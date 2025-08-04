const { isConnected } = require('../config/database');
const { errorResponse } = require('../utils/responseUtils');

// Middleware to validate database connection
function validateDatabaseConnection(req, res, next) {
  if (!isConnected()) {
    return res.status(500).json(errorResponse(
      'Database connection not available',
      'MongoDB connection has not been established',
      500
    ));
  }
  next();
}

// Middleware to handle database errors
function handleDatabaseError(error, req, res, next) {
  console.error('Database operation error:', error);
  
  // Handle specific MongoDB errors
  if (error.code === 11000) {
    return res.status(409).json(errorResponse(
      error,
      'Duplicate key error - document already exists',
      409
    ));
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).json(errorResponse(
      error,
      'Validation error - invalid data provided',
      400
    ));
  }
  
  // Generic database error
  return res.status(500).json(errorResponse(
    error,
    'Database operation failed',
    500
  ));
}

module.exports = {
  validateDatabaseConnection,
  handleDatabaseError
};