const config = require('../src/config');
const SapClient = require('../src/sapClient');
const ShortCloserService = require('../src/shortCloser');
const logger = require('../src/logger');

async function testWindow() {
  const client = new SapClient(config);

  logger.header('TESTING 7-DAY CREATION DATE WINDOW');

  // Test a 7-day window where orders exist (March 12-19, 2024)
  const orders = await client.fetchSalesOrders({
    fromDate: '2024-03-12',
    toDate: '2024-03-19',
    dateField: 'CreationDate'
  });

  logger.info(`Orders retrieved in 7-day window: ${orders.length}`);

  let totalItems = 0;
  let matchingStatusA = 0;
  let matchingZmt = 0;
  let matchingQtyLe5 = 0;

  for (const order of orders) {
    const items = order.to_Item?.results || [];
    totalItems += items.length;
    for (const item of items) {
      const isStatusA = item.SDProcessStatus === 'A';
      const isZmt = (item.OrderQuantitySAPUnit === 'ZMT' || item.OrderQuantityUnit === 'ZMT' || (item.OrderQuantityUnit === 'MT' && item.OrderQuantitySAPUnit === 'ZMT'));
      const qty = parseFloat(item.ConfdDelivQtyInOrderQtyUnit || '0');
      const isQtyLe5 = qty <= 5.0;

      if (isStatusA) matchingStatusA++;
      if (isZmt) matchingZmt++;
      if (isQtyLe5) matchingQtyLe5++;

      if (isStatusA && isZmt && isQtyLe5 && !item.SalesDocumentRjcnReason) {
        logger.success(`MATCH: Order ${order.SalesOrder}, Item ${item.SalesOrderItem}, CreationDate=${client.parseODataDate(order.CreationDate)}, ConfdQty=${qty} ${item.OrderQuantitySAPUnit}, Status='${item.SDProcessStatus}'`);
      }
    }
  }

  logger.divider();
  logger.info(`Summary across ${totalItems} items:`);
  logger.info(`  Matching SDProcessStatus = 'A': ${matchingStatusA}`);
  logger.info(`  Matching OrderQuantitySAPUnit = 'ZMT': ${matchingZmt}`);
  logger.info(`  Matching ConfdDelivQtyInOrderQtyUnit <= 5: ${matchingQtyLe5}`);
}

testWindow().catch(console.error);
