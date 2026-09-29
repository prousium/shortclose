const config = require('../src/config');
const SapClient = require('../src/sapClient');
const logger = require('../src/logger');

async function testConnection() {
  logger.header('TESTING SAP GATEWAY CONNECTIVITY');
  logger.info(`Host: ${config.baseHost}`);
  logger.info(`Service: ${config.basePath}`);

  const client = new SapClient(config);
  try {
    const orders = await client.request({
      hostname: config.baseHost,
      path: `${config.basePath}?$format=json`,
      method: 'GET',
      headers: {
        'Authorization': config.authHeader,
        'Accept': 'application/json'
      }
    });

    if (orders.statusCode === 200) {
      logger.success(`Connection successful! HTTP ${orders.statusCode} ${orders.statusMessage}`);
    } else {
      logger.error(`Connection failed: HTTP ${orders.statusCode} - ${orders.body}`);
    }
  } catch (err) {
    logger.error('Network or request error:', err.message);
  }
}

testConnection();
