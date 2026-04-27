const TAX_RATE = 0.0625;
const SIZE_PRICE_DELTA = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toMoney(value) {
  return Number.parseFloat(Number(value || 0).toFixed(2));
} // Used to fix decimal values to nearest cent denomination

function mapAuthResult(row) {
  if (!row) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    username: row.username,
    name: row.name,
    role: row.role,
  };
}

function mapProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    price: toMoney(row.price),
  };
}

function normalizeSize(size) {
  const value = String(size || 'Medium').trim().toLowerCase();
  if (value === 'small') return 'Small';
  if (value === 'large') return 'Large';
  return 'Medium';
}

function normalizePercent(value, fallback = 100) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : fallback, 0, 100);
}

function applySizePriceDelta(basePrice, size) {
  const price = toMoney(basePrice);
  if (size === 'Small') return toMoney(price - SIZE_PRICE_DELTA);
  if (size === 'Large') return toMoney(price + SIZE_PRICE_DELTA);
  return price;
}

function addRequired(map, ingredientId, amount) {
  if (ingredientId === null || ingredientId === undefined) {
    return;
  }
  map.set(ingredientId, (map.get(ingredientId) || 0) + amount);
}

function findSugarIngredientId(ingredientNames) {
  for (const [id, name] of ingredientNames.entries()) {
    if (String(name).toLowerCase().includes('sugar')) {
      return id;
    }
  }
  return null;
}

function findIngredientIdByContains(ingredientNames, token) {
  const target = String(token || '').toLowerCase();
  for (const [id, name] of ingredientNames.entries()) {
    if (String(name).toLowerCase().includes(target)) {
      return id;
    }
  }
  return null;
}

function isUnlimitedIngredient(name) {
  const value = String(name || '').toLowerCase();
  return value.includes('ice') || value.includes('water');
}

function isPackagingIngredient(name) {
  const value = String(name || '').toLowerCase();
  return value.includes('straw') || value.includes('napkin') || value.includes('lid') || value.includes('cup');
}

function normalizeOrderLines(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const line = {
        productId: Number(item.productId),
        quantity: Math.max(1, Number(item.quantity) || 1),
        size: normalizeSize(item.size),
        sugarPercent: normalizePercent(item.sugarPercent, 100),
        toppings: Array.isArray(item.toppings)
          ? item.toppings.map((entry) => String(entry).trim()).filter(Boolean)
          : [],
      };
      if (Object.prototype.hasOwnProperty.call(item, 'icePercent')) {
        line.icePercent = normalizePercent(item.icePercent, 50);
      }
      return line;
    })
    .filter((item) => Number.isInteger(item.productId));
}

function buildLineSummary(line, product) {
  if (!product) {
    return null;
  }
  const unitPrice = applySizePriceDelta(product.price, line.size);
  const lineTotal = toMoney(unitPrice * line.quantity);
  const summary = {
    productId: product.id,
    name: product.name,
    category: product.category,
    quantity: line.quantity,
    size: line.size,
    sugarPercent: line.sugarPercent,
    toppings: line.toppings,
    unitPrice: toMoney(unitPrice),
    lineTotal,
  };
  if (line.icePercent != null) {
    summary.icePercent = line.icePercent;
  }
  return summary;
}

function buildPaymentBreakdown(payment, total) {
  const breakdown = { creditCard: 0, debitCard: 0, giftCard: 0, cash: 0 };
  const giftAmount = toMoney(payment.giftAmount);
  const remaining = toMoney(Math.max(0, total - giftAmount));
  breakdown.giftCard = giftAmount;
  const primary = String(payment.primaryPaymentType || 'Cash').toLowerCase();
  const secondary = String(payment.secondaryPaymentType || '').toLowerCase();
  assignPaymentAmount(breakdown, primary, primary.includes('gift') ? 0 : remaining);
  if (secondary && !secondary.includes('gift')) {
    assignPaymentAmount(breakdown, secondary, 0);
  }
  if (!primary.includes('credit') && !primary.includes('debit') && !primary.includes('gift')) {
    breakdown.cash = remaining;
  }
  return breakdown;
}

function assignPaymentAmount(breakdown, paymentType, amount) {
  if (paymentType.includes('credit')) breakdown.creditCard += amount;
  else if (paymentType.includes('debit')) breakdown.debitCard += amount;
  else if (paymentType.includes('gift')) breakdown.giftCard += amount;
  else breakdown.cash += amount;
}

function normalizePayment(payment, total) {
  return {
    primaryPaymentType: String(payment.primaryPaymentType || payment.primary || 'Cash'),
    secondaryPaymentType: payment.secondaryPaymentType || payment.secondary || null,
    giftAmount: toMoney(payment.giftAmount),
    discountAmount: toMoney(payment.discountAmount),
    cashReceived: toMoney(payment.cashReceived),
    cashChange: toMoney(payment.cashChange),
    totalAmount: toMoney(payment.totalAmount || total),
  };
}

function emptyOrderPreview() {
  return { lineItems: [], subtotal: 0, tax: 0, total: 0, shortages: [], canSubmit: false };
}

module.exports = {
  TAX_RATE,
  addRequired,
  applySizePriceDelta,
  buildLineSummary,
  buildPaymentBreakdown,
  emptyOrderPreview,
  findIngredientIdByContains,
  findSugarIngredientId,
  isPackagingIngredient,
  isUnlimitedIngredient,
  mapAuthResult,
  mapProduct,
  normalizeOrderLines,
  normalizePayment,
  toMoney,
};
