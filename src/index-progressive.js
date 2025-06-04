const express = require('express');
require('dotenv').config();

const logger = require('./utils/logger');
const config = require('./config/config');

const app = express();

// Progressive component loading
async function startProgressiveServer() {
  try {
    logger.info('=== PROGRESSIVE STARTUP TEST ===');
    logger.info('Initial memory usage:', process.memoryUsage());
    
    // Step 1: Basic Express
    logger.info('Step 1: Basic Express setup');
    app.use(express.json({ limit: '1mb' }));
    app.get('/health', (req, res) => res.json({ status: 'ok', step: 1 }));
    logger.info('Step 1 memory usage:', process.memoryUsage());
    
    // Step 2: Add CORS
    logger.info('Step 2: Adding CORS');
    const cors = require('cors');
    app.use(cors({
      origin: true,
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS']
    }));
    logger.info('Step 2 memory usage:', process.memoryUsage());
    
    // Step 3: Add Security Headers
    logger.info('Step 3: Adding helmet and compression');
    const helmet = require('helmet');
    const compression = require('compression');
    app.use(helmet());
    app.use(compression());
    logger.info('Step 3 memory usage:', process.memoryUsage());
    
    // Step 4: Add Rate Limiting
    logger.info('Step 4: Adding rate limiting');
    const rateLimit = require('express-rate-limit');
    const limiter = rateLimit({
      windowMs: config.rateLimiting.windowMs,
      max: config.rateLimiting.maxRequests,
      message: { error: 'Too many requests' }
    });
    app.use(limiter);
    logger.info('Step 4 memory usage:', process.memoryUsage());
    
    // Step 5: Try RPC Validator (likely culprit)
    logger.info('Step 5: Initializing RPC Validator');
    const { rpcValidator } = require('./middleware/rpcValidator');
    await rpcValidator.initialize();
    logger.info('Step 5 memory usage:', process.memoryUsage());
    
    // Step 6: Try MultiChainManager (likely culprit)
    logger.info('Step 6: Initializing MultiChainManager');
    const MultiChainManager = require('./core/MultiChainManager');
    const multiChainManager = new MultiChainManager();
    await multiChainManager.initialize();
    logger.info('Step 6 memory usage:', process.memoryUsage());
    
    // Step 7: Add routes
    logger.info('Step 7: Adding routes');
    app.locals.multiChainManager = multiChainManager;
    
    const healthRoutes = require('./routes/health');
    const proxyRoutes = require('./routes/proxy');
    app.use('/health', healthRoutes);
    app.use('/', proxyRoutes);
    logger.info('Step 7 memory usage:', process.memoryUsage());
    
    // Start server
    const server = app.listen(config.server.port, () => {
      logger.info('=== PROGRESSIVE STARTUP COMPLETE ===');
      logger.info(`Server listening on port ${config.server.port}`);
      logger.info('Final memory usage:', process.memoryUsage());
    });

    return server;
    
  } catch (error) {
    logger.error('Progressive startup failed at step:', error.message);
    logger.error('Memory usage at failure:', process.memoryUsage());
    throw error;
  }
}

if (require.main === module) {
  startProgressiveServer().catch(error => {
    logger.error('Startup failed:', error);
    process.exit(1);
  });
}

module.exports = app; 