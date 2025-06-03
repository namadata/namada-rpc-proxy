const axios = require('axios');
const HealthMonitor = require('./HealthMonitor');
const LoadBalancer = require('./LoadBalancer');
const RegistryManager = require('./RegistryManager');
const { healthLogger, rpcLogger } = require('../utils/logger');
const config = require('../config/config');

/**
 * Chain Instance
 * Manages a single blockchain network including RPC pool management,
 * health monitoring, load balancing, and request routing
 */
class ChainInstance {
  constructor(chainConfig) {
    this.config = chainConfig;
    this.startTime = Date.now();
    
    // Initialize components
    this.registryManager = new RegistryManager(chainConfig);
    this.healthMonitor = new HealthMonitor(chainConfig);
    this.loadBalancer = new LoadBalancer(chainConfig);
    
    // State tracking
    this.initialized = false;
    this.shutdownInProgress = false;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null
    };

    // Bind event handlers
    this.setupEventHandlers();
  }

  /**
   * Set up event listeners between components
   */
  setupEventHandlers() {
    // Registry updates should trigger health monitor refresh
    this.registryManager.on('registryUpdated', (rpcs) => {
      healthLogger.info(`Registry updated for ${this.config.displayName}`, { 
        rpcCount: rpcs.length 
      });
      this.healthMonitor.updateRpcs(rpcs);
    });

    // Health status changes should update load balancer
    this.healthMonitor.on('healthStatusChanged', (healthData) => {
      healthLogger.debug(`Health status changed for ${this.config.displayName}`, {
        healthy: healthData.healthy.length,
        unhealthy: healthData.unhealthy.length
      });
      this.loadBalancer.updateHealthyRpcs(healthData.healthy, healthData.archive);
    });

    // Log critical health events
    this.healthMonitor.on('allRpcsUnhealthy', () => {
      healthLogger.error(`All RPCs unhealthy for ${this.config.displayName}!`);
    });

    this.healthMonitor.on('rpcRecovered', (rpc) => {
      healthLogger.info(`RPC recovered for ${this.config.displayName}`, { rpc: rpc.url });
    });
  }

  /**
   * Initialize the chain instance
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    healthLogger.info(`Initializing chain instance: ${this.config.displayName}`);

    try {
      // Initialize registry manager first
      await this.registryManager.initialize();
      
      // Get initial RPC list
      const initialRpcs = await this.registryManager.fetchRegistry();
      
      // Initialize health monitor with RPC list
      await this.healthMonitor.initialize(initialRpcs);
      
      // Initialize load balancer
      await this.loadBalancer.initialize();
      
      // Start background processes
      this.registryManager.startPeriodicUpdates();
      this.healthMonitor.startHealthChecks();
      
      this.initialized = true;
      healthLogger.info(`Chain instance initialized: ${this.config.displayName}`);
      
    } catch (error) {
      healthLogger.error(`Failed to initialize chain instance: ${this.config.displayName}`, error);
      throw error;
    }
  }

  /**
   * Route an RPC request through the load balancer
   */
  async routeRequest(rpcQuery, options = {}) {
    if (!this.initialized) {
      throw new Error(`Chain instance not initialized: ${this.config.name}`);
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = new Date().toISOString();

    try {
      rpcLogger.debug(`Routing request for ${this.config.displayName}`, {
        query: rpcQuery,
        isArchiveRequest: options.isArchiveRequest || false
      });

      // Route through load balancer
      const result = await this.loadBalancer.routeRequest(rpcQuery, options);
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(true, responseTime);
      
      rpcLogger.info(`Request successful for ${this.config.displayName}`, {
        responseTime,
        selectedRpc: result.selectedRpc
      });

      return result;
      
    } catch (error) {
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(false, responseTime);
      
      rpcLogger.error(`Request failed for ${this.config.displayName}`, {
        error: error.message,
        responseTime
      });

      throw error;
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(success, responseTime) {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time using exponential moving average
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * 0.9) + (responseTime * 0.1);
    }
  }

  /**
   * Get health status for this chain
   */
  getHealthStatus() {
    if (!this.initialized) {
      return {
        status: 'initializing',
        chain: this.config.displayName,
        rpcs: { total: 0, healthy: 0, archive: 0 },
        blockHeight: null,
        lastHealthCheck: null
      };
    }

    return this.healthMonitor.getHealthStatus();
  }

  /**
   * Get detailed status including metrics and configuration
   */
  getDetailedStatus() {
    const healthStatus = this.getHealthStatus();
    const loadBalancerStatus = this.loadBalancer.getStatus();
    
    return {
      chain: this.config.displayName,
      config: {
        name: this.config.name,
        basePath: this.config.basePath,
        archivePath: this.config.archivePath,
        registryUrl: this.config.registryUrl
      },
      health: healthStatus,
      loadBalancer: loadBalancerStatus,
      metrics: this.getMetrics(),
      uptime: this.getUptime(),
      initialized: this.initialized,
      shutdownInProgress: this.shutdownInProgress
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
        : 0
    };
  }

  /**
   * Get uptime information
   */
  getUptime() {
    const uptimeMs = Date.now() - this.startTime;
    return {
      startTime: new Date(this.startTime).toISOString(),
      uptimeMs,
      uptimeHours: Math.floor(uptimeMs / (1000 * 60 * 60)),
      uptimeDays: Math.floor(uptimeMs / (1000 * 60 * 60 * 24))
    };
  }

  /**
   * Get chain configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Force refresh the RPC registry
   */
  async refreshRegistry() {
    if (!this.initialized) {
      throw new Error(`Chain instance not initialized: ${this.config.name}`);
    }

    healthLogger.info(`Forcing registry refresh for ${this.config.displayName}`);
    return this.registryManager.forceUpdate();
  }

  /**
   * Force health check
   */
  async performHealthCheck() {
    if (!this.initialized) {
      throw new Error(`Chain instance not initialized: ${this.config.name}`);
    }

    healthLogger.debug(`Forcing health check for ${this.config.displayName}`);
    return this.healthMonitor.performHealthCheck();
  }

  /**
   * Get list of healthy RPCs
   */
  getHealthyRpcs(archiveOnly = false) {
    if (!this.initialized) {
      return [];
    }

    return this.loadBalancer.getHealthyRpcs(archiveOnly);
  }

  /**
   * Get RPC statistics
   */
  getRpcStatistics() {
    if (!this.initialized) {
      return { total: 0, healthy: 0, unhealthy: 0, archive: 0 };
    }

    return this.healthMonitor.getStatistics();
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.shutdownInProgress) {
      return;
    }

    this.shutdownInProgress = true;
    healthLogger.info(`Shutting down chain instance: ${this.config.displayName}`);

    try {
      // Stop background processes
      await this.registryManager.shutdown();
      await this.healthMonitor.shutdown();
      await this.loadBalancer.shutdown();
      
      this.initialized = false;
      healthLogger.info(`Chain instance shutdown complete: ${this.config.displayName}`);
      
    } catch (error) {
      healthLogger.error(`Error during chain instance shutdown: ${this.config.displayName}`, error);
      throw error;
    } finally {
      this.shutdownInProgress = false;
    }
  }

  /**
   * Check if chain instance is ready to handle requests
   */
  isReady() {
    return this.initialized && 
           !this.shutdownInProgress && 
           this.loadBalancer.hasHealthyRpcs();
  }

  /**
   * Get current block height from the chain
   */
  getCurrentBlockHeight() {
    if (!this.initialized) {
      return null;
    }

    return this.healthMonitor.getCurrentBlockHeight();
  }
}

module.exports = ChainInstance; 