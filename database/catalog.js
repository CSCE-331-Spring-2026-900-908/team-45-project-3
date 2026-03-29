const { query, getPool, withTransaction } = require('./client');
const { ensureProductActiveColumn } = require('./schema');
const { mapProduct, toMoney } = require('./helpers');

async function fetchProducts() {
  await ensureProductActiveColumn();
  const { rows } = await query('SELECT id, name, category, price FROM products WHERE active = TRUE ORDER BY category, name');
  return rows.map(mapProduct);
}

async function fetchMenuProducts(includeInactive = false) {
  await ensureProductActiveColumn();
  const sql = includeInactive
    ? 'SELECT id, name, category, price, active FROM products ORDER BY id'
    : 'SELECT id, name, category, price, active FROM products WHERE active = TRUE ORDER BY id';
  const { rows } = await query(sql);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    category: row.category,
    price: toMoney(row.price),
    active: row.active === undefined ? true : Boolean(row.active),
  }));
}

async function fetchProductCategories() {
  await ensureProductActiveColumn();
  const { rows } = await query(
    "SELECT DISTINCT category FROM products WHERE active = TRUE AND category IS NOT NULL AND trim(category) <> '' ORDER BY category"
  );
  return rows.map((row) => row.category);
}

async function fetchInventoryItems() {
  const { rows } = await query('SELECT id, name, category, price, quantity FROM inventory ORDER BY id');
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    category: row.category,
    price: toMoney(row.price),
    quantity: Number(row.quantity),
  }));
}

async function fetchLowInventoryItems(threshold = 60) {
  const { rows } = await query('SELECT id, name, quantity FROM inventory WHERE quantity < $1 ORDER BY quantity ASC', [threshold]);
  return rows.map((row) => ({ id: Number(row.id), name: row.name, quantity: Number(row.quantity) }));
}

async function fetchProductsUsingInventoryItem(inventoryId) {
  const { rows } = await query(
    'SELECT p.name FROM product_ingredients pi JOIN products p ON p.id = pi.product_id WHERE pi.ingredient_id = $1 ORDER BY p.name',
    [inventoryId]
  );
  return rows.map((row) => row.name);
}

async function updateMenuPrice(productId, price) {
  await query('UPDATE products SET price = $1 WHERE id = $2', [toMoney(price).toFixed(2), productId]);
}

async function updateMenuCategory(productId, category) {
  await query('UPDATE products SET category = $1 WHERE id = $2', [category, productId]);
}

async function deactivateProduct(productId) {
  await ensureProductActiveColumn();
  const result = await query('UPDATE products SET active = FALSE WHERE id = $1 AND active = TRUE', [productId]);
  return result.rowCount;
}

async function reactivateProduct(productId) {
  await ensureProductActiveColumn();
  const result = await query('UPDATE products SET active = TRUE WHERE id = $1 AND active = FALSE', [productId]);
  return result.rowCount;
}

async function fetchNextProductId() {
  const { rows } = await query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products');
  return Number(rows[0].next_id);
}

async function fetchNextInventoryId() {
  const { rows } = await query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM inventory');
  return Number(rows[0].next_id);
}

async function addProductWithIngredients({ name, category, price, ingredientUsage }) {
  if (!name || !category || !Array.isArray(ingredientUsage) || ingredientUsage.length === 0) {
    throw new Error('Product name, category, and at least one ingredient are required.');
  }

  return withTransaction(async (client) => {
    await ensureProductActiveColumn(client);
    const productId = await fetchNextProductId();
    await client.query(
      'INSERT INTO products (id, name, category, price, active) VALUES ($1, $2, $3, $4, TRUE)',
      [productId, name.trim(), category.trim(), toMoney(price).toFixed(2)]
    );

    for (const entry of ingredientUsage) {
      const ingredientId = Number(entry.ingredientId);
      const quantityUsed = Number(entry.quantityUsed);
      if (!ingredientId || quantityUsed <= 0) {
        continue;
      }
      await client.query(
        'INSERT INTO product_ingredients (product_id, ingredient_id, quantity_used) VALUES ($1, $2, $3)',
        [productId, ingredientId, quantityUsed]
      );
    }

    return productId;
  });
}

async function addInventoryItem({ name, category, price, quantity }) {
  const inventoryId = await fetchNextInventoryId();
  await query(
    'INSERT INTO inventory (id, name, category, price, quantity) VALUES ($1, $2, $3, $4, $5)',
    [inventoryId, name.trim(), category.trim(), toMoney(price).toFixed(2), Number(quantity)]
  );
  return inventoryId;
}

async function updateInventoryQuantity(inventoryId, quantity) {
  await query('UPDATE inventory SET quantity = $1 WHERE id = $2', [Number(quantity), inventoryId]);
}

async function updateInventoryPrice(inventoryId, price) {
  await query('UPDATE inventory SET price = $1 WHERE id = $2', [toMoney(price).toFixed(2), inventoryId]);
}

async function deleteInventoryItem(inventoryId) {
  const result = await query('DELETE FROM inventory WHERE id = $1', [inventoryId]);
  return result.rowCount;
}

async function fetchProductsById(client = null) {
  const runner = client || getPool();
  await ensureProductActiveColumn(runner);
  const { rows } = await runner.query('SELECT id, name, category, price FROM products WHERE active = TRUE OR active IS NULL');
  return new Map(rows.map((row) => [Number(row.id), mapProduct(row)]));
}

module.exports = {
  addInventoryItem,
  addProductWithIngredients,
  deactivateProduct,
  deleteInventoryItem,
  fetchInventoryItems,
  fetchLowInventoryItems,
  fetchMenuProducts,
  fetchNextInventoryId,
  fetchNextProductId,
  fetchProductCategories,
  fetchProducts,
  fetchProductsById,
  fetchProductsUsingInventoryItem,
  reactivateProduct,
  updateInventoryPrice,
  updateInventoryQuantity,
  updateMenuCategory,
  updateMenuPrice,
};
