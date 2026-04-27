const { query } = require('./client');

/**
 * Fetches all employees including PINs.
 */
async function fetchEmployees() {
  const { rows } = await query('SELECT id, name, role, username, pin FROM employees ORDER BY id');
  return rows.map((row) => ({ 
    id: Number(row.id), 
    name: row.name, 
    role: row.role, 
    username: row.username,
    pin: row.pin 
  }));
}

/**
 * Inserts a new employee record including a 4-digit PIN.
 */
async function addEmployee({ id, name, role, username, password, pin }) {
  await query(
    'INSERT INTO employees (id, name, role, username, password, pin) VALUES ($1, $2, $3, $4, $5, $6)',
    [Number(id), name.trim(), String(role).trim().toLowerCase(), username.trim(), password.trim(), pin]
  );
}

/**
 * Updates the role of an existing employee.
 */
async function updateEmployeeRole(employeeId, role) {
  await query('UPDATE employees SET role = $1 WHERE id = $2', [String(role).trim().toLowerCase(), employeeId]);
}

/**
 * Specifically updates an employee's PIN.
 */
async function updateEmployeePin(employeeId, newPin) {
  await query('UPDATE employees SET pin = $1 WHERE id = $2', [newPin, employeeId]);
}

/**
 * Deletes an employee by ID.
 */
async function deleteEmployee(employeeId) {
  const result = await query('DELETE FROM employees WHERE id = $1', [employeeId]);
  return result.rowCount;
}

// ONLY ONE module.exports at the very bottom
module.exports = {
  addEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployeeRole,
  updateEmployeePin, 
};