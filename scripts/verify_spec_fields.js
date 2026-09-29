const config = require('../src/config');
const SapClient = require('../src/sapClient');
const logger = require('../src/logger');

async function verify() {
  const client = new SapClient(config);

  logger.header('VERIFYING SPEC FIELDS ON LIVE SAP SYSTEM');

  // Query 1: Fetch latest orders by CreationDate
  const pathLatest = `${config.basePath}A_SalesOrder?${encodeURI('$top=5&$orderby=CreationDate desc&$expand=to_Item&$format=json')}`;
  logger.info(`Fetching latest 5 sales orders ordered by CreationDate...`);
  const resLatest = await client.request({
    hostname: config.baseHost,
    path: pathLatest,
    method: 'GET',
    headers: { 'Authorization': config.authHeader, 'Accept': 'application/json' }
  });

  if (resLatest.statusCode === 200) {
    const data = JSON.parse(resLatest.body);
    const orders = data.d?.results || [];
    logger.info(`Found ${orders.length} latest orders:`);
    for (const order of orders) {
      const creationDate = client.parseODataDate(order.CreationDate);
      const salesOrderDate = client.parseODataDate(order.SalesOrderDate);
      logger.info(`SalesOrder: ${order.SalesOrder} | CreationDate: ${creationDate} | SalesOrderDate: ${salesOrderDate}`);
      const items = order.to_Item?.results || [];
      for (const item of items) {
        console.log({
          SalesOrder: item.SalesOrder,
          Item: item.SalesOrderItem,
          Material: item.Material,
          ConfdDelivQtyInOrderQtyUnit: item.ConfdDelivQtyInOrderQtyUnit,
          OrderQuantitySAPUnit: item.OrderQuantitySAPUnit,
          OrderQuantityUnit: item.OrderQuantityUnit,
          RequestedQuantity: item.RequestedQuantity,
          RequestedQuantitySAPUnit: item.RequestedQuantitySAPUnit,
          RequestedQuantityUnit: item.RequestedQuantityUnit,
          SDProcessStatus: item.SDProcessStatus,
          DeliveryStatus: item.DeliveryStatus,
          SalesDocumentRjcnReason: item.SalesDocumentRjcnReason
        });
      }
    }
  } else {
    logger.error(`Error querying latest orders: HTTP ${resLatest.statusCode} - ${resLatest.body}`);
  }

  // Query 2: Fetch items where OrderQuantitySAPUnit = 'ZMT'
  const pathZmt = `${config.basePath}A_SalesOrderItem?${encodeURI("$top=10&$filter=OrderQuantitySAPUnit eq 'ZMT'&$format=json")}`;
  logger.divider();
  logger.info(`Fetching items where OrderQuantitySAPUnit eq 'ZMT'...`);
  const resZmt = await client.request({
    hostname: config.baseHost,
    path: pathZmt,
    method: 'GET',
    headers: { 'Authorization': config.authHeader, 'Accept': 'application/json' }
  });

  if (resZmt.statusCode === 200) {
    const data = JSON.parse(resZmt.body);
    const items = data.d?.results || [];
    logger.info(`Found ${items.length} items with OrderQuantitySAPUnit eq 'ZMT':`);
    for (const item of items.slice(0, 5)) {
      console.log({
        SalesOrder: item.SalesOrder,
        Item: item.SalesOrderItem,
        Material: item.Material,
        ConfdDelivQtyInOrderQtyUnit: item.ConfdDelivQtyInOrderQtyUnit,
        OrderQuantitySAPUnit: item.OrderQuantitySAPUnit,
        OrderQuantityUnit: item.OrderQuantityUnit,
        RequestedQuantity: item.RequestedQuantity,
        RequestedQuantitySAPUnit: item.RequestedQuantitySAPUnit,
        RequestedQuantityUnit: item.RequestedQuantityUnit,
        SDProcessStatus: item.SDProcessStatus,
        SalesDocumentRjcnReason: item.SalesDocumentRjcnReason
      });
    }
  } else {
    logger.error(`Error querying items: HTTP ${resZmt.statusCode} - ${resZmt.body}`);
  }
}

verify().catch(console.error);
