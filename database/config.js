const fs = require('node:fs');
const path = require('node:path');

function readCredentials() {
  const jdbcUrl = process.env.DB_URL || process.env.DATABASE_URL || readProperty('db.url');
  const user = process.env.DB_USER || readProperty('db.user');
  const password = process.env.DB_PASSWORD || readProperty('db.password');

  if (!jdbcUrl || !user || !password) {
    throw new Error(
      'Database credentials are missing. Set DB_URL, DB_USER, and DB_PASSWORD in the environment or provide db.properties locally.'
    );
  }

  const parsed = new URL(String(jdbcUrl).replace(/^jdbc:/, ''));
  const shouldUseSsl = process.env.DB_SSL === 'true'
    || (process.env.DB_SSL !== 'false' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1');

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, ''),
    user,
    password,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
  };
}

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
