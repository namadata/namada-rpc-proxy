const logger = require('../utils/logger');

/**
 * Global Error Handler Middleware
 * Handles different types of errors and provides consistent error responses
 */
const errorHandler = (error, req, res, next) => {
  // Log the error
  logger.error('Request error occurred', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    error: error.message,
    stack: error.stack
  });

  // Default error response
  let statusCode = 500;
  let errorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred while processing your request',
    timestamp: new Date().toISOString(),
    path: req.path
  };

  // Handle specific error types
  if (error.name === 'ValidationError') {
    // Input validation errors
    statusCode = 400;
    errorResponse.error = 'Validation Error';
    errorResponse.message = error.message;
    errorResponse.details = error.details || null;
    
  } else if (error.message?.includes('No healthy RPCs available')) {
    // No available RPCs
    statusCode = 503;
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'No healthy RPC endpoints are currently available. Please try again later.';
    errorResponse.retryAfter = 30; // seconds
    
  } else if (error.message?.includes('No chain found for path')) {
    // Invalid chain path
    statusCode = 404;
    errorResponse.error = 'Chain Not Found';
    errorResponse.message = 'The requested blockchain network is not supported.';
    errorResponse.supportedChains = [
      '/namada/{rpc_query}',
      '/housefiretestnet/{rpc_query}',
      '/namada/archive/{rpc_query}',
      '/housefiretestnet/archive/{rpc_query}'
    ];
    
  } else if (error.message?.includes('MultiChainManager not initialized')) {
    // System not ready
    statusCode = 503;
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'The RPC proxy service is starting up. Please try again in a few moments.';
    errorResponse.retryAfter = 10;
    
  } else if (error.message?.includes('Request timeout')) {
    // Request timeout
    statusCode = 504;
    errorResponse.error = 'Gateway Timeout';
    errorResponse.message = 'The request timed out while waiting for a response from the RPC endpoint.';
    
  } else if (error.message?.includes('Connection refused') || 
             error.message?.includes('ECONNREFUSED')) {
    // Connection errors
    statusCode = 502;
    errorResponse.error = 'Bad Gateway';
    errorResponse.message = 'Unable to connect to RPC endpoints. The service may be temporarily unavailable.';
    
  } else if (error.code === 'ENOTFOUND') {
    // DNS resolution errors
    statusCode = 502;
    errorResponse.error = 'Bad Gateway';
    errorResponse.message = 'Failed to resolve RPC endpoint address.';
    
  } else if (error.response?.status) {
    // HTTP errors from upstream
    statusCode = error.response.status;
    errorResponse.error = `Upstream Error (${statusCode})`;
    errorResponse.message = `The RPC endpoint returned an error: ${error.response.statusText || 'Unknown error'}`;
    
    // Include upstream error details if available
    if (error.response.data) {
      errorResponse.upstreamError = error.response.data;
    }
    
  } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    // JSON parsing errors
    statusCode = 400;
    errorResponse.error = 'Invalid JSON';
    errorResponse.message = 'The request body contains invalid JSON.';
    
  } else if (error.message?.includes('Rate limit')) {
    // Rate limiting errors
    statusCode = 429;
    errorResponse.error = 'Too Many Requests';
    errorResponse.message = 'Rate limit exceeded. Please slow down your requests.';
    errorResponse.retryAfter = 60;
    
  } else if (error.type === 'entity.too.large') {
    // Request too large
    statusCode = 413;
    errorResponse.error = 'Payload Too Large';
    errorResponse.message = 'The request payload is too large.';
    
  } else if (error.message?.includes('Chain instance not initialized')) {
    // Chain not ready
    statusCode = 503;
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'The blockchain network is not ready to handle requests.';
    errorResponse.retryAfter = 5;
  }

  // Add request ID if available
  if (req.headers['x-request-id']) {
    errorResponse.requestId = req.headers['x-request-id'];
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.originalError = error.message;
  }

  // Set appropriate headers
  res.status(statusCode);
  
  if (errorResponse.retryAfter) {
    res.set('Retry-After', errorResponse.retryAfter.toString());
  }

  // Send error response
  res.json(errorResponse);
};

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('404 Not Found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
    path: req.path,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      '/namada/{rpc_query}',
      '/housefiretestnet/{rpc_query}',
      '/namada/archive/{rpc_query}',
      '/housefiretestnet/archive/{rpc_query}',
      '/health'
    ]
  });
};

/**
 * Async Error Handler Wrapper
 * Wraps async route handlers to catch promises that reject
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create Error
 * Helper function to create standardized errors
 */
const createError = (message, statusCode = 500, details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createError
}; 