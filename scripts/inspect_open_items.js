const config = require('../src/config');
const SapClient = require('../src/sapClient');
const logger = require('../src/logger');

async function inspectOpenItems() {
  logger.header('INSPECTING OPEN ZMT ITEMS IN SAP SYSTEM');
  const client = new SapClient(config);

  const path = `${config.basePath}A_SalesOrderItem?$top=200&$filter=RequestedQuantitySAPUnit%20eq%20'ZMT'&$select=SalesOrder,SalesOrderItem,RequestedQuantity,RequestedQuantityUnit,RequestedQuantitySAPUnit,SalesDocumentRjcnReason,SDProcessStatus,DeliveryStatus&$format=json`;
  
  logger.info('Querying items with RequestedQuantitySAPUnit = ZMT...');
  const res = await client.request({
    hostname: config.baseHost,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': config.authHeader,
      'Accept': 'application/json'
    }
  });

  if (res.statusCode !== 200) {
    logger.error(`Error querying items: HTTP ${res.statusCode} ${res.body}`);
    return;
  }

  const items = JSON.parse(res.body).d?.results || [];
  logger.info(`Retrieved ${items.length} ZMT items.`);

  const eligibleList = [];
  for (const it of items) {
    const qty = parseFloat(it.RequestedQuantity);
    const isOpen = it.SDProcessStatus !== 'C' && it.DeliveryStatus !== 'C';
    const notRejected = !it.SalesDocumentRjcnReason;

    if (qty < 5 && isOpen && notRejected) {
      eligibleList.push({
        'Sales Order': it.SalesOrder,
        'Item': it.SalesOrderItem,
        'Qty': `${qty} ${it.RequestedQuantityUnit}`,
        'SAP Unit': it.RequestedQuantitySAPUnit,
        'Process Status': it.SDProcessStatus || 'Initial',
        'Delivery Status': it.DeliveryStatus || 'Initial',
        'Current Rejection': it.SalesDocumentRjcnReason || 'None',
        'Eligible': 'YES'
      });
    }
  }

  logger.success(`Found ${eligibleList.length} open items with Qty < 5 ZMT eligible for short-close:`);
  console.table(eligibleList);
}

inspectOpenItems().catch(console.error);
