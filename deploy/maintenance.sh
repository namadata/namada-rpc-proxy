#!/bin/bash

# Namada RPC Proxy Maintenance Script
# Simple maintenance script for regular updates (can be used in cron)

set -e

# Configuration
SERVICE_NAME="namada-rpc-proxy"
SERVICE_DIR="/home/namada-rpc-proxy/namada-rpc-proxy"
LOG_FILE="/var/log/namada-rpc-proxy-maintenance.log"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root."
    exit 1
fi

log "Starting maintenance check..."

# Check if service directory exists
if [[ ! -d "$SERVICE_DIR" ]]; then
    log "ERROR: Service directory not found: $SERVICE_DIR"
    exit 1
fi

cd "$SERVICE_DIR"

# Check for updates
log "Checking for updates..."
git fetch origin >/dev/null 2>&1

CURRENT_COMMIT=$(git rev-parse HEAD)
LATEST_COMMIT=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)

if [[ "$CURRENT_COMMIT" == "$LATEST_COMMIT" ]]; then
    log "No updates available"
    
    # Check service health
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Service is running normally"
        
        # Quick health check
        if curl -f -s http://localhost:3001/health >/dev/null 2>&1; then
            log "Health check passed"
            exit 0
        else
            log "WARNING: Health check failed, restarting service"
            systemctl restart "$SERVICE_NAME"
            sleep 5
            if curl -f -s http://localhost:3001/health >/dev/null 2>&1; then
                log "Service restarted successfully"
            else
                log "ERROR: Service restart failed"
                exit 1
            fi
        fi
    else
        log "WARNING: Service is not running, starting it"
        systemctl start "$SERVICE_NAME"
        sleep 5
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            log "Service started successfully"
        else
            log "ERROR: Failed to start service"
            exit 1
        fi
    fi
else
    log "Updates available - running full update script"
    exec /home/namada-rpc-proxy/namada-rpc-proxy/deploy/update.sh
fi 