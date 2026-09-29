const config = require('../src/config');
const SapClient = require('../src/sapClient');
const logger = require('../src/logger');

async function getAllRejectionReasons() {
  logger.header('SCANNING DISTINCT REJECTION REASONS IN SAP SYSTEM');
  const client = new SapClient(config);
  const distinctReasons = new Set();
  const sampleItems = {};
  let skip = 0;
  const top = 1000;

  while (true) {
    const path = `${config.basePath}A_SalesOrderItem?$top=${top}&$skip=${skip}&$select=SalesOrder,SalesOrderItem,SalesDocumentRjcnReason,SDProcessStatus,DeliveryStatus&$format=json`;
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
      logger.error(`Error fetching: HTTP ${res.statusCode} ${res.body}`);
      break;
    }

    const items = JSON.parse(res.body).d?.results || [];
    if (items.length === 0) break;

    for (const it of items) {
      if (it.SalesDocumentRjcnReason) {
        distinctReasons.add(it.SalesDocumentRjcnReason);
        if (!sampleItems[it.SalesDocumentRjcnReason]) {
          sampleItems[it.SalesDocumentRjcnReason] = it;
        }
      }
    }

    logger.info(`Fetched ${items.length} items (total scanned: ${skip + items.length}). Reasons found so far: ${Array.from(distinctReasons).join(', ')}`);
    if (items.length < top) break;
    skip += top;
    if (skip >= 5000) break;
  }

  logger.success(`Distinct rejection reasons found in live data: [${Array.from(distinctReasons).join(', ')}]`);
  console.log('\nSample items per reason:');
  console.dir(sampleItems, { depth: null });
}

getAllRejectionReasons().catch(console.error);
