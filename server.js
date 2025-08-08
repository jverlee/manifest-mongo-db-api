require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('./config/passport');
const authRoutes = require('./routes/auth');
const entityService = require('./services/entityService');
const supabaseService = require('./services/supabaseService');
const { validateDatabaseConnection, handleDatabaseError } = require('./middleware/databaseMiddleware');
const { requireProjectAccess } = require('./middleware/authMiddleware');
const { createResponse, bulkResponse, errorResponse } = require('./utils/responseUtils');

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

// Session middleware
const isProduction = process.env.NODE_ENV === 'production';

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Cookies:', req.headers.cookie);
  console.log('Session ID before middleware:', req.sessionID);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false, // Don't create session until something is stored
  name: 'connect.sid',
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: 'sessions',
    collectionName: 'user_sessions',
    ttl: 24 * 60 * 60 // 24 hours in seconds
  }),
  cookie: {
    secure: isProduction, // HTTPS only in production
    httpOnly: true, // Keep secure - browser handles cookie automatically
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: isProduction ? 'lax' : 'lax', // Same-site for subdomains
    domain: isProduction ? '.madewithmanifest.com' : 'localhost' // Share cookies across madewithmanifest.com subdomains
  }
}));

// Debug middleware to log session info after session middleware
app.use((req, res, next) => {
  console.log('Session ID after middleware:', req.sessionID);
  console.log('Session data:', JSON.stringify(req.session, null, 2));
  console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'passport not initialized');
  console.log('User:', req.user);
  console.log('---');
  next();
});

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.use('/auth', authRoutes);

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
// CONFIG ROUTES
// =============================================================================

// GET /:projectId/config - Get project configuration from Supabase
app.get('/:projectId/config', async (req, res) => {
  try {
    const { projectId } = req.params;
    const config = await supabaseService.getProjectConfig(projectId);
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching project config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project configuration'
    });
  }
});

// =============================================================================
// MONGODB API ROUTES
// =============================================================================

// READ operations
// GET /:projectId/entities/:collection - Get all documents
app.get('/:projectId/entities/:collection', requireProjectAccess, async (req, res) => {
  
  console.log('User:', req.user)

  try {
    const { projectId, collection } = req.params;
    const documents = await entityService.getAllDocuments(projectId, collection);
    
    res.json(createResponse(documents, documents.length, projectId, collection));
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch documents'));
  }
});

// GET /:projectId/entities/:collection/:id - Get single document
app.get('/:projectId/entities/:collection/:id', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection, id } = req.params;
    const document = await entityService.getDocumentById(projectId, collection, id);
    
    res.json(createResponse(document, null, projectId, collection));
  } catch (error) {
    console.error('Error fetching document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to fetch document'));
    }
  }
});

// CREATE operations
// POST /:projectId/entities/:collection - Create single document
app.post('/:projectId/entities/:collection', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection } = req.params;
    const documentData = req.body;
    
    if (!documentData || Object.keys(documentData).length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body is required and cannot be empty',
        400
      ));
    }
    
    const createdDocument = await entityService.createDocument(projectId, collection, documentData);
    
    res.status(201).json(createResponse(createdDocument, null, projectId, collection));
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json(errorResponse(error, 'Failed to create document'));
  }
});

// POST /:projectId/entities/:collection/bulk - Create multiple documents
app.post('/:projectId/entities/:collection/bulk', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection } = req.params;
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain a "documents" array with at least one document',
        400
      ));
    }
    
    const results = await entityService.bulkCreateDocuments(projectId, collection, documents);
    
    res.status(201).json(bulkResponse(results, projectId, collection));
  } catch (error) {
    console.error('Error creating documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to create documents'));
  }
});

// UPDATE operations
// PUT /:projectId/entities/:collection/:id - Update single document
app.put('/:projectId/entities/:collection/:id', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection, id } = req.params;
    const updateData = req.body;
    
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body is required and cannot be empty',
        400
      ));
    }
    
    const updatedDocument = await entityService.updateDocument(projectId, collection, id, updateData);
    
    res.json(createResponse(updatedDocument, null, projectId, collection));
  } catch (error) {
    console.error('Error updating document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to update document'));
    }
  }
});

// PUT /:projectId/entities/:collection/bulk - Update multiple documents
app.put('/:projectId/entities/:collection/bulk', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection } = req.params;
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain an "updates" array with at least one update object containing "id" and update data',
        400
      ));
    }
    
    // Validate that each update has an id
    const invalidUpdates = updates.filter(update => !update.id);
    if (invalidUpdates.length > 0) {
      return res.status(400).json(errorResponse(
        'Invalid update objects',
        'Each update object must contain an "id" field',
        400
      ));
    }
    
    const results = await entityService.bulkUpdateDocuments(projectId, collection, updates);
    
    res.json(bulkResponse(results, projectId, collection));
  } catch (error) {
    console.error('Error updating documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to update documents'));
  }
});

// DELETE operations
// DELETE /:projectId/entities/:collection/:id - Delete single document
app.delete('/:projectId/entities/:collection/:id', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection, id } = req.params;
    const deletedDocument = await entityService.deleteDocument(projectId, collection, id);
    
    res.json(createResponse(deletedDocument, null, projectId, collection));
  } catch (error) {
    console.error('Error deleting document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to delete document'));
    }
  }
});

// DELETE /:projectId/entities/:collection/bulk - Delete multiple documents
app.delete('/:projectId/entities/:collection/bulk', requireProjectAccess, async (req, res) => {
  try {
    const { projectId, collection } = req.params;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain an "ids" array with at least one document ID',
        400
      ));
    }
    
    const results = await entityService.bulkDeleteDocuments(projectId, collection, ids);
    
    res.json(bulkResponse(results, projectId, collection));
  } catch (error) {
    console.error('Error deleting documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to delete documents'));
  }
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
      api: '/:projectId/entities/:collection'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MongoDB API Server is running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`API endpoints available at: http://localhost:${PORT}/{projectId}/entities/{collection}`);
});