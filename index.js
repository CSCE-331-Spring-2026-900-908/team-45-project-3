/**
 * index.js — Project 3 Portal Server
 *
 * Express app that serves the staff, manager, and customer UIs and exposes
 * a REST API backed by the PostgreSQL database layer in ./database.
 *
 * Environment variables:
 * PORT             - HTTP port to listen on (default: 3000)
 * ENABLE_DB_WRITES - Set to "true" to allow any route that mutates data
 * SESSION_SECRET   - Secret key for session management
 * GOOGLE_CLIENT_ID - From Google Cloud Console
 * GOOGLE_CLIENT_SECRET - From Google Cloud Console
 */
require('dotenv').config();
const express = require('express');
const path = require('node:path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./database');

const anthropic = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here'
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

// Write operations are disabled by default to prevent accidental mutations
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

/**
 * Builds and returns the configured Express application.
 */
function createApp() {
  const app = express();

  // --- Middleware Setup ---
  app.use(express.json());
  app.use('/assets', express.static(path.join(publicDir, 'assets')));

  // 1. Session setup
  app.use(session({
    secret: process.env.SESSION_SECRET || 'howdy_aggies_secret', 
    resave: false,
    saveUninitialized: false
  }));

  // 2. Passport Initialization
  app.use(passport.initialize());
  app.use(passport.session());

  // 3. Configure Google Strategy
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      try {
        // Use the 'query' function from your database client directly
        const { query } = require('./database/client'); 
        const { rows } = await query("SELECT * FROM employees WHERE username = $1", [email]);
        
        if (rows.length > 0) {
          return done(null, rows[0]);
        } else {
          return done(null, false, { message: 'User not authorized.' });
        }
      } catch (err) {
        return done(err);
      }
    }

  ));

  passport.serializeUser((user, done) => done(null, user.username));
  passport.deserializeUser(async (username, done) => {
    try {
      const { query } = require('./database/client');
      const { rows } = await query("SELECT * FROM employees WHERE username = $1", [username]);
      done(null, rows[0]);
    } catch (err) {
      done(err);
    }
  });


  // --- HTML page routes ---
  app.get('/', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/staff', (_, res) => res.sendFile(path.join(publicDir, 'staff.html')));
  app.get('/manager', (_, res) => res.sendFile(path.join(publicDir, 'manager.html')));
  app.get('/customer', (_, res) => res.sendFile(path.join(publicDir, 'customer.html')));

  // --- Google Auth API Routes ---
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
      // Success! Redirect to the page corresponding to their role (e.g., /manager)
      res.redirect(`/${req.user.role}`);
    }
  );

  // --- Legacy / Standard Login API Route ---
  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { username, password, role } = req.body || {};
    const result = await db.authenticateEmployee(username, password, role);
    res.status(result.authenticated ? 200 : 401).json({ source: 'database', ...result });
  }));

  app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ authenticated: true, ...req.user });
    } else {
      res.json({ authenticated: false });
    }
  });

  app.get('/api/customer/rewards/session', asyncHandler(async (req, res) => {
    const rewardsEmail = req.session.customerRewardsEmail;
    if (!rewardsEmail) {
      res.json({ authenticated: false });
      return;
    }

    const profile = await db.fetchRewardsAccountByEmail(rewardsEmail);
    if (!profile) {
      delete req.session.customerRewardsEmail;
      res.json({ authenticated: false });
      return;
    }

    res.json({ authenticated: true, profile });
  }));

  app.post('/api/customer/rewards/register', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    const profile = await db.registerRewardsAccount(req.body || {});
    req.session.customerRewardsEmail = profile.email;
    res.status(201).json({ authenticated: true, profile });
  }));

  app.post('/api/customer/rewards/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const profile = await db.authenticateRewardsAccount(email, password);
    req.session.customerRewardsEmail = profile.email;
    res.json({ authenticated: true, profile });
  }));

  app.post('/api/customer/rewards/logout', (req, res) => {
    delete req.session.customerRewardsEmail;
    res.json({ ok: true });
  });

  // --- Utility / meta routes ---
  app.get('/api/health', (_, res) => {
    res.json({ ok: true, service: 'project3-portal' });
  });

  app.get('/api/portal', asyncHandler(async (_, res) => {
    res.json({ ...portalContent, ...(await db.fetchPortalSummary()) });
  }));

  // --- Read-only API routes ---
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

  // --- Write routes (require ENABLE_DB_WRITES=true) ---
  app.post('/api/orders', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    res.json({
      source: 'database',
      accepted: true,
      result: await db.submitOrderWithPayment(req.body?.items, req.body?.payment || {}),
    });
  }));

  app.post('/api/customer/rewards/increment', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    const rewardsEmail = req.session.customerRewardsEmail;
    if (!rewardsEmail) {
      const error = new Error('Sign in to a rewards account before updating rewards.');
      error.statusCode = 401;
      throw error;
    }

    res.json({
      ok: true,
      profile: await db.incrementRewardsCounter(rewardsEmail),
    });
  }));

  app.post('/api/customer/rewards/redeem', asyncHandler(async (req, res) => {
    ensureWritesEnabled();
    const rewardsEmail = req.session.customerRewardsEmail;
    if (!rewardsEmail) {
      const error = new Error('Sign in to a rewards account before redeeming a free drink.');
      error.statusCode = 401;
      throw error;
    }

    res.json({
      ok: true,
      profile: await db.redeemFreeDrinkCredit(rewardsEmail),
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

  // --- AI Chatbot route ---
  app.post('/api/chat', asyncHandler(async (req, res) => {
    if (!anthropic) {
      res.status(503).json({ error: 'Chatbot is not configured. Set ANTHROPIC_API_KEY in your .env file.' });
      return;
    }

    const userMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!userMessages.length) {
      res.status(400).json({ error: 'At least one message is required.' });
      return;
    }

    // Build live menu context so the AI knows what's actually available
    const menuItems = await db.fetchMenuProducts(false);
    const menuText = menuItems.length
      ? menuItems.map((item) => `  • ${item.name} (${item.category}) — $${Number(item.price).toFixed(2)}`).join('\n')
      : '  (Menu is currently unavailable)';

    const systemPrompt =
      'You are a friendly and helpful assistant for Reveille Bubble Tea, a boba tea shop. ' +
      'Your job is to help customers with menu information, drink recommendations, and ordering guidance.\n\n' +
      `Current menu:\n${menuText}\n\n` +
      'Drink customization options:\n' +
      '  • Size: Small, Medium, or Large\n' +
      '  • Sweetness: 0%, 25%, 50%, 75%, or 100%\n' +
      '  • Toppings: Boba, Crystal Boba, Lychee Jelly, Pudding\n\n' +
      'Rewards program: Customers earn 1 point per order. Every 5 orders earns 1 free drink credit ' +
      '(the cheapest drink in the cart is free). Credits stack and are tracked automatically when signed in.\n\n' +
      'Guidelines:\n' +
      '  • Be warm, concise, and enthusiastic about boba tea\n' +
      '  • Recommend specific drinks based on customer preferences\n' +
      '  • Only mention items that appear on the current menu above\n' +
      '  • Keep responses to 2–4 sentences when possible\n' +
      '  • You cannot place orders yourself — guide customers to use the menu on the page\n' +
      '  • If asked about something unrelated to the shop, politely redirect the conversation';

    // Validate and sanitize messages — only allow user/assistant roles
    const safeMessages = userMessages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20) // keep last 20 turns to stay within token limits
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'user') {
      res.status(400).json({ error: 'The last message must be from the user.' });
      return;
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: safeMessages,
    });

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : '';
    res.json({ reply });
  }));

  // --- Fallback handlers ---
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
  if (writesEnabled) return;
  const error = new Error('Database write routes are disabled. Set ENABLE_DB_WRITES=true.');
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
