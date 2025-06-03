# Namada RPC Proxy

A performant, publicly accessible CometBFT RPC proxy and load balancer for Namada mainnet and testnets. The system automatically monitors RPC endpoint health and intelligently routes requests to the most responsive and synchronized nodes.

## Features

- **Multi-Chain Support**: Concurrent support for Namada mainnet and testnets
- **Intelligent Load Balancing**: Weighted round-robin with performance-based routing
- **Health Monitoring**: Automatic RPC endpoint health checks and sync status tracking
- **Archive Node Support**: Dedicated routing for archive node requests
- **Circuit Breaker Pattern**: Automatic failure detection and recovery
- **High Availability**: 99.9% uptime target with graceful degradation
- **CORS Enabled**: Full cross-origin request support for web applications
- **Comprehensive Monitoring**: Detailed metrics and health status endpoints
- **Professional Logging**: Structured logging with rotation and component separation

## Architecture

### Multi-Chain Concurrent Design
The system runs multiple network instances concurrently from a single deployment, with each chain maintaining its own isolated health monitoring, load balancing, and RPC pools.

### Base URL Structure
- **Service Domain**: `namacall.namadata.xyz`
- **Mainnet Endpoint**: `/namada/{rpc_query}`
- **Testnet Endpoint**: `/housefiretestnet/{rpc_query}`
- **Archive Node Option**: `/namada/archive/{rpc_query}` or `/housefiretestnet/archive/{rpc_query}`

## Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd namada-rpc-proxy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp config.env.example .env
   # Edit .env with your configuration
   ```

4. **Start the service**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

The service will be available at `http://localhost:3000`

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Service Configuration
SERVICE_DOMAIN=namacall.namadata.xyz

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30000      # 30 seconds
REGISTRY_UPDATE_INTERVAL=600000   # 10 minutes
SYNC_THRESHOLD=50                # blocks

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=info
LOG_MAX_FILES=30
LOG_MAX_SIZE=100m

# Registry URLs
MAINNET_REGISTRY_URL=https://raw.githubusercontent.com/Luminara-Hub/namada-ecosystem/main/user-and-dev-tools/mainnet/rpc.json
TESTNET_REGISTRY_URL=https://raw.githubusercontent.com/Luminara-Hub/namada-ecosystem/main/user-and-dev-tools/testnet/housefire/rpc.json

# Request Configuration
REQUEST_TIMEOUT=10000            # 10 seconds
HEALTH_CHECK_TIMEOUT=5000        # 5 seconds
```

## API Usage

### RPC Endpoints

#### Mainnet
```bash
# Regular RPC calls
POST /namada/status
POST /namada/abci_query

# Archive node calls
POST /namada/archive/block?height=1
POST /namada/archive/blockchain?minHeight=1&maxHeight=100
```

#### Testnet
```bash
# Regular RPC calls
POST /housefiretestnet/status
POST /housefiretestnet/abci_query

# Archive node calls
POST /housefiretestnet/archive/block?height=1
POST /housefiretestnet/archive/blockchain?minHeight=1&maxHeight=100
```

### Example Usage

#### Check Node Status
```bash
curl -X POST http://localhost:3000/namada/status
```

#### Submit Transaction
```bash
curl -X POST http://localhost:3000/namada/broadcast_tx_commit \
  -H "Content-Type: application/json" \
  -d '{"tx": "your_transaction_data"}'
```

#### Archive Query
```bash
curl -X POST http://localhost:3000/namada/archive/block \
  -H "Content-Type: application/json" \
  -d '{"height": "1"}'
```

### Health Check Endpoints

#### Basic Health Check
```bash
GET /health
```

#### Detailed Health Information
```bash
GET /health/detailed
```

#### Chain-Specific Status
```bash
GET /health/chains/mainnet
GET /health/chains/testnet
```

#### Performance Metrics
```bash
GET /health/metrics
```

#### Force Registry Refresh
```bash
POST /health/refresh
POST /health/chains/mainnet/refresh
```

## Monitoring

### Health Status Response
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "summary": {
    "totalChains": 2,
    "healthyChains": 2,
    "totalRpcs": 15,
    "healthyRpcs": 12
  },
  "chains": {
    "mainnet": {
      "status": "healthy",
      "rpcs": {
        "total": 8,
        "healthy": 6,
        "archive": 2
      },
      "blockHeight": 1234567
    }
  }
}
```

### Metrics Response
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "chains": {
    "mainnet": {
      "totalRequests": 10000,
      "successfulRequests": 9950,
      "failedRequests": 50,
      "averageResponseTime": 150,
      "successRate": 99.5
    }
  }
}
```

## Development

### Project Structure
```
src/
├── config/           # Configuration management
├── core/            # Core business logic
│   ├── MultiChainManager.js
│   ├── ChainInstance.js
│   ├── HealthMonitor.js
│   ├── LoadBalancer.js
│   └── RegistryManager.js
├── middleware/      # Express middleware
├── routes/          # Route handlers
├── utils/           # Utilities and helpers
└── index.js         # Application entry point
```

### Scripts
```bash
npm start           # Start production server
npm run dev         # Start development server with hot reload
npm test            # Run tests
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues
```

### Adding New Chains

1. Add chain configuration to `src/config/config.js`:
```javascript
newchain: {
  name: 'newchain',
  displayName: 'New Chain',
  registryUrl: 'https://example.com/registry.json',
  basePath: '/newchain',
  archivePath: '/newchain/archive'
}
```

2. The system will automatically initialize the new chain on startup.

## Deployment

### Docker Deployment

1. **Build Docker image**
   ```bash
   docker build -t namada-rpc-proxy .
   ```

2. **Run container**
   ```bash
   docker run -p 3000:3000 \
     -e NODE_ENV=production \
     -e PORT=3000 \
     namada-rpc-proxy
   ```

### Production Deployment

#### Using PM2
```bash
npm install -g pm2
pm2 start src/index.js --name namada-rpc-proxy
pm2 startup
pm2 save
```

#### Using systemd
Create `/etc/systemd/system/namada-rpc-proxy.service`:
```ini
[Unit]
Description=Namada RPC Proxy
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/namada-rpc-proxy
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Nginx Configuration

```nginx
upstream namada_rpc_proxy {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name namacall.namadata.xyz;

    location / {
        proxy_pass http://namada_rpc_proxy;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 30s;
    }
}
```

### Kubernetes Deployment

See `k8s/` directory for Kubernetes manifests including:
- Deployment configuration
- Service definition
- ConfigMap for environment variables
- Ingress configuration

## Performance

### Benchmarks
- **Latency**: Sub-100ms average response time
- **Throughput**: 1000+ requests per minute per chain
- **Availability**: 99.9% uptime target
- **Scalability**: Horizontal scaling support

### Optimization Tips
1. **Connection Pooling**: Automatic HTTP connection reuse
2. **Circuit Breakers**: Prevent cascade failures
3. **Load Balancing**: Performance-based RPC selection
4. **Caching**: Response caching for static queries
5. **Monitoring**: Real-time performance tracking

## Troubleshooting

### Common Issues

#### Service Not Starting
```bash
# Check logs
npm run dev

# Verify configuration
node -e "console.log(require('./src/config/config'))"
```

#### No Healthy RPCs
- Check registry URLs are accessible
- Verify RPC endpoints are responding
- Review health check logs

#### High Response Times
- Monitor RPC endpoint performance
- Check network connectivity
- Review load balancer metrics

### Debugging

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

Check health status:
```bash
curl http://localhost:3000/health/detailed
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Code Style
- Follow ESLint configuration
- Use meaningful variable names
- Add JSDoc comments for functions
- Maintain test coverage

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Open an issue on GitHub
- Check the troubleshooting guide
- Review the API documentation

## Acknowledgments

- Namada Protocol team
- Luminara Hub for registry maintenance
- CometBFT for the RPC specification 