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
