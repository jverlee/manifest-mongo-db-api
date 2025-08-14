require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const appRoutes = require('./routes/appRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const sessionService = require('./services/sessionService');
const { validateDatabaseConnection, handleDatabaseError } = require('./middleware/databaseMiddleware');

const app = express();
const PORT = process.env.PORT || 3500;

// CORS middleware
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Cookie and session middleware  
const isProduction = process.env.NODE_ENV === 'production';
console.log('SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
console.log('SESSION_PEPPER exists:', !!process.env.SESSION_PEPPER);

app.set('trust proxy', 1); // required for sessions to work properly in production

app.use(cookieParser());

// Passport middleware (no session)
app.use(passport.initialize());

// Attach user from session middleware - only for routes that need it
// app.use(sessionService.attachUserFromSession);

// Stripe webhook route MUST be defined BEFORE express.json() middleware
// to preserve raw body for signature verification
// We need to handle this separately because it needs raw body parsing
const stripeWebhookHandler = require('./routes/stripeRoutes').webhookHandler;
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Other body parser middleware (AFTER webhook route)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes - add session middleware
app.use('/auth', sessionService.attachUserFromSession, authRoutes);

// App routes - all routes under /apps/:appId
app.use('/apps/:appId', appRoutes);

// Stripe routes - success/cancel pages and other non-webhook routes
app.use('/stripe', stripeRoutes);

// Apply database middleware to all API routes
app.use('/', validateDatabaseConnection);
app.use('/', handleDatabaseError);

// Global OPTIONS handler as fallback
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});



// =============================================================================
// HEALTH CHECK AND ROOT ENDPOINTS
// =============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'MongoDB API Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'MongoDB API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/apps/:appId/entities/:collection'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MongoDB API Server is running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`API endpoints available at: http://localhost:${PORT}/apps/{appId}/entities/{collection}`);
});