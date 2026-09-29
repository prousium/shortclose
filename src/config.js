const fs = require('fs');
const path = require('path');

// Optional local development .env loader (safe if .env does not exist on Cloud Foundry)
function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking in containerized / Cloud Foundry environments
  }
}

loadEnv();

// Parse Command Line Arguments (supports --key=val and --flag)
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');
      if (equalIndex !== -1) {
        const key = arg.slice(2, equalIndex);
        const value = arg.slice(equalIndex + 1);
        parsed[key] = value;
      } else {
        const key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          parsed[key] = args[i + 1];
          i++;
        } else {
          parsed[key] = true;
        }
      }
    }
  }
  return parsed;
}

const cliArgs = parseArgs();

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const rollingDays = parseInt(process.env.ROLLING_WINDOW_DAYS || '7', 10) || 7;

function getRollingWindow(days = rollingDays) {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - days);
  return {
    fromDate: formatDate(past),
    toDate: formatDate(today)
  };
}

const rollingDefaults = getRollingWindow(rollingDays);

// Normalize SAP base host (strip http/https protocols or trailing paths)
function getBaseHost() {
  const raw = process.env.SAP_BASE_HOST || 'my403214-api.s4hana.cloud.sap';
  return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
}

// Normalize SAP base path
function getBasePath() {
  let p = process.env.SAP_BASE_PATH || '/sap/opu/odata/sap/API_SALES_ORDER_SRV/';
  p = p.trim();
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

// Resolve Authorization Header (from SAP_AUTH_HEADER or SAP_USERNAME + SAP_PASSWORD)
function getAuthHeader() {
  if (process.env.SAP_AUTH_HEADER && process.env.SAP_AUTH_HEADER.trim()) {
    const raw = process.env.SAP_AUTH_HEADER.trim();
    return raw.startsWith('Basic ') || raw.startsWith('Bearer ') ? raw : `Basic ${raw}`;
  }

  const username = process.env.SAP_USERNAME || process.env.SAP_USER;
  const password = process.env.SAP_PASSWORD;
  if (username && password) {
    const token = Buffer.from(`${username.trim()}:${password}`).toString('base64');
    return `Basic ${token}`;
  }

  return '';
}

const config = {
  // SAP Gateway Connection Details
  baseHost: getBaseHost(),
  basePath: getBasePath(),
  authHeader: getAuthHeader(),

  // Business Rules for Short-Close
  rejectionReason: cliArgs.reason || process.env.REJECTION_REASON_CODE || '81',
  quantityThreshold: parseFloat(cliArgs.threshold || process.env.QUANTITY_THRESHOLD || '5.0'),
  targetUnit: process.env.TARGET_UNIT || 'ZMT',

  // Query Window Settings
  dateField: cliArgs['date-field'] || process.env.DEFAULT_DATE_FIELD || 'CreationDate',
  fromDate: cliArgs.from || process.env.DEFAULT_FROM_DATE || rollingDefaults.fromDate,
  toDate: cliArgs.to || process.env.DEFAULT_TO_DATE || rollingDefaults.toDate,
  rollingWindowDays: rollingDays,

  // Execution Mode (Safety DRY-RUN default unless --execute passed or DRY_RUN=false)
  isDryRun: cliArgs.execute ? false : (cliArgs['dry-run'] !== undefined ? true : (process.env.DRY_RUN !== 'false')),

  // Optional: Single Sales Order filter
  singleOrder: cliArgs.order || null,

  // Rolling window helpers
  getRollingWindow,
  getRolling7DaysWindow: getRollingWindow
};

module.exports = config;
