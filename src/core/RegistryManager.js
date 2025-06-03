const EventEmitter = require('events');
const axios = require('axios');
const { registryLogger } = require('../utils/logger');
const config = require('../config/config');

/**
 * Registry Manager
 * Manages fetching and updating RPC lists from GitHub registries
 * Emits events when registries are updated
 */
class RegistryManager extends EventEmitter {
  constructor(chainConfig) {
    super();
    this.chainConfig = chainConfig;
    this.currentRpcs = [];
    this.lastUpdate = null;
    this.updateInterval = null;
    this.running = false;
    this.lastFetchTime = null;
    this.fetchErrors = 0;
    this.maxRetries = 3;
  }

  /**
   * Initialize registry manager
   */
  async initialize() {
    registryLogger.info(`Initializing registry manager for ${this.chainConfig.displayName}`);
    
    try {
      // Perform initial registry fetch
      await this.fetchRegistry();
      registryLogger.info(`Registry manager initialized for ${this.chainConfig.displayName}`);
    } catch (error) {
      registryLogger.error(`Failed to initialize registry manager for ${this.chainConfig.displayName}`, error);
      throw error;
    }
  }

  /**
   * Fetch RPC registry from GitHub
   */
  async fetchRegistry() {
    registryLogger.debug(`Fetching registry for ${this.chainConfig.displayName}`, {
      url: this.chainConfig.registryUrl
    });

    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const response = await axios.get(this.chainConfig.registryUrl, {
          timeout: 10000, // 10 seconds
          headers: {
            'User-Agent': 'Namada-RPC-Proxy/1.0',
            'Accept': 'application/json'
          }
        });

        if (!Array.isArray(response.data)) {
          throw new Error('Registry response is not an array');
        }

        // Parse and validate RPC entries
        const parsedRpcs = this.parseRpcEntries(response.data);
        
        if (parsedRpcs.length === 0) {
          throw new Error('No valid RPC entries found in registry');
        }

        // Update current RPCs if changed
        const hasChanged = this.hasRegistryChanged(parsedRpcs);
        
        this.currentRpcs = parsedRpcs;
        this.lastUpdate = new Date().toISOString();
        this.lastFetchTime = Date.now();
        this.fetchErrors = 0;

        registryLogger.info(`Registry fetched successfully for ${this.chainConfig.displayName}`, {
          rpcCount: parsedRpcs.length,
          hasChanged
        });

        // Emit update event if registry changed
        if (hasChanged) {
          this.emit('registryUpdated', parsedRpcs);
        }

        return parsedRpcs;

      } catch (error) {
        retries++;
        this.fetchErrors++;
        
        registryLogger.warn(`Registry fetch attempt ${retries} failed for ${this.chainConfig.displayName}`, {
          error: error.message,
          url: this.chainConfig.registryUrl
        });

        if (retries >= this.maxRetries) {
          const errorMsg = `Failed to fetch registry after ${this.maxRetries} attempts: ${error.message}`;
          registryLogger.error(errorMsg, {
            chain: this.chainConfig.displayName,
            url: this.chainConfig.registryUrl
          });
          throw new Error(errorMsg);
        }

        // Wait before retry with exponential backoff
        await this.sleep(1000 * Math.pow(2, retries - 1));
      }
    }
  }

  /**
   * Parse RPC entries from registry response
   */
  parseRpcEntries(registryData) {
    const validRpcs = [];
    
    for (const entry of registryData) {
      try {
        // Handle different possible field names
        const rpcAddress = entry['RPC Address'] || 
                          entry['rpc_address'] || 
                          entry.rpc || 
                          entry.url;
        
        const teamName = entry['Team or Contributor Name'] || 
                        entry['team_name'] || 
                        entry.team || 
                        entry.name;

        if (!rpcAddress) {
          registryLogger.debug('Skipping registry entry without RPC address', { entry });
          continue;
        }

        // Validate URL format
        if (!this.isValidUrl(rpcAddress)) {
          registryLogger.debug('Skipping invalid RPC URL', { url: rpcAddress });
          continue;
        }

        validRpcs.push({
          url: this.normalizeUrl(rpcAddress),
          name: teamName || 'Unknown',
          originalEntry: entry
        });

      } catch (error) {
        registryLogger.debug('Error parsing registry entry', { 
          entry, 
          error: error.message 
        });
      }
    }

    registryLogger.debug(`Parsed ${validRpcs.length} valid RPCs from ${registryData.length} entries`, {
      chain: this.chainConfig.displayName
    });

    return validRpcs;
  }

  /**
   * Validate URL format
   */
  isValidUrl(urlString) {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Normalize URL (remove trailing slash, ensure proper format)
   */
  normalizeUrl(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  /**
   * Check if registry has changed
   */
  hasRegistryChanged(newRpcs) {
    if (this.currentRpcs.length !== newRpcs.length) {
      return true;
    }

    const currentUrls = new Set(this.currentRpcs.map(rpc => rpc.url));
    const newUrls = new Set(newRpcs.map(rpc => rpc.url));

    // Check if any URLs are different
    for (const url of newUrls) {
      if (!currentUrls.has(url)) {
        return true;
      }
    }

    for (const url of currentUrls) {
      if (!newUrls.has(url)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Start periodic registry updates
   */
  startPeriodicUpdates() {
    if (this.running) {
      registryLogger.warn(`Periodic updates already running for ${this.chainConfig.displayName}`);
      return;
    }

    this.running = true;
    registryLogger.info(`Starting periodic registry updates for ${this.chainConfig.displayName}`, {
      intervalMs: config.registry.updateInterval
    });

    this.updateInterval = setInterval(async () => {
      try {
        await this.fetchRegistry();
      } catch (error) {
        registryLogger.error(`Periodic registry update failed for ${this.chainConfig.displayName}`, {
          error: error.message
        });
      }
    }, config.registry.updateInterval);
  }

  /**
   * Force immediate registry update
   */
  async forceUpdate() {
    registryLogger.info(`Forcing registry update for ${this.chainConfig.displayName}`);
    
    try {
      return await this.fetchRegistry();
    } catch (error) {
      registryLogger.error(`Forced registry update failed for ${this.chainConfig.displayName}`, error);
      throw error;
    }
  }

  /**
   * Get current RPC list
   */
  getCurrentRpcs() {
    return [...this.currentRpcs];
  }

  /**
   * Get registry status
   */
  getStatus() {
    return {
      chain: this.chainConfig.displayName,
      registryUrl: this.chainConfig.registryUrl,
      currentRpcCount: this.currentRpcs.length,
      lastUpdate: this.lastUpdate,
      lastFetchTime: this.lastFetchTime,
      fetchErrors: this.fetchErrors,
      running: this.running,
      uptime: this.lastFetchTime ? Date.now() - this.lastFetchTime : 0
    };
  }

  /**
   * Get detailed information about current RPCs
   */
  getDetailedRpcInfo() {
    return this.currentRpcs.map(rpc => ({
      url: rpc.url,
      name: rpc.name,
      originalEntry: rpc.originalEntry
    }));
  }

  /**
   * Check if a specific RPC exists in current registry
   */
  hasRpc(rpcUrl) {
    const normalizedUrl = this.normalizeUrl(rpcUrl);
    return this.currentRpcs.some(rpc => rpc.url === normalizedUrl);
  }

  /**
   * Get RPC by URL
   */
  getRpc(rpcUrl) {
    const normalizedUrl = this.normalizeUrl(rpcUrl);
    return this.currentRpcs.find(rpc => rpc.url === normalizedUrl);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop periodic updates and cleanup
   */
  async shutdown() {
    if (!this.running) {
      return;
    }

    registryLogger.info(`Shutting down registry manager for ${this.chainConfig.displayName}`);

    this.running = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear all listeners
    this.removeAllListeners();

    registryLogger.info(`Registry manager shutdown complete for ${this.chainConfig.displayName}`);
  }

  /**
   * Get statistics about registry performance
   */
  getStatistics() {
    const timeSinceLastFetch = this.lastFetchTime ? Date.now() - this.lastFetchTime : null;
    
    return {
      totalRpcs: this.currentRpcs.length,
      lastUpdate: this.lastUpdate,
      timeSinceLastFetch,
      fetchErrors: this.fetchErrors,
      running: this.running,
      registryUrl: this.chainConfig.registryUrl,
      updateInterval: config.registry.updateInterval
    };
  }

  /**
   * Validate current registry health
   */
  isHealthy() {
    const maxAge = config.registry.updateInterval * 2; // Allow 2x the update interval
    const timeSinceLastFetch = this.lastFetchTime ? Date.now() - this.lastFetchTime : Infinity;
    
    return this.currentRpcs.length > 0 && 
           this.running && 
           timeSinceLastFetch < maxAge;
  }
}

module.exports = RegistryManager; 