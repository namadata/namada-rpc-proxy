const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    serviceDomain: process.env.SERVICE_DOMAIN || 'namacall.namadata.xyz'
  },

  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000, // 30 seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 5000, // 5 seconds
    syncThreshold: parseInt(process.env.SYNC_THRESHOLD, 10) || 50 // blocks
  },

  registry: {
    updateInterval: parseInt(process.env.REGISTRY_UPDATE_INTERVAL, 10) || 600000, // 10 minutes
    mainnetUrl: process.env.MAINNET_REGISTRY_URL || 'https://raw.githubusercontent.com/Luminara-Hub/namada-ecosystem/main/user-and-dev-tools/mainnet/rpc.json',
    testnetUrl: process.env.TESTNET_REGISTRY_URL || 'https://raw.githubusercontent.com/Luminara-Hub/namada-ecosystem/main/user-and-dev-tools/testnet/housefire/rpc.json'
  },

  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    maxSize: process.env.LOG_MAX_SIZE || '100m'
  },

  request: {
    timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000, // 10 seconds
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY, 10) || 1000 // 1 second
  },

  chains: {
    mainnet: {
      name: 'namada',
      displayName: 'Namada Mainnet',
      registryUrl: process.env.MAINNET_REGISTRY_URL || 'https://raw.githubusercontent.com/Luminara-Hub/namada-ecosystem/main/user-and-dev-tools/mainnet/rpc.json',
      basePath: '/namada',
      archivePath: '/namada/archive'
    },
    testnet: {
      name: 'housefiretestnet',
      displayName: 'Housefire Testnet',
      registryUrl: process.env.TESTNET_REGISTRY_URL || 'https://raw.githubusercontent.com/Luminara-Hub/namada-ecosystem/main/user-and-dev-tools/testnet/housefire/rpc.json',
      basePath: '/housefiretestnet',
      archivePath: '/housefiretestnet/archive'
    }
  }
};

// Validate critical configuration
const validateConfig = () => {
  const requiredEnvVars = [
    'MAINNET_REGISTRY_URL',
    'TESTNET_REGISTRY_URL'
  ];

  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
    console.warn('Using default values. Consider setting these in your .env file.');
  }

  // Validate numeric values
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Invalid PORT: must be between 1 and 65535');
  }

  if (config.healthCheck.interval < 1000) {
    throw new Error('Invalid HEALTH_CHECK_INTERVAL: must be at least 1000ms');
  }

  if (config.registry.updateInterval < 60000) {
    throw new Error('Invalid REGISTRY_UPDATE_INTERVAL: must be at least 60000ms');
  }

  console.log('Configuration validation passed');
};

// Validate on module load
validateConfig();

module.exports = config; 