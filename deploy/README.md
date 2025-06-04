# Namada RPC Proxy - Deployment Guide

This directory contains all the deployment scripts and configurations for the Namada RPC Proxy.

## 📁 Files Overview

### Deployment Scripts
- **`install.sh`** - Complete installation script for fresh deployments
- **`update.sh`** - Interactive update script with rollback capability  
- **`maintenance.sh`** - Automated maintenance script for cron jobs

### Configuration Files
- **`namada-rpc-proxy.service`** - Systemd service configuration
- **`nginx-namada-rpc-proxy.conf`** - Nginx reverse proxy configuration
- **`production.env`** - Environment variables template

## 🚀 Installation

### Fresh Installation

For a complete fresh installation on Ubuntu/Debian:

```bash
# Clone repository
git clone https://github.com/your-repo/namada-rpc-proxy.git
cd namada-rpc-proxy

# Run installation (requires root)
sudo ./deploy/install.sh
```

The installer will:
1. Install Node.js 18+, nginx, and dependencies
2. Create dedicated `namada-rpc-proxy` system user
3. Set up systemd service with security hardening
4. Configure nginx with SSL placeholder and rate limiting
5. Start the service and verify operation
6. Optionally set up automatic daily maintenance

### Post-Installation SSL Setup

```bash
# Install Let's Encrypt certificate
sudo certbot --nginx -d namacall.namadata.xyz

# Verify SSL setup
curl -I https://namacall.namadata.xyz/health
```

## 🔄 Updates & Maintenance

### Interactive Update Script (`update.sh`)

Full-featured update script with safety features:

```bash
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/update.sh
```

**Features:**
- Pre-update validation (service status, nginx config, disk space)
- Automatic backup creation with timestamp
- Git-based updates with version tracking
- Dependency management (npm ci --production)  
- Configuration change detection (nginx, systemd, env)
- Interactive prompts for configuration updates
- Post-update health checks
- Automatic rollback on failure
- Backup cleanup (keeps last 5 backups)

**Example Update Session:**
```
🔄 Namada RPC Proxy Update Script
=================================
✓ Service is running
✓ Nginx configuration is valid
✓ Sufficient disk space available
💾 Backup created: /home/namada-rpc-proxy/backups/backup_20240101_120000
🔄 Updates available: abc1234 → def5678
🛑 Stopping service...
📦 Dependencies updated
⚙️ Configuration changes detected
🚀 Service started successfully
🔍 Health check passed
✓ Update completed successfully!
```

### Automated Maintenance Script (`maintenance.sh`)

Lightweight script for automated daily checks:

```bash
sudo /home/namada-rpc-proxy/namada-rpc-proxy/deploy/maintenance.sh
```

**Features:**
- Check for available updates
- Service health monitoring
- Automatic service restart if unhealthy
- If updates available, runs full update script
- Suitable for cron jobs (no interactive prompts)
- Comprehensive logging

**Automatic Setup:**
The installer can configure daily maintenance at 2 AM:
```bash
# View cron job
sudo crontab -l | grep maintenance

# View maintenance logs
sudo tail -f /var/log/namada-rpc-proxy-maintenance.log
```

**Log Rotation:**
Maintenance logs are automatically rotated weekly (keep 4 weeks).

## 🔧 Configuration Management

### Environment Variables

Template: `production.env` → `.env`

Key variables:
```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
HEALTH_CHECK_INTERVAL=30000
REGISTRY_UPDATE_INTERVAL=600000
SYNC_TOLERANCE_BLOCKS=50
REQUEST_TIMEOUT=30000
RATE_LIMIT_MAX_REQUESTS=100
```

### Systemd Service

**Configuration**: `namada-rpc-proxy.service`
- Security hardening (NoNewPrivileges, ProtectSystem, etc.)
- Resource limits (1GB memory, 200% CPU)
- Automatic restart with 10-second delay
- Proper logging to systemd journal

**Management:**
```bash
# Service status
sudo systemctl status namada-rpc-proxy

# View logs
sudo journalctl -u namada-rpc-proxy -f

# Restart service
sudo systemctl restart namada-rpc-proxy
```

### Nginx Configuration

**Configuration**: `nginx-namada-rpc-proxy.conf`
- SSL/TLS with modern security (A+ rating)
- Rate limiting (10 req/s RPC, 1 req/s health)
- Security headers (HSTS, CSP, X-Frame-Options)
- CORS support for web applications
- Internal monitoring endpoints (localhost only)

**Domain Setup:**
1. Update server_name in nginx config: `namacall.namadata.xyz`
2. Install SSL certificate: `sudo certbot --nginx -d namacall.namadata.xyz`
3. Test configuration: `sudo nginx -t`
4. Reload nginx: `sudo systemctl reload nginx`

## 🔒 Security Features

### System Security
- **Dedicated User**: Runs as `namada-rpc-proxy` system user
- **Filesystem Protection**: Read-only access except logs directory
- **Network Restrictions**: Limited address families (AF_UNIX, AF_INET, AF_INET6)
- **Resource Limits**: Memory and CPU usage caps
- **No Privilege Escalation**: NoNewPrivileges=yes

### Network Security
- **Modern TLS**: TLS 1.2+ with secure cipher suites
- **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- **Rate Limiting**: DDoS protection at nginx level
- **Request Validation**: RPC request validation before forwarding

### Update Security
- **Backup System**: Automatic rollback on failed updates
- **Pre-update Validation**: Comprehensive safety checks
- **Configuration Isolation**: Prompts before config changes
- **Health Verification**: Post-update service validation

## 📊 Monitoring

### Health Endpoints

**Public:**
- `GET /health` - Basic service health
- `GET /health/chains/{chainKey}` - Individual chain status

**Internal (localhost:8080):**
- `GET /health/detailed` - Comprehensive status
- `GET /health/metrics` - Performance metrics
- `GET /nginx_status` - Nginx statistics

### Logs

**Service Logs:**
```bash
# Real-time service logs
sudo journalctl -u namada-rfc-proxy -f

# Application logs
sudo tail -f /home/namada-rpc-proxy/namada-rpc-proxy/logs/app.log
```

**Nginx Logs:**
```bash
# Access logs
sudo tail -f /var/log/nginx/namada-rpc-proxy.access.log

# Error logs  
sudo tail -f /var/log/nginx/namada-rpc-proxy.error.log
```

**Maintenance Logs:**
```bash
# Maintenance script logs
sudo tail -f /var/log/namada-rpc-proxy-maintenance.log
```

## 🚨 Troubleshooting

### Common Issues

**Service Won't Start:**
```bash
# Check service status
sudo systemctl status namada-rpc-proxy

# View detailed logs
sudo journalctl -u namada-rpc-proxy --no-pager

# Check configuration
sudo nano /home/namada-rpc-proxy/namada-rpc-proxy/.env
```

**Nginx Issues:**
```bash
# Test nginx configuration
sudo nginx -t

# Check nginx status
sudo systemctl status nginx

# View nginx error logs
sudo tail -f /var/log/nginx/error.log
```

**Update Failures:**
```bash
# Check last backup
ls -la /home/namada-rpc-proxy/backups/

# Manual rollback
sudo systemctl stop namada-rpc-proxy
sudo rm -rf /home/namada-rpc-proxy/namada-rpc-proxy
sudo cp -r /home/namada-rpc-proxy/backups/backup_TIMESTAMP /home/namada-rpc-proxy/namada-rpc-proxy
sudo chown -R namada-rpc-proxy:namada-rpc-proxy /home/namada-rpc-proxy/namada-rpc-proxy
sudo systemctl start namada-rpc-proxy
```

**SSL Certificate Issues:**
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew

# Test SSL configuration
curl -I https://namacall.namadata.xyz/health
```

### Performance Issues

**High Memory Usage:**
```bash
# Check service memory usage
sudo systemctl show namada-rpc-proxy --property=MemoryCurrent

# Restart service to clear memory
sudo systemctl restart namada-rpc-proxy
```

**High CPU Usage:**
```bash
# Check process status
htop -p $(pgrep -f namada-rpc-proxy)

# Check service resource limits
sudo systemctl show namada-rpc-proxy --property=CPUQuota
```

**Network Issues:**
```bash
# Check listening ports
sudo netstat -tlnp | grep :3000

# Test internal connectivity
curl -f http://localhost:3000/health

# Check nginx upstream
sudo nginx -T | grep upstream
```

## 🔄 Migration & Backup

### Backup Strategy

**Automatic Backups:**
- Created before every update
- Stored in `/home/namada-rpc-proxy/backups/`
- Timestamped directories
- Automatic cleanup (keeps last 5)

**Manual Backup:**
```bash
# Create manual backup
sudo cp -r /home/namada-rpc-proxy/namada-rpc-proxy /home/namada-rpc-proxy/backups/manual_$(date +%Y%m%d_%H%M%S)
```

### Migration to New Server

```bash
# On old server - create backup
sudo tar -czf namada-rpc-proxy-backup.tar.gz -C /home/namada-rpc-proxy namada-rpc-proxy

# On new server - extract and install
sudo tar -xzf namada-rpc-proxy-backup.tar.gz -C /home/namada-rpc-proxy/
sudo ./deploy/install.sh
```

## 📚 Best Practices

### Regular Maintenance
1. **Enable automatic maintenance** during installation
2. **Monitor maintenance logs** weekly
3. **Test SSL certificate renewal** monthly
4. **Review service logs** for errors
5. **Check backup retention** policy

### Security Updates
1. **Keep system packages updated**: `sudo apt update && sudo apt upgrade`
2. **Monitor security advisories** for Node.js and nginx
3. **Review nginx security headers** periodically
4. **Audit service permissions** quarterly

### Performance Optimization
1. **Monitor resource usage** trends
2. **Adjust rate limits** based on usage patterns
3. **Review log retention** settings
4. **Optimize nginx buffer sizes** if needed

### Disaster Recovery
1. **Test backup/restore procedure** monthly
2. **Document recovery steps** for your team
3. **Maintain off-site configuration backups**
4. **Practice SSL certificate recovery**

---

For additional support, check the main [README.md](../README.md) or create an issue in the repository. 