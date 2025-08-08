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
console.log('SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
console.log('SESSION_SECRET length:', process.env.SESSION_SECRET?.length || 'undefined');

app.set('trust proxy', 1); // required for sessions to work properly in production

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: true,
  saveUninitialized: true,
  name: 'connect.sid',
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: 'sessions',
    collectionName: 'user_sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProduction ? 'none' : 'lax', // Change back to 'none' for cross-site
    domain: isProduction ? undefined : 'localhost' // Remove domain restriction
  }
}));

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

// GET /:appId/config - Get project configuration from Supabase
app.get('/:appId/config', async (req, res) => {
  try {
    const { appId } = req.params;
    const config = await supabaseService.getProjectConfig(appId);
    
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
// GET /:appId/entities/:collection - Get all documents
app.get('/:appId/entities/:collection', requireProjectAccess, async (req, res) => {
  
  console.log('User:', req.user)

  // get app config based on req.user.appId

  try {
    const { appId, collection } = req.params;
    const documents = await entityService.getAllDocuments(appId, collection);
    
    res.json(createResponse(documents, documents.length, appId, collection));
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch documents'));
  }
});

// GET /:appId/entities/:collection/:id - Get single document
app.get('/:appId/entities/:collection/:id', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection, id } = req.params;
    const document = await entityService.getDocumentById(appId, collection, id);
    
    res.json(createResponse(document, null, appId, collection));
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
// POST /:appId/entities/:collection - Create single document
app.post('/:appId/entities/:collection', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const documentData = req.body;
    
    if (!documentData || Object.keys(documentData).length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body is required and cannot be empty',
        400
      ));
    }
    
    const createdDocument = await entityService.createDocument(appId, collection, documentData);
    
    res.status(201).json(createResponse(createdDocument, null, appId, collection));
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json(errorResponse(error, 'Failed to create document'));
  }
});

// POST /:appId/entities/:collection/bulk - Create multiple documents
app.post('/:appId/entities/:collection/bulk', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain a "documents" array with at least one document',
        400
      ));
    }
    
    const results = await entityService.bulkCreateDocuments(appId, collection, documents);
    
    res.status(201).json(bulkResponse(results, appId, collection));
  } catch (error) {
    console.error('Error creating documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to create documents'));
  }
});

// UPDATE operations
// PUT /:appId/entities/:collection/:id - Update single document
app.put('/:appId/entities/:collection/:id', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection, id } = req.params;
    const updateData = req.body;
    
    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body is required and cannot be empty',
        400
      ));
    }
    
    const updatedDocument = await entityService.updateDocument(appId, collection, id, updateData);
    
    res.json(createResponse(updatedDocument, null, appId, collection));
  } catch (error) {
    console.error('Error updating document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to update document'));
    }
  }
});

// PUT /:appId/entities/:collection/bulk - Update multiple documents
app.put('/:appId/entities/:collection/bulk', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
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
    
    const results = await entityService.bulkUpdateDocuments(appId, collection, updates);
    
    res.json(bulkResponse(results, appId, collection));
  } catch (error) {
    console.error('Error updating documents:', error);
    res.status(500).json(errorResponse(error, 'Failed to update documents'));
  }
});

// DELETE operations
// DELETE /:appId/entities/:collection/:id - Delete single document
app.delete('/:appId/entities/:collection/:id', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection, id } = req.params;
    const deletedDocument = await entityService.deleteDocument(appId, collection, id);
    
    res.json(createResponse(deletedDocument, null, appId, collection));
  } catch (error) {
    console.error('Error deleting document:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(errorResponse(error, 'Document not found', 404));
    } else {
      res.status(500).json(errorResponse(error, 'Failed to delete document'));
    }
  }
});

// DELETE /:appId/entities/:collection/bulk - Delete multiple documents
app.delete('/:appId/entities/:collection/bulk', requireProjectAccess, async (req, res) => {
  try {
    const { appId, collection } = req.params;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(errorResponse(
        'Invalid request body',
        'Request body must contain an "ids" array with at least one document ID',
        400
      ));
    }
    
    const results = await entityService.bulkDeleteDocuments(appId, collection, ids);
    
    res.json(bulkResponse(results, appId, collection));
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
      api: '/:appId/entities/:collection'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`MongoDB API Server is running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  console.log(`API endpoints available at: http://localhost:${PORT}/{appId}/entities/{collection}`);
});