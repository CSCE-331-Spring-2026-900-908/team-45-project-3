const { query } = require('./client');

/**
 * Fetches all employees ordered by ID.
 * @returns {Promise<Array<{ id: number, name: string, role: string, username: string }>>}
 */
async function fetchEmployees() {
  const { rows } = await query('SELECT id, name, role, username FROM employees ORDER BY id');
  return rows.map((row) => ({ id: Number(row.id), name: row.name, role: row.role, username: row.username }));
}

/**
 * Inserts a new employee record into the database.
 * Role is normalized to lowercase before insertion.
 * @param {{ id: number, name: string, role: string, username: string, password: string }} employee
 * @returns {Promise<void>}
 */
async function addEmployee({ id, name, role, username, password }) {
  await query(
    'INSERT INTO employees (id, name, role, username, password) VALUES ($1, $2, $3, $4, $5)',
    [Number(id), name.trim(), String(role).trim().toLowerCase(), username.trim(), password.trim()]
  );
}

/**
 * Updates the role of an existing employee.
 * Role is normalized to lowercase before update.
 * @param {number} employeeId - The ID of the employee to update
 * @param {string} role - The new role (e.g. 'staff', 'manager')
 * @returns {Promise<void>}
 */
async function updateEmployeeRole(employeeId, role) {
  await query('UPDATE employees SET role = $1 WHERE id = $2', [String(role).trim().toLowerCase(), employeeId]);
}

/**
 * Deletes an employee by ID.
 * @param {number} employeeId - The ID of the employee to remove
 * @returns {Promise<number>} Number of rows deleted (0 if employee not found, 1 if deleted)
 */
async function deleteEmployee(employeeId) {
  const result = await query('DELETE FROM employees WHERE id = $1', [employeeId]);
  return result.rowCount;
}

module.exports = {
  addEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployeeRole,
};
