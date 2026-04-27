const { query, withTransaction } = require('./client');
const {
  ensureCustomerIdAndCreditsColumns,
  ensureRewardTransactionsTable,
  ensureRewardsAccountsTable,
} = require('./schema');

const PHONE_DIGIT_PATTERN = /\d/g;
const PHONE_NUMBER_LENGTH = 10;

function normalizePhoneNumber(phoneNumber) {
  return (String(phoneNumber || '').match(PHONE_DIGIT_PATTERN) || []).join('').slice(0, PHONE_NUMBER_LENGTH);
}

function validatePhoneNumber(phoneNumber) {
  return normalizePhoneNumber(phoneNumber).length === PHONE_NUMBER_LENGTH;
}

function mapRewardsProfile(row) {
  if (!row) return null;
  return {
    phoneNumber: normalizePhoneNumber(row.phone_number),
    orderCount: Number(row.reward_counter || 0),
    customerId: row.customer_id != null ? Number(row.customer_id) : null,
    freeDrinkCredits: Number(row.free_drink_credits || 0),
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function fetchRewardsAccountByPhone(phoneNumber) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhoneNumber) return null;

  await ensureRewardsAccountsTable();
  await ensureCustomerIdAndCreditsColumns();
  const { rows } = await query(
    'SELECT phone_number, reward_counter, customer_id, free_drink_credits FROM customer_rewards_accounts WHERE phone_number = $1 LIMIT 1',
    [normalizedPhoneNumber]
  );
  return mapRewardsProfile(rows[0]);
}

async function registerRewardsAccount({ phoneNumber }) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  if (!validatePhoneNumber(normalizedPhoneNumber)) {
    throw createHttpError(400, 'Enter a 10-digit phone number.');
  }

  await ensureRewardsAccountsTable();
  await ensureCustomerIdAndCreditsColumns();
  await ensureRewardTransactionsTable();

  const existing = await query(
    'SELECT 1 FROM customer_rewards_accounts WHERE phone_number = $1 LIMIT 1',
    [normalizedPhoneNumber]
  );
  if (existing.rows.length) {
    throw createHttpError(409, 'An account already exists for that phone number.');
  }

  const { rows } = await query(
    'INSERT INTO customer_rewards_accounts (phone_number, reward_counter) VALUES ($1, 0) RETURNING phone_number, reward_counter, customer_id, free_drink_credits',
    [normalizedPhoneNumber]
  );
  return mapRewardsProfile(rows[0]);
}

async function authenticateRewardsAccount(phoneNumber) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  if (!validatePhoneNumber(normalizedPhoneNumber)) {
    throw createHttpError(400, 'Enter a 10-digit phone number.');
  }

  await ensureRewardsAccountsTable();
  await ensureCustomerIdAndCreditsColumns();

  const { rows } = await query(
    'SELECT phone_number, reward_counter, customer_id, free_drink_credits FROM customer_rewards_accounts WHERE phone_number = $1 LIMIT 1',
    [normalizedPhoneNumber]
  );
  if (!rows.length) {
    throw createHttpError(401, 'No rewards account found for that phone number.');
  }

  return mapRewardsProfile(rows[0]);
}

async function incrementRewardsCounter(phoneNumber) {
  // Normalize the input phone number for consistent DB lookup
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  // Reject if user is not authenticated / valid
  if (!normalizedPhoneNumber) throw createHttpError(401, 'Sign in to use rewards.');

  // Wrap all operations in a transaction for atomicity
  return withTransaction(async (client) => {
    // Ensure required tables/columns exist before operating
    await ensureRewardsAccountsTable(client);
    await ensureCustomerIdAndCreditsColumns(client);
    await ensureRewardTransactionsTable(client);

    // Increment reward counter for the user and return updated row
    const { rows } = await client.query(
      'UPDATE customer_rewards_accounts SET reward_counter = reward_counter + 1 WHERE phone_number = $1 RETURNING phone_number, reward_counter, customer_id, free_drink_credits',
      [normalizedPhoneNumber]
    );

    // If no account exists, throw error
    if (!rows.length) throw createHttpError(404, 'Rewards account not found.');

    // Extract updated counter value
    const newCounter = Number(rows[0].reward_counter);

    // Determine if a reward milestone (every 5 visits) is reached
    const creditGranted = newCounter % 5 === 0;

    // Log this transaction in reward history table
    await client.query(
      'INSERT INTO customer_reward_transactions (customer_phone_number, points_earned, credit_granted) VALUES ($1, 1, $2)',
      [normalizedPhoneNumber, creditGranted]
    );

    // If milestone reached, increment free drink credits
    if (creditGranted) {
      await client.query(
        'UPDATE customer_rewards_accounts SET free_drink_credits = free_drink_credits + 1 WHERE phone_number = $1',
        [normalizedPhoneNumber]
      );

      // Reflect updated credit count in returned object
      rows[0].free_drink_credits = Number(rows[0].free_drink_credits) + 1;
    }

    // Map DB row to response object
    return mapRewardsProfile(rows[0]);
  });
}

async function redeemFreeDrinkCredit(phoneNumber) {
  // Normalize phone number input
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  // Reject if invalid / unauthenticated
  if (!normalizedPhoneNumber) throw createHttpError(401, 'Sign in to redeem a free drink.');

  // Execute within transaction
  return withTransaction(async (client) => {
    // Ensure required schema exists
    await ensureRewardsAccountsTable(client);
    await ensureCustomerIdAndCreditsColumns(client);

    // Fetch current credit balance
    const { rows } = await client.query(
      'SELECT free_drink_credits FROM customer_rewards_accounts WHERE phone_number = $1 LIMIT 1',
      [normalizedPhoneNumber]
    );

    // Validate account existence
    if (!rows.length) throw createHttpError(404, 'Rewards account not found.');

    // Ensure user has available credits
    if (Number(rows[0].free_drink_credits) <= 0) {
      throw createHttpError(400, 'No free drink credits available to redeem.');
    }

    // Decrement credit balance and return updated profile
    const { rows: updated } = await client.query(
      'UPDATE customer_rewards_accounts SET free_drink_credits = free_drink_credits - 1 WHERE phone_number = $1 RETURNING phone_number, reward_counter, customer_id, free_drink_credits',
      [normalizedPhoneNumber]
    );

    // Map updated row to response object
    return mapRewardsProfile(updated[0]);
  });
}
module.exports = {
  authenticateRewardsAccount,
  fetchRewardsAccountByPhone,
  incrementRewardsCounter,
  normalizePhoneNumber,
  redeemFreeDrinkCredit,
  registerRewardsAccount,
  validatePhoneNumber,
};
