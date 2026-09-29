# SAP Sales Order Short-Close Application

Automated solution for identifying and short-closing SAP S/4HANA Cloud sales order line items that have confirmed delivery quantities less than or equal to a specified threshold (default **5.0 ZMT**) within a rolling date window.

This project supports two operational modes:
1. **Automated Scheduled Job**: Executes unattended as a Cloud Foundry Task via SAP BTP Job Scheduling Service with zero interactive prompts, full stdout audit trails, and deterministic exit codes (`0` on success, `1` on failure).
2. **Interactive Web UI**: Lightweight Express web dashboard (`server.js`) with visual **Preview** and **Execute** capabilities for SD business users.

---

## Architecture & Deployment Details

- **Target Platform**: SAP BTP Cloud Foundry Environment
- **API Endpoint**: `https://api.cf.us10-001.hana.ondemand.com`
- **Org**: `33a0e5cctrial`
- **Space**: `dev`
- **App Name**: `sap-shortclose`
- **Buildpack**: `nodejs_buildpack`
- **Memory**: `256M`
- **SAP Gateway Service**: `API_SALES_ORDER_SRV` (Entities: `A_SalesOrder`, `A_SalesOrderItem`)
- **Business Logic Specification**:
  - Filter: `CreationDate` (or `SalesOrderDate`) in rolling window (default: last 7 days)
  - Unit of Measure: `OrderQuantitySAPUnit` / `OrderQuantityUnit` = `ZMT`
  - Quantity: `ConfdDelivQtyInOrderQtyUnit` <= `5.0`
  - Processing Status: `SDProcessStatus === 'A'` (Open only)
  - Rejection Reason: Updates `SalesDocumentRjcnReason` to `'81'` (or SD-configured code) via `POST` with `X-HTTP-Method: MERGE`

---

## 1. Cloud Foundry Login

Log in to your SAP BTP Cloud Foundry environment using the CF CLI:

```bash
cf login -a https://api.cf.us10-001.hana.ondemand.com -o 33a0e5cctrial -s dev
```

> **Note**: If your SAP BTP account uses Single Sign-On (SSO) / Corporate Identity Provider:
> ```bash
> cf login -a https://api.cf.us10-001.hana.ondemand.com -o 33a0e5cctrial -s dev --sso
> ```

---

## 2. Deploying to Cloud Foundry

Deploy the application using the included [`manifest.yml`](manifest.yml):

```bash
cf push
```

Or explicitly targeting the manifest:

```bash
cf push -f manifest.yml
```

### Routing Strategy (Public Web UI vs. Private Headless Worker)

The [`manifest.yml`](manifest.yml) is pre-configured with `random-route: true`, which assigns a unique URL so you can access the interactive Web UI.

If you prefer **NO public route** on trial (headless scheduled worker triggered solely via CF Tasks):
1. Open [`manifest.yml`](manifest.yml)
2. Comment out `random-route: true`
3. Uncomment:
   ```yaml
   no-route: true
   health-check-type: process
   ```
4. Push with `cf push`.

---

## 3. Configuring Environment Variables

Configure SAP connection parameters and business rule settings in Cloud Foundry using `cf set-env`. 

All settings are read purely from `process.env` at runtime—**no local `.env` file is required on Cloud Foundry**.

### A. SAP Connection & Authentication

Run the following commands in your terminal:

```bash
# 1. SAP S/4HANA Cloud Host and OData Path
cf set-env sap-shortclose SAP_BASE_HOST "my403214-api.s4hana.cloud.sap"
cf set-env sap-shortclose SAP_BASE_PATH "/sap/opu/odata/sap/API_SALES_ORDER_SRV/"

# 2. Authentication: Option 1 - Precomputed Basic Auth Header
cf set-env sap-shortclose SAP_AUTH_HEADER "Basic <INSERT_BASE64_CREDENTIALS>"

# OR Authentication: Option 2 - Separate Username and Password
# cf set-env sap-shortclose SAP_USERNAME "<COMMUNICATION_USER>"
# cf set-env sap-shortclose SAP_PASSWORD "<COMMUNICATION_PASSWORD>"
```

### B. Business Rule Configuration

```bash
# Rejection Reason Code (Default '81' verified in live tests)
cf set-env sap-shortclose REJECTION_REASON_CODE "81"

# Quantity Threshold (<= 5.0)
cf set-env sap-shortclose QUANTITY_THRESHOLD "5.0"

# Target Unit of Measure
cf set-env sap-shortclose TARGET_UNIT "ZMT"

# Date Field to filter on ('CreationDate' or 'SalesOrderDate')
cf set-env sap-shortclose DEFAULT_DATE_FIELD "CreationDate"

# Rolling Date Window in days (e.g. 7 = rolling last 7 days from current date)
cf set-env sap-shortclose ROLLING_WINDOW_DAYS "7"

# Execution Mode: set to 'false' for live system updates, or 'true' for dry-run simulation
cf set-env sap-shortclose DRY_RUN "false"
```

### C. Apply Changes

After updating environment variables, restage the application to inject them into the container runtime:

```bash
cf restage sap-shortclose
```

---

## 4. SAP Job Scheduling Service Setup

The SAP Job Scheduling Service (`jobscheduler`) can trigger the short-close job automatically according to a recurring schedule (e.g. daily).

### Step 4.1: Create the Job Scheduling Service Instance

Check available plans in your trial/production subaccount:

```bash
cf marketplace -e jobscheduler
```

Create the service instance (use plan `lite` or `free` on trial, `standard` on production):

```bash
# For BTP Trial accounts:
cf create-service jobscheduler lite sap-shortclose-scheduler
# (If 'lite' is deprecated in your trial region, use 'free'):
# cf create-service jobscheduler free sap-shortclose-scheduler

# For Production accounts:
# cf create-service jobscheduler standard sap-shortclose-scheduler
```

Verify service creation:

```bash
cf service sap-shortclose-scheduler
```

### Step 4.2: Bind the Service to `sap-shortclose`

Bind the service instance to your application:

```bash
cf bind-service sap-shortclose sap-shortclose-scheduler
cf restage sap-shortclose
```

---

### Step 4.3: Choose Trigger Mechanism in Job Scheduling Service

The SAP Job Scheduling Service supports **two mechanisms**. Both are fully supported by this codebase:

| Mechanism | Description | Best For | Entry Point |
|---|---|---|---|
| **Mechanism 1: Cloud Foundry Task** *(Recommended)* | Runs ephemeral container task using `cf run-task`. Terminates when done. | Batch jobs, cron routines, headless workers | `node job.js` |
| **Mechanism 2: HTTP Action Endpoint** | Sends scheduled HTTP `POST` requests to the running web server. | Continuously running web apps | `POST /api/job/run` |

---

### Option 1 (Recommended): Cloud Foundry Task via Job Scheduler

Cloud Foundry Tasks execute as short-lived container processes isolated from the web server. They run to completion, log everything to stdout, and exit with code `0` on success or `1` on error.

#### In the SAP BTP Cockpit Dashboard:
1. Go to your **SAP BTP Cockpit** -> Subaccount -> Space **`dev`**.
2. Navigate to **Instances and Subscriptions** -> Find **`sap-shortclose-scheduler`**.
3. Click **Go to Dashboard** (or click the instance and open the dashboard URL).
4. Select the **Tasks** (or **CF Tasks**) tab.
5. Click **Create Task**:
   - **Task Name**: `daily-sales-order-shortclose`
   - **Application**: Select `sap-shortclose` from dropdown
   - **Command**: `node job.js`
6. Click **Create**.
7. In the task details, click **Add Schedule**:
   - **Schedule Name**: `daily-run-02am`
   - **Type**: `Cron`
   - **Cron Expression**: `0 2 * * *` *(Runs daily at 02:00 UTC)*
   - **Active**: Check the box to activate
8. Click **Save**.

#### Manual On-Demand Testing via CLI:
You can trigger and test the Cloud Foundry Task immediately via the CF CLI without waiting for the scheduled time:

```bash
cf run-task sap-shortclose "node job.js" --name manual-shortclose-test
```

To list task status:
```bash
cf tasks sap-shortclose
```

---

### Option 2: HTTP Action Endpoint via Job Scheduler

If your application runs with a web route (`random-route: true`), you can schedule HTTP calls to the automated job endpoint.

1. Open the **Job Scheduling Service Dashboard** from BTP Cockpit.
2. Select the **Jobs** tab.
3. Click **Create Job**:
   - **Job Name**: `sap-shortclose-http-job`
   - **Description**: `Automated Daily Short-Close for Orders <= 5 ZMT`
   - **Action**: `https://<YOUR-CF-APP-ROUTE>/api/job/run`
   - **HTTP Method**: `POST`
4. Click **Create**.
5. Select the created job and click **Add Schedule**:
   - **Cron Expression**: `0 2 * * *` *(Daily at 02:00 UTC)*
   - **Active**: Check to activate
6. The endpoint returns:
   - HTTP `200` with JSON audit results if all candidates succeed.
   - HTTP `500` if any item fails or an unhandled exception occurs (triggering Job Scheduler error alerts).

---

## 5. Audit Logging & Monitoring (`cf logs`)

Every execution of [`job.js`](job.js) writes a comprehensive audit trail to standard output. 

### Stream Live Logs:
```bash
cf logs sap-shortclose
```

### View Recent Logs:
```bash
cf logs sap-shortclose --recent
```

### Example Audit Trail in `cf logs`:

```text
================================================================
  SAP BTP SCHEDULED JOB: SALES ORDER SHORT-CLOSE
================================================================
[2026-09-29 07:24:32] [INFO] Target Host:      my403214-api.s4hana.cloud.sap
[2026-09-29 07:24:32] [INFO] Base Path:        /sap/opu/odata/sap/API_SALES_ORDER_SRV/
[2026-09-29 07:24:32] [INFO] Date Field:       CreationDate
[2026-09-29 07:24:32] [INFO] Date Range:       2026-09-22 to 2026-09-29 (7 days rolling window)
[2026-09-29 07:24:32] [INFO] Criteria:         Unit='ZMT', ConfdDelivQty <= 5, SDProcessStatus='A' (Open)
[2026-09-29 07:24:32] [INFO] Rejection Code:   '81'
[2026-09-29 07:24:32] [INFO] Execution Mode:   LIVE EXECUTION (Updating SAP S/4HANA)
----------------------------------------------------------------
[2026-09-29 07:24:32] [INFO] Evaluating line items across fetched orders...
[2026-09-29 07:24:32] [SKIP] Order 40000440, Item 10: Unit is 'TO', not ZMT (skipped)
[2026-09-29 07:24:32] [SKIP] Order 40000444, Item 10: Confirmed Quantity 5250.61 ZMT > threshold (5)
[2026-09-29 07:24:32] [SKIP] Order 40000450, Item 10: Item status SDProcessStatus is 'C', not 'A' (Open)
[2026-09-29 07:24:32] [INFO] [CANDIDATE] Order 40000453, Item 10: Confirmed Qty 1 ZMT (Open)
----------------------------------------------------------------
[2026-09-29 07:24:33] [INFO] Processing Order 40000453, Item 10 (1 ZMT)...
[2026-09-29 07:24:33] [INFO] Fetching CSRF token & session for Order 40000453, Item 10...
[2026-09-29 07:24:33] [INFO] Sending MERGE update for Order 40000453, Item 10 with Reason '81'...
[2026-09-29 07:24:34] [INFO] Verifying update on SAP Gateway...
[2026-09-29 07:24:34] [SUCCESS] Order 40000453, Item 10 short-closed successfully! Reason persisted as '81'.
================================================================
  SCHEDULED JOB AUDIT TRAIL
================================================================
[2026-09-29 07:24:34] [INFO] Orders Scanned:          43
[2026-09-29 07:24:34] [INFO] Items Evaluated:         43
[2026-09-29 07:24:34] [INFO] Eligible Candidates:     1
[2026-09-29 07:24:34] [INFO] Skipped Non-ZMT:         24
[2026-09-29 07:24:34] [INFO] Skipped Over 5 ZMT:      4
[2026-09-29 07:24:34] [INFO] Skipped Not Open Status: 14
[2026-09-29 07:24:34] [INFO] Skipped Already Closed:  0
[2026-09-29 07:24:34] [INFO] Successfully Updated:    1
[2026-09-29 07:24:34] [INFO] Failed / Errors:         0
----------------------------------------------------------------
[2026-09-29 07:24:34] [SUCCESS] [AUDIT SUCCESS] Order 40000453 | Item 10 | Material 650000060 | Qty: 1 ZMT | Reason: '81'
[2026-09-29 07:24:34] [INFO] Job duration: 1.82s
[2026-09-29 07:24:34] [SUCCESS] Job completed successfully with zero errors. Exiting with code 0.
```

---

## 6. Local Development & Testing

```bash
# 1. Start the interactive Web UI locally (http://localhost:3000)
npm run server

# 2. Run the scheduled job script locally in safe dry-run mode
npm run job:dry-run

# 3. Run the scheduled job script live against SAP
npm run job

# 4. Run ad-hoc CLI queries with custom parameters
node index.js --dry-run --from=2024-02-01 --to=2024-03-31 --reason=81
node index.js --execute --order=40000431 --reason=81

# 5. Test SAP connectivity
npm run test:connection
```
