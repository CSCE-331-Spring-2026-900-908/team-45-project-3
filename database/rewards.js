const crypto = require('node:crypto');
const { query } = require('./client');
const { ensureRewardsAccountsTable } = require('./schema');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return EMAIL_PATTERN.test(normalizedEmail);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, storedDigest] = String(passwordHash || '').split(':');
  if (!salt || !storedDigest) {
    return false;
  }

  const candidateDigest = crypto.scryptSync(String(password), salt, 64);
  const storedBuffer = Buffer.from(storedDigest, 'hex');
  if (candidateDigest.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateDigest, storedBuffer);
}

function mapRewardsProfile(row) {
  if (!row) {
    return null;
  }

  return {
    email: normalizeEmail(row.email),
    name: row.name || '',
    orderCount: Number(row.reward_counter || 0),
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function fetchRewardsAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  await ensureRewardsAccountsTable();
  const { rows } = await query(
    'SELECT email, name, reward_counter FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  return mapRewardsProfile(rows[0]);
}

async function registerRewardsAccount({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = String(name || '').trim();
  const normalizedPassword = String(password || '');

  if (!validateEmail(normalizedEmail)) {
    throw createHttpError(400, 'Enter a valid email address.');
  }
  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    throw createHttpError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  await ensureRewardsAccountsTable();

  const existing = await query(
    'SELECT 1 FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  if (existing.rows.length) {
    throw createHttpError(409, 'An account already exists for that email.');
  }

  const { rows } = await query(
    'INSERT INTO customer_rewards_accounts (email, password_hash, reward_counter, name) VALUES ($1, $2, 0, $3) RETURNING email, name, reward_counter',
    [normalizedEmail, hashPassword(normalizedPassword), trimmedName]
  );

  return mapRewardsProfile(rows[0]);
}

async function authenticateRewardsAccount(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '');

  if (!validateEmail(normalizedEmail)) {
    throw createHttpError(400, 'Enter a valid email address.');
  }
  if (!normalizedPassword) {
    throw createHttpError(400, 'Enter your password.');
  }

  await ensureRewardsAccountsTable();
  const { rows } = await query(
    'SELECT email, name, reward_counter, password_hash FROM customer_rewards_accounts WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  const account = rows[0];
  if (!account || !verifyPassword(normalizedPassword, account.password_hash)) {
    throw createHttpError(401, 'Incorrect email or password.');
  }

  return mapRewardsProfile(account);
}

async function incrementRewardsCounter(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw createHttpError(401, 'Sign in to use rewards.');
  }

  await ensureRewardsAccountsTable();
  const { rows } = await query(
    'UPDATE customer_rewards_accounts SET reward_counter = reward_counter + 1 WHERE email = $1 RETURNING email, name, reward_counter',
    [normalizedEmail]
  );

  if (!rows.length) {
    throw createHttpError(404, 'Rewards account not found.');
  }

  return mapRewardsProfile(rows[0]);
}

module.exports = {
  authenticateRewardsAccount,
  fetchRewardsAccountByEmail,
  incrementRewardsCounter,
  registerRewardsAccount,
  validateEmail,
};
