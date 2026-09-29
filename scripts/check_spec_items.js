const config = require('../src/config');
const SapClient = require('../src/sapClient');
const logger = require('../src/logger');

async function checkSpecItems() {
  const client = new SapClient(config);

  logger.header('TESTING SPEC CRITERIA ON SAP GATEWAY');

  // Query items with OrderQuantitySAPUnit eq 'ZMT' and SDProcessStatus eq 'A'
  const filter = "OrderQuantitySAPUnit eq 'ZMT' and SDProcessStatus eq 'A'";
  const path = `${config.basePath}A_SalesOrderItem?${encodeURI(`$top=50&$filter=${filter}&$format=json`)}`;

  logger.info(`Fetching items with OrderQuantitySAPUnit='ZMT' and SDProcessStatus='A'...`);
  const res = await client.request({
    hostname: config.baseHost,
    path: path,
    method: 'GET',
    headers: { 'Authorization': config.authHeader, 'Accept': 'application/json' }
  });

  if (res.statusCode !== 200) {
    logger.error(`Error: HTTP ${res.statusCode} - ${res.body}`);
    return;
  }

  const items = JSON.parse(res.body).d?.results || [];
  logger.info(`Found ${items.length} items matching filter.`);

  const qualifying = [];
  for (const item of items) {
    const qty = parseFloat(item.ConfdDelivQtyInOrderQtyUnit || '0');
    const isUnderOrEq5 = qty <= 5.0;
    const notRejected = !item.SalesDocumentRjcnReason || item.SalesDocumentRjcnReason.trim() === '';

    if (isUnderOrEq5 && notRejected) {
      qualifying.push(item);
    }
  }

  logger.success(`Qualifying items (ConfdDelivQtyInOrderQtyUnit <= 5, SDProcessStatus='A', No Rejection): ${qualifying.length}`);
  for (const it of qualifying.slice(0, 10)) {
    console.log({
      SalesOrder: it.SalesOrder,
      Item: it.SalesOrderItem,
      Material: it.Material,
      ConfdDelivQtyInOrderQtyUnit: it.ConfdDelivQtyInOrderQtyUnit,
      OrderQuantitySAPUnit: it.OrderQuantitySAPUnit,
      OrderQuantityUnit: it.OrderQuantityUnit,
      SDProcessStatus: it.SDProcessStatus,
      SalesDocumentRjcnReason: it.SalesDocumentRjcnReason
    });
  }
}

checkSpecItems().catch(console.error);
