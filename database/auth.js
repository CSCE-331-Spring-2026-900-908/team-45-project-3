const { query } = require('./client');
const { mapAuthResult } = require('./helpers');

async function authenticateEmployee(username, password, role) {
  const normalizedRole = String(role || 'staff').trim().toLowerCase();
  if (!username || !password) {
    return { authenticated: false };
  }

  if (normalizedRole === 'staff') {
    const { rows } = await query(
      "SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 AND role IN ('staff', 'manager') LIMIT 1",
      [username, password]
    );
    return mapAuthResult(rows[0]);
  }

  const { rows } = await query(
    'SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 AND role = $3 LIMIT 1',
    [username, password, normalizedRole]
  );
  return mapAuthResult(rows[0]);
}

module.exports = {
  authenticateEmployee,
};
