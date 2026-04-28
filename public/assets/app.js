const ACCESS_KEY = 'portalAccessRole';
const SESSION_KEY = 'portalSession';
const EMPTY_PREVIEW = { lineItems: [], subtotal: 0, tax: 0, total: 0, shortages: [], canSubmit: false };

const staffState = {
  products: [],
  cart: [],
  selectedProductId: null,
  preview: { ...EMPTY_PREVIEW },
  lastCustomizationTrigger: null,
  isSubmittingOrder: false,
};
const managerState = {
  menuItems: [],
  inventoryItems: [],
  selectedProductId: null,
  selectedInventoryId: null,
};
const CUSTOMER_CONTRAST_KEY = 'customerHighContrast';
const CUSTOMER_TEXT_SIZE_KEY = 'customerTextScale';
const CUSTOMER_ZOOM_KEY = 'customerZoomScale';
const CUSTOMER_PHONE_DIGIT_PATTERN = /\d/g;
const CUSTOMER_PHONE_NUMBER_LENGTH = 10;
const CUSTOMER_CATEGORY_ORDER = ['boba-tea', 'milk-tea', 'tea', 'seasonal'];
const CUSTOMER_CATEGORY_META = {
  'boba-tea': {
    label: 'Boba Tea',
    description: 'Chewy pearls, bold flavors, and fun signature builds.',
  },
  'milk-tea': {
    label: 'Milk Tea',
    description: 'Creamy classics and rich house favorites.',
  },
  tea: {
    label: 'Tea',
    description: 'Fresh teas, fruit blends, and lighter refreshers.',
  },
  seasonal: {
    label: 'Seasonal',
    description: 'Limited-time drinks and rotating specials from the live menu.',
  },
};
const customerState = {
  products: [],
  activeCategory: 'boba-tea',
  cart: [],
  preview: { ...EMPTY_PREVIEW },
  rewardDiscount: 0,
  rewardCreditApplied: false,
  profile: null,
  selectedProductId: null,
  highContrast: false,
  textScale: 1,
  zoomScale: 1,
  lastDialogTrigger: null,
  lastRewardsTrigger: null,
  lastCategoryTrigger: null,
  suppressCategoryFocusRestore: false,
  isSubmittingOrder: false,
};
// ── Translation ───────────────────────────────────────────────────────────────
const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const translationCache = {}; // { 'lang:text': translatedText }
let currentLang = 'en';
let translationSeq = 0;  // guards against stale async renders
let bgPrefetchDone = false;

// Sync lookup — returns cached translation or original text
function t(text) {
  if (currentLang === 'en' || !text) return text;
  return translationCache[`${currentLang}:${text}`] || text;
}

const JS_STATIC_STRINGS = [
  'Member ID:',
  'No rewards profile yet',
  'Ask about the menu\u2026',
  'Hi! I\'m your Reveille Bubble Tea assistant. Ask me anything about the menu, customizations, or our rewards program!',
  'Sign in or create an account to count orders toward a free drink.',
  '0 of 5 orders completed',
  'of 5 orders completed toward next reward',
  'more order until the next free drink.',
  'more orders until the next free drink.',
  'You have 1 free drink credit ready to use on your next order!',
  'You have',
  'free drink credits ready to use!',
  'Close',
  'Hot',
  'Small',
  'Medium',
  'Large',
  'item',
  'items',
  'item available',
  'items available',
  'Out of Stock',
  'Out of stock.',
  'Open customization options.',
  'Base price',
  'Adjust size, sweetness, ice, and toppings.',
  'All options are keyboard accessible and remain readable for translation tools.',
  'No products are available in this category right now.',
  'Your cart is empty. Pick a drink to customize and add it here.',
  'Submitting',
  'Ordered',
  'Recommendation',
  'Rewards program?',
  'Customization?',
  'Reward Status',
  'Apply Credit',
  'Credit Applied',
  'Remove Credit',
  'Sign in to rewards to track progress and use free drink credits.',
  'Add an item to your cart to use rewards.',
  'No free drink credits available yet.',
  'Free drink credit available.',
  'Free drink credit applied.',
  'Free drink credit removed.',
  'credit',
  'credits',
];

function collectAllTranslatableStrings() {
  const staticTexts = Array.from(document.querySelectorAll('[data-i18n]'))
    .map((el) => el.dataset.i18n)
    .filter(Boolean);
  const productTexts = customerState.products.flatMap((p) => [p.name, p.category]);
  const categoryTexts = Object.values(CUSTOMER_CATEGORY_META).flatMap((m) => [m.label, m.description]);
  return [...new Set([...staticTexts, ...productTexts, ...categoryTexts, ...JS_STATIC_STRINGS])].filter(Boolean);
}

async function fetchTranslations(texts, lang) {
  if (!texts.length) return true;
  try {
    const data = await fetchJson('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, targetLang: lang }),
    });
    if (data.translations) {
      for (const [original, translated] of Object.entries(data.translations)) {
        translationCache[`${lang}:${original}`] = translated;
      }
    }
    return true;
  } catch (err) {
    console.error(`Translation to ${lang} failed:`, err);
    return false;
  }
}

// Translate all [data-i18n] elements + pre-cache product names, then re-render
async function applyLanguage(lang) {
  currentLang = lang;
  const seq = ++translationSeq;

  if (lang === 'en') {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = el.dataset.i18n;
    });
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.placeholder = 'Ask about the menu\u2026';
    renderCustomerCategoryButtons();
    renderCustomerProducts();
    renderCustomerRewards();
    renderCustomerCart();
    return;
  }

  const allUnique = collectAllTranslatableStrings();

  // Fetch translations for the selected language (awaited — needed before render)
  const uncached = allUnique.filter((text) => !translationCache[`${lang}:${text}`]);
  const ok = await fetchTranslations(uncached, lang);

  // Guard: discard if user switched again while we were waiting
  if (seq !== translationSeq) return;

  if (!ok) {
    setStatus('customer-products-status', 'Translation failed — check that GOOGLE_TRANSLATE_API_KEY is set and the Cloud Translation API is enabled in your Google Cloud project.', 'error');
    return;
  }

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.placeholder = t('Ask about the menu\u2026');
  renderCustomerCategoryButtons();
  renderCustomerProducts();
  renderCustomerRewards();
  renderCustomerCart();


  //Prefetches other translations to ensure seamless transitions
  if (!bgPrefetchDone) {
    bgPrefetchDone = true;
    const otherLangs = SUPPORTED_LANGUAGES
      .map((l) => l.code)
      .filter((code) => code !== 'en' && code !== lang);
    for (const otherLang of otherLangs) {
      const toFetch = allUnique.filter((text) => !translationCache[`${otherLang}:${text}`]);
      fetchTranslations(toFetch, otherLang); // intentionally not awaited
    }
  }
}


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
  if (page === 'portal' || page === 'customer') {
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
  } //Important for setting text dynamically, used in translation feature
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
  element.classList.toggle('is-loading', tone === 'loading');
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
  return { quantity: 1, size: 'Medium', sugarPercent: 100, icePercent: 100, toppings: [] };
}

function readPercentInput(id, fallback) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function getSelectedProduct() {
  return staffState.products.find((item) => item.id === staffState.selectedProductId) || null;
}

function formatIceLevel(value) {
  return Number(value) === 200 ? 'Hot' : `${Number(value || 0)}% ice`;
}

function readStaffIcePercent() {
  const iceField = document.querySelector('input[name="staff-ice"]:checked');
  return iceField ? Number(iceField.value) : 100;
}

function readCustomizationForm() {
  return {
    quantity: Math.max(1, Number(document.getElementById('staff-qty').value) || 1),
    size: document.getElementById('staff-size').value,
    sugarPercent: readPercentInput('staff-sugar', 100),
    icePercent: readStaffIcePercent(),
    toppings: Array.from(document.querySelectorAll('input[name="staff-topping"]:checked')).map((element) => element.value),
  };
}

function resetCustomizationForm() {
  const defaults = defaultCustomization();
  document.getElementById('staff-qty').value = defaults.quantity;
  document.getElementById('staff-size').value = defaults.size;
  
  document.getElementById('staff-sugar').value = defaults.sugarPercent;
  setText('staff-sugar-value', `${defaults.sugarPercent}%`);
  
  const defaultIceField = document.querySelector(`input[name="staff-ice"][value="${defaults.icePercent}"]`);
  if (defaultIceField) {
    defaultIceField.checked = true;
  }
  
  document.querySelectorAll('input[name="staff-topping"]').forEach((element) => {
    element.checked = false;
  });
}

function setStaffQuantity(nextValue) {
  const quantityInput = document.getElementById('staff-qty');
  if (!quantityInput) {
    return;
  }

  quantityInput.value = String(Math.max(1, Number(nextValue) || 1));
}

function adjustStaffQuantity(delta) {
  const quantityInput = document.getElementById('staff-qty');
  if (!quantityInput) {
    return;
  }

  setStaffQuantity((Number(quantityInput.value) || 1) + delta);
}

function setupStaffCustomizationDialog() {
  const panel = document.getElementById('staff-customization-panel');
  if (!panel || document.getElementById('staff-customization-dialog')) {
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'staff-customization-dialog';
  dialog.className = 'customer-dialog staff-customization-dialog';
  dialog.setAttribute('aria-labelledby', 'staff-selected-product');
  dialog.setAttribute('aria-describedby', 'staff-selected-price');
  dialog.setAttribute('aria-modal', 'true');

  panel.hidden = false;
  panel.classList.remove('content-card', 'dashboard-pane');
  panel.classList.add('customer-dialog-form', 'staff-customization-panel');

  const closeButton = document.createElement('button');
  closeButton.id = 'staff-close-customization-dialog';
  closeButton.className = 'ghost-button mini-button staff-customization-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close customization dialog');
  closeButton.textContent = 'Close';
  panel.insertBefore(closeButton, panel.firstChild);

  dialog.appendChild(panel);
  document.body.insertBefore(dialog, document.querySelector('script[src="/assets/app.js"]'));
}

function getStaffCustomizationDialogFocusableElements() {
  const dialog = document.getElementById('staff-customization-dialog');
  if (!dialog) {
    return [];
  }

  return Array.from(dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('hidden'));
}

function openStaffCustomizationDialog(trigger = null) {
  staffState.lastCustomizationTrigger = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dialog = document.getElementById('staff-customization-dialog');
  if (!dialog) {
    return;
  }

  resetCustomizationForm();

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', 'true');
  }

  document.getElementById('staff-qty-increment')?.focus();
}

function restoreStaffCustomizationDialogFocus() {
  const lastTrigger = staffState.lastCustomizationTrigger;
  staffState.lastCustomizationTrigger = null;
  if (lastTrigger && document.contains(lastTrigger)) {
    lastTrigger.focus();
    return;
  }

  document.querySelector('.product-card.selected')?.focus();
}

function closeStaffCustomizationDialog() {
  const dialog = document.getElementById('staff-customization-dialog');
  if (typeof dialog?.close === 'function') {
    dialog.close();
  } else {
    dialog?.removeAttribute('open');
    restoreStaffCustomizationDialogFocus();
  }
}

function refreshCustomerProductsInBackground() {
  fetchJson('/api/products')
    .then((productsData) => {
      customerState.products = productsData.items || customerState.products;
      renderCustomerCategoryButtons();
      renderCustomerProducts();
    })
    .catch((error) => {
      console.warn('Unable to refresh customer products after checkout:', error);
    });
}

function customizationMatches(a, b) {
  return a.size === b.size && 
         a.sugarPercent === b.sugarPercent && 
         a.icePercent === b.icePercent && 
         JSON.stringify(a.toppings.sort()) === JSON.stringify(b.toppings.sort());
}

function customizationSummary(item) {
  const toppings = item.toppings.length ? `, ${item.toppings.join(', ')}` : '';
  return `${item.size}, ${item.sugarPercent}% sugar, ${formatIceLevel(item.icePercent)}${toppings}`;
}

function mergePreviewLineItems(cart, previewLineItems) {
  if (!Array.isArray(previewLineItems) || previewLineItems.length !== cart.length) {
    return cart;
  }

  return previewLineItems.map((previewLine, index) => {
    const cartLine = cart[index];
    return {
      ...cartLine,
      ...previewLine,
      size: cartLine.size,
      sugarPercent: cartLine.sugarPercent,
      icePercent: cartLine.icePercent,
      toppings: cartLine.toppings,
    };
  });
}

function getFirstAvailableProduct(products) {
  return (products || []).find((item) => !item.outOfStock) || null;
}

function renderStaffProducts() {
  const container = document.getElementById('staff-products');
  const category = document.getElementById('staff-category-filter').value;
  const visible = category === 'all'
    ? staffState.products
    : staffState.products.filter((item) => item.category === category);

  const selectedVisibleProduct = visible.find((item) => Number(item.id) === Number(staffState.selectedProductId) && !item.outOfStock);
  if (!selectedVisibleProduct) {
    const fallbackProduct = getFirstAvailableProduct(visible);
    staffState.selectedProductId = fallbackProduct ? fallbackProduct.id : null;
    setText('staff-selected-product', fallbackProduct ? fallbackProduct.name : 'No in-stock product selected');
    setText('staff-selected-price', fallbackProduct ? `Base price ${formatCurrency(fallbackProduct.price)} before size adjustment.` : 'Products marked out of stock cannot be customized.');
  }

  container.innerHTML = '';
  visible.forEach((item) => {
    const card = document.createElement('article');
    const isDisabled = Boolean(item.outOfStock);
    card.className = `product-card selectable-card${staffState.selectedProductId === item.id ? ' selected' : ''}${isDisabled ? ' product-card-disabled' : ''}`;
    card.tabIndex = isDisabled ? -1 : 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', staffState.selectedProductId === item.id ? 'true' : 'false');
    card.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    card.innerHTML = `
      <p class="section-label">${escapeHtml(item.category)}</p>
      <h3>${escapeHtml(item.name)}</h3>
      <p class="price-line">$${Number(item.price).toFixed(2)}</p>
      <p class="muted-line">${isDisabled ? 'Out of stock.' : 'Click anywhere on this card to customize.'}</p>
      ${isDisabled ? '<p class="out-of-stock-label">Out of Stock</p>' : ''}
    `;

    const selectProduct = () => {
      if (isDisabled) {
        setStatus('staff-cart-status', `${item.name} is out of stock right now.`, 'error');
        return;
      }
      staffState.selectedProductId = item.id;
      setText('staff-selected-product', item.name);
      setText('staff-selected-price', `Base price ${formatCurrency(item.price)} before size adjustment.`);
      renderStaffProducts();
      openStaffCustomizationDialog(document.querySelector('.product-card.selected') || card);
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

  staffState.cart = mergePreviewLineItems(staffState.cart, preview.lineItems);

  renderCart();
  renderPreview();
}

function toOrderPayload(line) {
  return {
    productId: line.productId,
    quantity: line.quantity,
    size: line.size,
    sugarPercent: line.sugarPercent,
    icePercent: line.icePercent,
    toppings: line.toppings,
  };
}

function buildPaymentPayload() {
  const total = Number(staffState.preview.total || 0);

  // Safely get values with fallbacks to avoid crashes
  const giftEl = document.getElementById('staff-gift-amount');
  const cashEl = document.getElementById('staff-cash-received');
  const primaryEl = document.getElementById('staff-payment-primary');
  const secondaryEl = document.getElementById('staff-payment-secondary');

  const giftAmount = Number(giftEl?.value || 0);
  const cashReceived = Number(cashEl?.value || 0);
  const primary = primaryEl?.value || 'Cash';
  const secondary = secondaryEl?.value || null;

  const remainingAfterGift = Math.max(0, total - giftAmount);
  const cashChange = (primary === 'Cash' || secondary === 'Cash')
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
  // 1. Session check
  let session = getRoleSession();
  if (!session) {
    try {
      const status = await fetchJson('/api/auth/status');
      if (status.authenticated && (status.role === 'staff' || status.role === 'manager')) {
        session = status;
        saveRoleSession(session);
      }
    } catch (e) { console.log("No OAuth session."); }
  }

  if (session && (session.role === 'staff' || session.role === 'manager')) {
    showStaffWorkspace(session);
    await loadStaffProducts();
  }

  setupStaffCustomizationDialog();

  // 2. PIN Keypad Logic
  const loginForm = document.getElementById('staff-login-form');
  const pinInput = loginForm.querySelector('input[name="pin"]');

  loginForm.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.onclick = () => {
      if (pinInput.value.length < 4) pinInput.value += btn.dataset.val;
    };
  });

  loginForm.querySelector('.keypad-clear').onclick = () => {
    pinInput.value = '';
    setStatus('staff-login-status', 'PIN cleared.', 'neutral');
  };

  // 3. Login Submit
  loginForm.onsubmit = async (event) => {
    event.preventDefault();
    const pin = pinInput.value;
    if (pin.length !== 4) return setStatus('staff-login-status', 'Enter 4 digits.', 'error');

    try {
      const result = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (result.authenticated) {
        saveRoleSession(result);
        showStaffWorkspace(result);
        await loadStaffProducts();
      } else {
        setStatus('staff-login-status', 'Invalid PIN.', 'error');
      }
    } catch (error) { setStatus('staff-login-status', 'Login failed.', 'error'); }
  };

  // 4. Order Actions
  document.getElementById('staff-add-to-cart').onclick = async () => {
    const product = getSelectedProduct();
    if (!product) return setStatus('staff-cart-status', 'Select a product first!', 'error');

    const customization = readCustomizationForm();

    // 1. Check if an identical item already exists in the cart
    const existingItem = staffState.cart.find(item =>
      item.productId === product.id &&
      item.size === customization.size &&
      item.sugarPercent === customization.sugarPercent &&
      JSON.stringify(item.toppings.sort()) === JSON.stringify(customization.toppings.sort())
    );

    if (existingItem) {
      // 2. Update existing item Qty and Total
      existingItem.quantity += customization.quantity;
      existingItem.lineTotal = Number((existingItem.unitPrice * existingItem.quantity).toFixed(2));
      setStatus('staff-cart-status', `Updated ${product.name} quantity.`, 'success');
    } else {
      // 3. Add as a new block if it's different
      staffState.cart.push({
        ...product,
        productId: product.id,
        ...customization,
        unitPrice: Number(product.price),
        lineTotal: Number((Number(product.price) * customization.quantity).toFixed(2)),
      });
      setStatus('staff-cart-status', `Added ${product.name} to cart.`, 'success');
    }

    // 4. Refresh UI
    renderCart();
    await refreshPreview();

    // Optional: reset form to defaults after adding
    resetCustomizationForm();
    closeStaffCustomizationDialog();
  };

  document.getElementById('staff-qty-decrement')?.addEventListener('click', () => {
    adjustStaffQuantity(-1);
  });
  document.getElementById('staff-qty-increment')?.addEventListener('click', () => {
    adjustStaffQuantity(1);
  });
  document.getElementById('staff-close-customization-dialog')?.addEventListener('click', closeStaffCustomizationDialog);
  document.getElementById('staff-customization-dialog')?.addEventListener('close', restoreStaffCustomizationDialogFocus);
  document.getElementById('staff-customization-dialog')?.addEventListener('keydown', (event) => {
    const dialog = event.currentTarget;
    if (!dialog.hasAttribute('open')) {
      return;
    }

    if (event.key === 'Escape' && typeof dialog.showModal !== 'function') {
      event.preventDefault();
      closeStaffCustomizationDialog();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getStaffCustomizationDialogFocusableElements();
    if (!focusableElements.length) {
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.getElementById('staff-submit-order').onclick = async () => {
    if (!staffState.cart.length) {
      setStatus('staff-checkout-status', 'Cart is empty!', 'error');
      return;
    }

    try {
      const payload = {
        items: staffState.cart.map(toOrderPayload),
        payment: buildPaymentPayload()
      };

      setStatus('staff-checkout-status', 'Processing payment...', 'neutral');

      await fetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // 1. Show Success Message on Page
      setStatus('staff-checkout-status', '✔ Order placed successfully!', 'success');

      // 2. Reset State
      staffState.cart = [];
      staffState.preview = { ...EMPTY_PREVIEW };
      renderCart();
      renderPreview();

      // 3. Clear the success message after 4 seconds
      setTimeout(() => {
        setStatus('staff-checkout-status', '', 'neutral');
      }, 4000);

    } catch (error) {
      console.error("Submission error:", error);
      setStatus('staff-checkout-status', 'Error: ' + error.message, 'error');
    }
  };
  document.getElementById('staff-sign-out').onclick = () => {
    clearRoleSession();
    location.reload(); // Simplest way to reset everything
  };

  // UI sugar and ice level display
  document.getElementById('staff-sugar').oninput = (e) => {
    setText('staff-sugar-value', `${e.target.value}%`);
  };
  
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

  const firstAvailableStaffProduct = getFirstAvailableProduct(staffState.products);
  if (!staffState.selectedProductId) {
    staffState.selectedProductId = firstAvailableStaffProduct ? firstAvailableStaffProduct.id : null;
    setText('staff-selected-product', firstAvailableStaffProduct ? firstAvailableStaffProduct.name : 'No in-stock product selected');
    setText('staff-selected-price', firstAvailableStaffProduct ? `Base price ${formatCurrency(firstAvailableStaffProduct.price)} before size adjustment.` : 'Products marked out of stock cannot be customized.');
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

  container.innerHTML = '';
  if (options.beforeTable instanceof HTMLElement) {
    container.appendChild(options.beforeTable);
  }

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'muted-line';
    empty.textContent = 'No data found.';
    container.appendChild(empty);
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
      const value = typeof column.render === 'function' ? column.render(row) : row[column.key];
      if (value instanceof HTMLElement) {
        td.appendChild(value);
      } else {
        td.textContent = value === undefined || value === null ? '' : String(value);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

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
  const estimateRestockCost = (item, targetQuantity) => {
    const currentQuantity = Math.max(0, Number(item.quantity) || 0);
    const desiredQuantity = Math.max(0, Number(targetQuantity) || 0);
    const unitsToBuy = Math.max(0, desiredQuantity - currentQuantity);
    return Number((unitsToBuy * Number(item.price || 0)).toFixed(2));
  };
  const bulkControls = document.createElement('div');
  bulkControls.className = 'button-row';

  const bulkInput = document.createElement('input');
  bulkInput.type = 'number';
  bulkInput.min = '0';
  bulkInput.value = '100';
  bulkInput.className = 'numeric-input';
  bulkInput.style.maxWidth = '140px';

  const bulkCost = document.createElement('span');
  bulkCost.className = 'muted-line';

  const updateBulkCost = () => {
    const nextQuantity = Math.max(0, Number(bulkInput.value) || 0);
    const totalCost = (data.items || []).reduce((sum, item) => sum + estimateRestockCost(item, nextQuantity), 0);
    bulkCost.textContent = `Estimated total cost: ${formatCurrency(totalCost)}`;
  };
  bulkInput.addEventListener('input', updateBulkCost);

  const bulkButton = document.createElement('button');
  bulkButton.type = 'button';
  bulkButton.className = 'action-button mini-button';
  bulkButton.textContent = 'Restock All To';
  bulkButton.addEventListener('click', async () => {
    const nextQuantity = Math.max(0, Number(bulkInput.value) || 0);
    await runManagerAction(async () => {
      for (const item of data.items || []) {
        await fetchJson('/api/inventory/quantity', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventoryId: item.id, quantity: nextQuantity }),
        });
      }
      await loadManagerInventoryTable();
      await runReportLowInventory();
    }, 'manager-reports-status', `All low inventory items were restocked to ${nextQuantity}.`);
  });

  bulkControls.appendChild(bulkInput);
  bulkControls.appendChild(bulkButton);
  bulkControls.appendChild(bulkCost);
  updateBulkCost();

  renderTable('manager-report-table', [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'quantity', label: 'Quantity' },
    {
      key: 'price',
      label: 'Unit Price',
      render: (item) => formatCurrency(item.price),
    },
    {
      key: 'restock',
      label: 'Restock To',
      render: (item) => {
        const wrap = document.createElement('div');
        wrap.className = 'button-row';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.value = '100';
        input.className = 'numeric-input';
        input.style.maxWidth = '110px';

        const cost = document.createElement('span');
        cost.className = 'muted-line';
        const updateCost = () => {
          cost.textContent = formatCurrency(estimateRestockCost(item, input.value));
        };
        input.addEventListener('input', updateCost);
        updateCost();

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ghost-button mini-button';
        button.textContent = 'Restock';
        button.addEventListener('click', async (event) => {
          event.stopPropagation();
          const nextQuantity = Math.max(0, Number(input.value) || 0);
          await runManagerAction(async () => {
            await fetchJson('/api/inventory/quantity', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ inventoryId: item.id, quantity: nextQuantity }),
            });
            await loadManagerInventoryTable();
            await runReportLowInventory();
          }, 'manager-reports-status', `Inventory item #${item.id} restocked to ${nextQuantity}.`);
          const refreshedItem = managerState.inventoryItems.find((entry) => Number(entry.id) === Number(item.id));
          if (refreshedItem) {
            applyInventorySelection({ ...refreshedItem, rawPrice: refreshedItem.price });
          }
        });

        wrap.appendChild(input);
        wrap.appendChild(cost);
        wrap.appendChild(button);
        return wrap;
      },
    },
  ], data.items || [], { beforeTable: bulkControls });
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
    document.getElementById('manager-workspace').hidden = true;
    document.getElementById('manager-login-card').hidden = false;
    document.getElementById('manager-login-form')?.reset();
    setStatus('manager-login-status', 'Signed out successfully.', 'neutral');
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

  // 8. Attach Z-Report Handler — shows inline signature form instead of window.prompt
  document.getElementById('report-z').addEventListener('click', () => {
    document.getElementById('z-report-signature-section').hidden = false;
    document.querySelector('#z-report-signature-form [name="employeeSignature"]').focus();
    setStatus('manager-reports-status', 'Enter signatures below then click Generate Z-Report.', 'neutral');
  });

  document.getElementById('z-report-cancel').addEventListener('click', () => {
    document.getElementById('z-report-signature-section').hidden = true;
    document.getElementById('z-report-signature-form').reset();
  });

  document.getElementById('z-report-signature-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const employeeSignature = String(formData.get('employeeSignature') || '').trim();
    const managerSignature = String(formData.get('managerSignature') || '').trim();
    document.getElementById('z-report-signature-section').hidden = true;
    event.currentTarget.reset();
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
      setStatus('manager-reports-status', 'Z-report generated and daily totals reset.', 'success');
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
    const productId = data.get('productId');
    if (!productId) { setStatus('manager-menu-status', 'Select a product row first.', 'error'); return; }
    if (!window.confirm(`Hide product #${productId} from the menu? It can be reactivated later.`)) return;
    await runManagerAction(async () => {
      await fetchJson('/api/menu/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
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
    const inventoryId = data.get('inventoryId');
    if (!inventoryId) { setStatus('manager-inventory-status', 'Select an inventory row first.', 'error'); return; }
    if (!window.confirm(`Permanently delete inventory item #${inventoryId}? This cannot be undone.`)) return;
    await runManagerAction(async () => {
      await fetchJson(`/api/inventory?inventoryId=${inventoryId}`, { method: 'DELETE' });
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
    const employeeId = data.get('employeeId');
    if (!employeeId) { setStatus('manager-employees-status', 'Select an employee row first.', 'error'); return; }
    if (!window.confirm(`Terminate employee #${employeeId}? This will permanently remove them from the system.`)) return;
    await runManagerAction(async () => {
      await fetchJson(`/api/employees?employeeId=${employeeId}`, { method: 'DELETE' });
      await loadManagerEmployeesTable();
    }, 'manager-employees-status', 'Employee removed from the system.');
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

function normalizeCustomerPhoneNumber(phoneNumber) {
  return (String(phoneNumber || '').match(CUSTOMER_PHONE_DIGIT_PATTERN) || [])
    .join('')
    .slice(0, CUSTOMER_PHONE_NUMBER_LENGTH);
}

function formatCustomerPhoneNumber(phoneNumber) {
  const digits = normalizeCustomerPhoneNumber(phoneNumber);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function saveCustomerProfile(profile) {
  customerState.profile = profile
    ? {
      ...profile,
      phoneNumber: normalizeCustomerPhoneNumber(profile.phoneNumber),
      orderCount: Number(profile.orderCount || 0),
      customerId: profile.customerId != null ? Number(profile.customerId) : null,
      freeDrinkCredits: Number(profile.freeDrinkCredits || 0),
    }
    : null;
}

function clearCustomerProfile() {
  customerState.profile = null;
}

function readCustomerRewardsCredentials() {
  const formData = new FormData(document.getElementById('customer-login-form'));
  return {
    phoneNumber: normalizeCustomerPhoneNumber(formData.get('phoneNumber')),
  };
}

function validateCustomerRewardsCredentials(credentials) {
  if (normalizeCustomerPhoneNumber(credentials.phoneNumber).length !== CUSTOMER_PHONE_NUMBER_LENGTH) {
    throw new Error('Enter a 10-digit phone number.');
  }
}

async function loadCustomerRewardsSession() {
  const data = await fetchJson('/api/customer/rewards/session');
  saveCustomerProfile(data.authenticated ? data.profile : null);
}

function loadCustomerContrastPreference() {
  return localStorage.getItem(CUSTOMER_CONTRAST_KEY) === 'true';
}

function loadCustomerTextScalePreference() {
  const value = Number(localStorage.getItem(CUSTOMER_TEXT_SIZE_KEY) || 1);
  return [1, 1.1, 1.2, 1.35].includes(value) ? value : 1;
}

function loadCustomerZoomPreference() {
  const value = Number(localStorage.getItem(CUSTOMER_ZOOM_KEY) || 1);
  return Math.min(1.4, Math.max(0.5, Number.isFinite(value) ? value : 1));
}

function setCustomerContrastPreference(enabled) {
  customerState.highContrast = enabled;
  document.body.classList.toggle('high-contrast', enabled);
  localStorage.setItem(CUSTOMER_CONTRAST_KEY, enabled ? 'true' : 'false');
  const button = document.getElementById('customer-contrast-toggle');
  if (button) {
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.textContent = enabled ? 'Use Standard Contrast' : 'Enable High Contrast';
  }
}

function setCustomerTextScale(scale) {
  customerState.textScale = scale;
  // Set on <html> so all rem-based sizes on the page scale uniformly
  document.documentElement.style.fontSize = scale === 1 ? '' : `${scale * 100}%`;
  localStorage.setItem(CUSTOMER_TEXT_SIZE_KEY, String(scale));
  const select = document.getElementById('customer-text-size');
  if (select) select.value = String(scale);
}

function setCustomerZoomScale(scale) {
  const normalized = Math.min(1.4, Math.max(0.5, Number(scale) || 1));
  customerState.zoomScale = normalized;
  document.documentElement.style.setProperty('--customer-zoom-scale', String(normalized));
  localStorage.setItem(CUSTOMER_ZOOM_KEY, String(normalized));
  setText('customer-zoom-readout', `${Math.round(normalized * 100)}%`);
}

function setCustomerAccessibilityPanelOpen(isOpen) {
  const panel = document.querySelector('.customer-accessibility-tools');
  const toggle = document.getElementById('customer-accessibility-toggle');
  if (!panel || !toggle) {
    return;
  }
  panel.hidden = !isOpen;
  toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function normalizeCustomerCategory(product) {
  const source = `${product.category || ''} ${product.name || ''}`.toLowerCase();
  if (source.includes('season') || source.includes('limited') || source.includes('holiday') || source.includes('special')) {
    return 'seasonal';
  }
  if (source.includes('milk')) {
    return 'milk-tea';
  }
  if (source.includes('boba') || source.includes('pearl') || source.includes('tapioca') || source.includes('brown sugar')) {
    return 'boba-tea';
  }
  return 'tea';
}

function getCustomerProductsForActiveCategory() {
  return customerState.products.filter((item) => normalizeCustomerCategory(item) === customerState.activeCategory);
}

function getCustomerSelectedProduct() {
  return customerState.products.find((item) => item.id === customerState.selectedProductId) || null;
}

function getCustomerRewardProgress(profile = customerState.profile) {
  const orderCount = Number(profile?.orderCount || 0);
  const progress = orderCount % 5;
  const nextOrderNumber = orderCount + 1;
  return {
    orderCount,
    progress,
    isRewardOrder: nextOrderNumber % 5 === 0,
    ordersUntilReward: progress === 0 ? 5 : 5 - progress,
    nextOrderNumber,
  };
}

function getCustomerRewardDiscount() {
  if (!customerState.rewardCreditApplied || !customerState.profile || !customerState.cart.length || customerState.profile.freeDrinkCredits <= 0) {
    return 0;
  }
  const cheapestLine = customerState.cart.reduce((lowest, line) => {
    if (!lowest || Number(line.unitPrice) < Number(lowest.unitPrice)) {
      return line;
    }
    return lowest;
  }, null);
  return cheapestLine ? Number(cheapestLine.unitPrice) : 0;
}

function renderCustomerCartRewardStatus() {
  const status = document.getElementById('customer-cart-rewards-status');
  const button = document.getElementById('customer-apply-credit');
  const stamps = document.getElementById('customer-cart-rewards-stamps');
  const bar = document.getElementById('customer-cart-rewards-bar');
  const meta = document.getElementById('customer-cart-rewards-meta');
  if (!status || !button) {
    return;
  }

  const credits = Number(customerState.profile?.freeDrinkCredits || 0);
  const reward = getCustomerRewardProgress();
  button.hidden = false;
  button.disabled = true;
  setCustomerCheckoutButtonLabel(button, 'Apply Credit');
  if (stamps) {
    stamps.innerHTML = Array.from({ length: 5 }, (_, i) =>
      `<span class="customer-stamp${customerState.profile && i < reward.progress ? ' customer-stamp-filled' : ''}"></span>`
    ).join('');
  }
  if (bar) {
    bar.style.width = customerState.profile ? `${(reward.progress / 5) * 100}%` : '0%';
  }
  if (meta) {
    meta.textContent = customerState.profile
      ? `${reward.progress} ${t('of 5 orders completed toward next reward')}`
      : t('0 of 5 orders completed');
  }

  if (!customerState.profile) {
    status.textContent = t('Sign in to rewards to track progress and use free drink credits.');
    return;
  }

  if (!customerState.cart.length) {
    status.textContent = t('Add an item to your cart to use rewards.');
    return;
  }

  if (credits <= 0) {
    status.textContent = t('No free drink credits available yet.');
    return;
  }

  if (customerState.rewardDiscount > 0) {
    status.textContent = `${t('Free drink credit applied.')} ${t('Rewards')} -${formatCurrency(customerState.rewardDiscount)}`;
    button.disabled = false;
    setCustomerCheckoutButtonLabel(button, 'Remove Credit');
    return;
  }

  status.textContent = `${t('Free drink credit available.')} ${credits} ${credits === 1 ? t('credit') : t('credits')}`;
  button.disabled = false;
}

function readCustomerCustomizationForm() {
  const sizeField = document.querySelector('input[name="customer-size"]:checked');
  // Add the ice field reader
  const iceField = document.querySelector('input[name="customer-ice"]:checked'); 

  return {
    quantity: Math.max(1, Number(document.getElementById('customer-qty').value) || 1),
    size: sizeField ? sizeField.value : 'Medium',
    sugarPercent: readPercentInput('customer-sugar', 50),
    // Safely read the ice value, default to 50
    icePercent: iceField ? Number(iceField.value) : 50, 
    toppings: Array.from(document.querySelectorAll('input[name="customer-topping"]:checked')).map((element) => element.value),
  };
}

function resetCustomerCustomizationForm() {
  document.getElementById('customer-qty').value = '1';
  document.querySelector('input[name="customer-size"][value="Medium"]').checked = true;
  document.getElementById('customer-sugar').value = '50';
  setText('customer-sugar-value', '50%');
  
  // Add this line to reset the ice back to 50% when the dialog closes
  document.querySelector('input[name="customer-ice"][value="50"]').checked = true; 
  
  document.querySelectorAll('input[name="customer-topping"]').forEach((element) => {
    element.checked = false;
  });
}

function setCustomerQuantity(nextValue) {
  const quantityInput = document.getElementById('customer-qty');
  if (!quantityInput) {
    return;
  }

  quantityInput.value = String(Math.max(1, Number(nextValue) || 1));
}

function adjustCustomerQuantity(delta) {
  const quantityInput = document.getElementById('customer-qty');
  if (!quantityInput) {
    return;
  }

  setCustomerQuantity((Number(quantityInput.value) || 1) + delta);
}

function setCustomerCheckoutButtonLabel(button, label) {
  if (!button) {
    return;
  }

  button.dataset.i18n = label;
  button.textContent = t(label);
}

function showCustomerCheckoutSuccess(button) {
  if (!button) {
    return;
  }

  window.clearTimeout(customerState.checkoutSuccessTimer);
  button.classList.remove('customer-checkout-submitting', 'customer-checkout-success');
  setCustomerCheckoutButtonLabel(button, 'Ordered');
  void button.offsetWidth;
  button.classList.add('customer-checkout-success');
  customerState.checkoutSuccessTimer = window.setTimeout(() => {
    button.classList.remove('customer-checkout-success');
    setCustomerCheckoutButtonLabel(button, 'Place Order');
  }, 1400);
}

function getCustomerDialogFocusableElements() {
  const dialog = document.getElementById('customer-customize-dialog');
  if (!dialog) {
    return [];
  }

  return Array.from(dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('hidden'));
}

function focusCustomerDialogStart() {
  document.getElementById('customer-qty')?.focus();
  document.getElementById('customer-qty')?.select?.();
}

function restoreCustomerDialogFocus() {
  const lastTrigger = customerState.lastDialogTrigger;
  customerState.lastDialogTrigger = null;
  if (lastTrigger && document.contains(lastTrigger)) {
    lastTrigger.focus();
    return;
  }

  document.querySelector('.customer-category-button.active, .customer-product-tile')?.focus();
}

function setupCustomerRewardsDialog() {
  const panel = document.getElementById('customer-rewards-panel');
  if (!panel || document.getElementById('customer-rewards-dialog')) {
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'customer-rewards-dialog';
  dialog.className = 'customer-dialog customer-rewards-dialog';
  dialog.setAttribute('aria-labelledby', 'customer-rewards-dialog-title');
  dialog.setAttribute('aria-describedby', 'customer-rewards-dialog-help');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('translate', 'yes');

  panel.hidden = false;
  panel.classList.remove('content-card');
  panel.classList.add('customer-dialog-form');

  const heading = panel.querySelector('.section-heading');
  const closeButton = document.createElement('button');
  closeButton.id = 'customer-close-rewards-dialog';
  closeButton.className = 'ghost-button mini-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close rewards login dialog');
  closeButton.dataset.i18n = 'Close';
  closeButton.textContent = t('Close');
  heading?.appendChild(closeButton);

  const helpText = panel.querySelector('.muted-line');
  if (helpText) {
    helpText.id = 'customer-rewards-dialog-help';
  }

  dialog.appendChild(panel);
  document.body.insertBefore(dialog, document.getElementById('customer-customize-dialog'));
}

function getCustomerRewardsDialogFocusableElements() {
  const dialog = document.getElementById('customer-rewards-dialog');
  if (!dialog) {
    return [];
  }

  return Array.from(dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('hidden'));
}

function openCustomerRewardsDialog() {
  customerState.lastRewardsTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.getElementById('customer-rewards-dialog');
  if (!dialog) {
    return;
  }

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', 'true');
  }

  document.getElementById('customer-phone')?.focus();
}

function restoreCustomerRewardsDialogFocus() {
  const lastTrigger = customerState.lastRewardsTrigger;
  customerState.lastRewardsTrigger = null;
  if (lastTrigger && document.contains(lastTrigger)) {
    lastTrigger.focus();
    return;
  }

  document.getElementById('customer-open-rewards')?.focus();
}

function closeCustomerRewardsDialog() {
  const dialog = document.getElementById('customer-rewards-dialog');
  if (typeof dialog?.close === 'function') {
    dialog.close();
  } else {
    dialog?.removeAttribute('open');
    restoreCustomerRewardsDialogFocus();
  }
}

function setupCustomerCategoryDialog() {
  const panel = document.getElementById('customer-category-products-panel');
  if (!panel || document.getElementById('customer-category-dialog')) {
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'customer-category-dialog';
  dialog.className = 'customer-dialog customer-category-dialog';
  dialog.setAttribute('aria-labelledby', 'customer-active-category');
  dialog.setAttribute('aria-describedby', 'customer-category-description');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('translate', 'yes');

  panel.hidden = false;
  panel.classList.remove('content-card');
  panel.classList.add('customer-dialog-form');

  const heading = panel.querySelector('.section-heading');
  const closeButton = document.createElement('button');
  closeButton.id = 'customer-close-category-dialog';
  closeButton.className = 'ghost-button mini-button';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close category menu dialog');
  closeButton.dataset.i18n = 'Close';
  closeButton.textContent = t('Close');
  heading?.appendChild(closeButton);

  dialog.appendChild(panel);
  document.body.insertBefore(dialog, document.getElementById('customer-customize-dialog'));
}

function getCustomerCategoryDialogFocusableElements() {
  const dialog = document.getElementById('customer-category-dialog');
  if (!dialog) {
    return [];
  }

  return Array.from(dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('hidden'));
}

function openCustomerCategoryDialog(trigger = null) {
  customerState.lastCategoryTrigger = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dialog = document.getElementById('customer-category-dialog');
  if (!dialog) {
    return;
  }

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', 'true');
  }

  const firstProductTile = document.querySelector('#customer-product-grid .customer-product-tile:not([disabled])');
  if (firstProductTile) {
    firstProductTile.focus();
  } else {
    document.getElementById('customer-close-category-dialog')?.focus();
  }
}

function restoreCustomerCategoryDialogFocus() {
  if (customerState.suppressCategoryFocusRestore) {
    customerState.suppressCategoryFocusRestore = false;
    customerState.lastCategoryTrigger = null;
    return;
  }

  const lastTrigger = customerState.lastCategoryTrigger;
  customerState.lastCategoryTrigger = null;
  if (lastTrigger && document.contains(lastTrigger)) {
    lastTrigger.focus();
    return;
  }

  document.querySelector('.customer-category-button.active')?.focus();
}

function closeCustomerCategoryDialog(restoreFocus = true) {
  const dialog = document.getElementById('customer-category-dialog');
  if (!restoreFocus) {
    customerState.suppressCategoryFocusRestore = true;
  }

  if (typeof dialog?.close === 'function') {
    dialog.close();
  } else {
    dialog?.removeAttribute('open');
    if (restoreFocus) {
      restoreCustomerCategoryDialogFocus();
    }
  }

  if (!restoreFocus) {
    customerState.lastCategoryTrigger = null;
  }
}

function renderRewardStamps(filledCount) {
  const stampsEl = document.getElementById('customer-rewards-stamps');
  if (!stampsEl) return;
  stampsEl.innerHTML = Array.from({ length: 5 }, (_, i) =>
    `<span class="customer-stamp${i < filledCount ? ' customer-stamp-filled' : ''}"></span>`
  ).join('');
}

function renderCustomerRewards() {
  const heading = document.getElementById('customer-rewards-heading');
  const copy = document.getElementById('customer-rewards-copy');
  const meta = document.getElementById('customer-rewards-meta');
  const bar = document.getElementById('customer-rewards-bar');
  const idLine = document.getElementById('customer-rewards-id');

  if (!customerState.profile) {
    heading.textContent = t('No rewards profile yet');
    copy.textContent = t('Sign in or create an account to count orders toward a free drink.');
    meta.textContent = t('0 of 5 orders completed');
    bar.style.width = '0%';
    renderRewardStamps(0);
    if (idLine) idLine.textContent = '';
    setFieldValue('customer-phone', '');
    return;
  }

  const reward = getCustomerRewardProgress();
  const credits = customerState.profile.freeDrinkCredits || 0;

  heading.textContent = formatCustomerPhoneNumber(customerState.profile.phoneNumber);

  if (credits > 0) {
    copy.textContent = credits === 1
      ? t('You have 1 free drink credit ready to use on your next order!')
      : `${t('You have')} ${credits} ${t('free drink credits ready to use!')}`;
  } else {
    copy.textContent = `${reward.ordersUntilReward} ${reward.ordersUntilReward === 1 ? t('more order until the next free drink.') : t('more orders until the next free drink.')}`;
  }

  meta.textContent = `${reward.progress} ${t('of 5 orders completed toward next reward')}`;
  bar.style.width = `${(reward.progress / 5) * 100}%`;
  renderRewardStamps(reward.progress);

  if (idLine) {
    idLine.textContent = customerState.profile.customerId != null
      ? `${t('Member ID:')} #${customerState.profile.customerId}`
      : '';
  }

  setFieldValue('customer-phone', formatCustomerPhoneNumber(customerState.profile.phoneNumber || ''));
}

function activateCustomerCategory(categoryKey, focusButton = false) {
  customerState.activeCategory = categoryKey;
  renderCustomerCategoryButtons();
  renderCustomerProducts();

  if (focusButton) {
    document.querySelector(`.customer-category-button.customer-category-${categoryKey}`)?.focus();
  }
}

function renderCustomerCategoryButtons() {
  const container = document.getElementById('customer-category-buttons');
  container.innerHTML = '';

  CUSTOMER_CATEGORY_ORDER.forEach((key) => {
    const count = customerState.products.filter((item) => normalizeCustomerCategory(item) === key).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `customer-category-button customer-category-${key}${customerState.activeCategory === key ? ' active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', customerState.activeCategory === key ? 'true' : 'false');
    button.setAttribute('tabindex', '0');
    button.innerHTML = `
      <span class="customer-category-label">${escapeHtml(t(CUSTOMER_CATEGORY_META[key].label))}</span>
      <span class="customer-category-count">${count} ${count === 1 ? t('item') : t('items')}</span>
    `;
    button.addEventListener('click', () => {
      activateCustomerCategory(key);
      openCustomerCategoryDialog(button);
    });
    button.addEventListener('keydown', (event) => {
      const currentIndex = CUSTOMER_CATEGORY_ORDER.indexOf(key);
      if (currentIndex === -1) {
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const nextKey = CUSTOMER_CATEGORY_ORDER[(currentIndex + 1) % CUSTOMER_CATEGORY_ORDER.length];
        activateCustomerCategory(nextKey, true);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const nextKey = CUSTOMER_CATEGORY_ORDER[(currentIndex - 1 + CUSTOMER_CATEGORY_ORDER.length) % CUSTOMER_CATEGORY_ORDER.length];
        activateCustomerCategory(nextKey, true);
      } else if (event.key === 'Home') {
        event.preventDefault();
        activateCustomerCategory(CUSTOMER_CATEGORY_ORDER[0], true);
      } else if (event.key === 'End') {
        event.preventDefault();
        activateCustomerCategory(CUSTOMER_CATEGORY_ORDER[CUSTOMER_CATEGORY_ORDER.length - 1], true);
      }
    });
    container.appendChild(button);
  });
}

function renderCustomerProducts() {
  const container = document.getElementById('customer-product-grid');
  const visible = getCustomerProductsForActiveCategory();
  const meta = CUSTOMER_CATEGORY_META[customerState.activeCategory];

  setText('customer-active-category', t(meta.label));
  setText('customer-category-description', t(meta.description));
  setText('customer-product-count', `${visible.length} ${visible.length === 1 ? t('item available') : t('items available')}`);

  container.innerHTML = '';
  if (!visible.length) {
    container.innerHTML = `<p class="muted-line">${escapeHtml(t('No products are available in this category right now.'))}</p>`;
    return;
  }

  visible.forEach((item) => {
    const tile = document.createElement('button');
    const isDisabled = Boolean(item.outOfStock);
    tile.type = 'button';
    tile.className = `customer-product-tile customer-tile-${normalizeCustomerCategory(item)}${isDisabled ? ' customer-product-tile-disabled' : ''}`;
    tile.disabled = isDisabled;
    tile.innerHTML = `
      <span class="customer-product-overlay">
        <span class="section-label">${escapeHtml(t(item.category) || t(meta.label))}</span>
        <strong>${escapeHtml(t(item.name))}</strong>
        <span>${formatCurrency(item.price)}</span>
        ${isDisabled ? `<span class="out-of-stock-label">${escapeHtml(t('Out of Stock'))}</span>` : ''}
      </span>
    `;
    tile.setAttribute('aria-label', isDisabled
      ? `${t(item.name)}, ${formatCurrency(item.price)}. ${t('Out of stock.')}`
      : `${t(item.name)}, ${formatCurrency(item.price)}. ${t('Open customization options.')}`);
    if (!isDisabled) {
      tile.addEventListener('click', () => {
        closeCustomerCategoryDialog(false);
        openCustomerDialog(item.id);
      });
    }
    container.appendChild(tile);
  });
}

function renderCustomerCart() {
  const container = document.getElementById('customer-cart-lines');
  container.innerHTML = '';

  if (!customerState.cart.length) {
    container.innerHTML = `<p class="muted-line">${escapeHtml(t('Your cart is empty. Pick a drink to customize and add it here.'))}</p>`;
  } else {
    customerState.cart.forEach((line, index) => {
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
        customerState.cart.splice(index, 1);
        renderCustomerCart();
        await refreshCustomerPreview();
      });
      container.appendChild(row);
    });
  }

  setText('customer-subtotal', formatCurrency(customerState.preview.subtotal));
  setText('customer-tax', formatCurrency(customerState.preview.tax));
  setText('customer-discount', customerState.rewardDiscount > 0 ? `-${formatCurrency(customerState.rewardDiscount)}` : formatCurrency(0));
  setText('customer-total', formatCurrency(customerState.preview.total));
  renderCustomerCartRewardStatus();

  const rewardBanner = document.getElementById('customer-reward-banner');
  const credits = customerState.profile ? (customerState.profile.freeDrinkCredits || 0) : 0;
  if (customerState.rewardDiscount > 0 && credits > 0) {
    rewardBanner.hidden = false;
    rewardBanner.textContent = `Free drink credit applied! Your cheapest item is on us. (${credits} credit${credits === 1 ? '' : 's'} available)`;
  } else {
    rewardBanner.hidden = true;
    rewardBanner.textContent = '';
  }
}

async function refreshCustomerPreview() {
  if (!customerState.cart.length) {
    customerState.preview = { ...EMPTY_PREVIEW };
    customerState.rewardDiscount = 0;
    customerState.rewardCreditApplied = false;
    renderCustomerCart();
    return;
  }

  setStatus('customer-cart-status', 'Refreshing cart totals...', 'neutral');
  const basePreview = await fetchJson('/api/orders/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: customerState.cart.map(toOrderPayload) }),
  });
  customerState.preview = basePreview;
  customerState.cart = mergePreviewLineItems(customerState.cart, basePreview.lineItems);
  customerState.rewardDiscount = getCustomerRewardDiscount();

  if (customerState.rewardDiscount > 0) {
    customerState.preview = await fetchJson('/api/orders/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: customerState.cart.map(toOrderPayload),
        discountAmount: customerState.rewardDiscount,
      }),
    });
  }

  renderCustomerCart();
  setStatus('customer-cart-status', 'Cart totals are up to date.', 'success');
}

function openCustomerDialog(productId) {
  customerState.lastDialogTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  customerState.selectedProductId = productId;
  const product = getCustomerSelectedProduct();
  if (!product) {
    return;
  }
  if (product.outOfStock) {
    setStatus('customer-cart-status', `${product.name} is out of stock right now.`, 'error');
    return;
  }
  resetCustomerCustomizationForm();
  setText('customer-dialog-title', t(product.name));
  setText('customer-dialog-price', `${t('Base price')} ${formatCurrency(product.price)}. ${t('Adjust size, sweetness, ice, and toppings.')}`);
  const dialog = document.getElementById('customer-customize-dialog');
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', 'true');
  }
  focusCustomerDialogStart();
}

function closeCustomerDialog() {
  const dialog = document.getElementById('customer-customize-dialog');
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }

  restoreCustomerDialogFocus();
}

async function addCustomerSelectionToCart() {
  const product = getCustomerSelectedProduct();
  if (!product) {
    setStatus('customer-cart-status', 'Choose a product before adding it to the cart.', 'error');
    return;
  }

  const customization = readCustomerCustomizationForm();
  const existing = customerState.cart.find((line) => line.productId === product.id && customizationMatches(line, customization));

  if (existing) {
    existing.quantity += customization.quantity;
    existing.lineTotal = Number((existing.unitPrice * existing.quantity).toFixed(2));
  } else {
    customerState.cart.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      quantity: customization.quantity,
      size: customization.size,
      sugarPercent: customization.sugarPercent,
      icePercent: customization.icePercent,
      toppings: customization.toppings,
      unitPrice: Number(product.price),
      lineTotal: Number((Number(product.price) * customization.quantity).toFixed(2)),
    });
  }

  closeCustomerDialog();
  renderCustomerCart();
  await refreshCustomerPreview();
}

async function handleCustomerCheckout() {
  if (!customerState.cart.length) {
    setStatus('customer-cart-status', 'Add at least one drink before placing an order.', 'error');
    return;
  }
  if (customerState.isSubmittingOrder) {
    setStatus('customer-cart-status', 'Your order is already being submitted.', 'neutral');
    return;
  }

  customerState.isSubmittingOrder = true;
  const checkoutButton = document.getElementById('customer-checkout');
  if (checkoutButton) {
    window.clearTimeout(customerState.checkoutSuccessTimer);
    checkoutButton.disabled = true;
    checkoutButton.classList.remove('customer-checkout-success');
    checkoutButton.classList.add('customer-checkout-submitting');
    setCustomerCheckoutButtonLabel(checkoutButton, 'Submitting');
  }
  setStatus('customer-cart-status', 'Submitting your order...', 'neutral');
  try {
    try {
      await fetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: customerState.cart.map(toOrderPayload),
          payment: {
            primaryPaymentType: 'Credit Card',
            secondaryPaymentType: null,
            giftAmount: 0,
            discountAmount: customerState.rewardDiscount,
            cashReceived: 0,
            cashChange: 0,
            totalAmount: Number(customerState.preview.total || 0),
          },
        }),
      });
    } catch (error) {
      if (!String(error.message || '').includes('disabled')) {
        throw error;
      }
    }

    const rewardUsed = customerState.rewardDiscount > 0;
    let rewardsMessage = '';
    if (customerState.profile) {
      try {
        if (rewardUsed) {
          const redeemUpdate = await fetchJson('/api/customer/rewards/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          saveCustomerProfile(redeemUpdate.profile);
        }
        const rewardsUpdate = await fetchJson('/api/customer/rewards/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        saveCustomerProfile(rewardsUpdate.profile);
      } catch (error) {
        rewardsMessage = String(error.message || '').includes('disabled')
          ? ' Order was accepted, but rewards could not update while database writes are disabled.'
          : ' Order was accepted, but rewards could not be updated.';
      }
    }
    customerState.cart = [];
    customerState.preview = { ...EMPTY_PREVIEW };
    customerState.rewardDiscount = 0;
    customerState.rewardCreditApplied = false;
    renderCustomerRewards();
    renderCustomerCategoryButtons();
    renderCustomerProducts();
    renderCustomerCart();
    refreshCustomerProductsInBackground();
    setStatus(
      'customer-cart-status',
      (rewardUsed ? 'Order placed. Your free drink reward was applied.' : 'Order placed. Rewards progress has been updated.') + rewardsMessage,
      'success'
    );
    showCustomerCheckoutSuccess(checkoutButton);
  } catch (error) {
    setStatus('customer-cart-status', error.message || 'Unable to submit your order.', 'error');
    setCustomerCheckoutButtonLabel(checkoutButton, 'Place Order');
  } finally {
    customerState.isSubmittingOrder = false;
    if (checkoutButton) {
      checkoutButton.disabled = false;
      checkoutButton.classList.remove('customer-checkout-submitting');
    }
  }
}

function attachCustomerEventHandlers() {
  document.getElementById('customer-accessibility-toggle')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const panel = document.querySelector('.customer-accessibility-tools');
    setCustomerAccessibilityPanelOpen(Boolean(panel?.hidden));
  });
  document.querySelector('.customer-accessibility-tools')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  document.addEventListener('click', () => {
    setCustomerAccessibilityPanelOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setCustomerAccessibilityPanelOpen(false);
    }
  });
  document.getElementById('customer-contrast-toggle')?.addEventListener('click', () => {
    setCustomerContrastPreference(!customerState.highContrast);
  });
  document.getElementById('customer-text-size')?.addEventListener('change', (event) => {
    setCustomerTextScale(Number(event.target.value) || 1);
  });
  document.getElementById('customer-zoom-decrease')?.addEventListener('click', () => {
    setCustomerZoomScale(Number((customerState.zoomScale - 0.1).toFixed(2)));
  });
  document.getElementById('customer-zoom-increase')?.addEventListener('click', () => {
    setCustomerZoomScale(Number((customerState.zoomScale + 0.1).toFixed(2)));
  });
  document.getElementById('customer-qty-decrement').addEventListener('click', () => {
    adjustCustomerQuantity(-1);
  });
  document.getElementById('customer-qty-increment').addEventListener('click', () => {
    adjustCustomerQuantity(1);
  });
  document.getElementById('customer-qty').addEventListener('input', (event) => {
    setCustomerQuantity(event.target.value);
  });
  document.getElementById('customer-sugar')?.addEventListener('input', (event) => {
    setText('customer-sugar-value', `${event.target.value}%`);
  });
  document.getElementById('customer-phone')?.addEventListener('input', (event) => {
    event.target.value = formatCustomerPhoneNumber(event.target.value);
  });

  document.querySelector('.customer-numpad')?.addEventListener('click', (event) => {
    const key = event.target.closest('[data-digit]');
    if (!key) return;
    const input = document.getElementById('customer-phone');
    const digits = normalizeCustomerPhoneNumber(input.value);
    const digit = key.dataset.digit;
    let newDigits;
    if (digit === 'back') {
      newDigits = digits.slice(0, -1);
    } else if (digit === 'clear') {
      newDigits = '';
    } else {
      if (digits.length >= CUSTOMER_PHONE_NUMBER_LENGTH) return;
      newDigits = digits + digit;
    }
    input.value = formatCustomerPhoneNumber(newDigits);
  });

  document.getElementById('customer-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const credentials = readCustomerRewardsCredentials();
      validateCustomerRewardsCredentials(credentials);
      const result = await fetchJson('/api/customer/rewards/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      saveCustomerProfile(result.profile);
      renderCustomerRewards();
      customerState.rewardCreditApplied = false;
      customerState.rewardDiscount = 0;
      if (customerState.cart.length) {
        await refreshCustomerPreview();
      } else {
        renderCustomerCart();
      }
      setStatus('customer-cart-status', 'Rewards account signed in.', 'success');
    } catch (error) {
      setStatus('customer-cart-status', error.message || 'Unable to sign in to rewards.', 'error');
    }
  });

  document.getElementById('customer-register').addEventListener('click', async () => {
    try {
      const credentials = readCustomerRewardsCredentials();
      validateCustomerRewardsCredentials(credentials);
      const result = await fetchJson('/api/customer/rewards/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      saveCustomerProfile(result.profile);
      renderCustomerRewards();
      customerState.rewardCreditApplied = false;
      customerState.rewardDiscount = 0;
      if (customerState.cart.length) {
        await refreshCustomerPreview();
      } else {
        renderCustomerCart();
      }
      setStatus('customer-cart-status', 'Rewards account created and signed in.', 'success');
    } catch (error) {
      setStatus('customer-cart-status', error.message || 'Unable to create rewards account.', 'error');
    }
  });

  document.getElementById('customer-logout').addEventListener('click', async () => {
    await fetchJson('/api/customer/rewards/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    clearCustomerProfile();
    renderCustomerRewards();
    customerState.rewardCreditApplied = false;
    customerState.rewardDiscount = 0;
    if (customerState.cart.length) {
      await refreshCustomerPreview();
    } else {
      renderCustomerCart();
    }
    setStatus('customer-cart-status', 'Signed out of the rewards account.', 'neutral');
  });

  document.getElementById('customer-lang-select')?.addEventListener('change', async (event) => {
    const lang = event.target.value;
    setStatus('customer-products-status', lang === 'en' ? 'Restoring English...' : 'Translating page...', 'neutral');
    await applyLanguage(lang);
    setStatus('customer-products-status', lang === 'en' ? 'English restored.' : 'Translation applied.', 'success');
  });

  document.getElementById('customer-open-rewards')?.addEventListener('click', openCustomerRewardsDialog);
  document.getElementById('customer-apply-credit')?.addEventListener('click', async () => {
    if (!customerState.profile) {
      openCustomerRewardsDialog();
      return;
    }

    if (customerState.rewardCreditApplied) {
      customerState.rewardCreditApplied = false;
      customerState.rewardDiscount = 0;
      await refreshCustomerPreview();
      setStatus('customer-cart-status', 'Free drink credit removed.', 'neutral');
      return;
    }

    if (!customerState.cart.length || Number(customerState.profile.freeDrinkCredits || 0) <= 0) {
      renderCustomerCart();
      return;
    }

    customerState.rewardCreditApplied = true;
    await refreshCustomerPreview();
    setStatus('customer-cart-status', 'Free drink credit applied.', 'success');
  });
  document.getElementById('customer-close-rewards-dialog')?.addEventListener('click', closeCustomerRewardsDialog);
  document.getElementById('customer-rewards-dialog')?.addEventListener('close', restoreCustomerRewardsDialogFocus);
  document.getElementById('customer-rewards-dialog')?.addEventListener('keydown', (event) => {
    const dialog = event.currentTarget;
    if (!dialog.hasAttribute('open')) {
      return;
    }

    if (event.key === 'Escape' && typeof dialog.showModal !== 'function') {
      event.preventDefault();
      closeCustomerRewardsDialog();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getCustomerRewardsDialogFocusableElements();
    if (!focusableElements.length) {
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.getElementById('customer-close-category-dialog')?.addEventListener('click', () => closeCustomerCategoryDialog());
  document.getElementById('customer-category-dialog')?.addEventListener('close', restoreCustomerCategoryDialogFocus);
  document.getElementById('customer-category-dialog')?.addEventListener('keydown', (event) => {
    const dialog = event.currentTarget;
    if (!dialog.hasAttribute('open')) {
      return;
    }

    if (event.key === 'Escape' && typeof dialog.showModal !== 'function') {
      event.preventDefault();
      closeCustomerCategoryDialog();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getCustomerCategoryDialogFocusableElements();
    if (!focusableElements.length) {
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.getElementById('customer-checkout').addEventListener('click', handleCustomerCheckout);
  document.getElementById('customer-close-dialog').addEventListener('click', closeCustomerDialog);
  document.getElementById('customer-customize-dialog').addEventListener('close', restoreCustomerDialogFocus);
  document.getElementById('customer-customize-dialog').addEventListener('keydown', (event) => {
    const dialog = event.currentTarget;
    if (!dialog.hasAttribute('open')) {
      return;
    }

    if (event.key === 'Escape' && typeof dialog.showModal !== 'function') {
      event.preventDefault();
      closeCustomerDialog();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getCustomerDialogFocusableElements();
    if (!focusableElements.length) {
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.getElementById('customer-customize-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await addCustomerSelectionToCart();
  });
}

async function bootCustomer() {
  const accessibilityPanel = document.querySelector('.customer-accessibility-tools');
  const accessibilityToggle = document.getElementById('customer-accessibility-toggle');
  if (accessibilityPanel && accessibilityToggle) {
    if (accessibilityPanel.parentElement !== document.body) {
      document.body.insertBefore(accessibilityPanel, accessibilityToggle);
    }
    accessibilityPanel.id = 'customer-accessibility-panel';
    accessibilityPanel.hidden = true;
  }
  setupCustomerRewardsDialog();
  setupCustomerCategoryDialog();
  customerState.highContrast = loadCustomerContrastPreference();
  customerState.textScale = loadCustomerTextScalePreference();
  customerState.zoomScale = loadCustomerZoomPreference();
  setCustomerContrastPreference(customerState.highContrast);
  setCustomerTextScale(customerState.textScale);
  setCustomerZoomScale(customerState.zoomScale);
  await loadCustomerRewardsSession();
  renderCustomerRewards();
  renderCustomerCart();
  attachCustomerEventHandlers();
  attachChatEventHandlers();

  setStatus('customer-products-status', 'Loading live menu from the database...', 'loading');
  const data = await fetchJson('/api/products');
  customerState.products = data.items || [];

  const firstNonEmptyCategory = CUSTOMER_CATEGORY_ORDER.find((key) =>
    customerState.products.some((item) => normalizeCustomerCategory(item) === key)
  );
  customerState.activeCategory = firstNonEmptyCategory || 'tea';

  renderCustomerCategoryButtons();
  renderCustomerProducts();
  setStatus('customer-products-status', 'Live menu loaded. Choose a category to begin.', 'success');
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
    ['portal-summary', 'staff-products-status', 'staff-login-status', 'staff-preview-status', 'manager-login-status', 'manager-dashboard-status', 'customer-products-status', 'customer-cart-status'].forEach((id) => {
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

// ── AI Chat Widget ────────────────────────────────────────────────────────────

const chatState = {
  messages: [],   // { role: 'user'|'assistant', content: string }[]
  open: false,
  busy: false,
};

function isChatPage() {
  return document.body.dataset.page === 'customer';
}

function appendChatBubble(role, text) {
  const container = document.getElementById('chat-messages');
  if (!container) return null;
  const div = document.createElement('div');
  div.className = `chat-bubble chat-bubble-${role === 'user' ? 'user' : 'ai'}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function appendTypingIndicator() {
  const container = document.getElementById('chat-messages');
  if (!container) return null;
  const div = document.createElement('div');
  div.className = 'chat-bubble chat-bubble-typing';
  div.textContent = 'Thinking…';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function setChatBusy(busy) {
  chatState.busy = busy;
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  const quickOptions = document.querySelectorAll('.chat-quick-option');
  if (input) input.disabled = busy;
  if (send) send.disabled = busy;
  quickOptions.forEach((button) => {
    button.disabled = busy;
  });
}

async function sendChatMessage(userText) {
  if (chatState.busy || !userText.trim()) return;

  const text = userText.trim().slice(0, 500);
  chatState.messages.push({ role: 'user', content: text });
  appendChatBubble('user', text);

  const typingDiv = appendTypingIndicator();
  setChatBusy(true);

  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatState.messages }),
    });

    if (typingDiv) typingDiv.remove();
    const reply = data.reply || 'Sorry, I could not generate a response.';
    chatState.messages.push({ role: 'assistant', content: reply });
    appendChatBubble('assistant', reply);
  } catch (error) {
    if (typingDiv) typingDiv.remove();
    const errMsg = error.message || 'Something went wrong. Please try again.';
    appendChatBubble('assistant', errMsg);
  } finally {
    setChatBusy(false);
    document.getElementById('chat-input')?.focus();
  }
}

function openChatWidget() {
  chatState.open = true;
  const widget = document.getElementById('chat-widget');
  const toggle = document.getElementById('chat-toggle');
  if (widget) widget.hidden = false;
  if (toggle) toggle.setAttribute('aria-expanded', 'true');

  // Show a greeting on first open
  const container = document.getElementById('chat-messages');
  if (container && !container.children.length) {
    appendChatBubble('assistant', t('Hi! I\'m your Reveille Bubble Tea assistant. Ask me anything about the menu, customizations, or our rewards program!'));
  }

  document.getElementById('chat-input')?.focus();
}

function closeChatWidget() {
  chatState.open = false;
  const widget = document.getElementById('chat-widget');
  const toggle = document.getElementById('chat-toggle');
  if (widget) widget.hidden = true;
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
}

function attachChatEventHandlers() {
  const toggle = document.getElementById('chat-toggle');
  const closeBtn = document.getElementById('chat-close');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const quickOptions = document.querySelectorAll('.chat-quick-option');

  if (!toggle) return; // not on customer page

  toggle.addEventListener('click', () => {
    if (chatState.open) closeChatWidget();
    else openChatWidget();
  });

  closeBtn?.addEventListener('click', closeChatWidget);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input?.value || '';
    if (input) input.value = '';
    await sendChatMessage(text);
  });

  quickOptions.forEach((button) => {
    button.addEventListener('click', async () => {
      if (!chatState.open) {
        openChatWidget();
      }
      await sendChatMessage(button.dataset.chatPrompt || button.textContent || '');
    });
  });

  // Close on Escape when widget is open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatState.open) closeChatWidget();
  });
}

boot();
