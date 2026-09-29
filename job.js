#!/usr/bin/env node

/**
 * SAP Sales Order Short-Close - Scheduled Job Entry Point
 * Designed for SAP BTP Cloud Foundry Scheduled Tasks (cf run-task)
 * and the SAP Job Scheduling Service.
 *
 * Characteristics:
 * - Zero interactive prompts (fully automated batch execution)
 * - Structured audit trail written directly to stdout for `cf logs`
 * - Exits with status code 0 on success, non-zero on failure
 */

const config = require('./src/config');
const SapClient = require('./src/sapClient');
const ShortCloserService = require('./src/shortCloser');
const logger = require('./src/logger');

async function runScheduledJob() {
  const startTime = new Date();

  // Scheduled job defaults to live execution unless explicitly configured for dry-run
  const isDryRun = process.argv.includes('--dry-run') || 
    (process.env.DRY_RUN === 'true' && !process.argv.includes('--execute'));

  const jobConfig = {
    ...config,
    isDryRun
  };

  logger.header('SAP BTP SCHEDULED JOB: SALES ORDER SHORT-CLOSE');
  logger.info(`Start Time:       ${startTime.toISOString()}`);
  logger.info(`Target Host:      ${jobConfig.baseHost}`);
  logger.info(`Base Path:        ${jobConfig.basePath}`);
  logger.info(`Date Field:       ${jobConfig.dateField}`);
  logger.info(`Date Range:       ${jobConfig.fromDate} to ${jobConfig.toDate} (${jobConfig.rollingWindowDays} days rolling window)`);
  logger.info(`Criteria:         Unit='${jobConfig.targetUnit}', ConfdDelivQty <= ${jobConfig.quantityThreshold}, SDProcessStatus='A' (Open)`);
  logger.info(`Rejection Code:   '${jobConfig.rejectionReason}'`);
  logger.info(`Execution Mode:   ${isDryRun ? 'DRY-RUN (Simulation Only)' : 'LIVE EXECUTION (Updating SAP S/4HANA)'}`);

  // Validate SAP Authentication
  if (!jobConfig.authHeader) {
    logger.error('CRITICAL: SAP authentication credentials are not configured in environment.');
    logger.error('Please set SAP credentials using either:');
    logger.error('  cf set-env sap-shortclose SAP_AUTH_HEADER "Basic <token>"');
    logger.error('  or:');
    logger.error('  cf set-env sap-shortclose SAP_USERNAME "<user>"');
    logger.error('  cf set-env sap-shortclose SAP_PASSWORD "<pass>"');
    logger.error('Followed by: cf restage sap-shortclose');
    process.exit(1);
  }

  try {
    const sapClient = new SapClient(jobConfig);
    const service = new ShortCloserService(sapClient, jobConfig);

    const stats = await service.run();

    // Print itemized audit summary
    logger.header('SCHEDULED JOB AUDIT TRAIL');
    logger.info(`Orders Scanned:          ${stats.totalOrders}`);
    logger.info(`Items Evaluated:         ${stats.totalItems}`);
    logger.info(`Eligible Candidates:     ${stats.eligibleCandidates.length}`);
    logger.info(`Skipped Non-${jobConfig.targetUnit}:         ${stats.skippedNonZmt}`);
    logger.info(`Skipped Over ${jobConfig.quantityThreshold} ${jobConfig.targetUnit}:   ${stats.skippedOverThreshold}`);
    logger.info(`Skipped Not Open Status: ${stats.skippedCompleted}`);
    logger.info(`Skipped Already Closed:  ${stats.skippedAlreadyRejected}`);

    if (!isDryRun) {
      logger.info(`Successfully Updated:    ${stats.updatedSuccess}`);
      logger.info(`Failed / Errors:         ${stats.errors}`);

      if (stats.results && stats.results.length > 0) {
        logger.divider();
        logger.info('Detailed Line Item Results:');
        for (const res of stats.results) {
          if (res.status === 'SUCCESS') {
            logger.success(`[AUDIT SUCCESS] Order ${res.salesOrder} | Item ${res.item} | Material ${res.material || 'N/A'} | Qty: ${res.quantity} ${res.unit} | Reason: '${res.reasonCode}'`);
          } else {
            logger.error(`[AUDIT FAILED]  Order ${res.salesOrder} | Item ${res.item} | Material ${res.material || 'N/A'} | Error: ${res.error || res.message}`);
          }
        }
      }
    }

    const durationSeconds = ((Date.now() - startTime.getTime()) / 1000).toFixed(2);
    logger.divider();
    logger.info(`Job duration: ${durationSeconds}s`);

    // Determine exit code
    if (stats.errors > 0) {
      logger.error(`Job completed with ${stats.errors} failure(s). Exiting with code 1.`);
      process.exit(1);
    } else {
      logger.success(`Job completed successfully with zero errors. Exiting with code 0.`);
      process.exit(0);
    }
  } catch (err) {
    logger.error('CRITICAL UNHANDLED ERROR IN SCHEDULED JOB:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

runScheduledJob();
