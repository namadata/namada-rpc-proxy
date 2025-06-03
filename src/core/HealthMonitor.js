const EventEmitter = require('events');
const axios = require('axios');
const { healthLogger } = require('../utils/logger');
const config = require('../config/config');

/**
 * Health Monitor
 * Monitors RPC endpoint health, sync status, and block heights
 * Emits events when health status changes
 */
class HealthMonitor extends EventEmitter {
  constructor(chainConfig) {
    super();
    this.chainConfig = chainConfig;
    this.rpcs = new Map(); // Map of URL -> RPC info
    this.healthCheckInterval = null;
    this.lastMedianHeight = 0;
    this.running = false;
    
    // Health status tracking
    this.healthyRpcs = [];
    this.unhealthyRpcs = [];
    this.archiveRpcs = [];
    this.lastHealthCheck = null;
  }

  /**
   * Initialize health monitor with RPC list
   */
  async initialize(initialRpcs = []) {
    healthLogger.info(`Initializing health monitor for ${this.chainConfig.displayName}`);
    
    this.updateRpcs(initialRpcs);
    healthLogger.info(`Health monitor initialized with ${initialRpcs.length} RPCs`);
  }

  /**
   * Update RPC list
   */
  updateRpcs(rpcList) {
    // Clear existing RPCs and add new ones
    this.rpcs.clear();
    
    rpcList.forEach(rpc => {
      this.rpcs.set(rpc.url, {
        url: rpc.url,
        name: rpc.name || 'Unknown',
        healthy: false,
        isArchive: false,
        lastCheck: null,
        blockHeight: null,
        syncStatus: null,
        responseTime: null,
        errorCount: 0,
        lastError: null,
        consecutiveFailures: 0
      });
    });

    healthLogger.info(`Updated RPC list for ${this.chainConfig.displayName}`, {
      count: rpcList.length
    });

    // Perform immediate health check if running
    if (this.running) {
      this.performHealthCheck();
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.running) {
      healthLogger.warn(`Health checks already running for ${this.chainConfig.displayName}`);
      return;
    }

    this.running = true;
    healthLogger.info(`Starting health checks for ${this.chainConfig.displayName}`);

    // Perform initial health check
    this.performHealthCheck();

    // Set up periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, config.healthCheck.interval);
  }

  /**
   * Perform health check on all RPCs
   */
  async performHealthCheck() {
    if (this.rpcs.size === 0) {
      healthLogger.debug(`No RPCs to check for ${this.chainConfig.displayName}`);
      return;
    }

    healthLogger.debug(`Performing health check for ${this.chainConfig.displayName}`, {
      rpcCount: this.rpcs.size
    });

    const healthCheckPromises = Array.from(this.rpcs.values()).map(rpc => 
      this.checkRpcHealth(rpc)
    );

    try {
      await Promise.allSettled(healthCheckPromises);
      this.updateHealthStatus();
      this.lastHealthCheck = new Date().toISOString();
    } catch (error) {
      healthLogger.error(`Error during health check for ${this.chainConfig.displayName}`, error);
    }
  }

  /**
   * Check health of a single RPC
   */
  async checkRpcHealth(rpc) {
    const checkStartTime = Date.now();
    
    try {
      const response = await axios.get(`${rpc.url}/status`, {
        timeout: config.healthCheck.timeout,
        headers: {
          'User-Agent': 'Namada-RPC-Proxy/1.0'
        }
      });

      const responseTime = Date.now() - checkStartTime;
      const statusData = response.data.result;

      // Extract health information
      rpc.blockHeight = parseInt(statusData.sync_info.latest_block_height, 10);
      rpc.syncStatus = statusData.sync_info.catching_up;
      rpc.responseTime = responseTime;
      rpc.lastCheck = new Date().toISOString();
      rpc.lastError = null;
      rpc.consecutiveFailures = 0;

      // Check if it's an archive node (earliest block is 1)
      rpc.isArchive = statusData.sync_info.earliest_block_height === '1';

      // Mark as healthy if not catching up and response time is reasonable
      const wasHealthy = rpc.healthy;
      rpc.healthy = !rpc.syncStatus && responseTime < (config.healthCheck.timeout * 0.8);

      // Log recovery if RPC was previously unhealthy
      if (!wasHealthy && rpc.healthy) {
        this.emit('rpcRecovered', rpc);
      }

      healthLogger.debug(`RPC health check passed`, {
        chain: this.chainConfig.displayName,
        rpc: rpc.url,
        blockHeight: rpc.blockHeight,
        responseTime,
        isArchive: rpc.isArchive,
        catching_up: rpc.syncStatus
      });

    } catch (error) {
      rpc.healthy = false;
      rpc.lastError = error.message;
      rpc.lastCheck = new Date().toISOString();
      rpc.responseTime = Date.now() - checkStartTime;
      rpc.consecutiveFailures++;
      rpc.errorCount++;

      healthLogger.debug(`RPC health check failed`, {
        chain: this.chainConfig.displayName,
        rpc: rpc.url,
        error: error.message,
        consecutiveFailures: rpc.consecutiveFailures
      });
    }
  }

  /**
   * Update overall health status and emit events
   */
  updateHealthStatus() {
    const allRpcs = Array.from(this.rpcs.values());
    const healthyRpcs = allRpcs.filter(rpc => rpc.healthy);
    const unhealthyRpcs = allRpcs.filter(rpc => !rpc.healthy);
    const archiveRpcs = healthyRpcs.filter(rpc => rpc.isArchive);

    // Calculate median block height from healthy RPCs
    const blockHeights = healthyRpcs
      .filter(rpc => rpc.blockHeight !== null)
      .map(rpc => rpc.blockHeight)
      .sort((a, b) => a - b);

    const medianHeight = blockHeights.length > 0 
      ? blockHeights[Math.floor(blockHeights.length / 2)]
      : 0;

    // Filter healthy RPCs by sync threshold
    const syncedRpcs = healthyRpcs.filter(rpc => {
      if (!rpc.blockHeight || blockHeights.length === 0) return false;
      return Math.abs(rpc.blockHeight - medianHeight) <= config.healthCheck.syncThreshold;
    });

    const syncedArchiveRpcs = syncedRpcs.filter(rpc => rpc.isArchive);

    // Check if status changed
    const statusChanged = 
      this.healthyRpcs.length !== syncedRpcs.length ||
      this.unhealthyRpcs.length !== unhealthyRpcs.length ||
      this.archiveRpcs.length !== syncedArchiveRpcs.length ||
      this.lastMedianHeight !== medianHeight;

    // Update status
    this.healthyRpcs = syncedRpcs;
    this.unhealthyRpcs = unhealthyRpcs;
    this.archiveRpcs = syncedArchiveRpcs;
    this.lastMedianHeight = medianHeight;

    // Emit events if status changed
    if (statusChanged) {
      this.emit('healthStatusChanged', {
        healthy: this.healthyRpcs,
        unhealthy: this.unhealthyRpcs,
        archive: this.archiveRpcs
      });

      // Emit critical event if all RPCs are unhealthy
      if (this.healthyRpcs.length === 0 && allRpcs.length > 0) {
        this.emit('allRpcsUnhealthy');
      }
    }

    healthLogger.debug(`Health status updated for ${this.chainConfig.displayName}`, {
      healthy: this.healthyRpcs.length,
      unhealthy: this.unhealthyRpcs.length,
      archive: this.archiveRpcs.length,
      medianHeight,
      statusChanged
    });
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    const totalRpcs = this.rpcs.size;
    const healthyCount = this.healthyRpcs.length;
    const archiveCount = this.archiveRpcs.length;

    return {
      status: healthyCount > 0 ? 'healthy' : 'unhealthy',
      chain: this.chainConfig.displayName,
      rpcs: {
        total: totalRpcs,
        healthy: healthyCount,
        archive: archiveCount
      },
      blockHeight: this.lastMedianHeight,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  /**
   * Get detailed statistics
   */
  getStatistics() {
    const allRpcs = Array.from(this.rpcs.values());
    
    return {
      total: allRpcs.length,
      healthy: this.healthyRpcs.length,
      unhealthy: this.unhealthyRpcs.length,
      archive: this.archiveRpcs.length,
      averageResponseTime: this.getAverageResponseTime(),
      medianBlockHeight: this.lastMedianHeight,
      rpcDetails: allRpcs.map(rpc => ({
        url: rpc.url,
        name: rpc.name,
        healthy: rpc.healthy,
        isArchive: rpc.isArchive,
        blockHeight: rpc.blockHeight,
        responseTime: rpc.responseTime,
        errorCount: rpc.errorCount,
        consecutiveFailures: rpc.consecutiveFailures,
        lastCheck: rpc.lastCheck,
        lastError: rpc.lastError
      }))
    };
  }

  /**
   * Calculate average response time of healthy RPCs
   */
  getAverageResponseTime() {
    const healthyResponseTimes = this.healthyRpcs
      .filter(rpc => rpc.responseTime !== null)
      .map(rpc => rpc.responseTime);

    return healthyResponseTimes.length > 0
      ? healthyResponseTimes.reduce((sum, time) => sum + time, 0) / healthyResponseTimes.length
      : null;
  }

  /**
   * Get current block height
   */
  getCurrentBlockHeight() {
    return this.lastMedianHeight;
  }

  /**
   * Get healthy RPCs
   */
  getHealthyRpcs() {
    return [...this.healthyRpcs];
  }

  /**
   * Get archive RPCs
   */
  getArchiveRpcs() {
    return [...this.archiveRpcs];
  }

  /**
   * Stop health checks and cleanup
   */
  async shutdown() {
    if (!this.running) {
      return;
    }

    healthLogger.info(`Shutting down health monitor for ${this.chainConfig.displayName}`);

    this.running = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Clear all listeners
    this.removeAllListeners();

    healthLogger.info(`Health monitor shutdown complete for ${this.chainConfig.displayName}`);
  }
}

module.exports = HealthMonitor; 