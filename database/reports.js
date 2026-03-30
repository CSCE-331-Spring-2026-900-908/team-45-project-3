const { query, withTransaction } = require('./client');
const { ensureReportingTables } = require('./schema');
const { toMoney } = require('./helpers');
const { fetchLowInventoryItems, fetchProductCategories, fetchProducts } = require('./catalog');

async function fetchTotalRevenue() {
  const { rows } = await query('SELECT COALESCE(SUM(cost), 0) AS total_revenue FROM orders');
  return toMoney(rows[0]?.total_revenue);
}

async function fetchXReportForToday() {
  await ensureReportingTables();
  const { rows } = await query(
    'SELECT hour, sales, tax, voids, credit_card, debit_card, gift_card, cash, discounts, service_charges FROM x_hourly_totals ORDER BY hour'
  );
  return rows.map((row) => ({
    hour: Number(row.hour),
    sales: toMoney(row.sales),
    tax: toMoney(row.tax),
    voids: toMoney(row.voids),
    creditCard: toMoney(row.credit_card),
    debitCard: toMoney(row.debit_card),
    giftCard: toMoney(row.gift_card),
    cash: toMoney(row.cash),
    discounts: toMoney(row.discounts),
    serviceCharges: toMoney(row.service_charges),
  }));
}

async function fetchMostOrderedProducts(limit = 8) {
  const safeLimit = Math.max(1, Number(limit) || 8);
  const { rows } = await query(
    'SELECT p.id, p.name, COUNT(*) AS order_count FROM orders o JOIN products p ON p.id = o.item GROUP BY p.id, p.name ORDER BY order_count DESC, p.name ASC LIMIT $1',
    [safeLimit]
  );
  return rows.map((row) => ({ id: Number(row.id), name: row.name, orderCount: Number(row.order_count) }));
}

async function fetchInventoryUsage(startDate, endDate, limit = 8) {
  const safeLimit = Math.max(1, Number(limit) || 8);
  const { rows } = await query(
    'SELECT i.id, i.name, COALESCE(SUM(pi.quantity_used), 0) AS units_used ' +
      'FROM orders o ' +
      'JOIN product_ingredients pi ON pi.product_id = o.item ' +
      'JOIN inventory i ON i.id = pi.ingredient_id ' +
      'WHERE o.date::date BETWEEN $1::date AND $2::date ' +
      'GROUP BY i.id, i.name ORDER BY units_used DESC, i.name ASC LIMIT $3',
    [startDate, endDate, safeLimit]
  );
  return rows.map((row) => ({ id: Number(row.id), name: row.name, unitsUsed: Number(row.units_used) }));
}

async function runZReport(employeeSignature, managerSignature) {
  return withTransaction(async (client) => {
    await ensureReportingTables(client);
    const { rows } = await client.query(
      'SELECT SUM(sales) AS sales, SUM(tax) AS tax, SUM(voids) AS voids, SUM(credit_card) AS credit_card, ' +
      'SUM(debit_card) AS debit_card, SUM(gift_card) AS gift_card, SUM(cash) AS cash, ' +
      'SUM(discounts) AS discounts, SUM(service_charges) AS service_charges FROM x_hourly_totals'
    );

    const totals = rows[0] || {};
    const values = [
      employeeSignature || '',
      managerSignature || '',
      toMoney(totals.sales),
      toMoney(totals.tax),
      toMoney(totals.voids),
      toMoney(totals.credit_card),
      toMoney(totals.debit_card),
      toMoney(totals.gift_card),
      toMoney(totals.cash),
      toMoney(totals.discounts),
      toMoney(totals.service_charges),
      toMoney(totals.cash),
      toMoney(totals.sales),
    ];

    await client.query(
      'INSERT INTO z_reports (' +
        'run_date, employee_sig, manager_signature, sales, tax, voids, credit_card, debit_card, gift_card, cash, discounts, service_charges, total_cash, total_sales' +
      ') VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ' +
      'ON CONFLICT (run_date) DO UPDATE SET ' +
        'employee_sig = EXCLUDED.employee_sig, manager_signature = EXCLUDED.manager_signature, sales = EXCLUDED.sales, tax = EXCLUDED.tax, voids = EXCLUDED.voids, credit_card = EXCLUDED.credit_card, debit_card = EXCLUDED.debit_card, gift_card = EXCLUDED.gift_card, cash = EXCLUDED.cash, discounts = EXCLUDED.discounts, service_charges = EXCLUDED.service_charges, total_cash = EXCLUDED.total_cash, total_sales = EXCLUDED.total_sales, generated_at = CURRENT_TIMESTAMP',
      values
    );

    await client.query(
      'UPDATE x_hourly_totals SET sales = 0, tax = 0, voids = 0, credit_card = 0, debit_card = 0, gift_card = 0, cash = 0, discounts = 0, service_charges = 0'
    );

    return {
      runDate: new Date().toISOString().slice(0, 10),
      employeeSignature: employeeSignature || '',
      managerSignature: managerSignature || '',
      sales: toMoney(totals.sales),
      tax: toMoney(totals.tax),
      voids: toMoney(totals.voids),
      creditCard: toMoney(totals.credit_card),
      debitCard: toMoney(totals.debit_card),
      giftCard: toMoney(totals.gift_card),
      cash: toMoney(totals.cash),
      discounts: toMoney(totals.discounts),
      serviceCharges: toMoney(totals.service_charges),
      totalCash: toMoney(totals.cash),
      totalSales: toMoney(totals.sales),
    };
  });
}

async function resetZReportToday() {
  return withTransaction(async (client) => {
    await ensureReportingTables(client);
    const deleted = await client.query('DELETE FROM z_reports WHERE run_date = CURRENT_DATE');
    await client.query('UPDATE x_hourly_totals SET sales = 0, tax = 0, voids = 0, credit_card = 0, debit_card = 0, gift_card = 0, cash = 0, discounts = 0, service_charges = 0');
    return deleted.rowCount > 0;
  });
}

async function fetchPortalSummary() {
  const [menuPreview, categories, lowInventory, totalRevenue] = await Promise.all([
    fetchProducts(),
    fetchProductCategories(),
    fetchLowInventoryItems(60),
    fetchTotalRevenue(),
  ]);
  return { menuPreview: menuPreview.slice(0, 8), categories, lowInventoryCount: lowInventory.length, totalRevenue };
}

module.exports = {
  fetchInventoryUsage,
  fetchMostOrderedProducts,
  fetchPortalSummary,
  fetchTotalRevenue,
  fetchXReportForToday,
  resetZReportToday,
  runZReport,
};