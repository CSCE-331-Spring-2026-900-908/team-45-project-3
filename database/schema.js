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

/**
 * Adds a unique auto-incrementing customer_id and a free_drink_credits counter
 * to the existing customer_rewards_accounts table.
 * Safe to call multiple times — all operations are idempotent.
 */
async function ensureCustomerIdAndCreditsColumns(client = null) {
  const runner = client || getPool();
  // Sequence that drives customer IDs
  await runner.query('CREATE SEQUENCE IF NOT EXISTS customer_rewards_id_seq');
  // Add the column (no-op if it already exists)
  await runner.query(
    'ALTER TABLE customer_rewards_accounts ADD COLUMN IF NOT EXISTS customer_id BIGINT'
  );
  // Back-fill any existing rows that predate this migration
  await runner.query(
    "UPDATE customer_rewards_accounts SET customer_id = nextval('customer_rewards_id_seq') WHERE customer_id IS NULL"
  );
  // Future inserts get an ID automatically
  await runner.query(
    "ALTER TABLE customer_rewards_accounts ALTER COLUMN customer_id SET DEFAULT nextval('customer_rewards_id_seq')"
  );
  // Free-drink credit balance — 1 credit = 1 free drink
  await runner.query(
    'ALTER TABLE customer_rewards_accounts ADD COLUMN IF NOT EXISTS free_drink_credits INT NOT NULL DEFAULT 0'
  );
}

/**
 * Creates the customer_reward_transactions table that records every
 * point-earning purchase. Each row represents one order that earned points.
 * Safe to call multiple times.
 */
async function ensureRewardTransactionsTable(client = null) {
  const runner = client || getPool();
  await runner.query(
    'CREATE TABLE IF NOT EXISTS customer_reward_transactions (' +
      'id SERIAL PRIMARY KEY, ' +
      'customer_email TEXT NOT NULL, ' +
      'points_earned INT NOT NULL DEFAULT 1, ' +
      'credit_granted BOOLEAN NOT NULL DEFAULT FALSE, ' +
      'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
}

module.exports = {
  ensureCustomerIdAndCreditsColumns,
  ensureOrderPaymentsTable,
  ensureOrderVoidsTable,
  ensureProductActiveColumn,
  ensureRewardTransactionsTable,
  ensureRewardsAccountsTable,
  ensureReportingTables,
};
