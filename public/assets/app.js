const ACCESS_KEY = 'portalAccessRole';
const SESSION_KEY = 'portalSession';
const EMPTY_PREVIEW = { lineItems: [], subtotal: 0, tax: 0, total: 0, shortages: [], canSubmit: false };

const staffState = {
  products: [],
  cart: [],
  selectedProductId: null,
  preview: { ...EMPTY_PREVIEW },
};
const managerState = {
  menuItems: [],
  inventoryItems: [],
  selectedProductId: null,
  selectedInventoryId: null,
};
const INVENTORY_CATEGORY_OPTIONS = [
  'Milk Flavor',
  'Tea Flavor',
  'Boba Type',
  'Utensil',
  'Cup',
  'Lid',
];


async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }
  return data;
}

function setPortalAccess(role) {
  sessionStorage.setItem(ACCESS_KEY, role);
}

function clearRoleSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function saveRoleSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getRoleSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function requirePortalAccess(page) {
  if (page === 'portal') {
    return true;
  }
  const allowedRole = sessionStorage.getItem(ACCESS_KEY);
  if (allowedRole === page) {
    return true;
  }
  window.location.replace('/');
  return false;
}

function attachPortalEntryHandlers() {
  document.querySelectorAll('[data-enter-role]').forEach((element) => {
    element.addEventListener('click', () => {
      clearRoleSession();
      setPortalAccess(element.dataset.enterRole);
    });
  });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setFieldValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value ?? '';
  }
}

function setStatus(id, message, tone = 'neutral') {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  element.textContent = message;
  element.dataset.tone = tone;
}

function renderList(elementId, items, mapper = (item) => escapeHtml(item)) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }
  element.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = mapper(item);
    element.appendChild(li);
  });
}

function renderSimpleProducts(elementId, items) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }
  element.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <p class="section-label">${escapeHtml(item.category)}</p>
      <h3>${escapeHtml(item.name)}</h3>
      <p class="price-line">$${Number(item.price).toFixed(2)}</p>
    `;
    element.appendChild(card);
  });
}

function renderPortalSummary(data) {
  const panel = document.getElementById('portal-summary');
  if (!panel) {
    return;
  }
  panel.textContent = JSON.stringify(
    {
      categories: data.categories || [],
      lowInventoryCount: data.lowInventoryCount,
      totalRevenue: data.totalRevenue,
      apiRoutes: data.migrationRoutes,
    },
    null,
    2
  );
}

function renderPortalMetrics(data) {
  setText('portal-category-count', String((data.categories || []).length));
  setText('portal-low-inventory', String(data.lowInventoryCount ?? 0));
  setText('portal-revenue', formatCurrency(data.totalRevenue || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function defaultCustomization() {
  return { quantity: 1, size: 'Medium', sugarPercent: 100, toppings: [] };
}

function getSelectedProduct() {
  return staffState.products.find((item) => item.id === staffState.selectedProductId) || null;
}

function readCustomizationForm() {
  return {
    quantity: Math.max(1, Number(document.getElementById('staff-qty').value) || 1),
    size: document.getElementById('staff-size').value,
    sugarPercent: Number(document.getElementById('staff-sugar').value) || 100,
    toppings: Array.from(document.querySelectorAll('input[name="staff-topping"]:checked')).map((element) => element.value),
  };
}

function resetCustomizationForm() {
  const defaults = defaultCustomization();
  document.getElementById('staff-qty').value = defaults.quantity;
  document.getElementById('staff-size').value = defaults.size;
  document.getElementById('staff-sugar').value = defaults.sugarPercent;
  setText('staff-sugar-value', `${defaults.sugarPercent}%`);
  document.querySelectorAll('input[name="staff-topping"]').forEach((element) => {
    element.checked = false;
  });
}

function customizationMatches(a, b) {
  return a.size === b.size && a.sugarPercent === b.sugarPercent && JSON.stringify(a.toppings) === JSON.stringify(b.toppings);
}

function customizationSummary(item) {
  const toppings = item.toppings.length ? `, ${item.toppings.join(', ')}` : '';
  return `${item.size}, ${item.sugarPercent}% sugar${toppings}`;
}

function renderStaffProducts() {
  const container = document.getElementById('staff-products');
  const category = document.getElementById('staff-category-filter').value;
  const visible = category === 'all'
    ? staffState.products
    : staffState.products.filter((item) => item.category === category);

  container.innerHTML = '';
  visible.forEach((item) => {
    const card = document.createElement('article');
    card.className = `product-card selectable-card${staffState.selectedProductId === item.id ? ' selected' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', staffState.selectedProductId === item.id ? 'true' : 'false');
    card.innerHTML = `
      <p class="section-label">${escapeHtml(item.category)}</p>
      <h3>${escapeHtml(item.name)}</h3>
      <p class="price-line">$${Number(item.price).toFixed(2)}</p>
      <p class="muted-line">Click anywhere on this card to customize.</p>
    `;

    const selectProduct = () => {
      staffState.selectedProductId = item.id;
      setText('staff-selected-product', item.name);
      setText('staff-selected-price', `Base price ${formatCurrency(item.price)} before size adjustment.`);
      renderStaffProducts();
      setStatus('staff-cart-status', `Selected ${item.name}. Adjust the options and add it to the cart.`, 'neutral');
    };

    card.addEventListener('click', selectProduct);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectProduct();
      }
    });
    container.appendChild(card);
  });

  setText('staff-product-count', `${visible.length} items shown`);
}

function renderCart() {
  const container = document.getElementById('staff-cart-lines');
  container.innerHTML = '';

  if (!staffState.cart.length) {
    container.innerHTML = '<p class="muted-line">No items in the cart yet.</p>';
    return;
  }

  staffState.cart.forEach((line, index) => {
    const row = document.createElement('article');
    row.className = 'cart-row';
    row.innerHTML = `
      <div>
        <h3>${escapeHtml(line.name)}</h3>
        <p>${escapeHtml(customizationSummary(line))}</p>
        <p class="muted-line">Qty ${line.quantity} at ${formatCurrency(line.unitPrice)}</p>
      </div>
      <div class="cart-actions">
        <strong>${formatCurrency(line.lineTotal)}</strong>
        <button class="ghost-button mini-button" type="button">Remove</button>
      </div>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      staffState.cart.splice(index, 1);
      renderCart();
      await refreshPreview();
    });
    container.appendChild(row);
  });
}

function renderPreview() {
  setText('staff-subtotal', formatCurrency(staffState.preview.subtotal));
  setText('staff-tax', formatCurrency(staffState.preview.tax));
  setText('staff-total', formatCurrency(staffState.preview.total));

  if (staffState.preview.shortages.length) {
    renderList('staff-shortages', staffState.preview.shortages);
    setStatus('staff-preview-status', 'Inventory shortages were found for the current cart.', 'error');
  } else if (staffState.cart.length) {
    renderList('staff-shortages', ['Inventory looks sufficient for the current cart.']);
    setStatus('staff-preview-status', 'Cart preview is ready for checkout.', 'success');
  } else {
    renderList('staff-shortages', []);
    setStatus('staff-preview-status', 'Cart totals and inventory warnings will appear here.', 'neutral');
  }
}

async function refreshPreview() {
  if (!staffState.cart.length) {
    staffState.preview = { ...EMPTY_PREVIEW };
    renderPreview();
    return;
  }

  setStatus('staff-preview-status', 'Checking totals and inventory...', 'neutral');
  const preview = await fetchJson('/api/orders/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: staffState.cart.map(toOrderPayload) }),
  });
  staffState.preview = preview;

  if (Array.isArray(preview.lineItems) && preview.lineItems.length === staffState.cart.length) {
    staffState.cart = preview.lineItems.map((line) => ({ ...line }));
  }

  renderCart();
  renderPreview();
}

function toOrderPayload(line) {
  return {
    productId: line.productId,
    quantity: line.quantity,
    size: line.size,
    sugarPercent: line.sugarPercent,
    toppings: line.toppings,
  };
}

function buildPaymentPayload() {
  const total = Number(staffState.preview.total || 0);
  const giftAmount = Number(document.getElementById('staff-gift-amount').value || 0);
  const cashReceived = Number(document.getElementById('staff-cash-received').value || 0);
  const primary = document.getElementById('staff-payment-primary').value;
  const secondary = document.getElementById('staff-payment-secondary').value || null;
  const remainingAfterGift = Math.max(0, total - giftAmount);
  const cashChange = primary === 'Cash' || secondary === 'Cash'
    ? Math.max(0, cashReceived - remainingAfterGift)
    : 0;

  return {
    primaryPaymentType: primary,
    secondaryPaymentType: secondary,
    giftAmount,
    cashReceived,
    cashChange,
    totalAmount: total,
  };
}

async function bootPortal() {
  attachPortalEntryHandlers();
  const data = await fetchJson('/api/portal');
  renderPortalSummary(data);
  renderPortalMetrics(data);
}

async function bootStaff() {
  renderList('staff-features', [
    'Portal-only entry enforced on the client side.',
    'Staff and manager users can authenticate into cashier mode.',
    'Size, sugar, toppings, cart preview, and database-backed totals are now interactive.',
    'Submit Order will work once ENABLE_DB_WRITES=true is set on the backend.',
  ]);

  document.getElementById('staff-sugar').addEventListener('input', (event) => {
    setText('staff-sugar-value', `${event.target.value}%`);
  });

  const session = getRoleSession();
  if (session && (session.role === 'staff' || session.role === 'manager')) {
    showStaffWorkspace(session);
    await loadStaffProducts();
  }

  const form = document.getElementById('staff-login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('staff-login-status', 'Checking staff credentials...', 'neutral');

    const formData = new FormData(form);
    try {
      const result = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
          role: 'staff',
        }),
      });

      saveRoleSession(result);
      showStaffWorkspace(result);
      setStatus('staff-login-status', `Signed in as ${result.name || result.username} (${result.role}).`, 'success');
      await loadStaffProducts();
    } catch (error) {
      setStatus('staff-login-status', error.message, 'error');
    }
  });

  document.getElementById('staff-sign-out').addEventListener('click', () => {
    clearRoleSession();
    window.location.replace('/');
  });

  document.getElementById('staff-add-to-cart').addEventListener('click', async () => {
    const product = getSelectedProduct();
    if (!product) {
      setStatus('staff-cart-status', 'Select a product before adding to the cart.', 'error');
      return;
    }

    const customization = readCustomizationForm();
    const existing = staffState.cart.find((line) => line.productId === product.id && customizationMatches(line, customization));
    if (existing) {
      existing.quantity += customization.quantity;
      existing.lineTotal = Number((existing.unitPrice * existing.quantity).toFixed(2));
    } else {
      const unitPrice = Number(product.price);
      staffState.cart.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        quantity: customization.quantity,
        size: customization.size,
        sugarPercent: customization.sugarPercent,
        toppings: customization.toppings,
        unitPrice,
        lineTotal: Number((unitPrice * customization.quantity).toFixed(2)),
      });
    }

    resetCustomizationForm();
    renderCart();
    setStatus('staff-cart-status', `${product.name} added to the cart.`, 'success');
    await refreshPreview();
  });

  document.getElementById('staff-preview-order').addEventListener('click', refreshPreview);
  document.getElementById('staff-submit-order').addEventListener('click', async () => {
    if (!staffState.cart.length) {
      setStatus('staff-preview-status', 'Add at least one item before submitting the order.', 'error');
      return;
    }

    try {
      const result = await fetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: staffState.cart.map(toOrderPayload),
          payment: buildPaymentPayload(),
        }),
      });

      staffState.cart = [];
      staffState.preview = { ...EMPTY_PREVIEW };
      renderCart();
      renderPreview();
      setStatus('staff-preview-status', `Order submitted successfully. Payment record ${result.result.paymentRecordId}.`, 'success');
    } catch (error) {
      setStatus('staff-preview-status', error.message, 'error');
    }
  });
}

function showStaffWorkspace(session) {
  document.getElementById('staff-login-card').hidden = true;
  document.getElementById('staff-workspace').hidden = false;
  setText('staff-session-name', session.name || session.username || 'Staff User');
  setText('staff-session-role', session.role || 'staff');
}

async function loadStaffProducts() {
  setStatus('staff-products-status', 'Loading live menu...', 'neutral');
  const [productsData, categoriesData] = await Promise.all([
    fetchJson('/api/products'),
    fetchJson('/api/categories'),
  ]);

  staffState.products = productsData.items || [];
  const select = document.getElementById('staff-category-filter');
  select.innerHTML = '<option value="all">All categories</option>';
  (categoriesData.items || []).forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
  select.onchange = renderStaffProducts;

  if (staffState.products.length && !staffState.selectedProductId) {
    staffState.selectedProductId = staffState.products[0].id;
    setText('staff-selected-product', staffState.products[0].name);
    setText('staff-selected-price', `Base price ${formatCurrency(staffState.products[0].price)} before size adjustment.`);
  }

  renderStaffProducts();
  renderCart();
  renderPreview();
  setStatus('staff-products-status', 'Live menu loaded from the shared database.', 'success');
}

function renderTable(containerId, columns, rows, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = '<p class="muted-line">No data found.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (options.isSelected && options.isSelected(row)) {
      tr.classList.add('selected-row');
    }
    if (options.onRowClick) {
      tr.dataset.selectable = 'true';
      tr.addEventListener('click', () => options.onRowClick(row));
    }
    columns.forEach((column) => {
      const td = document.createElement('td');
      const value = row[column.key];
      td.textContent = value === undefined || value === null ? '' : String(value);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
}

function describePieSlice(cx, cy, radius, startAngle, endAngle) {
  const startRadians = (startAngle - 90) * (Math.PI / 180);
  const endRadians = (endAngle - 90) * (Math.PI / 180);
  const x1 = cx + radius * Math.cos(startRadians);
  const y1 = cy + radius * Math.sin(startRadians);
  const x2 = cx + radius * Math.cos(endRadians);
  const y2 = cy + radius * Math.sin(endRadians);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + radius + ' ' + radius + ' 0 ' + largeArcFlag + ' 1 ' + x2 + ' ' + y2 + ' Z';
}

function renderMostOrderedReport(items) {
  const container = document.getElementById('manager-report-table');
  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = '<p class="muted-line">No data found.</p>';
    return;
  }

  const totalOrders = items.reduce((sum, item) => sum + Number(item.orderCount || 0), 0);
  const palette = ['#b55d3d', '#d48755', '#e0a66e', '#8d5b47', '#c6b08d', '#7f8c69', '#a54b58', '#d6c3a5'];
  let currentAngle = 0;
  const slices = items.map((item, index) => {
    const value = Number(item.orderCount || 0);
    const percentage = totalOrders > 0 ? (value / totalOrders) * 100 : 0;
    const startAngle = currentAngle;
    const endAngle = currentAngle + (totalOrders > 0 ? (value / totalOrders) * 360 : 0);
    currentAngle = endAngle;
    return {
      ...item,
      color: palette[index % palette.length],
      percentage,
      path: describePieSlice(110, 110, 92, startAngle, endAngle),
    };
  });

  const rows = items.map((item) => [
    '      <tr>',
    '        <td>' + escapeHtml(item.id) + '</td>',
    '        <td>' + escapeHtml(item.name) + '</td>',
    '        <td>' + escapeHtml(item.orderCount) + '</td>',
    '      </tr>',
  ].join('\n')).join('');

  const legend = slices.map((slice) => [
    '        <li>',
    '          <span class="report-pie-key" style="--swatch:' + slice.color + '"></span>',
    '          <span>' + escapeHtml(slice.name) + '</span>',
    '          <strong>' + slice.percentage.toFixed(1) + '%</strong>',
    '        </li>',
  ].join('\n')).join('');

  const chart = slices.map((slice) => [
    '          <path d="' + slice.path + '" fill="' + slice.color + '"></path>',
  ].join('\n')).join('');

  container.innerHTML = [
    '    <div class="report-chart-layout">',
    '      <section class="report-chart-card">',
    '        <div class="report-pie-wrap">',
    '          <svg viewBox="0 0 220 220" class="report-pie-chart" aria-label="Most ordered items pie chart" role="img">' + chart + '\n            <circle cx="110" cy="110" r="46" fill="rgba(255, 250, 242, 0.92)"></circle>\n          </svg>',
    '          <div class="report-pie-center">',
    '            <span>Total Orders</span>',
    '            <strong>' + totalOrders + '</strong>',
    '          </div>',
    '        </div>',
    '        <ul class="report-pie-legend">' + legend + '\n        </ul>',
    '      </section>',
    '      <section class="report-table-card">',
    '        <table class="data-table">',
    '          <thead>',
    '            <tr>',
    '              <th>Product ID</th>',
    '              <th>Name</th>',
    '              <th>Orders</th>',
    '            </tr>',
    '          </thead>',
    '          <tbody>' + rows + '\n          </tbody>',
    '        </table>',
    '      </section>',
    '    </div>',
  ].join('\n');
}

function setManagerTab(tabName) {
  document.querySelectorAll('[data-manager-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.managerTab === tabName);
  });
  document.querySelectorAll('.manager-tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `manager-tab-${tabName}`;
  });
}

function populateSelect(selectId, values, options = {}) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const includeBlank = options.includeBlank === true;
  select.innerHTML = includeBlank ? '<option value="">Select</option>' : '';
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateInventoryDatalist(items) {
  const datalist = document.getElementById('inventory-name-options');
  if (!datalist) {
    return;
  }

  datalist.innerHTML = '';
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = `${item.id} - ${item.name}`;
    datalist.appendChild(option);
  });
}

function createIngredientRow(items, selectedId = '', quantity = 1) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input name="ingredientSearch" list="inventory-name-options" placeholder="Type or pick ingredient" />
    <input name="quantityUsed" type="number" min="1" value="${quantity}" placeholder="Qty used" />
    <button class="ghost-button mini-button" type="button">Remove</button>
  `;

  const searchInput = row.querySelector('[name="ingredientSearch"]');
  const quantityInput = row.querySelector('[name="quantityUsed"]');
  const removeButton = row.querySelector('button');

  const applySelection = (selectedItem) => {
    if (!selectedItem) {
      row.dataset.ingredientId = '';
      return;
    }
    row.dataset.ingredientId = String(selectedItem.id);
    searchInput.value = `${selectedItem.id} - ${selectedItem.name}`;
  };

  if (selectedId) {
    applySelection(items.find((item) => Number(item.id) === Number(selectedId)));
  }

  searchInput.addEventListener('input', () => {
    const raw = searchInput.value.trim();
    const match = raw.match(/^(\d+)\s*-/);
    if (match) {
      applySelection(items.find((item) => Number(item.id) === Number(match[1])) || null);
      return;
    }

    const normalized = raw.toLowerCase();
    const selectedItem = items.find((item) => item.name.toLowerCase() === normalized)
      || items.find((item) => item.name.toLowerCase().includes(normalized));
    if (selectedItem) {
      applySelection(selectedItem);
      return;
    }

    row.dataset.ingredientId = '';
  });

  removeButton.addEventListener('click', () => {
    row.remove();
  });

  quantityInput.addEventListener('input', () => {
    if (Number(quantityInput.value) < 1) {
      quantityInput.value = '1';
    }
  });

  return row;
}
function getInputValue(formId, fieldName) {
  const form = document.getElementById(formId);
  return form?.elements?.namedItem(fieldName) || null;
}

function parseIngredientUsageFromRows() {
  const rows = Array.from(document.querySelectorAll('#menu-ingredient-rows .ingredient-row'));
  const usage = rows.map((row) => ({
    ingredientId: Number(row.dataset.ingredientId || 0),
    quantityUsed: Number(row.querySelector('[name="quantityUsed"]')?.value || 0),
  })).filter((entry) => entry.ingredientId > 0 && entry.quantityUsed > 0);

  if (!usage.length) {
    throw new Error('Select at least one valid ingredient before adding a menu item.');
  }

  return usage;
}
function applyMenuSelection(product) {
  managerState.selectedProductId = Number(product.id);
  const productField = getInputValue('menu-update-form', 'productId');
  const priceField = getInputValue('menu-update-form', 'price');
  const categoryField = getInputValue('menu-update-form', 'category');
  if (productField) {
    productField.value = product.id;
  }
  if (priceField) {
    priceField.value = Number(product.rawPrice ?? product.price ?? 0).toFixed(2);
  }
  if (categoryField) {
    categoryField.value = product.category || '';
  }
  setStatus('manager-menu-status', `Selected product #${product.id} (${product.name}) for menu actions.`, 'neutral');
}

function applyInventorySelection(item) {
  managerState.selectedInventoryId = Number(item.id);
  const inventoryField = getInputValue('inventory-update-form', 'inventoryId');
  const quantityField = getInputValue('inventory-update-form', 'quantity');
  const priceField = getInputValue('inventory-update-form', 'price');
  if (inventoryField) {
    inventoryField.value = item.id;
  }
  if (quantityField) {
    quantityField.value = item.quantity ?? '';
  }
  if (priceField) {
    priceField.value = Number(item.rawPrice ?? item.price ?? 0).toFixed(2);
  }
  setStatus('manager-inventory-status', `Selected inventory item #${item.id} (${item.name}) for inventory actions.`, 'neutral');
}

async function populateManagerFormOptions() {
  const [menuIdData, inventoryIdData, categoriesData, inventoryData] = await Promise.all([
    fetchJson('/api/menu/next-id'),
    fetchJson('/api/inventory/next-id'),
    fetchJson('/api/categories'),
    fetchJson('/api/inventory'),
  ]);

  setFieldValue('menu-next-id', String(menuIdData.nextId));
  setFieldValue('inventory-next-id', String(inventoryIdData.nextId));
  populateSelect('menu-category-select', categoriesData.items || []);
  populateSelect('menu-update-category-select', categoriesData.items || [], { includeBlank: true });
  populateSelect('inventory-category-select', INVENTORY_CATEGORY_OPTIONS);
  managerState.inventoryItems = inventoryData.items || [];
  populateInventoryDatalist(managerState.inventoryItems);

  const ingredientRows = document.getElementById('menu-ingredient-rows');
  if (ingredientRows && !ingredientRows.children.length) {
    ingredientRows.appendChild(createIngredientRow(managerState.inventoryItems));
  }

  document.getElementById('menu-add-ingredient-row').onclick = () => {
    ingredientRows.appendChild(createIngredientRow(managerState.inventoryItems));
  };
}

async function refreshManagerSummary() {
  const [revenueData, inventoryData, productsData] = await Promise.all([
    fetchJson('/api/revenue'),
    fetchJson('/api/inventory/low'),
    fetchJson('/api/products'),
  ]);
  setText('manager-revenue-total', formatCurrency(revenueData.totalRevenue));
  setText('manager-low-count', String((inventoryData.items || []).length));
  setText('manager-product-count', String((productsData.items || []).length));
}

async function loadManagerMenuTable() {
  const includeInactive = document.getElementById('manager-show-inactive').checked;
  const data = await fetchJson(`/api/menu?includeInactive=${includeInactive}`);
  managerState.menuItems = data.items || [];
  renderTable('manager-menu-table', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price' },
    { key: 'active', label: 'Active' },
  ], managerState.menuItems.map((item) => ({
    ...item,
    rawPrice: item.price,
    price: formatCurrency(item.price),
  })), {
    isSelected: (row) => Number(row.id) === Number(managerState.selectedProductId),
    onRowClick: applyMenuSelection,
  });
}

async function loadManagerInventoryTable() {
  const data = await fetchJson('/api/inventory');
  managerState.inventoryItems = data.items || [];
  populateInventoryDatalist(managerState.inventoryItems);
  renderTable('manager-inventory-table', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price' },
    { key: 'quantity', label: 'Quantity' },
  ], managerState.inventoryItems.map((item) => ({
    ...item,
    rawPrice: item.price,
    price: formatCurrency(item.price),
  })), {
    isSelected: (row) => Number(row.id) === Number(managerState.selectedInventoryId),
    onRowClick: applyInventorySelection,
  });
}

async function loadManagerEmployeesTable() {
  const data = await fetchJson('/api/employees');
  renderTable('manager-employees-table', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'username', label: 'Username' },
  ], data.items || []);
}

async function runReportTotalRevenue() {
  const data = await fetchJson('/api/revenue');
  renderTable('manager-report-table', [
    { key: 'metric', label: 'Metric' },
    { key: 'value', label: 'Value' },
  ], [{ metric: 'Total Revenue', value: formatCurrency(data.totalRevenue) }]);
  setStatus('manager-reports-status', 'Loaded total revenue report.', 'success');
}

async function runReportLowInventory() {
  const data = await fetchJson('/api/inventory/low');
  renderTable('manager-report-table', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'quantity', label: 'Quantity' },
  ], data.items || []);
  setStatus('manager-reports-status', 'Loaded low inventory report.', 'success');
}

async function runReportMostOrdered() {
  const data = await fetchJson('/api/reports/most-ordered?limit=8');
  renderMostOrderedReport(data.items || []);
  setStatus('manager-reports-status', 'Loaded most ordered items report.', 'success');
}

async function runReportX() {
  const data = await fetchJson('/api/reports/x');
  renderTable('manager-report-table', [
    { key: 'hourLabel', label: 'Hour' },
    { key: 'salesLabel', label: 'Sales' },
    { key: 'voidsLabel', label: 'Voids' },
    { key: 'creditLabel', label: 'Credit Card' },
    { key: 'debitLabel', label: 'Debit Card' },
    { key: 'giftLabel', label: 'Gift Card' },
    { key: 'cashLabel', label: 'Cash' },
  ], (data.today || []).map((item) => ({
    hourLabel: `${String(item.hour).padStart(2, '0')}:00`,
    salesLabel: formatCurrency(item.sales),
    voidsLabel: formatCurrency(item.voids),
    creditLabel: formatCurrency(item.creditCard),
    debitLabel: formatCurrency(item.debitCard),
    giftLabel: formatCurrency(item.giftCard),
    cashLabel: formatCurrency(item.cash),
  })));
  setStatus('manager-reports-status', 'Loaded X-report (today).', 'success');
}

async function runReportInventoryUsage(form) {
  const formData = new FormData(form);
  const params = new URLSearchParams({
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    limit: formData.get('limit'),
  });
  const data = await fetchJson(`/api/reports/inventory-usage?${params}`);
  renderTable('manager-report-table', [
    { key: 'id', label: 'Inventory ID' },
    { key: 'name', label: 'Ingredient' },
    { key: 'unitsUsed', label: 'Units Used' },
  ], data.items || []);
  setStatus('manager-reports-status', 'Loaded inventory usage report.', 'success');
}

async function bootManager() {
  // 1. Check for an existing local session
  let session = getRoleSession();

  // 2. If no local session, check the server for a Google OAuth session
  if (!session) {
    try {
      const status = await fetchJson('/api/auth/status');
      // Verify they are authenticated and have the correct manager role
      if (status.authenticated && status.role === 'manager') {
        session = status;
        saveRoleSession(session); // Save to sessionStorage so it persists on refresh
      }
    } catch (e) {
      // Not logged in via Google, or server error - fallback to login form
      console.log("No active Google session found.");
    }
  }

  // 3. If we have a valid session (from either method), show the workspace
  if (session && session.role === 'manager') {
    showManagerWorkspace(session);
    await loadManagerWorkspace();
  }

  // 4. Attach event listeners for the tab system
  document.querySelectorAll('[data-manager-tab]').forEach((button) => {
    button.addEventListener('click', () => setManagerTab(button.dataset.managerTab));
  });
  setManagerTab('reports');

  // 5. Handle the manual (Username/Password) Login Form
  const form = document.getElementById('manager-login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('manager-login-status', 'Checking manager credentials...', 'neutral');
    const formData = new FormData(form);

    try {
      const result = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
          role: 'manager',
        }),
      });
      saveRoleSession(result);
      showManagerWorkspace(result);
      setStatus('manager-login-status', `Signed in as ${result.name || result.username}.`, 'success');
      await loadManagerWorkspace();
    } catch (error) {
      setStatus('manager-login-status', error.message, 'error');
    }
  });

  // 6. Handle Sign Out
  document.getElementById('manager-sign-out').addEventListener('click', () => {
    clearRoleSession();
    // Also redirect to a logout route if you want to clear the Google session server-side
    window.location.replace('/');
  });

  // 7. Attach Report Handlers
  document.getElementById('report-total-revenue').addEventListener('click', () => runReportWithStatus(runReportTotalRevenue));
  document.getElementById('report-low-inventory').addEventListener('click', () => runReportWithStatus(runReportLowInventory));
  document.getElementById('report-most-ordered').addEventListener('click', () => runReportWithStatus(runReportMostOrdered));
  document.getElementById('report-x').addEventListener('click', () => runReportWithStatus(runReportX));
  document.getElementById('inventory-usage-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await runReportWithStatus(() => runReportInventoryUsage(event.currentTarget));
  });

  // 8. Attach Z-Report Handler
  document.getElementById('report-z').addEventListener('click', async () => {
    const employeeSignature = window.prompt('Closing staff signature:');
    if (!employeeSignature) return;
    const managerSignature = window.prompt('Manager signature:');
    if (!managerSignature) return;
    try {
      const result = await fetchJson('/api/reports/z', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeSignature, managerSignature }),
      });
      renderTable('manager-report-table', [
        { key: 'metric', label: 'Metric' },
        { key: 'value', label: 'Value' },
      ], [
        { metric: 'Run Date', value: result.report.runDate },
        { metric: 'Employee Signature', value: result.report.employeeSignature },
        { metric: 'Manager Signature', value: result.report.managerSignature },
        { metric: 'Sales', value: formatCurrency(result.report.sales) },
        { metric: 'Tax', value: formatCurrency(result.report.tax) },
        { metric: 'Voids', value: formatCurrency(result.report.voids) },
        { metric: 'Credit Card', value: formatCurrency(result.report.creditCard) },
        { metric: 'Debit Card', value: formatCurrency(result.report.debitCard) },
        { metric: 'Gift Card', value: formatCurrency(result.report.giftCard) },
        { metric: 'Cash', value: formatCurrency(result.report.cash) },
        { metric: 'Discounts', value: formatCurrency(result.report.discounts) },
        { metric: 'Service Charges', value: formatCurrency(result.report.serviceCharges) },
        { metric: 'Total Cash', value: formatCurrency(result.report.totalCash) },
        { metric: 'Total Sales', value: formatCurrency(result.report.totalSales) },
      ]);
      setStatus('manager-reports-status', 'Z-report updated and X-totals reset.', 'success');
      await refreshManagerSummary();
    } catch (error) {
      setStatus('manager-reports-status', error.message, 'error');
    }
  });

  // 9. Attach Reset Z-Report Handler
  document.getElementById('report-reset-z').addEventListener('click', async () => {
    try {
      const result = await fetchJson('/api/reports/reset-z', { method: 'POST' });
      renderTable('manager-report-table', [
        { key: 'status', label: 'Status' },
        { key: 'details', label: 'Details' },
      ], [{ status: result.reset ? 'Success' : 'Info', details: result.reset ? 'Today\'s Z-report was reset.' : 'No Z-report existed for today. X-report totals were reset.' }]);
      setStatus('manager-reports-status', 'Z-report reset complete.', 'success');
      await refreshManagerSummary();
    } catch (error) {
      setStatus('manager-reports-status', error.message, 'error');
    }
  });

  // 10. Attach Menu Actions
  document.getElementById('manager-show-inactive').addEventListener('change', () => runManagerAction(loadManagerMenuTable, 'manager-menu-status', 'Menu table refreshed.'));
  document.getElementById('menu-refresh').addEventListener('click', () => runManagerAction(loadManagerMenuTable, 'manager-menu-status', 'Menu table refreshed.'));

  document.getElementById('menu-update-price').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('menu-update-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/menu/price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: data.get('productId'), price: data.get('price') }),
      });
      await loadManagerMenuTable();
    }, 'manager-menu-status', 'Product price updated.');
  });

  document.getElementById('menu-update-category').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('menu-update-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/menu/category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: data.get('productId'), category: data.get('category') }),
      });
      await loadManagerMenuTable();
    }, 'manager-menu-status', 'Product category updated.');
  });

  document.getElementById('menu-deactivate').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('menu-update-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/menu/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: data.get('productId') }),
      });
      await loadManagerMenuTable();
    }, 'manager-menu-status', 'Product hidden (inactive).');
  });

  document.getElementById('menu-reactivate').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('menu-update-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/menu/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: data.get('productId') }),
      });
      await loadManagerMenuTable();
    }, 'manager-menu-status', 'Product reactivated.');
  });

  document.getElementById('menu-add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await runManagerAction(async () => {
      await fetchJson('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          category: data.get('category'),
          price: data.get('price'),
          ingredientUsage: parseIngredientUsageFromRows(),
        }),
      });
      form.reset();
      document.getElementById('menu-ingredient-rows').innerHTML = '';
      await populateManagerFormOptions();
      await loadManagerMenuTable();
    }, 'manager-menu-status', 'Menu item added.');
  });

  // 11. Attach Inventory Actions
  document.getElementById('inventory-refresh').addEventListener('click', () => runManagerAction(loadManagerInventoryTable, 'manager-inventory-status', 'Inventory table refreshed.'));

  document.getElementById('inventory-update-quantity').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('inventory-update-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/inventory/quantity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId: data.get('inventoryId'), quantity: data.get('quantity') }),
      });
      await loadManagerInventoryTable();
    }, 'manager-inventory-status', 'Inventory quantity updated.');
  });

  document.getElementById('inventory-update-price').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('inventory-update-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/inventory/price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId: data.get('inventoryId'), price: data.get('price') }),
      });
      await loadManagerInventoryTable();
    }, 'manager-inventory-status', 'Inventory price updated.');
  });

  document.getElementById('inventory-delete').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('inventory-update-form'));
    await runManagerAction(async () => {
      await fetchJson(`/api/inventory?inventoryId=${data.get('inventoryId')}`, { method: 'DELETE' });
      await loadManagerInventoryTable();
    }, 'manager-inventory-status', 'Inventory item deleted.');
  });

  document.getElementById('inventory-affected-products').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('inventory-update-form'));
    try {
      const result = await fetchJson(`/api/inventory/affected-products?inventoryId=${data.get('inventoryId')}`);
      renderTable('manager-report-table', [{ key: 'name', label: 'Affected Products' }], (result.items || []).map((name) => ({ name })));
      setStatus('manager-inventory-status', 'Affected products loaded into the report panel.', 'success');
      setManagerTab('reports');
    } catch (error) {
      setStatus('manager-inventory-status', error.message, 'error');
    }
  });

  document.getElementById('inventory-add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await runManagerAction(async () => {
      await fetchJson('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          category: data.get('category'),
          price: data.get('price'),
          quantity: data.get('quantity'),
        }),
      });
      form.reset();
      await populateManagerFormOptions();
      await loadManagerInventoryTable();
    }, 'manager-inventory-status', 'Inventory item added.');
  });

  // 12. Attach Employee Actions
  document.getElementById('employees-refresh').addEventListener('click', () => runManagerAction(loadManagerEmployeesTable, 'manager-employees-status', 'Employees table refreshed.'));
  document.getElementById('employees-update-role').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('employee-role-form'));
    await runManagerAction(async () => {
      await fetchJson('/api/employees/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: data.get('employeeId'), role: data.get('role') }),
      });
      await loadManagerEmployeesTable();
    }, 'manager-employees-status', 'Employee role updated.');
  });

  document.getElementById('employees-delete').addEventListener('click', async () => {
    const data = new FormData(document.getElementById('employee-role-form'));
    await runManagerAction(async () => {
      await fetchJson(`/api/employees?employeeId=${data.get('employeeId')}`, { method: 'DELETE' });
      await loadManagerEmployeesTable();
    }, 'manager-employees-status', 'Employee terminated.');
  });

  document.getElementById('employee-add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await runManagerAction(async () => {
      await fetchJson('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.get('id'),
          name: data.get('name'),
          role: data.get('role'),
          username: data.get('username'),
          password: data.get('password'),
        }),
      });
      form.reset();
      await loadManagerEmployeesTable();
    }, 'manager-employees-status', 'Employee added.');
  });
}

async function runReportWithStatus(action) {
  try {
    setStatus('manager-reports-status', 'Loading report...', 'neutral');
    await action();
  } catch (error) {
    setStatus('manager-reports-status', error.message, 'error');
  }
}

async function runManagerAction(action, statusId, successMessage) {
  try {
    setStatus(statusId, 'Running action...', 'neutral');
    await action();
    await refreshManagerSummary();
    setStatus(statusId, successMessage, 'success');
  } catch (error) {
    setStatus(statusId, error.message, 'error');
  }
}

function showManagerWorkspace(session) {
  document.getElementById('manager-login-card').hidden = true;
  document.getElementById('manager-workspace').hidden = false;
  setText('manager-session-name', session.name || session.username || 'Manager');
}

async function loadManagerWorkspace() {
  setStatus('manager-dashboard-status', 'Loading live manager data...', 'neutral');
  await Promise.all([
    refreshManagerSummary(),
    populateManagerFormOptions(),
    loadManagerMenuTable(),
    loadManagerInventoryTable(),
    loadManagerEmployeesTable(),
    runReportTotalRevenue(),
  ]);
  setStatus('manager-dashboard-status', 'Manager workspace synced with the live database.', 'success');
}

async function bootCustomer() {
  renderList('customer-features', [
    'Portal-driven entry path is already in place.',
    'Customer page can reuse the shared product catalog immediately.',
    'Next step is building cart and customization controls on top of /api/products.',
    'Online checkout should stay behind the write flag until fully ported.',
  ]);

  const data = await fetchJson('/api/products');
  renderSimpleProducts('customer-products', (data.items || []).slice(0, 6));
}

async function boot() {
  const page = document.body.dataset.page;
  if (!requirePortalAccess(page)) {
    return;
  }

  try {
    if (page === 'portal') {
      await bootPortal();
      return;
    }
    if (page === 'staff') {
      await bootStaff();
      return;
    }
    if (page === 'manager') {
      await bootManager();
      return;
    }
    if (page === 'customer') {
      await bootCustomer();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    ['portal-summary', 'staff-products-status', 'staff-login-status', 'staff-preview-status', 'manager-login-status', 'manager-dashboard-status'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = message;
      }
    });
  }
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    role: document.getElementById('role').value
  };

  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (response.ok && result.authenticated) {
    document.getElementById('login-message').innerText = `Welcome, ${result.name}!`;
    // Redirect based on role
    window.location.href = `/${result.role}`;
  } else {
    document.getElementById('login-message').innerText = "Login failed. Please check your credentials.";
  }
});

boot();