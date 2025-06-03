module.exports = {
  env: {
    browser: false,
    commonjs: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 12
  },
  rules: {
    // Code style
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'space-before-function-paren': ['error', 'never'],
    
    // Best practices
    'no-console': 'warn',
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Error prevention
    'no-undef': 'error',
    'no-unreachable': 'error',
    'no-duplicate-imports': 'error',
    
    // Allow console in specific files
    'no-console': ['warn', { 
      allow: ['warn', 'error', 'info'] 
    }],
    
    // Async/await
    'require-await': 'error',
    'no-return-await': 'error',
    
    // Object/Array formatting
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    
    // Function spacing
    'space-in-parens': ['error', 'never'],
    'func-call-spacing': ['error', 'never'],
    
    // Line length
    'max-len': ['warn', { 
      code: 100, 
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true
    }]
  },
  overrides: [
    {
      files: ['src/index.js'],
      rules: {
        'no-console': 'off'
      }
    },
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true
      },
      rules: {
        'no-unused-expressions': 'off'
      }
    }
  ]
}; 