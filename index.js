const express = require('express');
const path = require('node:path');
const db = require('./database');

const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
const writesEnabled = process.env.ENABLE_DB_WRITES === 'true';

const portalContent = {
  project2Features: {
    staff: [
      'Employee authentication',
      'Menu browsing by category',
      'Cart building with quantity changes',
      'Drink customization and size pricing',
      'Inventory shortage checks',
      'Cash and gift card payment flows',
      'Void latest payment',
    ],
    manager: [
      'Reports tab with total revenue, low inventory, most ordered, inventory usage, X-report, Z-report, and reset Z-report',
      'Menu tab with refresh, add item, update price, update category, deactivate, reactivate, and show inactive',
      'Inventory tab with refresh, add item, update quantity, update price, delete, and affected product lookup',
      'Employees tab with refresh, add employee, update role, and terminate employee',
    ],
    customer: [
      'Menu browsing',
      'Customization selections',
      'Cart review',
      'Checkout and payment',
      'Order confirmation',
    ],
  },
  migrationRoutes: [
    'POST /api/auth/login',
    'GET /api/products',
    'GET /api/categories',
    'GET /api/menu',
    'GET /api/inventory',
    'GET /api/employees',
    'GET /api/reports/x',
    'GET /api/reports/most-ordered',
    'GET /api/reports/inventory-usage',
    'POST /api/orders/preview',
    'POST /api/orders',
  ],
};

function createApp() {
  const app = express();

  app.use(express.json());
  app.use('/assets', express.static(path.join(publicDir, 'assets')));

  app.get('/', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/staff', (_, res) => res.sendFile(path.join(publicDir, 'staff.html')));
  app.get('/manager', (_, res) => res.sendFile(path.join(publicDir, 'manager.html')));
  app.get('/customer', (_, res) => res.sendFile(path.join(publicDir, 'customer.html')));

  app.get('/api/health', (_, res) => {
    res.json({ ok: true, service: 'project3-portal' });
  });

  app.get('/api/portal', asyncHandler(async (_, res) => {
    res.json({ ...portalContent, ...(await db.fetchPortalSummary()) });
  }));

  app.get('/api/products', asyncHandler(async (_, res) => {
    res.json({ source: 'database', items: await db.fetchProducts() });
  }));

  app.get('/api/categories', asyncHandler(async (_, res) => {
    res.json({ source: 'database', items: await db.fetchProductCategories() });
  }));

  app.get('/api/menu/next-id', asyncHandler(async (_, res) => {
    res.json({ source: 'database', nextId: await db.fetchNextProductId() });
  }));

  app.get('/api/revenue', asyncHandler(async (_, res) => {
    res.json({ source: 'database', totalRevenue: await db.fetchTotalRevenue() });
  }));

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { username, password, role } = req.body || {};
    const result = await db.authenticateEmployee(username, password, role);
    res.status(result.authenticated ? 200 : 401).json({ source: 'database', ...result });
  }));

  app.get('/api/menu', asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    res.json({ source: 'database', items: await db.fetchMenuProducts(includeInactive) });
  }));

  app.get('/api/inventory', asyncHandler(async (_, res) => {
    res.json({ source: 'database', items: await db.fetchInventoryItems() });
  }));

  app.get('/api/inventory/next-id', asyncHandler(async (_, res) => {
    res.json({ source: 'database', nextId: await db.fetchNextInventoryId() });
  }));

  app.get('/api/inventory/low', asyncHandler(async (req, res) => {
    const threshold = Number(req.query.threshold || 60);
    res.json({ source: 'database', threshold, items: await db.fetchLowInventoryItems(threshold) });
  }));

  app.get('/api/inventory/affected-products', asyncHandler(async (req, res) => {
    const inventoryId = Number(req.query.inventoryId);
    res.json({ source: 'database', items: await db.fetchProductsUsingInventoryItem(inventoryId) });
  }));

  app.get('/api/employees', asyncHandler(async (_, res) => {
    res.json({ source: 'database', items: await db.fetchEmployees() });
  }));

  app.get('/api/reports/x', asyncHandler(async (_, res) => {
    res.json({ source: 'database', today: await db.fetchXReportForToday() });
  }));

  app.get('/api/reports/most-ordered', asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit || 8);
    res.json({ source: 'database', items: await db.fetchMostOrderedProducts(limit) });
  }));

  app.get('/api/reports/inventory-usage', asyncHandler(async (req, res) => {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const limit = Number(req.query.limit || 8);
    res.json({ source: 'database', items: await db.fetchInventoryUsage(startDate, endDate, limit) });
  }));

  app.post('/api/orders/preview', asyncHandler(async (req, res) => {
    res.json({ source: 'database', ...(await db.previewOrder(req.body?.items)) });
  }));

  app.post('/api/orders', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({
      source: 'database',
      accepted: true,
      result: await db.submitOrderWithPayment(req.body?.items, req.body?.payment || {}),
    });
  }));

  app.post('/api/reports/z', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({
      source: 'database',
      accepted: true,
      report: await db.runZReport(req.body?.employeeSignature, req.body?.managerSignature),
    });
  }));

  app.post('/api/reports/reset-z', asyncHandler(async (_, res) => {
    ensureWritesEnabled();
    res.json({ source: 'database', reset: await db.resetZReportToday() });
  }));

  app.post('/api/payments/void', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({
      source: 'database',
      accepted: true,
      result: await db.voidPaymentById(req.body?.paymentRecordId),
    });
  }));

  app.post('/api/menu', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({ source: 'database', productId: await db.addProductWithIngredients(req.body || {}) });
  }));

  app.patch('/api/menu/price', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    await db.updateMenuPrice(Number(req.body?.productId), req.body?.price);
    res.json({ source: 'database', ok: true });
  }));

  app.patch('/api/menu/category', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    await db.updateMenuCategory(Number(req.body?.productId), req.body?.category);
    res.json({ source: 'database', ok: true });
  }));

  app.post('/api/menu/deactivate', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({ source: 'database', rows: await db.deactivateProduct(Number(req.body?.productId)) });
  }));

  app.post('/api/menu/reactivate', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({ source: 'database', rows: await db.reactivateProduct(Number(req.body?.productId)) });
  }));

  app.post('/api/inventory', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({ source: 'database', inventoryId: await db.addInventoryItem(req.body || {}) });
  }));

  app.patch('/api/inventory/quantity', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    await db.updateInventoryQuantity(Number(req.body?.inventoryId), req.body?.quantity);
    res.json({ source: 'database', ok: true });
  }));

  app.patch('/api/inventory/price', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    await db.updateInventoryPrice(Number(req.body?.inventoryId), req.body?.price);
    res.json({ source: 'database', ok: true });
  }));

  app.delete('/api/inventory', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    const inventoryId = Number(req.query.inventoryId);
    res.json({ source: 'database', rows: await db.deleteInventoryItem(inventoryId) });
  }));

  app.post('/api/employees', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    await db.addEmployee(req.body || {});
    res.json({ source: 'database', ok: true });
  }));

  app.patch('/api/employees/role', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    await db.updateEmployeeRole(Number(req.body?.employeeId), req.body?.role);
    res.json({ source: 'database', ok: true });
  }));

  app.delete('/api/employees', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    const employeeId = Number(req.query.employeeId);
    res.json({ source: 'database', rows: await db.deleteEmployee(employeeId) });
  }));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Server error' : 'Request failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  return app;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function ensureWritesEnabled() {
  if (writesEnabled) {
    return;
  }

  const error = new Error('Database write routes are disabled. Set ENABLE_DB_WRITES=true to enable manager write actions, order submission, voids, and Z-report actions.');
  error.statusCode = 503;
  throw error;
}

if (require.main === module) {
  const app = createApp();
  app.listen(port, () => {
    console.log(`Project portal running on port ${port}`);
  });
}

module.exports = { createApp };
