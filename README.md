# Namada RPC Proxy

A high-performance, production-ready multi-chain CometBFT RPC proxy and load balancer for Namada mainnet and testnets. This system automatically monitors RPC endpoint health and intelligently routes requests to the most responsive and synchronized nodes.

Live Endpoint: https://namacall.namadata.xyz

## 🏗️ System Overview

```
Internet → Nginx (SSL, Rate Limiting) → Node.js App → Namada RPC Endpoints
```

### Supported Networks
- **Namada Mainnet**: `/namada/*` and `/namada/archive/*`
- **Housefire Testnet**: `/housefiretestnet/*` and `/housefiretestnet/archive/*`

### Key Features
- ✅ **Multi-chain concurrent support** with isolated health monitoring
- ✅ **Automatic RPC discovery** from Luminara Hub registry  
- ✅ **Intelligent load balancing** with circuit breakers
- ✅ **Archive node detection** and routing
- ✅ **Request validation** against CometBFT OpenAPI specification
- ✅ **Production-ready** systemd service with security hardening
- ✅ **SSL/TLS termination** with modern security headers
- ✅ **Rate limiting** and DDoS protection
- ✅ **Comprehensive monitoring** and health checks

## 🔒 Security

### Network Security
- **Firewall**: Only SSH, HTTP, and HTTPS ports open
- **SSL/TLS**: A+ rated configuration with HSTS
- **Rate Limiting**: DDoS protection at nginx level
- **Request Validation**: Invalid requests blocked before forwarding

### Application Security  
- **Dedicated User**: Isolated system user with minimal privileges
- **Filesystem Protection**: Read-only access with restricted paths
- **Resource Limits**: Memory and CPU usage caps
- **Input Validation**: All RPC requests validated against OpenAPI spec

### Monitoring Security
- **Internal Endpoints**: Detailed metrics only on localhost
- **Access Logs**: Comprehensive request logging
- **Error Tracking**: Structured error logging with correlation IDs

## 📚 API Documentation

### RPC Endpoints

**Namada Mainnet:**
- `POST/GET /namada/{rpc_method}` - Standard RPC endpoints
- `POST/GET /namada/archive/{rpc_method}` - Archive node endpoints

**Housefire Testnet:**  
- `POST/GET /housefiretestnet/{rpc_method}` - Standard RPC endpoints
- `POST/GET /housefiretestnet/archive/{rpc_method}` - Archive node endpoints

### Available RPC Methods

All CometBFT RPC methods are supported:
- `status`, `health`, `net_info` - Node information
- `block`, `block_by_hash`, `blockchain` - Block data  
- `tx`, `tx_search`, `block_search` - Transaction queries
- `validators`, `consensus_params` - Network parameters
- `abci_query`, `abci_info` - Application queries
- `broadcast_tx_*` - Transaction broadcasting

### Request Validation

Requests are validated against the CometBFT OpenAPI specification:
- ✅ **Parameter Types**: Automatic type coercion and validation
- ✅ **Required Fields**: Missing parameters are rejected with helpful errors
- ✅ **Method Support**: Only supported HTTP methods allowed
- ✅ **Endpoint Discovery**: Typo suggestions for invalid endpoints

## 🎯 Production Deployment

This setup is production-ready with:

- **99.9% Uptime Target**: Auto-restart, health monitoring, circuit breakers
- **High Performance**: Connection pooling, efficient load balancing  
- **Security Hardened**: Modern TLS, security headers, input validation
- **Scalable**: Easy horizontal scaling with multiple instances
- **Observable**: Comprehensive logging, metrics, and monitoring
- **Maintainable**: Automated updates, log rotation, SSL renewal


## 🚀 Quick Installation (Ubuntu/Debian)

### Prerequisites

Fresh Ubuntu 20.04+ or Debian 11+ server with:
- Root access
- Domain name pointed to your server (`namacall.namadata.xyz`)
- Minimum 2GB RAM, 2 CPU cores, 20GB disk

### One-Command Installation

```bash
# Clone and install
git clone https://github.com/namadata/namada-rpc-proxy.git
cd namada-rpc-proxy
chmod +x deploy/install.sh
sudo ./deploy/install.sh
```

The installer will:
1. ✅ Install Node.js 18+ and nginx
2. ✅ Create dedicated `namada-rpc-proxy` system user
3. ✅ Install and configure the application
4. ✅ Set up systemd service with security hardening
5. ✅ Configure nginx with rate limiting and security headers
6. ✅ Start the service automatically

### Post-Installation Steps

1. **Configure SSL certificate:**
```bash
sudo certbot --nginx -d namacall.namadata.xyz
```

2. **Verify installation:**
```bash
# Check service status
sudo systemctl status namada-rpc-proxy

# Test endpoints
curl https://namacall.namadata.xyz/health
curl https://namacall.namadata.xyz/namada/status
```

## 📋 Manual Installation Guide

### Step 1: System Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install nginx and other dependencies
sudo apt install -y nginx git curl certbot python3-certbot-nginx ufw

# Configure firewall
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

### Step 2: Create Service User

```bash
# Create dedicated user
sudo useradd --system --create-home --shell /bin/bash namada-rpc-proxy

# Create installation directory
sudo mkdir -p /home/namada-rpc-proxy/namada-rpc-proxy
sudo chown namada-rpc-proxy:namada-rpc-proxy /home/namada-rpc-proxy/namada-rpc-proxy
```

### Step 3: Install Application

```bash
# Clone repository
git clone https://github.com/your-repo/namada-rpc-proxy.git /tmp/namada-rpc-proxy

# Copy files to service directory
sudo cp -r /tmp/namada-rpc-proxy/* /home/namada-rpc-proxy/namada-rpc-proxy/
sudo chown -R namada-rpc-proxy:namada-rpc-proxy /home/namada-rpc-proxy/namada-rpc-proxy

# Install dependencies
cd /home/namada-rpc-proxy/namada-rpc-proxy
sudo -u namada-rpc-proxy npm install --production
```

### Step 4: Configure Environment

```bash
# Create environment file
sudo cp deploy/production.env /home/namada-rpc-proxy/namada-rpc-proxy/.env
sudo chown namada-rpc-proxy:namada-rpc-proxy /home/namada-rpc-proxy/namada-rpc-proxy/.env

# Edit configuration (optional)
sudo nano /home/namada-rpc-proxy/namada-rpc-proxy/.env
```

### Step 5: Install Systemd Service

```bash
# Install service file
sudo cp deploy/namada-rpc-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable namada-rpc-proxy
sudo systemctl start namada-rpc-proxy

# Verify service
sudo systemctl status namada-rpc-proxy
```

### Step 6: Configure Nginx

```bash
# Install nginx configuration
sudo cp deploy/nginx-namada-rpc-proxy.conf /etc/nginx/sites-available/namada-rpc-proxy
sudo ln -s /etc/nginx/sites-available/namada-rpc-proxy /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7: Setup SSL

```bash
# Install SSL certificate
sudo certbot --nginx -d namacall.namadata.xyz

# Verify SSL setup
sudo certbot certificates
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Server
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Health Monitoring  
HEALTH_CHECK_INTERVAL=30000      # 30 seconds
REGISTRY_UPDATE_INTERVAL=600000  # 10 minutes
SYNC_TOLERANCE_BLOCKS=50         # Block sync tolerance

# Performance
REQUEST_TIMEOUT=30000            # 30 second timeout
REQUEST_RETRY_ATTEMPTS=3         # Retry failed requests
CONNECTION_POOL_SIZE=50          # HTTP connection pool

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100      # Per minute per IP
```

### Nginx Configuration

The nginx setup includes:
- **SSL/TLS**: Let's Encrypt integration with A+ security rating
- **Rate Limiting**: 10 req/s for RPC, 1 req/s for health checks  
- **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- **CORS**: Proper headers for web application integration
- **Monitoring**: Internal localhost:8080 for detailed metrics

### Systemd Service

Security features:
- **Isolated User**: Runs as dedicated `namada-rpc-proxy` user
- **Filesystem Protection**: Read-only access except for logs
- **Resource Limits**: Memory (1GB) and CPU (200%) caps
- **Network Restrictions**: Only allowed address families
- **Auto-restart**: Automatic recovery from failures

## 📊 Monitoring & Health Checks

### Health Endpoints

- `GET /health` - Basic service health
- `GET /health/detailed` - Detailed chain status (internal only)
- `GET /health/metrics` - Performance metrics (internal only)
- `GET /health/chains/:chainKey` - Individual chain status
- `GET /health/rpc-endpoints` - Available RPC endpoints

### Monitoring Commands

```bash
# Service status
sudo systemctl status namada-rpc-proxy
sudo journalctl -u namada-rpc-proxy -f

# Resource usage
sudo systemctl show namada-rpc-proxy --property=MemoryCurrent,CPUUsageNSec

# Nginx logs
sudo tail -f /var/log/nginx/namada-rpc-proxy.access.log
sudo tail -f /var/log/nginx/namada-rpc-proxy.error.log

# Test endpoints
curl https://namacall.namadata.xyz/health
curl https://namacall.namadata.xyz/namada/status
curl https://namacall.namadata.xyz/housefiretestnet/status
```

## 🛠️ Maintenance

### Update Scripts

The system includes automated update scripts for easy maintenance:

#### Manual Updates
```bash
# Full interactive update with prompts
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/update.sh

# Simple maintenance check (for cron)
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/maintenance.sh
```

#### Automatic Updates
The installer can set up daily automatic maintenance checks:
- **Schedule**: Daily at 2 AM
- **Function**: Checks for updates and applies them automatically
- **Logging**: Writes to `/var/log/namada-rpc-proxy-maintenance.log`
- **Safety**: Only updates if available, includes rollback capability

```bash
# View maintenance logs
sudo tail -f /var/log/namada-rpc-proxy-maintenance.log

# Manually trigger maintenance check
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/maintenance.sh
```

### Update Script Features

The update script includes:
- ✅ **Pre-update validation** (service status, nginx config, disk space)
- ✅ **Automatic backup creation** with timestamp
- ✅ **Git-based updates** with version tracking
- ✅ **Dependency management** (npm ci --production)
- ✅ **Configuration change detection** (nginx, systemd, env)
- ✅ **Health checks** post-update
- ✅ **Automatic rollback** on failure
- ✅ **Backup cleanup** (keeps last 5 backups)

### Regular Tasks

```bash
# Update application (interactive)
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/update.sh

# Quick maintenance check
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/maintenance.sh

# SSL certificate renewal (automatic)
sudo certbot renew --dry-run

# Check SSL certificate status
sudo certbot certificates

# Manual certificate renewal
sudo certbot --nginx -d namacall.namadata.xyz

# Log rotation (automatic via logrotate)
# - Systemd journal: automatic cleanup
# - Application logs: 30-day rotation  
# - Nginx logs: logrotate handles this
# - Maintenance logs: weekly rotation
```

### Troubleshooting

```bash
# Service won't start
sudo journalctl -u namada-rpc-proxy --no-pager
sudo systemctl status namada-rpc-proxy

# Nginx issues  
sudo nginx -t
sudo systemctl status nginx

# Performance issues
htop
sudo netstat -tlnp | grep :3001
```

### Common Issues

**Node.js Out Of Memory (OOM) Errors:**
If you see "MemoryChunk allocation failed during deserialization" errors, this is caused by the `MemoryDenyWriteExecute=yes` systemd security restriction being incompatible with Node.js JIT compilation. Our service configuration has this disabled for Node.js compatibility while maintaining other security protections.

**Port Conflicts:**
The service runs on port 3001 by default. If you see `EADDRINUSE` errors, check what's using the port:
```bash
sudo netstat -tlnp | grep :3001
```

### Request Validation

Requests are validated against the CometBFT OpenAPI specification:
- ✅ **Parameter Types**: Automatic type coercion and validation
- ✅ **Required Fields**: Missing parameters are rejected with helpful errors
- ✅ **Method Support**: Only supported HTTP methods allowed
- ✅ **Endpoint Discovery**: Typo suggestions for invalid endpoints

## 🎯 Production Deployment

This setup is production-ready with:

- **99.9% Uptime Target**: Auto-restart, health monitoring, circuit breakers
- **High Performance**: Connection pooling, efficient load balancing  
- **Security Hardened**: Modern TLS, security headers, input validation
- **Scalable**: Easy horizontal scaling with multiple instances
- **Observable**: Comprehensive logging, metrics, and monitoring
- **Maintainable**: Automated updates, log rotation, SSL renewal

## 📞 Support

For issues and questions:
1. Check service logs: `sudo journalctl -u namada-rpc-proxy -f`
2. Verify configuration: `sudo nginx -t` 
3. Test endpoints: `curl https://namacall.namadata.xyz/health`
4. Review documentation: `/deploy/README.md`
5. Open GitHub issue with logs and error details

## 📄 License

[MIT License](LICENSE) - See LICENSE file for details.

---

**Live Endpoint**: `https://namacall.namadata.xyz`

Built with ❤️ for the Namada ecosystem. 
