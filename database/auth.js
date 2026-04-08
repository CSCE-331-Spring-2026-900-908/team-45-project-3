const { query } = require('./client');
const { mapAuthResult } = require('./helpers');

/**
 * Authenticates an employee by username, password, and requested role.
 *
 * Role logic:
 *   - 'staff'   → accepts employees with role 'staff' OR 'manager' (managers can use the staff view)
 *   - any other → must match the exact role stored in the database
 *
 * @param {string} username - The employee's username
 * @param {string} password - The employee's plaintext password
 * @param {string} [role='staff'] - The role the user is attempting to log in as
 * @returns {Promise<{ authenticated: boolean, username?: string, name?: string, role?: string }>}
 */
async function authenticateEmployee(username, password, role) {
  const normalizedRole = String(role || 'staff').trim().toLowerCase();

  // Reject immediately if credentials are missing
  if (!username || !password) {
    return { authenticated: false };
  }

  if (normalizedRole === 'staff') {
    // Staff login accepts both staff and manager accounts
    const { rows } = await query(
      "SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 AND role IN ('staff', 'manager') LIMIT 1",
      [username, password]
    );
    return mapAuthResult(rows[0]);
  }

  // All other roles (e.g. 'manager') require an exact role match
  const { rows } = await query(
    'SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 AND role = $3 LIMIT 1',
    [username, password, normalizedRole]
  );
  return mapAuthResult(rows[0]);
}

async function authenticateEmployee(username, password, role) {
  const normalizedRole = String(role || 'staff').trim().toLowerCase();

  if (!username || !password) {
    return { authenticated: false };
  }

  // Specific accommodation for the boba tea account
  // This allows the specific gmail to act as a manager or customer depending on your needs
  if (username === 'reveille.bubbletea@gmail.com') {
     const { rows } = await query(
      "SELECT username, name, role FROM employees WHERE username = $1 AND password = $2 LIMIT 1",
      [username, password]
    );
    return mapAuthResult(rows[0]);
  }

  // Existing logic for staff/manager...
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
