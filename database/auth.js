const { query } = require('./client');
const { mapAuthResult } = require('./helpers');

/**
 * Authenticates an employee by username, password, and requested role.
 *
 * Role logic:
 *   - 'staff'   → accepts employees with role 'staff' OR 'manager'
 *   - any other → must match the exact role stored in the database
 *
 * reveille.bubbletea@gmail.com bypasses the role check so it can log in
 * to either interface regardless of its stored role.
 *
 * @param {string} username
 * @param {string} password
 * @param {string} [role='staff']
 * @returns {Promise<{ authenticated: boolean, username?: string, name?: string, role?: string }>}
 */
async function authenticateEmployee(username, password, role) {
  const normalizedRole = String(role || 'staff').trim().toLowerCase();

  if (!username || !password) {
    return { authenticated: false };
  }

  // Demo account — bypasses role restriction so it works in any view
  if (username === 'reveille.bubbletea@gmail.com') {
    const { rows } = await query(
      'SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 LIMIT 1',
      [username, password]
    );
    return mapAuthResult(rows[0]);
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
