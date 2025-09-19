const { errorResponse } = require('../utils/responseUtils');
const supabaseService = require('../services/supabaseService');
const { getAppConfig } = require('../utils/appConfigUtils');

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json(errorResponse(
      'Authentication required',
      'User must be authenticated to access this resource',
      401
    ));
  }
  next();
}

async function validateAccess(req, res, next) {
  try {
    const { appId } = req.params;
    
    // Get app config based on :appId
    const appConfig = await getAppConfig(appId, req);
    
    // Check monetization requirements
    if (appConfig.monetization?.type === 'login_required') {
      if (!req.auth || !req.auth.appUserId) {
        return res.status(401).json(errorResponse(
          'Authentication required',
          'This app requires user authentication',
          401
        ));
      }
      
      if (req.auth.appId !== appId) {
        return res.status(403).json(errorResponse(
          'Access forbidden',
          'User does not have access to this app',
          403
        ));
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in requireAppAccess middleware:', error);
    return res.status(500).json(errorResponse(error, 'Failed to verify app access'));
  }
}

module.exports = {
  requireAuth,
  validateAccess
};