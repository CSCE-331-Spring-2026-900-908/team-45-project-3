const { getPool, withTransaction } = require('./client');
const { ensureOrderPaymentsTable, ensureOrderVoidsTable, ensureReportingTables } = require('./schema');
const {
  TAX_RATE,
  addRequired,
  buildLineSummary,
  buildPaymentBreakdown,
  emptyOrderPreview,
  findIngredientIdByContains,
  findSugarIngredientId,
  isPackagingIngredient,
  isUnlimitedIngredient,
  normalizeOrderLines,
  normalizePayment,
  toMoney,
} = require('./helpers');
const { fetchProductsById } = require('./catalog');

async function previewOrder(items, discountAmount = 0) {
  const orderLines = normalizeOrderLines(items);
  if (!orderLines.length) {
    return emptyOrderPreview();
  }

  const products = await fetchProductsById();
  const lineItems = orderLines.map((line) => buildLineSummary(line, products.get(line.productId))).filter(Boolean);
  const subtotal = toMoney(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const discount = toMoney(Math.min(Math.max(0, Number(discountAmount) || 0), subtotal));
  const taxableSubtotal = toMoney(Math.max(0, subtotal - discount));
  const tax = toMoney(taxableSubtotal * TAX_RATE);
  const total = toMoney(taxableSubtotal + tax);
  const shortages = await findInventoryShortages(orderLines);

  return { lineItems, subtotal, discount, tax, total, shortages, canSubmit: shortages.length === 0 && lineItems.length > 0 };
}

async function fetchProductAvailability() {
  return withTransaction(async (client) => {
    const products = await fetchProductsById(client);
    const availability = new Map();
    const productIds = Array.from(products.keys());

    productIds.forEach((productId) => {
      availability.set(productId, true);
    });

    if (!productIds.length) {
      return availability;
    }

    const { rows } = await client.query(
      'SELECT pi.product_id, i.name, i.quantity, SUM(pi.quantity_used) AS required_quantity ' +
      'FROM product_ingredients pi ' +
      'JOIN inventory i ON i.id = pi.ingredient_id ' +
      'WHERE pi.product_id = ANY($1::int[]) ' +
      'GROUP BY pi.product_id, i.id, i.name, i.quantity',
      [productIds]
    );

    rows.forEach((row) => {
      const ingredientName = row.name || '';
      if (isUnlimitedIngredient(ingredientName) || isPackagingIngredient(ingredientName)) {
        return;
      }

      if (Number(row.quantity) < Number(row.required_quantity)) {
        availability.set(Number(row.product_id), false);
      }
    });

    return availability;
  });
}

async function findInventoryShortages(items) {
  const orderLines = normalizeOrderLines(items);
  if (!orderLines.length) {
    return [];
  }

  const client = await getPool().connect();
  try {
    const requiredIngredients = await calculateRequiredIngredients(client, orderLines);
    return findIngredientShortages(client, requiredIngredients);
  } finally {
    client.release();
  }
}

async function resolveOrderCustomerBinding(client) {
  const { rows } = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('orders', 'customers')"
  );

  const columnsByTable = rows.reduce((map, row) => {
    const tableName = String(row.table_name || '');
    const columnName = String(row.column_name || '');
    if (!map.has(tableName)) {
      map.set(tableName, new Set());
    }
    map.get(tableName).add(columnName);
    return map;
  }, new Map());

  const customerColumns = columnsByTable.get('customers') || new Set();
  const orderColumns = columnsByTable.get('orders') || new Set();
  const customerLookupColumn = customerColumns.has('customer_id')
    ? 'customer_id'
    : customerColumns.has('id')
      ? 'id'
      : null;
  const orderCustomerColumn = orderColumns.has('customer_id')
    ? 'customer_id'
    : orderColumns.has('id_customer')
      ? 'id_customer'
      : null;

  if (!customerLookupColumn || !orderCustomerColumn) {
    return null;
  }

  const customerResult = await client.query(
    `SELECT ${customerLookupColumn} AS customer_ref FROM customers ORDER BY ${customerLookupColumn} LIMIT 1`
  );
  if (!customerResult.rows.length) {
    throw new Error('No customers available in the database.');
  }

  return {
    orderCustomerColumn,
    customerValue: Number(customerResult.rows[0].customer_ref),
  };
}

async function submitOrderWithPayment(items, payment = {}) {
  return withTransaction(async (client) => {
    const orderLines = normalizeOrderLines(items);
    if (!orderLines.length) {
      const error = new Error('At least one order item is required.');
      error.statusCode = 400;
      throw error;
    }

    const normalizedPayment = normalizePayment(payment, 0);
    const preview = await previewOrder(orderLines, normalizedPayment.discountAmount);
    if (!preview.lineItems.length) {
      const error = new Error('No valid order items were submitted.');
      error.statusCode = 400;
      throw error;
    }
    if (preview.shortages.length) {
      const error = new Error(`Insufficient inventory: ${preview.shortages.join('; ')}`);
      error.statusCode = 400;
      throw error;
    }
    const customerBinding = await resolveOrderCustomerBinding(client);
    const orderIdResult = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM orders');
    const firstOrderId = Number(orderIdResult.rows[0].next_id);
    let nextOrderId = firstOrderId;
    const now = new Date();

    for (const lineItem of preview.lineItems) {
      for (let count = 0; count < lineItem.quantity; count += 1) {
        if (customerBinding) {
          await client.query(
            `INSERT INTO orders (id, cost, item, date, ${customerBinding.orderCustomerColumn}) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)`,
            [nextOrderId, toMoney(lineItem.unitPrice).toFixed(2), lineItem.productId, customerBinding.customerValue]
          );
        } else {
          await client.query(
            'INSERT INTO orders (id, cost, item, date) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
            [nextOrderId, toMoney(lineItem.unitPrice).toFixed(2), lineItem.productId]
          );
        }
        nextOrderId += 1;
      }
    }

    const requiredIngredients = await calculateRequiredIngredients(client, orderLines);
    await decrementInventory(client, requiredIngredients);
    await ensureOrderPaymentsTable(client);
    await ensureReportingTables(client);
    //ensure block is finished before moving on
    const normalizedPaymentWithTotal = normalizePayment(payment, preview.total);
    const paymentResult = await client.query(
      'INSERT INTO order_payments (order_start_id, order_end_id, total_amount, primary_payment_type, secondary_payment_type, gift_amount, cash_received, cash_change) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [
        firstOrderId,
        nextOrderId - 1,
        preview.total.toFixed(2),
        normalizedPaymentWithTotal.primaryPaymentType,
        normalizedPaymentWithTotal.secondaryPaymentType,
        normalizedPaymentWithTotal.giftAmount.toFixed(2),
        normalizedPaymentWithTotal.cashReceived.toFixed(2),
        normalizedPaymentWithTotal.cashChange.toFixed(2),
      ]
    );

    const breakdown = buildPaymentBreakdown(normalizedPaymentWithTotal, preview.total);
    await client.query(
      'UPDATE x_hourly_totals SET sales = sales + $2, tax = tax + $3, credit_card = credit_card + $4, debit_card = debit_card + $5, gift_card = gift_card + $6, cash = cash + $7, discounts = discounts + $8 WHERE hour = $1',
      [
        now.getHours(),
        toMoney(preview.subtotal - preview.discount).toFixed(2),
        preview.tax.toFixed(2),
        breakdown.creditCard.toFixed(2),
        breakdown.debitCard.toFixed(2),
        breakdown.giftCard.toFixed(2),
        breakdown.cash.toFixed(2),
        preview.discount.toFixed(2),
      ]
    );

    return {
      paymentRecordId: Number(paymentResult.rows[0].id),
      orderStartId: firstOrderId,
      orderEndId: nextOrderId - 1,
      total: preview.total,
    };
  });
}
//Used to remove payments that have already been added
async function voidPaymentById(paymentRecordId) {
  return withTransaction(async (client) => {
    await ensureOrderPaymentsTable(client);
    await ensureOrderVoidsTable(client);
    await ensureReportingTables(client);

    const { rows } = await client.query(
      'SELECT order_start_id, order_end_id, total_amount, voided FROM order_payments WHERE id = $1',
      [paymentRecordId]
    );
    if (!rows.length) {
      const error = new Error('Payment record not found.');
      error.statusCode = 404;
      throw error;
    }
    if (rows[0].voided) {
      const error = new Error('This payment has already been voided.');
      error.statusCode = 400;
      throw error;
    }

    await client.query(
      'INSERT INTO order_voids (payment_id, order_start_id, order_end_id, void_amount, voided_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [paymentRecordId, rows[0].order_start_id, rows[0].order_end_id, toMoney(rows[0].total_amount).toFixed(2)]
    );
    await client.query('UPDATE order_payments SET voided = TRUE WHERE id = $1', [paymentRecordId]);
    await client.query('UPDATE x_hourly_totals SET voids = voids + $2 WHERE hour = $1', [new Date().getHours(), toMoney(rows[0].total_amount).toFixed(2)]);
    return { paymentRecordId: Number(paymentRecordId), voided: true };
  });
}

async function calculateRequiredIngredients(client, orderLines) {
  const requiredByIngredient = new Map();
  const ingredientNames = await fetchIngredientNames(client);
  const sugarIngredientId = findSugarIngredientId(ingredientNames);
  const strawIngredientId = findIngredientIdByContains(ingredientNames, 'straw');
  const napkinIngredientId = findIngredientIdByContains(ingredientNames, 'napkin');
  const lidIngredientId = findIngredientIdByContains(ingredientNames, 'lid');
  const smallCupIngredientId = findIngredientIdByContains(ingredientNames, 'cup - small');
  const mediumCupIngredientId = findIngredientIdByContains(ingredientNames, 'cup - medium');
  const largeCupIngredientId = findIngredientIdByContains(ingredientNames, 'cup - large');

  for (const line of orderLines) {
    const { rows } = await client.query(
      'SELECT ingredient_id, quantity_used FROM product_ingredients WHERE product_id = $1',
      [line.productId]
    );

    rows.forEach((row) => {
      const ingredientId = Number(row.ingredient_id);
      const quantityUsed = Number(row.quantity_used) * line.quantity;
      requiredByIngredient.set(ingredientId, (requiredByIngredient.get(ingredientId) || 0) + quantityUsed);
    });

    if (sugarIngredientId !== null) {
      const sugarUnits = Math.round((line.sugarPercent / 100) * line.quantity);
      if (sugarUnits > 0) {
        requiredByIngredient.set(sugarIngredientId, (requiredByIngredient.get(sugarIngredientId) || 0) + sugarUnits);
      }
    }

    const cupIngredientId = line.size === 'Small' ? smallCupIngredientId : line.size === 'Large' ? largeCupIngredientId : mediumCupIngredientId;
    addRequired(requiredByIngredient, cupIngredientId, line.quantity);
    addRequired(requiredByIngredient, strawIngredientId, line.quantity);
    addRequired(requiredByIngredient, napkinIngredientId, line.quantity);
    addRequired(requiredByIngredient, lidIngredientId, line.quantity);

    line.toppings.forEach((topping) => {
      addRequired(requiredByIngredient, findIngredientIdByContains(ingredientNames, topping), line.quantity);
    });
  }

  return requiredByIngredient;
}

async function findIngredientShortages(client, requiredIngredients) {
  const ingredientNames = await fetchIngredientNames(client);
  const shortages = [];
  for (const [ingredientId, requiredQuantity] of requiredIngredients.entries()) {
    const ingredientName = ingredientNames.get(ingredientId) || `Ingredient ${ingredientId}`;
    if (isUnlimitedIngredient(ingredientName) || isPackagingIngredient(ingredientName)) {
      continue;
    }
    const { rows } = await client.query('SELECT quantity FROM inventory WHERE id = $1', [ingredientId]);
    const available = rows.length ? Number(rows[0].quantity) : 0;
    if (available < requiredQuantity) {
      shortages.push(`${ingredientName} (${available} available, ${requiredQuantity} needed)`);
    }
  }
  return shortages;
}

async function decrementInventory(client, requiredIngredients) {
  const ingredientNames = await fetchIngredientNames(client);
  for (const [ingredientId, amount] of requiredIngredients.entries()) {
    const ingredientName = ingredientNames.get(ingredientId) || '';
    if (isUnlimitedIngredient(ingredientName) || isPackagingIngredient(ingredientName)) {
      continue;
    }
    await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE id = $2', [amount, ingredientId]);
  }
}

async function fetchIngredientNames(client) {
  const { rows } = await client.query('SELECT id, name FROM inventory');
  return new Map(rows.map((row) => [Number(row.id), String(row.name || '')]));
}

module.exports = {
  fetchProductAvailability,
  findInventoryShortages,
  previewOrder,
  submitOrderWithPayment,
  voidPaymentById,
};
