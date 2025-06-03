const ChainInstance = require('./ChainInstance');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Multi-Chain Manager
 * Orchestrates multiple chain instances, handles concurrent operations,
 * and provides unified interface for chain-specific operations
 */
class MultiChainManager {
  constructor() {
    this.chains = new Map();
    this.initialized = false;
    this.shutdownInProgress = false;
  }

  /**
   * Initialize all chain instances
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('MultiChainManager already initialized');
      return;
    }

    logger.info('Initializing Multi-Chain Manager...');

    try {
      // Initialize chain instances concurrently
      const initPromises = Object.entries(config.chains).map(async ([chainKey, chainConfig]) => {
        logger.info(`Initializing ${chainConfig.displayName}...`);
        
        const chainInstance = new ChainInstance(chainConfig);
        await chainInstance.initialize();
        
        this.chains.set(chainKey, chainInstance);
        logger.info(`${chainConfig.displayName} initialized successfully`);
      });

      await Promise.all(initPromises);
      
      this.initialized = true;
      logger.info('Multi-Chain Manager initialized successfully');
      
      // Log initial status
      this.logStatus();
      
    } catch (error) {
      logger.error('Failed to initialize Multi-Chain Manager:', error);
      throw error;
    }
  }

  /**
   * Get chain instance by chain key or path
   */
  getChainInstance(identifier) {
    // Try direct chain key lookup first
    if (this.chains.has(identifier)) {
      return this.chains.get(identifier);
    }

    // Try path-based lookup
    for (const [chainKey, chainInstance] of this.chains) {
      const chainConfig = chainInstance.getConfig();
      if (identifier.startsWith(chainConfig.basePath) || 
          identifier.startsWith(chainConfig.archivePath)) {
        return chainInstance;
      }
    }

    return null;
  }

  /**
   * Route RPC request to appropriate chain
   */
  async routeRequest(path, rpcQuery, options = {}) {
    if (!this.initialized) {
      throw new Error('MultiChainManager not initialized');
    }

    const chainInstance = this.getChainInstance(path);
    if (!chainInstance) {
      throw new Error(`No chain found for path: ${path}`);
    }

    // Determine if this is an archive request
    const isArchiveRequest = path.includes('/archive/');
    
    return chainInstance.routeRequest(rpcQuery, {
      ...options,
      isArchiveRequest
    });
  }

  /**
   * Get health status for all chains
   */
  getHealthStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      chains: {},
      summary: {
        totalChains: this.chains.size,
        healthyChains: 0,
        totalRpcs: 0,
        healthyRpcs: 0
      }
    };

    for (const [chainKey, chainInstance] of this.chains) {
      const chainHealth = chainInstance.getHealthStatus();
      status.chains[chainKey] = chainHealth;
      
      if (chainHealth.status === 'healthy') {
        status.summary.healthyChains++;
      }
      
      status.summary.totalRpcs += chainHealth.rpcs.total;
      status.summary.healthyRpcs += chainHealth.rpcs.healthy;
    }

    return status;
  }

  /**
   * Get detailed status for a specific chain
   */
  getChainStatus(chainKey) {
    const chainInstance = this.chains.get(chainKey);
    if (!chainInstance) {
      throw new Error(`Chain not found: ${chainKey}`);
    }

    return chainInstance.getDetailedStatus();
  }

  /**
   * Get performance metrics for all chains
   */
  getMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      chains: {}
    };

    for (const [chainKey, chainInstance] of this.chains) {
      metrics.chains[chainKey] = chainInstance.getMetrics();
    }

    return metrics;
  }

  /**
   * Force refresh registry for all chains
   */
  async refreshAllRegistries() {
    logger.info('Refreshing registries for all chains...');
    
    const refreshPromises = Array.from(this.chains.values()).map(chainInstance => 
      chainInstance.refreshRegistry()
    );

    try {
      await Promise.all(refreshPromises);
      logger.info('All chain registries refreshed successfully');
    } catch (error) {
      logger.error('Error refreshing some chain registries:', error);
      throw error;
    }
  }

  /**
   * Force health check for all chains
   */
  async performHealthChecks() {
    logger.debug('Performing health checks for all chains...');
    
    const healthCheckPromises = Array.from(this.chains.values()).map(chainInstance => 
      chainInstance.performHealthCheck()
    );

    try {
      await Promise.allSettled(healthCheckPromises);
      logger.debug('Health checks completed for all chains');
    } catch (error) {
      logger.error('Error during health checks:', error);
    }
  }

  /**
   * Get list of supported chains
   */
  getSupportedChains() {
    return Array.from(this.chains.keys()).map(chainKey => {
      const chainInstance = this.chains.get(chainKey);
      const chainConfig = chainInstance.getConfig();
      
      return {
        key: chainKey,
        name: chainConfig.name,
        displayName: chainConfig.displayName,
        basePath: chainConfig.basePath,
        archivePath: chainConfig.archivePath,
        status: chainInstance.getHealthStatus().status
      };
    });
  }

  /**
   * Log current status of all chains
   */
  logStatus() {
    const status = this.getHealthStatus();
    
    logger.info('=== Multi-Chain Status ===', {
      totalChains: status.summary.totalChains,
      healthyChains: status.summary.healthyChains,
      totalRpcs: status.summary.totalRpcs,
      healthyRpcs: status.summary.healthyRpcs
    });

    for (const [chainKey, chainHealth] of Object.entries(status.chains)) {
      logger.info(`Chain ${chainKey}:`, {
        status: chainHealth.status,
        healthyRpcs: chainHealth.rpcs.healthy,
        totalRpcs: chainHealth.rpcs.total,
        blockHeight: chainHealth.blockHeight,
        lastUpdate: chainHealth.lastHealthCheck
      });
    }
  }

  /**
   * Graceful shutdown of all chain instances
   */
  async shutdown() {
    if (this.shutdownInProgress) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.shutdownInProgress = true;
    logger.info('Shutting down Multi-Chain Manager...');

    try {
      // Shutdown all chain instances concurrently
      const shutdownPromises = Array.from(this.chains.values()).map(chainInstance => 
        chainInstance.shutdown()
      );

      await Promise.allSettled(shutdownPromises);
      
      this.chains.clear();
      this.initialized = false;
      
      logger.info('Multi-Chain Manager shutdown completed');
    } catch (error) {
      logger.error('Error during Multi-Chain Manager shutdown:', error);
      throw error;
    } finally {
      this.shutdownInProgress = false;
    }
  }

  /**
   * Check if manager is ready to handle requests
   */
  isReady() {
    return this.initialized && !this.shutdownInProgress;
  }

  /**
   * Get uptime information
   */
  getUptime() {
    const uptime = {};
    
    for (const [chainKey, chainInstance] of this.chains) {
      uptime[chainKey] = chainInstance.getUptime();
    }
    
    return uptime;
  }
}

module.exports = MultiChainManager; 