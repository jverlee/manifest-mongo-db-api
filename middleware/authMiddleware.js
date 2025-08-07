const { errorResponse } = require('../utils/responseUtils');

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json(errorResponse(
      'Authentication required',
      'User must be authenticated to access this resource',
      401
    ));
  }
  next();
}

function requireProjectAccess(req, res, next) {

  // TODO: Add a check to see if the user is authenticated - base this on manifest.config.js scope on what is expected.


  const { projectId } = req.params;
  const user = req.user;
  
  if (!user) {
    return res.status(401).json(errorResponse(
      'Authentication required',
      'User must be authenticated to access this resource',
      401
    ));
  }
  
  // Check if user has access to this projectId
  // For now, allowing access if user is authenticated
  // This can be enhanced later with proper project membership checks
  if (!user.projects?.includes(projectId) && !user.isAdmin) {
    // Temporarily allow all authenticated users access
    // TODO: Implement proper project access control based on user.projects array
    console.warn(`User ${user.id} accessing project ${projectId} - implement proper access control`);
  }
  
  next();
}

module.exports = {
  requireAuth,
  requireProjectAccess
};