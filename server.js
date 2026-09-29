const express = require('express');
const path = require('path');
const config = require('./src/config');
const SapClient = require('./src/sapClient');
const ShortCloserService = require('./src/shortCloser');
const logger = require('./src/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /api/config
 * Returns current configuration defaults for the web interface
 */
app.get('/api/config', (req, res) => {
  const rolling = config.getRolling7DaysWindow ? config.getRolling7DaysWindow() : { fromDate: config.fromDate, toDate: config.toDate };
  res.json({
    rejectionReason: config.rejectionReason || '81',
    fromDate: config.fromDate || rolling.fromDate,
    toDate: config.toDate || rolling.toDate,
    rollingFromDate: rolling.fromDate,
    rollingToDate: rolling.toDate,
    targetUnit: config.targetUnit || 'ZMT',
    quantityThreshold: config.quantityThreshold || 5.0,
    dateField: config.dateField || 'CreationDate',
    baseHost: config.baseHost || 'my403214-api.s4hana.cloud.sap'
  });
});

/**
 * POST /api/preview
 * Runs ShortCloserService in dry-run mode.
 * Defaults to rolling last 7 days on CreationDate when no dates are passed.
 * Body: { fromDate, toDate, reasonCode, dateField }
 */
app.post('/api/preview', async (req, res) => {
  try {
    const { fromDate, toDate, reasonCode, dateField } = req.body;

    // Default to rolling last-7-days window if dates are not specified
    const rolling = config.getRolling7DaysWindow ? config.getRolling7DaysWindow() : { fromDate: config.fromDate, toDate: config.toDate };
    const effectiveFromDate = fromDate ? String(fromDate).trim() : rolling.fromDate;
    const effectiveToDate = toDate ? String(toDate).trim() : rolling.toDate;
    const effectiveDateField = dateField ? String(dateField).trim() : (config.dateField || 'CreationDate');
    const effectiveReason = reasonCode ? String(reasonCode).trim() : (config.rejectionReason || '81');

    logger.info(`[WEB] Preview requested for ${effectiveFromDate} to ${effectiveToDate} (${effectiveDateField}) with reason '${effectiveReason}'`);

    // Direct configuration for this request - do not rely on CLI or env defaults
    const previewConfig = {
      ...config,
      dateField: effectiveDateField,
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      rejectionReason: effectiveReason,
      isDryRun: true,
      singleOrder: null
    };

    const sapClient = new SapClient(previewConfig);
    const service = new ShortCloserService(sapClient, previewConfig);
    const stats = await service.run();

    return res.json({
      success: true,
      dateField: previewConfig.dateField,
      fromDate: previewConfig.fromDate,
      toDate: previewConfig.toDate,
      reasonCode: previewConfig.rejectionReason,
      totalOrders: stats.totalOrders || 0,
      totalItems: stats.totalItems || 0,
      eligibleCandidates: stats.eligibleCandidates || [],
      skipCounts: {
        nonZmt: stats.skippedNonZmt || 0,
        overThreshold: stats.skippedOverThreshold || 0,
        alreadyCompleted: stats.skippedCompleted || 0,
        alreadyRejected: stats.skippedAlreadyRejected || 0
      }
    });
  } catch (err) {
    logger.error('[WEB] Preview error:', err.message);
    return res.status(500).json({
      error: err.message || 'Failed to fetch and preview sales order candidates.'
    });
  }
});

/**
 * POST /api/execute
 * Runs live short-close writes only on the exact candidate items sent from frontend
 * Body: { fromDate, toDate, reasonCode, candidates, dateField }
 */
app.post('/api/execute', async (req, res) => {
  try {
    const { fromDate, toDate, reasonCode, candidates, dateField } = req.body;

    if (!Array.isArray(candidates)) {
      return res.status(400).json({
        error: 'A valid candidates array is required to execute short-close.'
      });
    }

    const rolling = config.getRolling7DaysWindow ? config.getRolling7DaysWindow() : { fromDate: config.fromDate, toDate: config.toDate };
    const effectiveFromDate = fromDate ? String(fromDate).trim() : (config.fromDate || rolling.fromDate);
    const effectiveToDate = toDate ? String(toDate).trim() : (config.toDate || rolling.toDate);
    const effectiveDateField = dateField ? String(dateField).trim() : (config.dateField || 'CreationDate');
    const effectiveReason = reasonCode ? String(reasonCode).trim() : (config.rejectionReason || '81');

    logger.header('[WEB] LIVE SHORT-CLOSE EXECUTION REQUESTED');
    logger.info(`[WEB] Items to process: ${candidates.length}, Reason code: '${effectiveReason}', Date Range: ${effectiveFromDate} to ${effectiveToDate}`);

    if (candidates.length === 0) {
      return res.json({
        success: true,
        reasonCode: effectiveReason,
        totalExecuted: 0,
        successCount: 0,
        failureCount: 0,
        results: []
      });
    }

    // Direct configuration for live execution
    const execConfig = {
      ...config,
      dateField: effectiveDateField,
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      rejectionReason: effectiveReason,
      isDryRun: false,
      singleOrder: null
    };

    const sapClient = new SapClient(execConfig);
    const service = new ShortCloserService(sapClient, execConfig);

    // Run short-close writes reusing executeItems
    const results = await service.executeItems(candidates, effectiveReason);

    const successCount = results.filter(r => r.status === 'SUCCESS').length;
    const failureCount = results.filter(r => r.status !== 'SUCCESS').length;

    logger.info(`[WEB] Execution completed: ${successCount} succeeded, ${failureCount} failed.`);

    return res.json({
      success: true,
      reasonCode: effectiveReason,
      totalExecuted: results.length,
      successCount,
      failureCount,
      results
    });
  } catch (err) {
    logger.error('[WEB] Execute error:', err.message);
    return res.status(500).json({
      error: err.message || 'Failed to execute short-close on candidates.'
    });
  }
});

/**
 * POST /api/job/run (and POST /api/job/execute)
 * Automated job execution endpoint designed for SAP Job Scheduling Service (HTTP Action).
 * Runs the full live short-close flow start to finish with zero interactive prompts.
 * Query or body overrides: { fromDate, toDate, reasonCode, dateField, dryRun }
 */
const handleJobRun = async (req, res) => {
  try {
    const payload = { ...req.query, ...req.body };
    const rolling = config.getRollingWindow ? config.getRollingWindow() : (config.getRolling7DaysWindow ? config.getRolling7DaysWindow() : { fromDate: config.fromDate, toDate: config.toDate });

    const effectiveFromDate = payload.fromDate ? String(payload.fromDate).trim() : (config.fromDate || rolling.fromDate);
    const effectiveToDate = payload.toDate ? String(payload.toDate).trim() : (config.toDate || rolling.toDate);
    const effectiveDateField = payload.dateField ? String(payload.dateField).trim() : (config.dateField || 'CreationDate');
    const effectiveReason = payload.reasonCode || payload.reason ? String(payload.reasonCode || payload.reason).trim() : (config.rejectionReason || '81');
    const isDryRun = payload.dryRun !== undefined ? (String(payload.dryRun).toLowerCase() === 'true') : false;

    logger.header('[JOB-RUN] AUTOMATED ENDPOINT INVOKED');
    logger.info(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE EXECUTION'}`);
    logger.info(`Date Range: ${effectiveFromDate} to ${effectiveToDate} (${effectiveDateField}), Reason: '${effectiveReason}'`);

    const jobConfig = {
      ...config,
      dateField: effectiveDateField,
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      rejectionReason: effectiveReason,
      isDryRun,
      singleOrder: payload.order || null
    };

    if (!jobConfig.authHeader) {
      logger.error('[JOB-RUN] SAP credentials missing in process.env');
      return res.status(500).json({
        success: false,
        error: 'SAP authentication credentials are not configured in environment.'
      });
    }

    const sapClient = new SapClient(jobConfig);
    const service = new ShortCloserService(sapClient, jobConfig);
    const stats = await service.run();

    const statusCode = stats.errors > 0 ? 500 : 200;
    return res.status(statusCode).json({
      success: stats.errors === 0,
      timestamp: new Date().toISOString(),
      isDryRun,
      dateField: jobConfig.dateField,
      fromDate: jobConfig.fromDate,
      toDate: jobConfig.toDate,
      rejectionReason: jobConfig.rejectionReason,
      totalOrders: stats.totalOrders || 0,
      totalItems: stats.totalItems || 0,
      eligibleCandidates: stats.eligibleCandidates?.length || 0,
      updatedSuccess: stats.updatedSuccess || 0,
      errors: stats.errors || 0,
      results: stats.results || []
    });
  } catch (err) {
    logger.error('[JOB-RUN] Fatal execution error:', err.message);
    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: err.message || 'Fatal error during scheduled job execution.'
    });
  }
};

app.post('/api/job/run', handleJobRun);
app.post('/api/job/execute', handleJobRun);
app.get('/api/job/run', handleJobRun);

// Single page application route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
if (require.main === module) {
  app.listen(PORT, () => {
    logger.header('SAP SALES ORDER SHORT-CLOSE WEB SERVER');
    logger.info(`Web UI available at: http://localhost:${PORT}`);
    logger.info(`Default Rejection Reason Code: '${config.rejectionReason || '81'}'`);
    logger.info(`Default Date Range: ${config.fromDate} to ${config.toDate}`);
  });
}

module.exports = app;
