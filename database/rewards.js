// Grabbing the crypto module for passwords and bringing in the DB helpers
const crypto = require('node:crypto');
const { query, withTransaction } = require('./client');
const {
  ensureCustomerIdAndCreditsColumns,
  ensureRewardTransactionsTable,
  ensureRewardsAccountsTable,
} = require('./schema');

// Standard checks: basic email regex and a decent password floor
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

// Cleaning up input so " User@Gmail.com " doesn't break things
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return EMAIL_PATTERN.test(normalizedEmail);
}

// Scrypt is a solid choice here—it's slow on purpose to fight off brute-force attacks
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${digest}`; // Store the salt with the hash so we can find it later
}

function verifyPassword(password, passwordHash) {
  const [salt, storedDigest] = String(passwordHash || '').split(':');
  if (!salt || !storedDigest) return false;

  const candidateDigest = crypto.scryptSync(String(password), salt, 64);
  const storedBuffer = Buffer.from(storedDigest, 'hex');
  
  if (candidateDigest.length !== storedBuffer.length) return false;

  // timingSafeEqual prevents "timing attacks" where hackers guess based on response time
  return crypto.timingSafeEqual(candidateDigest, storedBuffer);
}

// Turning raw database rows into a clean object the frontend can actually use
function mapRewardsProfile(row) {
  if (!row) return null;
  return {
    email: normalizeEmail(row.email),
    name: row.name || '',
    orderCount: Number(row.reward_counter || 0),
    customerId: row.customer_id != null ? Number(row.customer_id) : null,
    freeDrinkCredits: Number(row.free_drink_credits || 0),
  };
}

// Helper to keep the route handlers tidy
function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Quick lookup for existing fans
async function fetchRewardsAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  await ensureRewardsAccountsTable();
  await ensureCustomerIdAndCreditsColumns();
  const { rows } = await query(
    'SELECT email, name, reward_counter, customer_id, free_drink_credits FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  return mapRewardsProfile(rows[0]);
}

// The "Welcome to the club" function
async function registerRewardsAccount({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = String(name || '').trim();
  const normalizedPassword = String(password || '');

  // Safety first: validate before touching the DB
  if (!validateEmail(normalizedEmail)) {
    throw createHttpError(400, 'Enter a valid email address.');
  }
  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    throw createHttpError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  await ensureRewardsAccountsTable();
  await ensureCustomerIdAndCreditsColumns();
  await ensureRewardTransactionsTable();

  // No double-dipping on emails
  const existing = await query(
    'SELECT 1 FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  if (existing.rows.length) {
    throw createHttpError(409, 'An account already exists for that email.');
  }

  const { rows } = await query(
    'INSERT INTO customer_rewards_accounts (email, password_hash, reward_counter, name) VALUES ($1, $2, 0, $3) RETURNING email, name, reward_counter, customer_id, free_drink_credits',
    [normalizedEmail, hashPassword(normalizedPassword), trimmedName]
  );

  return mapRewardsProfile(rows[0]);
}

// Gatekeeper for the login screen
async function authenticateRewardsAccount(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '');

  if (!validateEmail(normalizedEmail)) throw createHttpError(400, 'Enter a valid email address.');
  if (!normalizedPassword) throw createHttpError(400, 'Enter your password.');

  await ensureRewardsAccountsTable();
  await ensureCustomerIdAndCreditsColumns();
  
  const { rows } = await query(
    'SELECT email, name, reward_counter, customer_id, free_drink_credits, password_hash FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  
  const account = rows[0];
  if (!account || !verifyPassword(normalizedPassword, account.password_hash)) {
    throw createHttpError(401, 'Incorrect email or password.');
  }

  return mapRewardsProfile(account);
}

// The main event: adding a point and checking if they earned a freebie
async function incrementRewardsCounter(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw createHttpError(401, 'Sign in to use rewards.');

  // wrapping this in a transaction so points and credits never get "out of sync"
  return withTransaction(async (client) => {
    await ensureRewardsAccountsTable(client);
    await ensureCustomerIdAndCreditsColumns(client);
    await ensureRewardTransactionsTable(client);

    const { rows } = await client.query(
      'UPDATE customer_rewards_accounts SET reward_counter = reward_counter + 1 WHERE email = $1 RETURNING email, name, reward_counter, customer_id, free_drink_credits',
      [normalizedEmail]
    );

    if (!rows.length) throw createHttpError(404, 'Rewards account not found.');

    const newCounter = Number(rows[0].reward_counter);
    const creditGranted = newCounter % 5 === 0; // High five! Every 5th drink is on the house.

    // Always keep a paper trail
    await client.query(
      'INSERT INTO customer_reward_transactions (customer_email, points_earned, credit_granted) VALUES ($1, 1, $2)',
      [normalizedEmail, creditGranted]
    );

    if (creditGranted) {
      await client.query(
        'UPDATE customer_rewards_accounts SET free_drink_credits = free_drink_credits + 1 WHERE email = $1',
        [normalizedEmail]
      );
      rows[0].free_drink_credits = Number(rows[0].free_drink_credits) + 1;
    }

    return mapRewardsProfile(rows[0]);
  });
}

// Cashing in that hard-earned loyalty credit
async function redeemFreeDrinkCredit(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw createHttpError(401, 'Sign in to redeem a free drink.');

  return withTransaction(async (client) => {
    await ensureRewardsAccountsTable(client);
    await ensureCustomerIdAndCreditsColumns(client);

    const { rows } = await client.query(
      'SELECT free_drink_credits FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
      [normalizedEmail]
    );
    
    if (!rows.length) throw createHttpError(404, 'Rewards account not found.');
    if (Number(rows[0].free_drink_credits) <= 0) {
      throw createHttpError(400, 'No free drink credits available to redeem.');
    }

    const { rows: updated } = await client.query(
      'UPDATE customer_rewards_accounts SET free_drink_credits = free_drink_credits - 1 WHERE email = $1 RETURNING email, name, reward_counter, customer_id, free_drink_credits',
      [normalizedEmail]
    );

    return mapRewardsProfile(updated[0]);
  });
}

// Exporting everything so the server.js or routes can use them
module.exports = {
  authenticateRewardsAccount,
  fetchRewardsAccountByEmail,
  incrementRewardsCounter,
  redeemFreeDrinkCredit,
  registerRewardsAccount,
  validateEmail,
};