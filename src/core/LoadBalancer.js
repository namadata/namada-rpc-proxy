const axios = require('axios');
const { loadBalancerLogger, rpcLogger } = require('../utils/logger');
const config = require('../config/config');

/**
 * Load Balancer
 * Implements weighted round-robin load balancing with circuit breaker pattern
 * Handles both regular and archive RPC requests
 */
class LoadBalancer {
  constructor(chainConfig) {
    this.chainConfig = chainConfig;
    this.healthyRpcs = [];
    this.archiveRpcs = [];
    this.currentIndex = 0;
    this.rpcWeights = new Map(); // URL -> weight info
    this.circuitBreakers = new Map(); // URL -> circuit breaker state
    this.initialized = false;
  }

  /**
   * Initialize load balancer
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    loadBalancerLogger.info(`Initializing load balancer for ${this.chainConfig.displayName}`);
    this.initialized = true;
  }

  /**
   * Update healthy RPCs from health monitor
   */
  updateHealthyRpcs(healthyRpcs, archiveRpcs) {
    const prevHealthyCount = this.healthyRpcs.length;
    const prevArchiveCount = this.archiveRpcs.length;

    this.healthyRpcs = [...healthyRpcs];
    this.archiveRpcs = [...archiveRpcs];

    // Reset round-robin index if RPC list changed significantly
    if (this.healthyRpcs.length !== prevHealthyCount) {
      this.currentIndex = 0;
    }

    // Update weights for new RPCs
    this.updateRpcWeights(healthyRpcs);

    // Reset circuit breakers for recovered RPCs
    healthyRpcs.forEach(rpc => {
      if (this.circuitBreakers.has(rpc.url)) {
        this.resetCircuitBreaker(rpc.url);
      }
    });

    loadBalancerLogger.debug(`Updated healthy RPCs for ${this.chainConfig.displayName}`, {
      healthy: this.healthyRpcs.length,
      archive: this.archiveRpcs.length,
      prevHealthy: prevHealthyCount,
      prevArchive: prevArchiveCount
    });
  }

  /**
   * Update RPC weights based on performance
   */
  updateRpcWeights(rpcs) {
    rpcs.forEach(rpc => {
      if (!this.rpcWeights.has(rpc.url)) {
        this.rpcWeights.set(rpc.url, {
          weight: 1.0,
          totalRequests: 0,
          successfulRequests: 0,
          averageResponseTime: rpc.responseTime || 1000,
          lastUpdated: Date.now()
        });
      } else {
        // Update existing weight based on response time
        const weightInfo = this.rpcWeights.get(rpc.url);
        const responseTime = rpc.responseTime || weightInfo.averageResponseTime;
        
        // Calculate weight based on response time (lower time = higher weight)
        const baseWeight = 1000 / Math.max(responseTime, 100); // Avoid division by zero
        weightInfo.weight = Math.max(0.1, Math.min(5.0, baseWeight));
        weightInfo.averageResponseTime = responseTime;
        weightInfo.lastUpdated = Date.now();
      }
    });
  }

  /**
   * Route request to appropriate RPC
   */
  async routeRequest(rpcQuery, options = {}) {
    if (!this.initialized) {
      throw new Error(`Load balancer not initialized for ${this.chainConfig.name}`);
    }

    const { 
      isArchiveRequest = false, 
      maxRetries = config.request.retryAttempts,
      isGetRequest = false,
      requestPath = ''
    } = options;
    
    // Select appropriate RPC pool
    const targetRpcs = isArchiveRequest ? this.archiveRpcs : this.healthyRpcs;
    
    if (targetRpcs.length === 0) {
      const errorMsg = isArchiveRequest 
        ? `No healthy archive RPCs available for ${this.chainConfig.displayName}`
        : `No healthy RPCs available for ${this.chainConfig.displayName}`;
      
      loadBalancerLogger.error(errorMsg);
      throw new Error(errorMsg);
    }

    let lastError;
    let attempts = 0;
    const maxAttempts = Math.min(maxRetries, targetRpcs.length);

    while (attempts < maxAttempts) {
      const selectedRpc = this.selectRpc(targetRpcs, attempts);
      
      // Check circuit breaker
      if (this.isCircuitBreakerOpen(selectedRpc.url)) {
        attempts++;
        continue;
      }

      try {
        rpcLogger.debug(`Attempting request to RPC`, {
          chain: this.chainConfig.displayName,
          rpc: selectedRpc.url,
          attempt: attempts + 1,
          isArchive: isArchiveRequest,
          isGet: isGetRequest
        });

        const result = await this.forwardRequest(selectedRpc, rpcQuery, {
          isGetRequest,
          requestPath
        });
        
        // Update success metrics
        this.updateRpcMetrics(selectedRpc.url, true, result.responseTime);
        
        return {
          data: result.data,
          selectedRpc: {
            url: selectedRpc.url,
            name: selectedRpc.name,
            responseTime: result.responseTime,
            isArchive: selectedRpc.isArchive
          }
        };

      } catch (error) {
        lastError = error;
        attempts++;
        
        // Update failure metrics and circuit breaker
        this.updateRpcMetrics(selectedRpc.url, false, error.responseTime || 0);
        this.updateCircuitBreaker(selectedRpc.url, false);
        
        rpcLogger.warn(`RPC request failed`, {
          chain: this.chainConfig.displayName,
          rpc: selectedRpc.url,
          attempt: attempts,
          error: error.message
        });

        // Add delay between retries
        if (attempts < maxAttempts) {
          await this.sleep(config.request.retryDelay * attempts);
        }
      }
    }

    // All attempts failed
    const errorMsg = `All RPC requests failed for ${this.chainConfig.displayName} after ${attempts} attempts`;
    loadBalancerLogger.error(errorMsg, { lastError: lastError?.message });
    
    throw new Error(`${errorMsg}: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Select RPC using weighted round-robin
   */
  selectRpc(rpcs, attemptNumber = 0) {
    if (rpcs.length === 1) {
      return rpcs[0];
    }

    // For retries, try different RPCs
    if (attemptNumber > 0) {
      const index = (this.currentIndex + attemptNumber) % rpcs.length;
      return rpcs[index];
    }

    // Weighted selection for first attempt
    const availableRpcs = rpcs.filter(rpc => !this.isCircuitBreakerOpen(rpc.url));
    
    if (availableRpcs.length === 0) {
      // All circuit breakers are open, use round-robin on all RPCs
      const selected = rpcs[this.currentIndex % rpcs.length];
      this.currentIndex = (this.currentIndex + 1) % rpcs.length;
      return selected;
    }

    // Calculate total weight
    const totalWeight = availableRpcs.reduce((sum, rpc) => {
      const weight = this.rpcWeights.get(rpc.url)?.weight || 1.0;
      return sum + weight;
    }, 0);

    // Select RPC based on weight
    let random = Math.random() * totalWeight;
    
    for (const rpc of availableRpcs) {
      const weight = this.rpcWeights.get(rpc.url)?.weight || 1.0;
      random -= weight;
      
      if (random <= 0) {
        return rpc;
      }
    }

    // Fallback to round-robin
    const selected = availableRpcs[this.currentIndex % availableRpcs.length];
    this.currentIndex = (this.currentIndex + 1) % availableRpcs.length;
    return selected;
  }

  /**
   * Forward request to selected RPC
   */
  async forwardRequest(rpc, rpcQuery, options = {}) {
    const startTime = Date.now();
    const { isGetRequest = false, requestPath = '' } = options;
    
    try {
      let response;
      
      if (isGetRequest) {
        // For GET requests, append the path to the RPC URL
        const url = `${rpc.url}${requestPath}`;
        response = await axios.get(url, {
          timeout: config.request.timeout,
          headers: {
            'User-Agent': 'Namada-RPC-Proxy/1.0'
          }
        });
      } else {
        // For POST requests (standard JSON-RPC)
        response = await axios.post(rpc.url, rpcQuery, {
          timeout: config.request.timeout,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Namada-RPC-Proxy/1.0'
          }
        });
      }

      const responseTime = Date.now() - startTime;
      
      return {
        data: response.data,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      error.responseTime = responseTime;
      
      // Handle different types of errors
      if (error.response) {
        // Server responded with error status
        error.message = `HTTP ${error.response.status}: ${error.response.statusText}`;
      } else if (error.code === 'ECONNABORTED') {
        // Request timeout
        error.message = 'Request timeout';
      } else if (error.code === 'ECONNREFUSED') {
        // Connection refused
        error.message = 'Connection refused';
      }
      
      throw error;
    }
  }

  /**
   * Update RPC performance metrics
   */
  updateRpcMetrics(rpcUrl, success, responseTime) {
    if (!this.rpcWeights.has(rpcUrl)) {
      this.rpcWeights.set(rpcUrl, {
        weight: 1.0,
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: responseTime,
        lastUpdated: Date.now()
      });
    }

    const metrics = this.rpcWeights.get(rpcUrl);
    metrics.totalRequests++;
    
    if (success) {
      metrics.successfulRequests++;
      
      // Update average response time with exponential moving average
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * 0.8) + (responseTime * 0.2);
        
      // Update weight based on performance
      const baseWeight = 1000 / Math.max(metrics.averageResponseTime, 100);
      metrics.weight = Math.max(0.1, Math.min(5.0, baseWeight));
    }
    
    metrics.lastUpdated = Date.now();
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreaker(rpcUrl, success) {
    if (!this.circuitBreakers.has(rpcUrl)) {
      this.circuitBreakers.set(rpcUrl, {
        state: 'closed', // closed, open, half-open
        failureCount: 0,
        lastFailureTime: null,
        nextRetryTime: null
      });
    }

    const breaker = this.circuitBreakers.get(rpcUrl);
    
    if (success) {
      this.resetCircuitBreaker(rpcUrl);
    } else {
      breaker.failureCount++;
      breaker.lastFailureTime = Date.now();
      
      // Open circuit breaker after 3 consecutive failures
      if (breaker.failureCount >= 3 && breaker.state === 'closed') {
        breaker.state = 'open';
        breaker.nextRetryTime = Date.now() + (30 * 1000); // 30 seconds
        
        loadBalancerLogger.warn(`Circuit breaker opened for RPC`, {
          chain: this.chainConfig.displayName,
          rpc: rpcUrl,
          failureCount: breaker.failureCount
        });
      }
    }
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(rpcUrl) {
    const breaker = this.circuitBreakers.get(rpcUrl);
    if (!breaker || breaker.state === 'closed') {
      return false;
    }

    if (breaker.state === 'open') {
      // Check if it's time to retry
      if (Date.now() >= breaker.nextRetryTime) {
        breaker.state = 'half-open';
        return false;
      }
      return true;
    }

    return false; // half-open allows requests
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(rpcUrl) {
    if (this.circuitBreakers.has(rpcUrl)) {
      const breaker = this.circuitBreakers.get(rpcUrl);
      const wasOpen = breaker.state !== 'closed';
      
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.lastFailureTime = null;
      breaker.nextRetryTime = null;
      
      if (wasOpen) {
        loadBalancerLogger.info(`Circuit breaker reset for RPC`, {
          chain: this.chainConfig.displayName,
          rpc: rpcUrl
        });
      }
    }
  }

  /**
   * Get load balancer status
   */
  getStatus() {
    return {
      healthyRpcs: this.healthyRpcs.length,
      archiveRpcs: this.archiveRpcs.length,
      currentIndex: this.currentIndex,
      rpcWeights: Array.from(this.rpcWeights.entries()).map(([url, weight]) => ({
        url,
        ...weight
      })),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([url, breaker]) => ({
        url,
        ...breaker
      }))
    };
  }

  /**
   * Check if there are healthy RPCs available
   */
  hasHealthyRpcs() {
    return this.healthyRpcs.length > 0;
  }

  /**
   * Get healthy RPCs
   */
  getHealthyRpcs(archiveOnly = false) {
    return archiveOnly ? [...this.archiveRpcs] : [...this.healthyRpcs];
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown load balancer
   */
  async shutdown() {
    loadBalancerLogger.info(`Shutting down load balancer for ${this.chainConfig.displayName}`);
    
    this.healthyRpcs = [];
    this.archiveRpcs = [];
    this.rpcWeights.clear();
    this.circuitBreakers.clear();
    this.initialized = false;
    
    loadBalancerLogger.info(`Load balancer shutdown complete for ${this.chainConfig.displayName}`);
  }
}

module.exports = LoadBalancer; 