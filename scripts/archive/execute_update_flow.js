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

async function runFlow(salesOrder = '40000822', item = '10') {
  console.log(`============================================================`);
  console.log(`RUNNING UPDATE FLOW FOR SalesOrder='${salesOrder}', Item='${item}'`);
  console.log(`============================================================\n`);

  // STEP 1: GET the item to confirm current state and grab fresh CSRF token
  console.log(`--- STEP 1: GET item to confirm current state and fetch CSRF token ---`);
  const getUrl = `${BASE_PATH}A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${item}')?$format=json`;
  console.log(`GET https://${BASE_HOST}${getUrl}`);

  const step1Res = await request({
    hostname: BASE_HOST,
    path: getUrl,
    method: 'GET',
    headers: {
      'Authorization': AUTH_HEADER,
      'Accept': 'application/json',
      'x-csrf-token': 'fetch'
    }
  });

  console.log(`Status Code: ${step1Res.statusCode} ${step1Res.statusMessage}`);
  const csrfToken = step1Res.headers['x-csrf-token'];
  const cookies = parseCookies(step1Res.headers['set-cookie']);
  console.log(`Fetched x-csrf-token: ${csrfToken}`);
  console.log(`Cookies: ${cookies ? cookies.substring(0, 80) + '...' : 'none'}`);

  if (step1Res.statusCode !== 200) {
    console.error('Failed to GET item in Step 1:', step1Res.body);
    return;
  }

  const itemDataBefore = JSON.parse(step1Res.body).d;
  console.log('\n--- State BEFORE Update ---');
  console.log(`SalesOrder:               ${itemDataBefore.SalesOrder}`);
  console.log(`SalesOrderItem:           ${itemDataBefore.SalesOrderItem}`);
  console.log(`Material:                 ${itemDataBefore.Material}`);
  console.log(`SDProcessStatus:          ${itemDataBefore.SDProcessStatus}`);
  console.log(`DeliveryStatus:           ${itemDataBefore.DeliveryStatus}`);
  console.log(`OrderRelatedBillingStatus:${itemDataBefore.OrderRelatedBillingStatus}`);
  console.log(`SalesDocumentRjcnReason:  "${itemDataBefore.SalesDocumentRjcnReason}"`);

  // STEP 2: POST to A_SalesOrderItem(SalesOrder='{SalesOrder}',SalesOrderItem='{Item}') with headers
  // x-csrf-token, Content-Type: application/json, If-Match: *, and X-HTTP-Method: MERGE, body { "SalesDocumentRjcnReason": "01" }
  console.log(`\n--- STEP 2: POST (MERGE) to update SalesDocumentRjcnReason to "01" ---`);
  const postUrl = `${BASE_PATH}A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${item}')`;
  const postBody = JSON.stringify({ "SalesDocumentRjcnReason": "01" });

  console.log(`POST https://${BASE_HOST}${postUrl}`);
  console.log(`Headers:`);
  console.log(`  x-csrf-token: ${csrfToken}`);
  console.log(`  Content-Type: application/json`);
  console.log(`  If-Match: *`);
  console.log(`  X-HTTP-Method: MERGE`);
  console.log(`Payload: ${postBody}`);

  const postHeaders = {
    'Authorization': AUTH_HEADER,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postBody),
    'x-csrf-token': csrfToken,
    'If-Match': '*',
    'X-HTTP-Method': 'MERGE'
  };
  if (cookies) {
    postHeaders['Cookie'] = cookies;
  }

  const step2Res = await request({
    hostname: BASE_HOST,
    path: postUrl,
    method: 'POST',
    headers: postHeaders
  }, postBody);

  console.log(`Status Code: ${step2Res.statusCode} ${step2Res.statusMessage}`);
  console.log(`Response Body: ${step2Res.body || '(Empty - typical for 204 No Content)'}`);

  if (step2Res.statusCode !== 204 && step2Res.statusCode !== 200) {
    console.error('Update may have failed or returned error!');
  }

  // STEP 3: GET the same item again to verify whether SalesDocumentRjcnReason now shows 01
  console.log(`\n--- STEP 3: GET item again to verify changes ---`);
  console.log(`GET https://${BASE_HOST}${getUrl}`);

  const step3Res = await request({
    hostname: BASE_HOST,
    path: getUrl,
    method: 'GET',
    headers: {
      'Authorization': AUTH_HEADER,
      'Accept': 'application/json'
    }
  });

  console.log(`Status Code: ${step3Res.statusCode} ${step3Res.statusMessage}`);

  if (step3Res.statusCode !== 200) {
    console.error('Failed to GET item in Step 3:', step3Res.body);
    return;
  }

  const itemDataAfter = JSON.parse(step3Res.body).d;
  console.log('\n--- State AFTER Update ---');
  console.log(`SalesOrder:               ${itemDataAfter.SalesOrder}`);
  console.log(`SalesOrderItem:           ${itemDataAfter.SalesOrderItem}`);
  console.log(`Material:                 ${itemDataAfter.Material}`);
  console.log(`SDProcessStatus:          ${itemDataAfter.SDProcessStatus}`);
  console.log(`DeliveryStatus:           ${itemDataAfter.DeliveryStatus}`);
  console.log(`OrderRelatedBillingStatus:${itemDataAfter.OrderRelatedBillingStatus}`);
  console.log(`SalesDocumentRjcnReason:  "${itemDataAfter.SalesDocumentRjcnReason}"`);

  console.log('\n============================================================');
  console.log('VERIFICATION RESULT:');
  if (itemDataAfter.SalesDocumentRjcnReason === '01') {
    console.log(`SUCCESS! SalesDocumentRjcnReason was successfully updated to '01'.`);
  } else {
    console.log(`FAILED! SalesDocumentRjcnReason is '${itemDataAfter.SalesDocumentRjcnReason}'.`);
  }
  console.log('============================================================\n');

  return {
    order: salesOrder,
    item: item,
    before: itemDataBefore,
    after: itemDataAfter,
    updated: itemDataAfter.SalesDocumentRjcnReason === '01'
  };
}

runFlow().catch(console.error);
