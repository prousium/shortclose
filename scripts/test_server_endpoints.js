const http = require('http');
const app = require('../server');

async function testEndpoints() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  console.log(`Test server running on ${baseUrl}`);

  function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(data)
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              raw: data
            });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // 1. Test GET /api/config
    console.log('\n--- 1. Testing GET /api/config ---');
    const configRes = await makeRequest('/api/config');
    console.log('Status:', configRes.status);
    console.log('Config response:', configRes.body);

    if (configRes.status !== 200 || !configRes.body.rejectionReason) {
      throw new Error('GET /api/config validation failed');
    }

    // 2. Test POST /api/preview (Web UI endpoint)
    console.log('\n--- 2. Testing POST /api/preview ---');
    const previewRes = await makeRequest('/api/preview', 'POST', {
      fromDate: '2026-09-22',
      toDate: '2026-09-29'
    });
    console.log('Status:', previewRes.status);
    console.log('Preview totalOrders:', previewRes.body.totalOrders);
    console.log('Preview eligibleCandidates:', previewRes.body.eligibleCandidates?.length);

    if (previewRes.status !== 200 || !previewRes.body.success) {
      throw new Error('POST /api/preview validation failed');
    }

    // 3. Test POST /api/job/run?dryRun=true (Job Scheduling Service endpoint)
    console.log('\n--- 3. Testing POST /api/job/run?dryRun=true ---');
    const jobRes = await makeRequest('/api/job/run?dryRun=true', 'POST', {
      fromDate: '2026-09-22',
      toDate: '2026-09-29'
    });
    console.log('Status:', jobRes.status);
    console.log('Job Run success:', jobRes.body.success);
    console.log('Job Run isDryRun:', jobRes.body.isDryRun);
    console.log('Job Run totalOrders:', jobRes.body.totalOrders);

    if (jobRes.status !== 200 || !jobRes.body.success || !jobRes.body.isDryRun) {
      throw new Error('POST /api/job/run validation failed');
    }

    console.log('\nALL ENDPOINT TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

testEndpoints().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
