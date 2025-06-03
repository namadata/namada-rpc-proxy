#!/usr/bin/env node

/**
 * RPC Validation Test Suite
 * Tests the RPC validation system by making requests to all endpoints
 * with both valid and invalid parameters
 */

const axios = require('axios');
const yaml = require('js-yaml');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const CHAINS = {
  mainnet: 'namada',
  testnet: 'housefiretestnet'
};

class RpcValidationTester {
  constructor() {
    this.openApiSpec = null;
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async initialize() {
    try {
      const specContent = fs.readFileSync('./openapi.yaml', 'utf8');
      this.openApiSpec = yaml.load(specContent);
      console.log('📋 Loaded OpenAPI specification');
    } catch (error) {
      console.error('❌ Failed to load OpenAPI spec:', error.message);
      process.exit(1);
    }
  }

  /**
   * Generate test parameters for an endpoint
   */
  generateTestParams(operation) {
    const params = {};
    const requiredParams = {};
    
    if (!operation.parameters) return { params, requiredParams };

    for (const param of operation.parameters) {
      if (param.in === 'query') {
        let value;
        
        // Use example if available, otherwise generate based on type
        if (param.schema?.example !== undefined) {
          value = param.schema.example;
        } else if (param.example !== undefined) {
          value = param.example;
        } else {
          // Generate value based on type
          switch (param.schema?.type) {
            case 'integer':
              value = 1;
              break;
            case 'boolean':
              value = true;
              break;
            case 'string':
              if (param.name === 'hash') {
                value = '0xD70952032620CC4E2737EB8AC379806359D8E0B17B0488F627997A0B043ABDED';
              } else if (param.name === 'tx') {
                value = '456';
              } else if (param.name === 'query') {
                value = '"tx.height=1000"';
              } else if (param.name === 'path') {
                value = '"/a/b/c"';
              } else if (param.name === 'data') {
                value = 'IHAVENOIDEA';
              } else if (param.name === 'evidence') {
                value = 'JSON_EVIDENCE_encoded';
              } else {
                value = 'test';
              }
              break;
            case 'array':
              // Handle arrays properly - use JSON string format
              if (param.name === 'peers') {
                value = '["f9baeaa15fedf5e1ef7448dd60f46c01f1a9e9c4@1.2.3.4:26656","0491d373a8e0fcf1023aaf18c51d6a1d0d4f31bd@5.6.7.8:26656"]';
              } else {
                value = '["test1","test2"]';
              }
              break;
            default:
              value = 'test';
          }
        }

        params[param.name] = value;
        
        if (param.required) {
          requiredParams[param.name] = value;
        }
      }
    }

    return { params, requiredParams };
  }

  /**
   * Make HTTP request and return result
   */
  async makeRequest(url, description) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true // Don't throw on HTTP error status
      });

      return {
        success: response.status < 400,
        status: response.status,
        data: response.data,
        description
      };
    } catch (error) {
      return {
        success: false,
        status: error.response?.status || 0,
        error: error.message,
        description
      };
    }
  }

  /**
   * Test a specific endpoint
   */
  async testEndpoint(path, method, operation, chain, isArchive = false) {
    const endpoint = path.replace('/', '');
    const { params, requiredParams } = this.generateTestParams(operation);
    
    const baseUrl = isArchive 
      ? `${BASE_URL}/${chain}/archive/${endpoint}`
      : `${BASE_URL}/${chain}/${endpoint}`;

    const tests = [];

    // Test 1: Valid request with all parameters
    if (Object.keys(params).length > 0) {
      const validUrl = `${baseUrl}?${new URLSearchParams(params).toString()}`;
      const result = await this.makeRequest(validUrl, 
        `${chain}${isArchive ? '/archive' : ''}/${endpoint} with all params`);
      tests.push({
        type: 'valid_with_params',
        ...result
      });
    } else {
      // No parameters endpoint
      const result = await this.makeRequest(baseUrl, 
        `${chain}${isArchive ? '/archive' : ''}/${endpoint} (no params)`);
      tests.push({
        type: 'valid_no_params',
        ...result
      });
    }

    // Test 2: Valid request with only required parameters
    if (Object.keys(requiredParams).length > 0 && Object.keys(requiredParams).length !== Object.keys(params).length) {
      const requiredUrl = `${baseUrl}?${new URLSearchParams(requiredParams).toString()}`;
      const result = await this.makeRequest(requiredUrl, 
        `${chain}${isArchive ? '/archive' : ''}/${endpoint} with required params only`);
      tests.push({
        type: 'valid_required_only',
        ...result
      });
    }

    // Test 3: Invalid request missing required parameters
    if (Object.keys(requiredParams).length > 0) {
      const result = await this.makeRequest(baseUrl, 
        `${chain}${isArchive ? '/archive' : ''}/${endpoint} missing required params (should fail validation)`);
      tests.push({
        type: 'invalid_missing_required',
        shouldFail: true,
        ...result
      });
    }

    // Test 4: Invalid parameter types
    if (operation.parameters?.some(p => p.schema?.type === 'integer')) {
      const invalidParams = { ...requiredParams };
      const intParam = operation.parameters.find(p => p.schema?.type === 'integer');
      invalidParams[intParam.name] = 'not_a_number';
      
      const invalidUrl = `${baseUrl}?${new URLSearchParams(invalidParams).toString()}`;
      const result = await this.makeRequest(invalidUrl, 
        `${chain}${isArchive ? '/archive' : ''}/${endpoint} with invalid integer param (should fail validation)`);
      tests.push({
        type: 'invalid_param_type',
        shouldFail: true,
        ...result
      });
    }

    return tests;
  }

  /**
   * Test invalid endpoints
   */
  async testInvalidEndpoints() {
    const tests = [];
    
    // Test non-existent endpoint
    const result1 = await this.makeRequest(`${BASE_URL}/namada/nonexistent`, 
      'Non-existent endpoint (should fail validation)');
    tests.push({
      type: 'invalid_endpoint',
      shouldFail: true,
      ...result1
    });

    // Test typo in endpoint
    const result2 = await this.makeRequest(`${BASE_URL}/namada/statuss`, 
      'Typo in endpoint (should suggest correction)');
    tests.push({
      type: 'typo_endpoint',
      shouldFail: true,
      ...result2
    });

    return tests;
  }

  /**
   * Evaluate test result
   */
  evaluateTest(test) {
    const shouldSucceed = !test.shouldFail;
    const actualSuccess = test.success;
    
    if (shouldSucceed === actualSuccess) {
      this.results.passed++;
      return '✅';
    } else {
      this.results.failed++;
      return '❌';
    }
  }

  /**
   * Run all tests
   */
  async runTests() {
    console.log('🧪 Starting RPC Validation Test Suite...\n');
    
    // First, test if server is running
    try {
      await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
      console.log('✅ Server is running\n');
    } catch (error) {
      console.error('❌ Server is not running. Please start with: npm start');
      process.exit(1);
    }

    // Test each endpoint
    for (const [path, pathObj] of Object.entries(this.openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(pathObj)) {
        if (method.toLowerCase() === 'get') {
          console.log(`\n📍 Testing endpoint: ${method.toUpperCase()} ${path}`);
          
          // Test on both chains
          for (const [chainName, chainPath] of Object.entries(CHAINS)) {
            console.log(`  🔗 ${chainName} chain:`);
            
            // Test regular endpoint
            const regularTests = await this.testEndpoint(path, method, operation, chainPath, false);
            for (const test of regularTests) {
              const status = this.evaluateTest(test);
              console.log(`    ${status} ${test.description} (${test.status})`);
              
              if (!test.success && !test.shouldFail) {
                console.log(`      Error: ${test.error || JSON.stringify(test.data)}`);
              }
              
              this.results.tests.push(test);
            }

            // Test archive endpoint
            const archiveTests = await this.testEndpoint(path, method, operation, chainPath, true);
            for (const test of archiveTests) {
              const status = this.evaluateTest(test);
              console.log(`    ${status} ${test.description} (${test.status})`);
              
              if (!test.success && !test.shouldFail) {
                console.log(`      Error: ${test.error || JSON.stringify(test.data)}`);
              }
              
              this.results.tests.push(test);
            }
          }
        }
      }
    }

    // Test invalid endpoints
    console.log('\n📍 Testing invalid endpoints:');
    const invalidTests = await this.testInvalidEndpoints();
    for (const test of invalidTests) {
      const status = this.evaluateTest(test);
      console.log(`  ${status} ${test.description} (${test.status})`);
      this.results.tests.push(test);
    }

    // Test endpoint discovery
    console.log('\n📍 Testing endpoint discovery:');
    const discoveryTest = await this.makeRequest(`${BASE_URL}/health/rpc-endpoints`, 
      'RPC endpoints list');
    const discoveryStatus = this.evaluateTest(discoveryTest);
    console.log(`  ${discoveryStatus} ${discoveryTest.description} (${discoveryTest.status})`);
    this.results.tests.push(discoveryTest);
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(test => {
          const shouldSucceed = !test.shouldFail;
          const actualSuccess = test.success;
          return shouldSucceed !== actualSuccess;
        })
        .forEach(test => {
          console.log(`  - ${test.description}: Expected ${test.shouldFail ? 'failure' : 'success'}, got ${test.success ? 'success' : 'failure'}`);
        });
    }

    console.log('\n🎯 Validation System Status:');
    const validationTests = this.results.tests.filter(t => t.shouldFail);
    const validationPassed = validationTests.filter(t => !t.success).length;
    console.log(`  - Correctly blocked invalid requests: ${validationPassed}/${validationTests.length}`);
    
    const successTests = this.results.tests.filter(t => !t.shouldFail);
    const successPassed = successTests.filter(t => t.success).length;
    console.log(`  - Correctly allowed valid requests: ${successPassed}/${successTests.length}`);
  }
}

// Run the tests
async function main() {
  const tester = new RpcValidationTester();
  
  try {
    await tester.initialize();
    await tester.runTests();
    tester.printSummary();
    
    process.exit(tester.results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 