const { query } = require('./client');
const { mapAuthResult } = require('./helpers');

/**
 * Authenticates an employee by a 4-digit PIN for the Staff interface.
 */
async function authenticateEmployeeByPin(pin) {
  if (!pin) return { authenticated: false };

  // Use TRIM to ignore hidden spaces and ensure we compare strings to strings
  const { rows } = await query(
    "SELECT username, name, role FROM employees WHERE TRIM(pin) = TRIM($1) AND role IN ('staff', 'manager') LIMIT 1",
    [String(pin)]
  );
  
  if (rows.length === 0) {
    return { authenticated: false };
  }

  return mapAuthResult(rows[0]);
}

/**
 * Authenticates an employee by username/password for the Manager portal.
 */
async function authenticateEmployee(username, password, role) {
  const normalizedRole = String(role || 'staff').trim().toLowerCase();

  if (!username || !password) {
    return { authenticated: false };
  }

  // Demo account bypass
  if (username === 'reveille.bubbletea@gmail.com') {
    const { rows } = await query(
      'SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 LIMIT 1',
      [username, password]
    );
    return mapAuthResult(rows[0]);
  }

  // Staff view allows both staff and managers
  if (normalizedRole === 'staff') {
    const { rows } = await query(
      "SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 AND role IN ('staff', 'manager') LIMIT 1",
      [username, password]
    );
    return mapAuthResult(rows[0]);
  }

  // Manager/Other views require exact role match
  const { rows } = await query(
    'SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 AND role = $3 LIMIT 1',
    [username, password, normalizedRole]
  );
  return mapAuthResult(rows[0]);
}

// ONLY ONE module.exports containing both functions
module.exports = {
  authenticateEmployee,
  authenticateEmployeeByPin,
};