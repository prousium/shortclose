const logger = require('./logger');
const { evaluateItem } = require('./evaluator');

class ShortCloserService {
  constructor(sapClient, config) {
    this.sapClient = sapClient;
    this.config = config;
  }

  async run() {
    logger.header('SAP SALES ORDER SHORT-CLOSE SERVICE');
    logger.info(`Mode: ${this.config.isDryRun ? 'DRY-RUN (Simulation only, no live updates)' : 'EXECUTE (LIVE SYSTEM WRITES)'}`);
    logger.info(`Date Range: ${this.config.fromDate} to ${this.config.toDate} (${this.config.dateField})`);
    logger.info(`Rule Criteria: Unit = '${this.config.targetUnit}', Confirmed Qty <= ${this.config.quantityThreshold}, SDProcessStatus = 'A'`);
    logger.info(`Rejection Reason Code to apply: '${this.config.rejectionReason}'`);

    let orders = [];
    if (this.config.singleOrder) {
      const order = await this.sapClient.fetchSingleOrder(this.config.singleOrder);
      orders = [order];
    } else {
      orders = await this.sapClient.fetchSalesOrders({
        fromDate: this.config.fromDate,
        toDate: this.config.toDate,
        dateField: this.config.dateField
      });
    }

    if (orders.length === 0) {
      logger.warn('No sales orders found in the specified criteria.');
      return {
        totalOrders: 0,
        totalItems: 0,
        eligibleCandidates: [],
        skippedNonZmt: 0,
        skippedOverThreshold: 0,
        skippedCompleted: 0,
        skippedAlreadyRejected: 0,
        updatedSuccess: 0,
        errors: 0,
        results: []
      };
    }

    const stats = {
      totalOrders: orders.length,
      totalItems: 0,
      eligibleCandidates: [],
      skippedNonZmt: 0,
      skippedOverThreshold: 0,
      skippedCompleted: 0,
      skippedAlreadyRejected: 0,
      updatedSuccess: 0,
      errors: 0,
      results: []
    };

    logger.divider();
    logger.info('Evaluating line items across fetched orders...');

    for (const order of orders) {
      const items = order.to_Item?.results || [];
      stats.totalItems += items.length;

      for (const item of items) {
        const evalResult = evaluateItem(item, this.config.quantityThreshold, this.config.targetUnit);

        if (evalResult.eligible) {
          stats.eligibleCandidates.push({
            salesOrder: order.SalesOrder,
            salesOrderDate: this.sapClient.parseODataDate(order.SalesOrderDate),
            creationDate: this.sapClient.parseODataDate(order.CreationDate),
            item: item.SalesOrderItem,
            material: item.Material,
            quantity: evalResult.quantity,
            unit: evalResult.unit,
            rawItem: item
          });
          logger.info(`[CANDIDATE] Order ${order.SalesOrder}, Item ${item.SalesOrderItem}: Confirmed Qty ${evalResult.quantity} ${evalResult.unit} (Open)`);
        } else {
          logger.skip(`Order ${order.SalesOrder}, Item ${item.SalesOrderItem}: ${evalResult.reason}`);
          if (evalResult.category === 'NON_ZMT' || evalResult.reason.includes('Unit is')) stats.skippedNonZmt++;
          else if (evalResult.category === 'OVER_THRESHOLD' || evalResult.reason.includes('threshold')) stats.skippedOverThreshold++;
          else if (evalResult.category === 'NOT_OPEN' || evalResult.reason.includes('SDProcessStatus') || evalResult.reason.includes('Completed')) stats.skippedCompleted++;
          else if (evalResult.category === 'ALREADY_REJECTED' || evalResult.reason.includes('Already short-closed')) stats.skippedAlreadyRejected++;
        }
      }
    }

    logger.divider();
    logger.info(`Evaluation complete: Found ${stats.eligibleCandidates.length} eligible item(s) across ${stats.totalItems} total items in ${stats.totalOrders} order(s).`);

    // If DRY RUN: Report candidates without modifying
    if (this.config.isDryRun) {
      logger.dryRun('=== DRY-RUN CANDIDATES SUMMARY ===');
      if (stats.eligibleCandidates.length === 0) {
        logger.dryRun('No items qualified for short-closing under current rules.');
      } else {
        console.table(stats.eligibleCandidates.map(c => ({
          'Sales Order': c.salesOrder,
          'Order Date': c.salesOrderDate,
          'Item': c.item,
          'Material': c.material,
          'Quantity': `${c.quantity} ${c.unit}`,
          'Target Reason': this.config.rejectionReason,
          'Action': 'WOULD SHORT-CLOSE'
        })));
      }
      this.printSummary(stats);
      return stats;
    }

    // LIVE EXECUTION FLOW
    logger.header('STARTING LIVE SHORT-CLOSE WRITES');
    if (stats.eligibleCandidates.length === 0) {
      logger.info('No eligible items to process in live mode.');
      this.printSummary(stats);
      return stats;
    }

    const results = await this.executeItems(stats.eligibleCandidates, this.config.rejectionReason);
    stats.results = results;

    for (const res of results) {
      if (res.status === 'SUCCESS') {
        stats.updatedSuccess++;
      } else {
        stats.errors++;
      }
    }

    this.printSummary(stats);
    return stats;
  }

  /**
   * Reusable method to execute short-close on a single item
   */
  async executeSingleItem(candidate, reasonCode = this.config.rejectionReason) {
    const { salesOrder, item, quantity, unit, material } = candidate;
    logger.divider();
    logger.info(`Processing Order ${salesOrder}, Item ${item} (${quantity} ${unit})...`);

    try {
      // Step 1: Fetch fresh CSRF token and session cookies
      logger.info(`Fetching CSRF token & session for Order ${salesOrder}, Item ${item}...`);
      const { csrfToken, cookies } = await this.sapClient.fetchCsrfSession(salesOrder, item);

      // Step 2: Perform write using POST + X-HTTP-Method: MERGE
      logger.info(`Sending MERGE update for Order ${salesOrder}, Item ${item} with Reason '${reasonCode}'...`);
      await this.sapClient.shortCloseItem(salesOrder, item, reasonCode, csrfToken, cookies);

      // Step 3: Verification GET
      logger.info(`Verifying update on SAP Gateway...`);
      const verified = await this.sapClient.verifyItem(salesOrder, item);

      if (verified && verified.rejectionReason === reasonCode) {
        logger.success(`Order ${salesOrder}, Item ${item} short-closed successfully! Reason persisted as '${verified.rejectionReason}'.`);
        return {
          salesOrder,
          item,
          material: material || candidate.material || '',
          quantity,
          unit,
          status: 'SUCCESS',
          reasonCode: verified.rejectionReason,
          message: `Successfully short-closed (Reason: ${verified.rejectionReason})`
        };
      } else {
        const actualReason = verified?.rejectionReason;
        const msg = `Update returned success but Reason is '${actualReason}' (expected '${reasonCode}').`;
        logger.warn(`Order ${salesOrder}, Item ${item}: ${msg}`);
        return {
          salesOrder,
          item,
          material: material || candidate.material || '',
          quantity,
          unit,
          status: 'FAILED',
          reasonCode: actualReason,
          error: msg,
          message: msg
        };
      }
    } catch (err) {
      logger.error(`Failed to short-close Order ${salesOrder}, Item ${item}: ${err.message}`);
      return {
        salesOrder,
        item,
        material: material || candidate.material || '',
        quantity,
        unit,
        status: 'FAILED',
        error: err.message,
        message: err.message
      };
    }
  }

  /**
   * Reusable method to execute short-close across a list of candidates
   */
  async executeItems(candidates, reasonCode = this.config.rejectionReason) {
    const results = [];
    for (const candidate of candidates) {
      const result = await this.executeSingleItem(candidate, reasonCode);
      results.push(result);
    }
    return results;
  }

  printSummary(stats) {
    logger.header('EXECUTION SUMMARY');
    console.log(`  Total Orders Scanned:          ${stats.totalOrders}`);
    console.log(`  Total Items Evaluated:         ${stats.totalItems}`);
    console.log(`  Eligible Candidates (<= 5 ZMT): ${stats.eligibleCandidates.length}`);
    console.log(`  Skipped (Non-ZMT Unit):        ${stats.skippedNonZmt}`);
    console.log(`  Skipped (Quantity > 5):        ${stats.skippedOverThreshold}`);
    console.log(`  Skipped (Status not 'A'):      ${stats.skippedCompleted}`);
    console.log(`  Skipped (Already Rejected):    ${stats.skippedAlreadyRejected}`);
    if (!this.config.isDryRun) {
      console.log(`  Successfully Short-Closed:     ${stats.updatedSuccess}`);
      console.log(`  Errors / Failures:             ${stats.errors}`);
    } else {
      logger.dryRun('Dry-run completed. Run with `--execute` or DRY_RUN=false to apply changes to SAP.');
    }
    logger.divider();
  }
}

module.exports = ShortCloserService;
