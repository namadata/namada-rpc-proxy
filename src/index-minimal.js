const express = require('express');
require('dotenv').config();

const logger = require('./utils/logger');
const config = require('./config/config');

const app = express();

// Basic middleware
app.use(express.json({ limit: '1mb' }));

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic info endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'Namada RPC Proxy', 
    status: 'minimal mode',
    memory: process.memoryUsage()
  });
});

// Start minimal server
const startMinimalServer = async () => {
  try {
    logger.info('Starting minimal server for debugging...');
    logger.info('Memory usage before startup:', process.memoryUsage());
    
    const server = app.listen(config.server.port, () => {
      logger.info(`Minimal server listening on port ${config.server.port}`);
      logger.info('Memory usage after startup:', process.memoryUsage());
    });

    return server;
  } catch (error) {
    logger.error('Failed to start minimal server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startMinimalServer();
}

module.exports = app; 