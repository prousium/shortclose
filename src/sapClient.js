const https = require('https');
const logger = require('./logger');

class SapClient {
  constructor(config) {
    this.baseHost = config.baseHost;
    this.basePath = config.basePath.endsWith('/') ? config.basePath : `${config.basePath}/`;
    this.authHeader = config.authHeader;
  }

  request(options, data = null) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
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
      if (data) req.write(data);
      req.end();
    });
  }

  parseCookies(setCookieHeader) {
    if (!setCookieHeader) return '';
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    return cookies.map(c => c.split(';')[0]).join('; ');
  }

  parseODataDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/\/Date\((\d+)\)\//);
    if (match) {
      return new Date(parseInt(match[1], 10)).toISOString().split('T')[0];
    }
    return dateStr;
  }

  /**
   * Fetch Sales Orders within a date range and expand their items in a single call
   */
  async fetchSalesOrders({ fromDate, toDate, dateField = 'CreationDate' }) {
    const filter = `${dateField} ge datetime'${fromDate}T00:00:00' and ${dateField} le datetime'${toDate}T23:59:59'`;
    const path = `${this.basePath}A_SalesOrder?$filter=${encodeURI(filter)}&$expand=to_Item&$format=json`;

    logger.info(`Fetching orders from ${fromDate} to ${toDate} (filtered on ${dateField})...`);
    logger.info(`OData URL: https://${this.baseHost}${path}`);

    const res = await this.request({
      hostname: this.baseHost,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (res.statusCode !== 200) {
      throw new Error(`Failed to fetch sales orders: HTTP ${res.statusCode} ${res.statusMessage} - ${res.body}`);
    }

    const data = JSON.parse(res.body);
    const orders = data.d?.results || [];
    logger.info(`Retrieved ${orders.length} sales orders.`);
    return orders;
  }

  /**
   * Fetch a single sales order with expanded items
   */
  async fetchSingleOrder(salesOrder) {
    const path = `${this.basePath}A_SalesOrder('${salesOrder}')?$expand=to_Item&$format=json`;
    logger.info(`Fetching single order ${salesOrder}...`);

    const res = await this.request({
      hostname: this.baseHost,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (res.statusCode !== 200) {
      throw new Error(`Order ${salesOrder} not found: HTTP ${res.statusCode} - ${res.body}`);
    }

    const data = JSON.parse(res.body);
    return data.d;
  }

  /**
   * Fetch fresh CSRF token and session cookies for write operations
   */
  async fetchCsrfSession(salesOrder, item) {
    const path = `${this.basePath}A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${item}')?$format=json`;

    const res = await this.request({
      hostname: this.baseHost,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'x-csrf-token': 'fetch'
      }
    });

    const csrfToken = res.headers['x-csrf-token'];
    const cookies = this.parseCookies(res.headers['set-cookie']);

    if (!csrfToken || csrfToken.toLowerCase() === 'required') {
      throw new Error(`Failed to fetch CSRF token: header value was '${csrfToken}'`);
    }

    return { csrfToken, cookies };
  }

  /**
   * Short-close a sales order item by setting its Reason for Rejection
   * Note: SAP Gateway rejects literal PATCH with 405. Uses POST + X-HTTP-Method: MERGE.
   */
  async shortCloseItem(salesOrder, item, rejectionReason, csrfToken, cookies) {
    const path = `${this.basePath}A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${item}')`;
    const payload = JSON.stringify({
      SalesDocumentRjcnReason: rejectionReason
    });

    const res = await this.request({
      hostname: this.baseHost,
      path: path,
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        'Cookie': cookies,
        'If-Match': '*',
        'X-HTTP-Method': 'MERGE'
      }
    }, payload);

    if (res.statusCode !== 204 && res.statusCode !== 200) {
      let errorMsg = res.body;
      try {
        const parsed = JSON.parse(res.body);
        errorMsg = parsed.error?.message?.value || res.body;
      } catch (e) {}
      throw new Error(`SAP Gateway error: HTTP ${res.statusCode} ${res.statusMessage} - ${errorMsg}`);
    }

    return true;
  }

  /**
   * Verify updated item state
   */
  async verifyItem(salesOrder, item) {
    const path = `${this.basePath}A_SalesOrderItem(SalesOrder='${salesOrder}',SalesOrderItem='${item}')?$format=json`;
    const res = await this.request({
      hostname: this.baseHost,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json'
      }
    });

    if (res.statusCode === 200) {
      const data = JSON.parse(res.body).d;
      return {
        salesOrder: data.SalesOrder,
        item: data.SalesOrderItem,
        quantity: data.ConfdDelivQtyInOrderQtyUnit || data.RequestedQuantity,
        unit: data.OrderQuantityUnit || data.RequestedQuantityUnit,
        sapUnit: data.OrderQuantitySAPUnit || data.RequestedQuantitySAPUnit,
        rejectionReason: data.SalesDocumentRjcnReason,
        processStatus: data.SDProcessStatus,
        deliveryStatus: data.DeliveryStatus
      };
    }
    return null;
  }
}

module.exports = SapClient;
