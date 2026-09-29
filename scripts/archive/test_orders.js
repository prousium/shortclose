const https = require('https');

const BASE_HOST = 'my403214-api.s4hana.cloud.sap';
const BASE_PATH = '/sap/opu/odata/sap/API_SALES_ORDER_SRV/';
const AUTH_HEADER = 'Basic Q1NfQlRQXzI6V2c2VFtVbndAazVsdjJWc2U0OUxbdGwjUndlI342Ky9wM01nOSVtPg==';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function testOrders() {
  // Let's test a few open items with reason 01, and see if ANY order accepts 01, or what error is returned.
  // We found open items earlier:
  // 40000829, 40000828, 40000827, 40000826, 40000825, 40000824, 40000822, 40000820, 40000816, 40000815, 40000814, 40000813, 40000812, 40000811, 40000810, 40000809, 40000808, 40000807, 40000803, 40000801
  
  // Let's also check if there is an order where 01 works.
  // First, get CSRF token
  const tokenRes = await request({
    hostname: BASE_HOST,
    path: `${BASE_PATH}A_SalesOrderItem(SalesOrder='40000820',SalesOrderItem='10')?$format=json`,
    method: 'GET',
    headers: {
      'Authorization': AUTH_HEADER,
      'Accept': 'application/json',
      'x-csrf-token': 'fetch'
    }
  });

  const csrfToken = tokenRes.headers['x-csrf-token'];
  const cookies = (tokenRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  console.log('CSRF Token:', csrfToken);

  const candidates = [
    { order: '40000820', item: '10' },
    { order: '40000816', item: '10' },
    { order: '40000813', item: '10' },
    { order: '40000808', item: '10' },
    { order: '40000801', item: '10' },
    { order: '40000521', item: '10' },
  ];

  for (const c of candidates) {
    const postBody = JSON.stringify({ "SalesDocumentRjcnReason": "01" });
    const res = await request({
      hostname: BASE_HOST,
      path: `${BASE_PATH}A_SalesOrderItem(SalesOrder='${c.order}',SalesOrderItem='${c.item}')`,
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postBody),
        'x-csrf-token': csrfToken,
        'Cookie': cookies,
        'If-Match': '*',
        'X-HTTP-Method': 'MERGE'
      }
    }, postBody);

    console.log(`Order ${c.order} item ${c.item} update status: ${res.statusCode}`);
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      try {
        const err = JSON.parse(res.body);
        console.log(`  Error: ${err.error.message.value}`);
      } catch (e) {
        console.log(`  Raw response: ${res.body.slice(0, 150)}`);
      }
    } else {
      console.log(`  SUCCESSFUL UPDATE!`);
      // Verify
      const getRes = await request({
        hostname: BASE_HOST,
        path: `${BASE_PATH}A_SalesOrderItem(SalesOrder='${c.order}',SalesOrderItem='${c.item}')?$format=json`,
        method: 'GET',
        headers: {
          'Authorization': AUTH_HEADER,
          'Accept': 'application/json'
        }
      });
      const d = JSON.parse(getRes.body).d;
      console.log(`  Verified SalesDocumentRjcnReason: "${d.SalesDocumentRjcnReason}"`);
      break;
    }
  }
}

testOrders().catch(console.error);
