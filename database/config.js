const fs = require('node:fs');
const path = require('node:path');

/**
 * Reads database credentials from environment variables or a local db.properties file
 * and returns a pg-compatible connection config object.
 *
 * Credential resolution order:
 *   1. Environment variables: DB_URL (or DATABASE_URL), DB_USER, DB_PASSWORD
 *   2. db.properties file in this directory
 *   3. db.properties from the project 2 GUI directory (fallback for shared dev setups)
 *
 * SSL is enabled automatically for any host that is not localhost/127.0.0.1,
 * unless overridden by DB_SSL=false.
 *
 * @returns {{ host: string, port: number, database: string, user: string, password: string, ssl?: object }}
 * @throws {Error} If any required credential (url, user, or password) is missing
 */
function readCredentials() {
  const jdbcUrl = process.env.DB_URL || process.env.DATABASE_URL || readProperty('db.url');
  const user = process.env.DB_USER || readProperty('db.user');
  const password = process.env.DB_PASSWORD || readProperty('db.password');

  if (!jdbcUrl || !user || !password) {
    throw new Error(
      'Database credentials are missing. Set DB_URL, DB_USER, and DB_PASSWORD in the environment or provide db.properties locally.'
    );
  }

  // Strip a leading "jdbc:" prefix so standard JDBC URLs also parse correctly
  const parsed = new URL(String(jdbcUrl).replace(/^jdbc:/, ''));

  // Enable SSL for remote hosts unless DB_SSL=false is explicitly set
  const shouldUseSsl = process.env.DB_SSL === 'true'
    || (process.env.DB_SSL !== 'false' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1');

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, ''), // strip leading slash from path
    user,
    password,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
  };
}

/**
 * Reads a single key=value entry from a db.properties file.
 * Searches the database directory first, then the project 2 GUI directory.
 * @param {string} key - The property key to look up (e.g. 'db.url')
 * @returns {string} The trimmed value, or an empty string if not found
 */
function readProperty(key) {
  const locations = [
    path.join(__dirname, 'db.properties'),
    path.join(__dirname, '..', '..', 'project_2', 'team-45-project-2', 'gui', 'db.properties'),
  ];

  for (const location of locations) {
    if (!fs.existsSync(location)) {
      continue;
    }

    const lines = fs.readFileSync(location, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith(`${key}=`)) {
        return line.slice(key.length + 1).trim();
      }
    }
  }

  return '';
}

module.exports = {
  readCredentials,
};
