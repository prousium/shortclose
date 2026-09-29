const config = require('../src/config');
const SapClient = require('../src/sapClient');
const logger = require('../src/logger');

async function testUpdateFlow(salesOrder = '40000822', item = '10', reason = '81') {
  logger.header(`TESTING UPDATE FLOW: Order ${salesOrder}, Item ${item}`);
  const client = new SapClient(config);

  // 1. Fetch current state and CSRF
  logger.info(`Fetching current state & CSRF token...`);
  const { csrfToken, cookies } = await client.fetchCsrfSession(salesOrder, item);
  logger.info(`CSRF Token: ${csrfToken}`);

  // 2. Perform write
  logger.info(`Applying Rejection Reason '${reason}' via POST + X-HTTP-Method: MERGE...`);
  await client.shortCloseItem(salesOrder, item, reason, csrfToken, cookies);
  logger.success(`MERGE update succeeded (204 No Content)!`);

  // 3. Verify
  logger.info(`Verifying persisted state...`);
  const verified = await client.verifyItem(salesOrder, item);
  logger.info(`Current Reason on SAP: '${verified?.rejectionReason}'`);
  if (verified?.rejectionReason === reason) {
    logger.success(`Verified: Item ${item} is confirmed rejected with code '${reason}'!`);
  } else {
    logger.warn(`Verification mismatch: expected '${reason}', got '${verified?.rejectionReason}'`);
  }
}

const targetOrder = process.argv[2] || '40000822';
const targetItem = process.argv[3] || '10';
const reasonCode = process.argv[4] || '81';

testUpdateFlow(targetOrder, targetItem, reasonCode).catch(console.error);
