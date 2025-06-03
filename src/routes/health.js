const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { rpcValidator } = require('../middleware/rpcValidator');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  if (!multiChainManager.isReady()) {
    return res.status(503).json({
      status: 'unhealthy',
      message: 'Service is starting up',
      timestamp: new Date().toISOString()
    });
  }

  const healthStatus = multiChainManager.getHealthStatus();
  const hasHealthyChains = healthStatus.summary.healthyChains > 0;
  
  res.status(hasHealthyChains ? 200 : 503).json({
    status: hasHealthyChains ? 'healthy' : 'unhealthy',
    timestamp: healthStatus.timestamp,
    summary: healthStatus.summary,
    message: hasHealthyChains ? 'All systems operational' : 'No healthy chains available'
  });
}));

/**
 * GET /health/rpc-endpoints
 * List available RPC endpoints from OpenAPI specification
 */
router.get('/rpc-endpoints', asyncHandler(async (req, res) => {
  const endpoints = rpcValidator.getAvailableEndpoints();
  
  res.json({
    endpoints,
    count: endpoints.length,
    usage: {
      mainnet: endpoints.map(ep => ({
        path: `/namada/${ep.path}`,
        methods: ep.methods,
        summary: ep.summary
      })),
      testnet: endpoints.map(ep => ({
        path: `/housefiretestnet/${ep.path}`,
        methods: ep.methods,
        summary: ep.summary
      })),
      archive: {
        mainnet: endpoints.map(ep => ({
          path: `/namada/archive/${ep.path}`,
          methods: ep.methods,
          summary: ep.summary
        })),
        testnet: endpoints.map(ep => ({
          path: `/housefiretestnet/archive/${ep.path}`,
          methods: ep.methods,
          summary: ep.summary
        }))
      }
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /health/rpc-endpoints/:endpoint
 * Get detailed information about a specific RPC endpoint
 */
router.get('/rpc-endpoints/:endpoint', asyncHandler(async (req, res) => {
  const { endpoint } = req.params;
  const endpointInfo = rpcValidator.getEndpointInfo(endpoint);
  
  if (!endpointInfo) {
    return res.status(404).json({
      error: 'Endpoint not found',
      endpoint,
      suggestion: rpcValidator.suggestSimilarEndpoint?.(endpoint),
      availableEndpoints: rpcValidator.getAvailableEndpoints().map(ep => ep.path)
    });
  }
  
  res.json({
    ...endpointInfo,
    usage: {
      mainnet: `/namada/${endpoint}`,
      testnet: `/housefiretestnet/${endpoint}`,
      archive: {
        mainnet: `/namada/archive/${endpoint}`,
        testnet: `/housefiretestnet/archive/${endpoint}`
      }
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /health/detailed
 * Detailed health information for all chains
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  if (!multiChainManager.isReady()) {
    return res.status(503).json({
      status: 'unhealthy',
      message: 'Service is starting up',
      timestamp: new Date().toISOString()
    });
  }

  const healthStatus = multiChainManager.getHealthStatus();
  
  res.json({
    status: 'healthy',
    timestamp: healthStatus.timestamp,
    summary: healthStatus.summary,
    chains: healthStatus.chains,
    uptime: multiChainManager.getUptime()
  });
}));

/**
 * GET /health/chains
 * List all supported chains with their status
 */
router.get('/chains', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  const supportedChains = multiChainManager.getSupportedChains();
  
  res.json({
    chains: supportedChains,
    count: supportedChains.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /health/chains/:chainKey
 * Detailed status for a specific chain
 */
router.get('/chains/:chainKey', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  const { chainKey } = req.params;
  
  try {
    const chainStatus = multiChainManager.getChainStatus(chainKey);
    res.json(chainStatus);
  } catch (error) {
    if (error.message.includes('Chain not found')) {
      return res.status(404).json({
        error: 'Chain Not Found',
        message: `Chain '${chainKey}' is not supported`,
        supportedChains: multiChainManager.getSupportedChains().map(c => c.key)
      });
    }
    throw error;
  }
}));

/**
 * GET /health/metrics
 * Performance metrics for all chains
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  const metrics = multiChainManager.getMetrics();
  
  res.json(metrics);
}));

/**
 * POST /health/refresh
 * Force refresh registries for all chains
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  logger.info('Manual registry refresh requested', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  try {
    await multiChainManager.refreshAllRegistries();
    
    res.json({
      message: 'Registry refresh completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Manual registry refresh failed', error);
    throw error;
  }
}));

/**
 * POST /health/chains/:chainKey/refresh
 * Force refresh registry for a specific chain
 */
router.post('/chains/:chainKey/refresh', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  const { chainKey } = req.params;
  
  logger.info(`Manual registry refresh requested for chain: ${chainKey}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  try {
    const chainInstance = multiChainManager.getChainInstance(chainKey);
    if (!chainInstance) {
      return res.status(404).json({
        error: 'Chain Not Found',
        message: `Chain '${chainKey}' is not supported`,
        supportedChains: multiChainManager.getSupportedChains().map(c => c.key)
      });
    }
    
    await chainInstance.refreshRegistry();
    
    res.json({
      message: `Registry refresh completed for chain: ${chainKey}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Manual registry refresh failed for chain: ${chainKey}`, error);
    throw error;
  }
}));

/**
 * GET /health/live
 * Kubernetes liveness probe endpoint
 */
router.get('/live', (req, res) => {
  // Simple liveness check - just return 200 if the process is running
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe endpoint
 */
router.get('/ready', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  if (!multiChainManager.isReady()) {
    return res.status(503).json({
      status: 'not ready',
      message: 'Service is not ready to handle requests',
      timestamp: new Date().toISOString()
    });
  }

  const healthStatus = multiChainManager.getHealthStatus();
  const hasHealthyRpcs = healthStatus.summary.healthyRpcs > 0;
  
  if (!hasHealthyRpcs) {
    return res.status(503).json({
      status: 'not ready',
      message: 'No healthy RPC endpoints available',
      timestamp: new Date().toISOString()
    });
  }
  
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    healthyRpcs: healthStatus.summary.healthyRpcs,
    healthyChains: healthStatus.summary.healthyChains
  });
}));

/**
 * GET /health/startup
 * Kubernetes startup probe endpoint
 */
router.get('/startup', asyncHandler(async (req, res) => {
  const multiChainManager = req.app.locals.multiChainManager;
  
  if (!multiChainManager.isReady()) {
    return res.status(503).json({
      status: 'starting',
      message: 'Service is still starting up',
      timestamp: new Date().toISOString()
    });
  }
  
  res.status(200).json({
    status: 'started',
    timestamp: new Date().toISOString()
  });
}));

module.exports = router; 