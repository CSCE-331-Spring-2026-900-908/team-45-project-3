const { Pool } = require('pg');
const { readCredentials } = require('./config');

// Singleton connection pool — shared across all database calls in the process
let pool;

/**
 * Returns the shared PostgreSQL connection pool, creating it on first call.
 * @returns {Pool} The pg Pool instance
 */
function getPool() {
  if (!pool) {
    pool = new Pool(readCredentials());
  }
  return pool;
}

/**
 * Executes a parameterized SQL query using the shared connection pool.
 * @param {string} text - The SQL query string with $1, $2, ... placeholders
 * @param {any[]} [params=[]] - Values to bind to the query placeholders
 * @returns {Promise<import('pg').QueryResult>} The pg query result
 */
async function query(text, params = []) {
  return getPool().query(text, params);
}

/**
 * Runs a unit of work inside a database transaction.
 * Commits on success, rolls back on any error, and always releases the client.
 * @param {(client: import('pg').PoolClient) => Promise<any>} work - Async function that receives
 *   a dedicated client and performs one or more queries within the transaction
 * @returns {Promise<any>} The value returned by `work`
 */
async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  query,
  withTransaction,
};
