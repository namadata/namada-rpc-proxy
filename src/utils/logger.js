const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config/config');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    level: config.logging.level,
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  })
];

// Add file transports only in production or when explicitly requested
if (config.server.nodeEnv === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
  // General application logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: config.logging.level,
      format: fileFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: 'error',
      format: fileFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // Health check specific logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'health-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: 'debug',
      format: fileFormat,
      filter: (info) => info.component === 'health-check'
    })
  );

  // RPC request logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'rpc-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: 'info',
      format: fileFormat,
      filter: (info) => info.component === 'rpc-proxy'
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  exitOnError: false
});

// Create specialized loggers for different components
const createComponentLogger = (component) => {
  return {
    error: (message, meta = {}) => logger.error(message, { ...meta, component }),
    warn: (message, meta = {}) => logger.warn(message, { ...meta, component }),
    info: (message, meta = {}) => logger.info(message, { ...meta, component }),
    debug: (message, meta = {}) => logger.debug(message, { ...meta, component }),
    verbose: (message, meta = {}) => logger.verbose(message, { ...meta, component })
  };
};

// Export main logger and component loggers
module.exports = logger;
module.exports.healthLogger = createComponentLogger('health-check');
module.exports.rpcLogger = createComponentLogger('rpc-proxy');
module.exports.loadBalancerLogger = createComponentLogger('load-balancer');
module.exports.registryLogger = createComponentLogger('registry');

// Log uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
}); 