#!/usr/bin/env node

const config = require('./src/config');
const SapClient = require('./src/sapClient');
const ShortCloserService = require('./src/shortCloser');
const logger = require('./src/logger');

function printUsage() {
  console.log(`
SAP Sales Order Short-Close CLI Tool

Usage:
  node index.js [options]

Options:
  --dry-run             Simulate without writing to SAP (default mode)
  --execute             Perform live short-close writes to SAP Gateway
  --from=YYYY-MM-DD     Start date for filtering (default: 2024-01-01)
  --to=YYYY-MM-DD       End date for filtering (default: 2024-03-31)
  --date-field=FIELD    Date field to filter on: 'SalesOrderDate' or 'CreationDate' (default: SalesOrderDate)
  --reason=CODE         Rejection reason code (default: '81')
  --threshold=NUM       Quantity threshold in ZMT (default: 5.0)
  --order=ID            Target a specific single sales order (e.g. --order=40000431)
  --help                Show this help message

Examples:
  # Dry-run scan for February-March 2024
  node index.js --dry-run --from=2024-02-01 --to=2024-03-31

  # Dry-run for a single order
  node index.js --dry-run --order=40000431

  # Live execute for a single order
  node index.js --execute --order=40000431 --reason=81

  # Live execute over a date range
  node index.js --execute --from=2024-02-01 --to=2024-03-31 --reason=81
`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  try {
    const sapClient = new SapClient(config);
    const service = new ShortCloserService(sapClient, config);
    await service.run();
  } catch (err) {
    logger.error('Fatal execution error:', err.message);
    process.exit(1);
  }
}

main();
