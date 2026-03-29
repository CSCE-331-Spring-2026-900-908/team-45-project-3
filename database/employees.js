const { query } = require('./client');

async function fetchEmployees() {
  const { rows } = await query('SELECT id, name, role, username FROM employees ORDER BY id');
  return rows.map((row) => ({ id: Number(row.id), name: row.name, role: row.role, username: row.username }));
}

async function addEmployee({ id, name, role, username, password }) {
  await query(
    'INSERT INTO employees (id, name, role, username, password) VALUES ($1, $2, $3, $4, $5)',
    [Number(id), name.trim(), String(role).trim().toLowerCase(), username.trim(), password.trim()]
  );
}

async function updateEmployeeRole(employeeId, role) {
  await query('UPDATE employees SET role = $1 WHERE id = $2', [String(role).trim().toLowerCase(), employeeId]);
}

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
