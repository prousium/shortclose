const https = require('https');

const BASE_HOST = 'my403214-api.s4hana.cloud.sap';
const BASE_PATH = '/sap/opu/odata/sap/API_SALES_ORDER_SRV/';
const AUTH_HEADER = 'Basic Q1NfQlRQXzI6V2c2VFtVbndAazVsdjJWc2U0OUxbdGwjUndlI342Ky9wM01nOSVtPg==';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: body
        });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookies.map(c => c.split(';')[0]).join('; ');
}

async function runUpdateFlow81(salesOrder = '40000822', item = '10') {
  console.log(`============================================================`);
  console.log(`RUNNING UPDATE FLOW WITH REJECTION REASON '81'`);
  console.log(`SalesOrder='${salesOrder}', Item='${item}'`);
  console.log(`============================================================\n`);

  // STEP 1: GET the item to confirm current state and fetch CSRF token
  const itemPath = `${BASE_PATH}A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${item}')`;
  console.log(`--- STEP 1: GET current state & fetch fresh CSRF token ---`);
  console.log(`GET https://${BASE_HOST}${itemPath}?$format=json`);

  const step1Res = await request({
    hostname: BASE_HOST,
    path: `${itemPath}?$format=json`,
    method: 'GET',
    headers: {
      'Authorization': AUTH_HEADER,
      'Accept': 'application/json',
      'x-csrf-token': 'fetch'
    }
  });

  console.log(`Status: ${step1Res.statusCode} ${step1Res.statusMessage}`);
  const csrfToken = step1Res.headers['x-csrf-token'];
  const cookies = parseCookies(step1Res.headers['set-cookie']);
  console.log(`x-csrf-token: ${csrfToken}`);
  console.log(`Cookie header: ${cookies}`);

  if (step1Res.statusCode !== 200) {
    console.error('Step 1 failed:', step1Res.body);
    return;
  }

  const beforeData = JSON.parse(step1Res.body).d;
  console.log('\nState BEFORE Update:');
  console.log(`  SalesOrder:              ${beforeData.SalesOrder}`);
  console.log(`  SalesOrderItem:          ${beforeData.SalesOrderItem}`);
  console.log(`  SDProcessStatus:         ${beforeData.SDProcessStatus}`);
  console.log(`  DeliveryStatus:          ${beforeData.DeliveryStatus}`);
  console.log(`  SalesDocumentRjcnReason: "${beforeData.SalesDocumentRjcnReason}"`);

  // STEP 2: POST with X-HTTP-Method: MERGE using reason '81'
  console.log(`\n--- STEP 2: POST (MERGE) with SalesDocumentRjcnReason: "81" ---`);
  const payload = JSON.stringify({ "SalesDocumentRjcnReason": "81" });
  console.log(`POST https://${BASE_HOST}${itemPath}`);
  console.log(`Payload: ${payload}`);

  const postHeaders = {
    'Authorization': AUTH_HEADER,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'x-csrf-token': csrfToken,
    'If-Match': '*',
    'X-HTTP-Method': 'MERGE'
  };
  if (cookies) {
    postHeaders['Cookie'] = cookies;
  }

  const step2Res = await request({
    hostname: BASE_HOST,
    path: itemPath,
    method: 'POST',
    headers: postHeaders
  }, payload);

  console.log(`Status: ${step2Res.statusCode} ${step2Res.statusMessage}`);
  console.log(`Response Body: ${step2Res.body || '(Empty body - expected for 204 No Content)'}`);

  // STEP 3: Verification GET
  console.log(`\n--- STEP 3: Verification GET ---`);
  console.log(`GET https://${BASE_HOST}${itemPath}?$format=json`);

  const step3Res = await request({
    hostname: BASE_HOST,
    path: `${itemPath}?$format=json`,
    method: 'GET',
    headers: {
      'Authorization': AUTH_HEADER,
      'Accept': 'application/json'
    }
  });

  console.log(`Status: ${step3Res.statusCode} ${step3Res.statusMessage}`);

  if (step3Res.statusCode !== 200) {
    console.error('Step 3 failed:', step3Res.body);
    return;
  }

  const afterData = JSON.parse(step3Res.body).d;
  console.log('\nState AFTER Update:');
  console.log(`  SalesOrder:              ${afterData.SalesOrder}`);
  console.log(`  SalesOrderItem:          ${afterData.SalesOrderItem}`);
  console.log(`  SDProcessStatus:         ${afterData.SDProcessStatus}`);
  console.log(`  DeliveryStatus:          ${afterData.DeliveryStatus}`);
  console.log(`  SalesDocumentRjcnReason: "${afterData.SalesDocumentRjcnReason}"`);

  console.log(`\n============================================================`);
  console.log(`CONFIRMATION:`);
  console.log(`Did SalesDocumentRjcnReason change to '81'? ${afterData.SalesDocumentRjcnReason === '81' ? 'YES (CONFIRMED)' : 'NO'}`);
  console.log(`============================================================\n`);
}

runUpdateFlow81().catch(console.error);
