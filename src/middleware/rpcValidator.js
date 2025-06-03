const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * RPC Request Validator
 * Validates incoming RPC requests against the CometBFT OpenAPI specification
 * to prevent invalid requests from being forwarded to RPC endpoints
 */
class RpcValidator {
  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true, 
      strict: false,
      coerceTypes: true  // Enable type coercion for query parameters
    });
    addFormats(this.ajv);
    this.openApiSpec = null;
    this.pathValidators = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the validator by loading and parsing the OpenAPI spec
   */
  async initialize() {
    try {
      const specPath = path.join(__dirname, '../../openapi.yaml');
      const specContent = fs.readFileSync(specPath, 'utf8');
      this.openApiSpec = yaml.load(specContent);
      
      this.buildValidators();
      this.initialized = true;
      
      logger.info('RPC Validator initialized successfully', {
        pathCount: this.pathValidators.size
      });
    } catch (error) {
      logger.error('Failed to initialize RPC Validator', { error: error.message });
      throw error;
    }
  }

  /**
   * Build AJV validators for each endpoint
   */
  buildValidators() {
    if (!this.openApiSpec.paths) return;

    for (const [pathPattern, pathObj] of Object.entries(this.openApiSpec.paths)) {
      for (const [method, operationObj] of Object.entries(pathObj)) {
        if (method.toLowerCase() === 'get') {
          // Build schema for parameters (empty schema if no parameters)
          const schema = operationObj.parameters 
            ? this.buildParameterSchema(operationObj.parameters)
            : { type: 'object', properties: {}, required: [] };
          
          const validator = this.ajv.compile(schema);
          
          this.pathValidators.set(`${method.toUpperCase()}:${pathPattern}`, {
            validator,
            operation: operationObj,
            pathPattern
          });
        }
      }
    }
  }

  /**
   * Build JSON schema for query parameters
   */
  buildParameterSchema(parameters) {
    const schema = {
      type: 'object',
      properties: {},
      required: []
    };

    for (const param of parameters) {
      if (param.in === 'query') {
        schema.properties[param.name] = param.schema;
        
        if (param.required) {
          schema.required.push(param.name);
        }
      }
    }

    return schema;
  }

  /**
   * Validate a request against the OpenAPI specification
   */
  validateRequest(method, rpcPath, queryParams = {}) {
    if (!this.initialized) {
      return { valid: true }; // Skip validation if not initialized
    }

    // Find matching validator
    const validatorKey = `${method.toUpperCase()}:/${rpcPath}`;
    const validatorInfo = this.pathValidators.get(validatorKey);

    if (!validatorInfo) {
      // Check if this is a valid endpoint that exists in the spec
      const pathExists = Object.keys(this.openApiSpec.paths).includes(`/${rpcPath}`);
      
      if (pathExists) {
        return {
          valid: false,
          error: `HTTP method ${method} not supported for endpoint /${rpcPath}`,
          code: 'METHOD_NOT_ALLOWED',
          statusCode: 405
        };
      } else {
        return {
          valid: false,
          error: `Unknown RPC endpoint: /${rpcPath}`,
          code: 'ENDPOINT_NOT_FOUND',
          statusCode: 404,
          suggestion: this.suggestSimilarEndpoint(rpcPath)
        };
      }
    }

    // Validate query parameters
    const isValid = validatorInfo.validator(queryParams);
    
    if (!isValid) {
      const errors = validatorInfo.validator.errors.map(error => ({
        field: error.instancePath ? error.instancePath.replace('/', '') : error.params?.missingProperty || 'unknown',
        message: error.message,
        rejectedValue: error.data
      }));

      return {
        valid: false,
        error: 'Invalid request parameters',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: errors,
        operation: validatorInfo.operation
      };
    }

    return { valid: true, operation: validatorInfo.operation };
  }

  /**
   * Suggest similar endpoints for typos
   */
  suggestSimilarEndpoint(rpcPath) {
    const availableEndpoints = Object.keys(this.openApiSpec.paths || {})
      .map(path => path.replace('/', ''));
    
    // Simple string similarity check
    const suggestions = availableEndpoints.filter(endpoint => {
      const similarity = this.calculateSimilarity(rpcPath, endpoint);
      return similarity > 0.6; // 60% similarity threshold
    });

    return suggestions.length > 0 ? suggestions[0] : null;
  }

  /**
   * Calculate string similarity (simple Levenshtein ratio)
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get list of available endpoints
   */
  getAvailableEndpoints() {
    if (!this.openApiSpec.paths) return [];
    
    return Object.entries(this.openApiSpec.paths).map(([path, pathObj]) => {
      const methods = Object.keys(pathObj).filter(key => 
        ['get', 'post', 'put', 'delete', 'patch'].includes(key.toLowerCase())
      );
      
      return {
        path: path.replace('/', ''),
        methods: methods.map(m => m.toUpperCase()),
        summary: pathObj[methods[0]]?.summary || 'No description available'
      };
    });
  }

  /**
   * Get endpoint information
   */
  getEndpointInfo(rpcPath) {
    const pathKey = `/${rpcPath}`;
    const pathObj = this.openApiSpec.paths?.[pathKey];
    
    if (!pathObj) return null;
    
    const methods = Object.keys(pathObj).filter(key => 
      ['get', 'post', 'put', 'delete', 'patch'].includes(key.toLowerCase())
    );
    
    return {
      path: rpcPath,
      methods: methods.map(m => m.toUpperCase()),
      operations: methods.map(method => ({
        method: method.toUpperCase(),
        summary: pathObj[method].summary,
        description: pathObj[method].description,
        parameters: pathObj[method].parameters || []
      }))
    };
  }
}

// Create singleton instance
const rpcValidator = new RpcValidator();

/**
 * Express middleware for RPC validation
 */
const validateRpcRequest = (req, res, next) => {
  // Extract RPC path from request
  const fullPath = req.path;
  let rpcPath = '';
  
  if (fullPath.startsWith('/namada/archive/')) {
    rpcPath = fullPath.replace('/namada/archive/', '');
  } else if (fullPath.startsWith('/namada/')) {
    rpcPath = fullPath.replace('/namada/', '');
  } else if (fullPath.startsWith('/housefiretestnet/archive/')) {
    rpcPath = fullPath.replace('/housefiretestnet/archive/', '');
  } else if (fullPath.startsWith('/housefiretestnet/')) {
    rpcPath = fullPath.replace('/housefiretestnet/', '');
  } else {
    // Not an RPC request, skip validation
    return next();
  }

  // Skip validation for health endpoints and root
  if (!rpcPath || rpcPath === '' || fullPath.startsWith('/health')) {
    return next();
  }

  const validation = rpcValidator.validateRequest(req.method, rpcPath, req.query);
  
  if (!validation.valid) {
    logger.warn('RPC request validation failed', {
      path: fullPath,
      rpcPath,
      method: req.method,
      error: validation.error,
      code: validation.code,
      queryParams: req.query
    });

    const errorResponse = {
      error: validation.error,
      code: validation.code,
      path: fullPath,
      rpcEndpoint: rpcPath,
      timestamp: new Date().toISOString()
    };

    // Add helpful information based on error type
    if (validation.code === 'VALIDATION_ERROR' && validation.details) {
      errorResponse.details = validation.details;
      errorResponse.requiredParameters = validation.operation?.parameters
        ?.filter(p => p.required)
        .map(p => ({
          name: p.name,
          description: p.description,
          type: p.schema?.type || 'string',
          example: p.schema?.example
        }));
    }

    if (validation.suggestion) {
      errorResponse.suggestion = `Did you mean '${validation.suggestion}'?`;
    }

    if (validation.code === 'ENDPOINT_NOT_FOUND') {
      errorResponse.availableEndpoints = rpcValidator.getAvailableEndpoints()
        .slice(0, 10) // Limit to 10 suggestions
        .map(ep => ep.path);
    }

    return res.status(validation.statusCode || 400).json(errorResponse);
  }

  // Add validation info to request for downstream use
  req.rpcValidation = validation;
  next();
};

module.exports = {
  rpcValidator,
  validateRpcRequest
}; 