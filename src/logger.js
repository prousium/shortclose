/**
 * Formatted Console Logger
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
  info: (msg, ...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.blue}[INFO]${colors.reset} ${msg}`, ...args),
  success: (msg, ...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${msg}`, ...args),
  error: (msg, ...args) => console.error(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${msg}`, ...args),
  dryRun: (msg, ...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.magenta}[DRY-RUN]${colors.reset} ${msg}`, ...args),
  skip: (msg, ...args) => console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.dim}[SKIP]${colors.reset} ${msg}`, ...args),
  header: (title) => {
    console.log(`\n${colors.cyan}${colors.bright}================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}  ${title}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}================================================================${colors.reset}\n`);
  },
  divider: () => console.log(`${colors.dim}----------------------------------------------------------------${colors.reset}`)
};

module.exports = logger;
