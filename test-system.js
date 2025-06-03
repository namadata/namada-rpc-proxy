#!/usr/bin/env node

/**
 * Simple system test to verify the Namada RPC Proxy setup
 * This script tests basic functionality without external dependencies
 */

const path = require('path');

console.log('🧪 Testing Namada RPC Proxy System Setup...\n');

async function testSystemSetup() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function test(name, testFn) {
    try {
      const result = testFn();
      if (result === true || (typeof result === 'object' && result.success)) {
        console.log(`✅ ${name}`);
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
      } else {
        console.log(`❌ ${name}: ${result}`);
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: result });
      }
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
    }
  }

  // Test 1: Check Node.js version
  test('Node.js version >= 18.0.0', () => {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    return majorVersion >= 18 ? true : `Current: ${version}, Required: >= 18.0.0`;
  });

  // Test 2: Check package.json exists and is valid
  test('package.json exists and is valid', () => {
    try {
      const pkg = require('./package.json');
      return pkg.name === 'namada-rpc-proxy' ? true : 'Invalid package name';
    } catch (error) {
      return 'package.json not found or invalid';
    }
  });

  // Test 3: Check core modules can be loaded
  test('Core modules load correctly', () => {
    try {
      require('./src/config/config');
      require('./src/utils/logger');
      return true;
    } catch (error) {
      return `Module loading failed: ${error.message}`;
    }
  });

  // Test 4: Check configuration validation
  test('Configuration validation', () => {
    try {
      const config = require('./src/config/config');
      
      // Check required config sections exist
      const requiredSections = ['server', 'healthCheck', 'registry', 'chains'];
      for (const section of requiredSections) {
        if (!config[section]) {
          return `Missing config section: ${section}`;
        }
      }
      
      // Check chain configurations
      if (!config.chains.mainnet || !config.chains.testnet) {
        return 'Missing chain configurations';
      }
      
      return true;
    } catch (error) {
      return `Config validation failed: ${error.message}`;
    }
  });

  // Test 5: Check logger initialization
  test('Logger initialization', () => {
    try {
      const logger = require('./src/utils/logger');
      
      // Test different log levels
      if (typeof logger.info !== 'function') {
        return 'Logger missing info method';
      }
      if (typeof logger.error !== 'function') {
        return 'Logger missing error method';
      }
      
      return true;
    } catch (error) {
      return `Logger test failed: ${error.message}`;
    }
  });

  // Test 6: Check core classes can be instantiated
  test('Core classes instantiation', () => {
    try {
      const MultiChainManager = require('./src/core/MultiChainManager');
      const ChainInstance = require('./src/core/ChainInstance');
      const HealthMonitor = require('./src/core/HealthMonitor');
      const LoadBalancer = require('./src/core/LoadBalancer');
      const RegistryManager = require('./src/core/RegistryManager');
      
      // Test instantiation with mock config
      const mockConfig = {
        name: 'test',
        displayName: 'Test Chain',
        registryUrl: 'https://example.com/registry.json',
        basePath: '/test',
        archivePath: '/test/archive'
      };
      
      new MultiChainManager();
      new ChainInstance(mockConfig);
      new HealthMonitor(mockConfig);
      new LoadBalancer(mockConfig);
      new RegistryManager(mockConfig);
      
      return true;
    } catch (error) {
      return `Class instantiation failed: ${error.message}`;
    }
  });

  // Test 7: Check middleware and routes
  test('Middleware and routes structure', () => {
    try {
      require('./src/middleware/errorHandler');
      require('./src/routes/health');
      require('./src/routes/proxy');
      
      return true;
    } catch (error) {
      return `Route/middleware loading failed: ${error.message}`;
    }
  });

  // Test 8: Check Express app can be created
  test('Express app creation', () => {
    try {
      // Don't actually start the server, just test app creation
      const app = require('./src/index');
      return typeof app === 'function' ? true : 'App is not a function';
    } catch (error) {
      return `App creation failed: ${error.message}`;
    }
  });

  // Print results
  console.log('\n📊 Test Results:');
  console.log('================');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! The system is ready to run.');
    console.log('\nNext steps:');
    console.log('1. Copy config.env.example to .env and configure as needed');
    console.log('2. Run "npm install" to install dependencies');
    console.log('3. Run "npm start" to start the production server');
    console.log('4. Run "npm run dev" to start the development server');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please fix the issues before running the system.');
    console.log('\nFailed tests:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    process.exit(1);
  }
}

// Run tests
testSystemSetup().catch(error => {
  console.error('\n💥 Test runner failed:', error);
  process.exit(1);
}); 