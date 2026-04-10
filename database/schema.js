const { getPool } = require('./client');

let hasVerifiedProductActiveColumn = false;

async function ensureProductActiveColumn(client = null) {
  if (hasVerifiedProductActiveColumn) {
    return;
  }

  const runner = client || getPool();
  const { rows } = await runner.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'active' LIMIT 1"
  );

  if (!rows.length) {
    await runner.query('ALTER TABLE products ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE');
  }

  hasVerifiedProductActiveColumn = true;
}

async function ensureOrderPaymentsTable(client = null) {
  const runner = client || getPool();
  await runner.query('CREATE TABLE IF NOT EXISTS order_payments (id SERIAL PRIMARY KEY, order_start_id INT NOT NULL, order_end_id INT NOT NULL, total_amount NUMERIC(10,2) NOT NULL, primary_payment_type TEXT NOT NULL, secondary_payment_type TEXT, gift_amount NUMERIC(10,2) NOT NULL DEFAULT 0, cash_received NUMERIC(10,2) NOT NULL DEFAULT 0, cash_change NUMERIC(10,2) NOT NULL DEFAULT 0, voided BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  await runner.query('ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE');
}

async function ensureOrderVoidsTable(client = null) {
  const runner = client || getPool();
  await runner.query('CREATE TABLE IF NOT EXISTS order_voids (id SERIAL PRIMARY KEY, payment_id INT NOT NULL UNIQUE, order_start_id INT NOT NULL, order_end_id INT NOT NULL, void_amount NUMERIC(10,2) NOT NULL, voided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
}

async function ensureReportingTables(client = null) {
  const runner = client || getPool();
  await runner.query('CREATE TABLE IF NOT EXISTS x_hourly_totals (hour INT PRIMARY KEY, sales NUMERIC(12,2) NOT NULL DEFAULT 0, tax NUMERIC(12,2) NOT NULL DEFAULT 0, voids NUMERIC(12,2) NOT NULL DEFAULT 0, credit_card NUMERIC(12,2) NOT NULL DEFAULT 0, debit_card NUMERIC(12,2) NOT NULL DEFAULT 0, gift_card NUMERIC(12,2) NOT NULL DEFAULT 0, cash NUMERIC(12,2) NOT NULL DEFAULT 0, discounts NUMERIC(12,2) NOT NULL DEFAULT 0, service_charges NUMERIC(12,2) NOT NULL DEFAULT 0)');
  for (let hour = 0; hour < 24; hour += 1) {
    await runner.query('INSERT INTO x_hourly_totals (hour) VALUES ($1) ON CONFLICT (hour) DO NOTHING', [hour]);
  }

  await runner.query(
    "CREATE TABLE IF NOT EXISTS z_reports (" +
      "run_date DATE PRIMARY KEY, " +
      "sales NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "tax NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "voids NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "credit_card NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "debit_card NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "gift_card NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "cash NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "discounts NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "service_charges NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "total_cash NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "total_sales NUMERIC(12,2) NOT NULL DEFAULT 0, " +
      "manager_signature TEXT NOT NULL DEFAULT 'Manager', " +
      "employee_sig TEXT NOT NULL DEFAULT '', " +
      "generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
    ")"
  );
  await runner.query('ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS total_sales NUMERIC(12,2) NOT NULL DEFAULT 0');
  await runner.query("ALTER TABLE z_reports ADD COLUMN IF NOT EXISTS employee_sig TEXT NOT NULL DEFAULT ''");
}

async function ensureRewardsAccountsTable(client = null) {
  const runner = client || getPool();
  await runner.query(
    'CREATE TABLE IF NOT EXISTS customer_rewards_accounts (' +
      'email TEXT PRIMARY KEY, ' +
      'password_hash TEXT NOT NULL, ' +
      'reward_counter INT NOT NULL DEFAULT 0, ' +
      "name TEXT NOT NULL DEFAULT '', " +
      'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
  await runner.query("ALTER TABLE customer_rewards_accounts ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''");
}

module.exports = {
  ensureOrderPaymentsTable,
  ensureOrderVoidsTable,
  ensureProductActiveColumn,
  ensureRewardsAccountsTable,
  ensureReportingTables,
};
