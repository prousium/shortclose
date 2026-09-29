const config = require('../src/config');
const SapClient = require('../src/sapClient');
const { evaluateItem } = require('../src/evaluator');

async function scanDates() {
  const client = new SapClient(config);

  console.log('Querying date ranges with orders in SAP...');

  // 1. Fetch oldest orders
  const pathAsc = `${config.basePath}A_SalesOrder?${encodeURI('$top=5&$orderby=CreationDate asc&$format=json')}`;
  const resAsc = await client.request({
    hostname: config.baseHost,
    path: pathAsc,
    method: 'GET',
    headers: { 'Authorization': config.authHeader, 'Accept': 'application/json' }
  });
  const oldest = JSON.parse(resAsc.body).d?.results || [];

  // 2. Fetch newest orders
  const pathDesc = `${config.basePath}A_SalesOrder?${encodeURI('$top=5&$orderby=CreationDate desc&$format=json')}`;
  const resDesc = await client.request({
    hostname: config.baseHost,
    path: pathDesc,
    method: 'GET',
    headers: { 'Authorization': config.authHeader, 'Accept': 'application/json' }
  });
  const newest = JSON.parse(resDesc.body).d?.results || [];

  console.log('Earliest orders CreationDate:', oldest.map(o => client.parseODataDate(o.CreationDate)));
  console.log('Latest orders CreationDate:  ', newest.map(o => client.parseODataDate(o.CreationDate)));

  // 3. Check specific key months with $expand=to_Item
  const testRanges = [
    { label: 'March 2023', from: '2023-03-01', to: '2023-03-31' },
    { label: 'April 2023', from: '2023-04-01', to: '2023-04-30' },
    { label: 'Nov 2023', from: '2023-11-01', to: '2023-11-30' },
    { label: 'Feb 2024', from: '2024-02-01', to: '2024-02-29' },
    { label: 'March 2024', from: '2024-03-01', to: '2024-03-31' },
    { label: 'Q1 2024', from: '2024-01-01', to: '2024-03-31' },
    { label: 'March 2026', from: '2026-03-01', to: '2026-03-31' },
    { label: 'May 2026', from: '2026-05-01', to: '2026-05-31' },
    { label: 'July 2026', from: '2026-07-01', to: '2026-07-31' },
    { label: 'Sept 2026 (Recent)', from: '2026-09-01', to: '2026-09-24' }
  ];

  console.log('\n--- DATE RANGE SUMMARY ---');
  for (const r of testRanges) {
    try {
      const orders = await client.fetchSalesOrders({ fromDate: r.from, toDate: r.to, dateField: 'CreationDate' });
      let eligible = 0;
      let totalItems = 0;
      for (const o of orders) {
        const items = o.to_Item?.results || [];
        totalItems += items.length;
        for (const it of items) {
          const res = evaluateItem(it, config.quantityThreshold, config.targetUnit);
          if (res.eligible) eligible++;
        }
      }
      console.log(`[${r.label}] (${r.from} to ${r.to}): ${orders.length} orders | ${totalItems} items | ${eligible} eligible candidates`);
    } catch (e) {
      console.log(`[${r.label}] Error:`, e.message);
    }
  }
}

scanDates().catch(console.error);
