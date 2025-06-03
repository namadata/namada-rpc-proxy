const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { rpcLogger } = require('../utils/logger');

const router = express.Router();

/**
 * POST /namada/*
 * Proxy requests to Namada mainnet RPCs
 */
router.post('/namada/archive/*', asyncHandler(async (req, res) => {
  await handleRpcRequest(req, res, '/namada/archive', true);
}));

router.post('/namada/*', asyncHandler(async (req, res) => {
  // Skip if this is an archive request (already handled above)
  if (req.path.startsWith('/namada/archive/')) {
    return;
  }
  await handleRpcRequest(req, res, '/namada', false);
}));

/**
 * POST /housefiretestnet/*
 * Proxy requests to Housefire testnet RPCs
 */
router.post('/housefiretestnet/archive/*', asyncHandler(async (req, res) => {
  await handleRpcRequest(req, res, '/housefiretestnet/archive', true);
}));

router.post('/housefiretestnet/*', asyncHandler(async (req, res) => {
  // Skip if this is an archive request (already handled above)
  if (req.path.startsWith('/housefiretestnet/archive/')) {
    return;
  }
  await handleRpcRequest(req, res, '/housefiretestnet', false);
}));

/**
 * GET endpoints for RPC queries that support GET method
 */
router.get('/namada/archive/*', asyncHandler(async (req, res) => {
  await handleGetRpcRequest(req, res, '/namada/archive', true);
}));

router.get('/namada/*', asyncHandler(async (req, res) => {
  if (req.path.startsWith('/namada/archive/')) {
    return;
  }
  await handleGetRpcRequest(req, res, '/namada', false);
}));

router.get('/housefiretestnet/archive/*', asyncHandler(async (req, res) => {
  await handleGetRpcRequest(req, res, '/housefiretestnet/archive', true);
}));

router.get('/housefiretestnet/*', asyncHandler(async (req, res) => {
  if (req.path.startsWith('/housefiretestnet/archive/')) {
    return;
  }
  await handleGetRpcRequest(req, res, '/housefiretestnet', false);
}));

/**
 * Handle POST RPC requests
 */
async function handleRpcRequest(req, res, basePath, isArchiveRequest) {
  const multiChainManager = req.app.locals.multiChainManager;
  const startTime = Date.now();
  
  // Log incoming request
  rpcLogger.info('RPC request received', {
    path: req.path,
    method: req.method,
    isArchive: isArchiveRequest,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentLength: req.get('Content-Length')
  });

  try {
    // Validate request body
    if (!req.body) {
      throw new Error('Request body is required');
    }

    // Route the request through multi-chain manager
    const result = await multiChainManager.routeRequest(req.path, req.body, {
      isArchiveRequest,
      headers: req.headers,
      ip: req.ip
    });

    const responseTime = Date.now() - startTime;

    // Log successful response
    rpcLogger.info('RPC request completed', {
      path: req.path,
      isArchive: isArchiveRequest,
      responseTime,
      selectedRpc: result.selectedRpc?.url,
      rpcResponseTime: result.selectedRpc?.responseTime
    });

    // Set response headers
    res.set({
      'Content-Type': 'application/json',
      'X-Response-Time': `${responseTime}ms`,
      'X-Selected-RPC': result.selectedRpc?.url || 'unknown',
      'X-RPC-Response-Time': `${result.selectedRpc?.responseTime || 0}ms`,
      'X-Is-Archive': isArchiveRequest.toString()
    });

    // Send the response
    res.json(result.data);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    rpcLogger.error('RPC request failed', {
      path: req.path,
      isArchive: isArchiveRequest,
      responseTime,
      error: error.message
    });

    throw error;
  }
}

/**
 * Handle GET RPC requests (for queries that support GET method)
 */
async function handleGetRpcRequest(req, res, basePath, isArchiveRequest) {
  const multiChainManager = req.app.locals.multiChainManager;
  const startTime = Date.now();
  
  // Extract RPC query from URL path
  const rpcPath = req.path.replace(basePath, '').replace(/^\//, '');
  
  if (!rpcPath) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'RPC endpoint path is required',
      example: `${basePath}/status`
    });
  }

  // Log incoming request
  rpcLogger.info('RPC GET request received', {
    path: req.path,
    rpcPath,
    method: req.method,
    isArchive: isArchiveRequest,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    query: req.query
  });

  try {
    // For GET requests to CometBFT RPC endpoints, we need to forward them as GET requests
    // The request path will be appended to the RPC URL (e.g., rpc.url + "/status")
    const requestPath = `/${rpcPath}`;
    
    // Route the request through multi-chain manager
    const result = await multiChainManager.routeRequest(req.path, null, {
      isArchiveRequest,
      headers: req.headers,
      ip: req.ip,
      isGetRequest: true,
      requestPath
    });

    const responseTime = Date.now() - startTime;

    // Log successful response
    rpcLogger.info('RPC GET request completed', {
      path: req.path,
      rpcPath,
      isArchive: isArchiveRequest,
      responseTime,
      selectedRpc: result.selectedRpc?.url,
      rpcResponseTime: result.selectedRpc?.responseTime
    });

    // Set response headers
    res.set({
      'Content-Type': 'application/json',
      'X-Response-Time': `${responseTime}ms`,
      'X-Selected-RPC': result.selectedRpc?.url || 'unknown',
      'X-RPC-Response-Time': `${result.selectedRpc?.responseTime || 0}ms`,
      'X-Is-Archive': isArchiveRequest.toString()
    });

    // Send the response
    res.json(result.data);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    rpcLogger.error('RPC GET request failed', {
      path: req.path,
      rpcPath,
      isArchive: isArchiveRequest,
      responseTime,
      error: error.message
    });

    throw error;
  }
}

/**
 * GET /
 * Root endpoint with API information
 */
router.get('/', (req, res) => {
  res.json({
    service: 'Namada RPC Proxy',
    version: '1.0.0',
    description: 'Multi-chain RPC proxy and load balancer for Namada networks',
    endpoints: {
      mainnet: {
        regular: '/namada/{rpc_endpoint}',
        archive: '/namada/archive/{rpc_endpoint}',
        example: '/namada/status'
      },
      testnet: {
        regular: '/housefiretestnet/{rpc_endpoint}',
        archive: '/housefiretestnet/archive/{rpc_endpoint}',
        example: '/housefiretestnet/status'
      },
      health: '/health',
      metrics: '/health/metrics'
    },
    supportedMethods: ['GET', 'POST'],
    documentation: 'https://github.com/namada/namada-rpc-proxy',
    timestamp: new Date().toISOString()
  });
});

/**
 * OPTIONS handler for CORS preflight requests
 */
router.options('*', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  });
  res.status(204).send();
});

module.exports = router; 