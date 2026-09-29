const config = require('../src/config');
const SapClient = require('../src/sapClient');
const { evaluateItem } = require('../src/evaluator');
const logger = require('../src/logger');

async function run() {
  const client = new SapClient(config);

  logger.header('ODATA CREATION DATE-RANGE & SPEC FIELDS VERIFICATION');

  // Test 1: Rolling 7-day window from config defaults
  const rolling = config.getRolling7DaysWindow();
  logger.info(`Test 1: Rolling 7-day window (${rolling.fromDate} to ${rolling.toDate}) on CreationDate`);
  const ordersCurrent = await client.fetchSalesOrders({
    fromDate: rolling.fromDate,
    toDate: rolling.toDate,
    dateField: 'CreationDate'
  });
  logger.info(`Status: Retrieved ${ordersCurrent.length} orders for current 7-day rolling window.`);

  // Test 2: Populated 7-day window with real historical orders (March 12-19, 2024)
  const testFrom = '2024-03-12';
  const testTo = '2024-03-19';
  logger.divider();
  logger.info(`Test 2: Populated 7-day window (${testFrom} to ${testTo}) on CreationDate with $expand=to_Item`);

  const orders = await client.fetchSalesOrders({
    fromDate: testFrom,
    toDate: testTo,
    dateField: 'CreationDate'
  });

  logger.success(`Orders returned: ${orders.length}`);

  let totalItems = 0;
  let matchingStatusA = 0;
  let eligibleItems = 0;

  for (const o of orders) {
    const items = o.to_Item?.results || [];
    totalItems += items.length;
    const creationDate = client.parseODataDate(o.CreationDate);
    logger.info(`Order ${o.SalesOrder} (CreationDate: ${creationDate}): ${items.length} item(s)`);

    for (const it of items) {
      const evalResult = evaluateItem(it, config.quantityThreshold, config.targetUnit);

      if (it.SDProcessStatus === 'A') matchingStatusA++;
      if (evalResult.eligible) eligibleItems++;

      logger.info(`  Item ${it.SalesOrderItem}: Material=${it.Material}, ConfdDelivQtyInOrderQtyUnit=${it.ConfdDelivQtyInOrderQtyUnit}, OrderQuantitySAPUnit=${it.OrderQuantitySAPUnit} (${it.OrderQuantityUnit}), SDProcessStatus='${it.SDProcessStatus}', Rejection='${it.SalesDocumentRjcnReason || 'None'}'`);
      logger.info(`    -> Evaluation: ${evalResult.eligible ? 'ELIGIBLE' : 'SKIPPED'} (${evalResult.reason})`);
    }
  }

  logger.divider();
  logger.header('SUMMARY FOR 7-DAY WINDOW VERIFICATION');
  console.log(`  Total Items Evaluated:                         ${totalItems}`);
  console.log(`  Items with SDProcessStatus === 'A' (Open):     ${matchingStatusA}`);
  console.log(`  Eligible for Short-Close (<= 5 ZMT, Open):     ${eligibleItems}`);
}

run().catch(console.error);
