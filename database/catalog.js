const { query, getPool, withTransaction } = require('./client');
const { ensureProductActiveColumn } = require('./schema');
const { mapProduct, toMoney } = require('./helpers');

/**
 * Fetches all active products ordered by category then name.
 * Used for the customer-facing menu and staff order views.
 * @returns {Promise<Array<{ id: number, name: string, category: string, price: number }>>}
 */
async function fetchProducts() {
  await ensureProductActiveColumn();
  const { rows } = await query('SELECT id, name, category, price FROM products WHERE active = TRUE ORDER BY category, name');
  return rows.map(mapProduct);
}

/**
 * Fetches products for the manager menu tab, optionally including inactive items.
 * @param {boolean} [includeInactive=false] - When true, returns all products regardless of active status
 * @returns {Promise<Array<{ id: number, name: string, category: string, price: number, active: boolean }>>}
 */
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
    // Default to true for older rows that predate the active column
    active: row.active === undefined ? true : Boolean(row.active),
  }));
}

/**
 * Fetches the distinct list of active product categories, sorted alphabetically.
 * Empty/null categories are excluded.
 * @returns {Promise<string[]>}
 */
async function fetchProductCategories() {
  await ensureProductActiveColumn();
  const { rows } = await query(
    "SELECT DISTINCT category FROM products WHERE active = TRUE AND category IS NOT NULL AND trim(category) <> '' ORDER BY category"
  );
  return rows.map((row) => row.category);
}

/**
 * Fetches all inventory items ordered by ID.
 * @returns {Promise<Array<{ id: number, name: string, category: string, price: number, quantity: number }>>}
 */
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

/**
 * Fetches inventory items whose quantity is below the given threshold.
 * Used for the manager low-inventory alert.
 * @param {number} [threshold=60] - Items with quantity strictly less than this value are returned
 * @returns {Promise<Array<{ id: number, name: string, quantity: number, price: number }>>}
 */
async function fetchLowInventoryItems(threshold = 60) {
  const { rows } = await query('SELECT id, name, quantity, price FROM inventory WHERE quantity < $1 ORDER BY quantity ASC', [threshold]);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    quantity: Number(row.quantity),
    price: toMoney(row.price),
  }));
}

/**
 * Returns the names of all products that use a given inventory item as an ingredient.
 * Used by the manager "affected products" lookup before modifying inventory.
 * @param {number} inventoryId - The inventory item to look up
 * @returns {Promise<string[]>} Sorted list of product names
 */
async function fetchProductsUsingInventoryItem(inventoryId) {
  const { rows } = await query(
    'SELECT p.name FROM product_ingredients pi JOIN products p ON p.id = pi.product_id WHERE pi.ingredient_id = $1 ORDER BY p.name',
    [inventoryId]
  );
  return rows.map((row) => row.name);
}

/**
 * Updates the price of a menu product.
 * @param {number} productId
 * @param {number|string} price - Converted to a two-decimal money string before storage
 * @returns {Promise<void>}
 */
async function updateMenuPrice(productId, price) {
  await query('UPDATE products SET price = $1 WHERE id = $2', [toMoney(price).toFixed(2), productId]);
}

/**
 * Updates the category of a menu product.
 * @param {number} productId
 * @param {string} category
 * @returns {Promise<void>}
 */
async function updateMenuCategory(productId, category) {
  await query('UPDATE products SET category = $1 WHERE id = $2', [category, productId]);
}

/**
 * Soft-deletes a product by setting its active flag to FALSE.
 * Only affects currently active products.
 * @param {number} productId
 * @returns {Promise<number>} Number of rows updated (1 if deactivated, 0 if already inactive)
 */
async function deactivateProduct(productId) {
  await ensureProductActiveColumn();
  const result = await query('UPDATE products SET active = FALSE WHERE id = $1 AND active = TRUE', [productId]);
  return result.rowCount;
}

/**
 * Restores a previously deactivated product by setting active = TRUE.
 * Only affects currently inactive products.
 * @param {number} productId
 * @returns {Promise<number>} Number of rows updated (1 if reactivated, 0 if already active)
 */
async function reactivateProduct(productId) {
  await ensureProductActiveColumn();
  const result = await query('UPDATE products SET active = TRUE WHERE id = $1 AND active = FALSE', [productId]);
  return result.rowCount;
}

/**
 * Returns the next available product ID (current MAX + 1).
 * @returns {Promise<number>}
 */
async function fetchNextProductId(runner = null) {
  const executor = runner || { query };
  const { rows } = await executor.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products');
  return Number(rows[0].next_id);
}
/**
 * Returns the next available inventory ID (current MAX + 1).
 * @returns {Promise<number>}
 */
async function fetchNextInventoryId(runner = null) {
  const executor = runner || { query };
  const { rows } = await executor.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM inventory');
  return Number(rows[0].next_id);
}

/**
 * Inserts a new product along with its ingredient associations in a single transaction.
 * Rolls back the entire operation if any ingredient insert fails.
 * @param {{ name: string, category: string, price: number|string, ingredientUsage: Array<{ ingredientId: number, quantityUsed: number }> }} product
 * @returns {Promise<number>} The newly assigned product ID
 * @throws {Error} If name, category, or ingredientUsage are missing/empty
 */
async function addProductWithIngredients({ name, category, price, ingredientUsage }) {
  if (!name || !category || !Array.isArray(ingredientUsage) || ingredientUsage.length === 0) {
    throw new Error('Product name, category, and at least one ingredient are required.');
  }

  return withTransaction(async (client) => {
    await ensureProductActiveColumn(client);
    const productId = await fetchNextProductId(client);
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

/**
 * Inserts a new inventory item.
 * @param {{ name: string, category: string, price: number|string, quantity: number }} item
 * @returns {Promise<number>} The newly assigned inventory ID
 */
async function addInventoryItem({ name, category, price, quantity }) {
  const inventoryId = await fetchNextInventoryId();
  await query(
    'INSERT INTO inventory (id, name, category, price, quantity) VALUES ($1, $2, $3, $4, $5)',
    [inventoryId, name.trim(), category.trim(), toMoney(price).toFixed(2), Number(quantity)]
  );
  return inventoryId;
}

/**
 * Updates the stock quantity of an inventory item.
 * @param {number} inventoryId
 * @param {number} quantity - New quantity value
 * @returns {Promise<void>}
 */
async function updateInventoryQuantity(inventoryId, quantity) {
  await query('UPDATE inventory SET quantity = $1 WHERE id = $2', [Number(quantity), inventoryId]);
}

/**
 * Updates the unit price of an inventory item.
 * @param {number} inventoryId
 * @param {number|string} price
 * @returns {Promise<void>}
 */
async function updateInventoryPrice(inventoryId, price) {
  await query('UPDATE inventory SET price = $1 WHERE id = $2', [toMoney(price).toFixed(2), inventoryId]);
}

/**
 * Permanently deletes an inventory item by ID.
 * @param {number} inventoryId
 * @returns {Promise<number>} Number of rows deleted
 */
async function deleteInventoryItem(inventoryId) {
  const result = await query('DELETE FROM inventory WHERE id = $1', [inventoryId]);
  return result.rowCount;
}

/**
 * Returns a Map of product ID → product object for all active (or legacy null-active) products.
 * Accepts an optional client so it can participate in a larger transaction.
 * @param {import('pg').PoolClient|null} [client=null] - Optional transaction client
 * @returns {Promise<Map<number, { id: number, name: string, category: string, price: number }>>}
 */
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
