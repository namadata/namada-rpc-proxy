const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const config = require('./config/config');
const MultiChainManager = require('./core/MultiChainManager');
const { errorHandler } = require('./middleware/errorHandler');
const { rpcValidator, validateRpcRequest } = require('./middleware/rpcValidator');
const healthRoutes = require('./routes/health');
const proxyRoutes = require('./routes/proxy');

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// RPC Validation middleware (before proxy routes)
app.use(validateRpcRequest);

// Initialize Multi-Chain Manager
const multiChainManager = new MultiChainManager();

// Make the manager available to routes
app.locals.multiChainManager = multiChainManager;

// Routes
app.use('/health', healthRoutes);
app.use('/', proxyRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'The requested RPC endpoint does not exist',
    availableEndpoints: [
      '/namada/{rpc_query}',
      '/housefiretestnet/{rpc_query}',
      '/namada/archive/{rpc_query}',
      '/housefiretestnet/archive/{rpc_query}',
      '/health'
    ]
  });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Starting graceful shutdown...');
  
  try {
    await multiChainManager.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Starting graceful shutdown...');
  
  try {
    await multiChainManager.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
const startServer = async () => {
  try {
    // Initialize the RPC validator
    await rpcValidator.initialize();
    
    // Initialize the multi-chain manager
    await multiChainManager.initialize();
    
    const server = app.listen(config.server.port, () => {
      logger.info(`Namada RPC Proxy listening on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info('Supported chains: mainnet, housefiretestnet');
      logger.info('RPC validation enabled');
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.server.port} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app; 