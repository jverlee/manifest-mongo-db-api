// Standardized response helpers for consistent API responses

function successResponse(data, message = 'Operation completed successfully') {
  return {
    success: true,
    message,
    data
  };
}

function errorResponse(error, message = 'Operation failed', statusCode = 500) {
  return {
    success: false,
    message,
    error: error.message || error,
    statusCode
  };
}

function createResponse(data, count = null, appId = null, collection = null) {
  const response = {
    success: true,
    message: 'Operation completed successfully',
    data
  };
  
  if (count !== null) response.count = count;
  if (appId) response.appId = appId;
  if (collection) response.collection = collection;
  
  return response;
}

function bulkResponse(results, appId, collection) {
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.length - successCount;
  
  return {
    success: true,
    message: `Bulk operation completed. ${successCount} successful, ${errorCount} failed.`,
    appId,
    collection,
    total: results.length,
    successful: successCount,
    failed: errorCount,
    results
  };
}

module.exports = {
  successResponse,
  errorResponse,
  createResponse,
  bulkResponse
};