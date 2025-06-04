#!/bin/bash

# Namada RPC Proxy Update Script
# This script safely updates the deployed service with rollback capability

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="namada-rpc-proxy"
SERVICE_USER="namada-rpc-proxy"
SERVICE_DIR="/home/${SERVICE_USER}/namada-rpc-proxy"
BACKUP_DIR="/home/${SERVICE_USER}/backups"
TEMP_DIR="/tmp/namada-rpc-proxy-update"
NGINX_CONFIG="/etc/nginx/sites-available/namada-rpc-proxy"

# Get current timestamp for backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/backup_${TIMESTAMP}"

echo -e "${BLUE}🔄 Namada RPC Proxy Update Script${NC}"
echo -e "${BLUE}=================================${NC}"
echo "Service: $SERVICE_NAME"
echo "Service Directory: $SERVICE_DIR"
echo "Backup Directory: $BACKUP_PATH"
echo ""

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Function to rollback on failure
rollback() {
    print_error "Update failed! Rolling back to previous version..."
    
    if [[ -d "$BACKUP_PATH" ]]; then
        print_info "Stopping service..."
        systemctl stop "$SERVICE_NAME" || true
        
        print_info "Restoring files from backup..."
        rm -rf "$SERVICE_DIR"
        cp -r "$BACKUP_PATH" "$SERVICE_DIR"
        chown -R "$SERVICE_USER:$SERVICE_USER" "$SERVICE_DIR"
        
        print_info "Starting service..."
        systemctl start "$SERVICE_NAME"
        
        print_warning "Rollback completed. Service restored to previous version."
    else
        print_error "No backup found for rollback!"
    fi
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    exit 1
}

# Set trap for errors
trap rollback ERR

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root."
    print_info "Please run: sudo $0"
    exit 1
fi

# Check if service directory exists
if [[ ! -d "$SERVICE_DIR" ]]; then
    print_error "Service directory not found: $SERVICE_DIR"
    print_error "Please run the install script first."
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$BACKUP_DIR"

# Pre-update checks
echo -e "${BLUE}📋 Pre-update Checks${NC}"

# Check service status
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    print_warning "Service is not currently running"
    SERVICE_WAS_STOPPED=true
else
    print_status "Service is running"
    SERVICE_WAS_STOPPED=false
fi

# Check nginx status
if ! nginx -t >/dev/null 2>&1; then
    print_error "Nginx configuration has errors. Please fix before updating."
    exit 1
fi
print_status "Nginx configuration is valid"

# Check disk space (need at least 1GB free)
AVAILABLE_SPACE=$(df "$SERVICE_DIR" | tail -1 | awk '{print $4}')
if [[ $AVAILABLE_SPACE -lt 1048576 ]]; then  # 1GB in KB
    print_error "Insufficient disk space. Need at least 1GB free."
    exit 1
fi
print_status "Sufficient disk space available"

# Create backup
echo -e "\n${BLUE}💾 Creating Backup${NC}"
print_info "Backing up current installation to: $BACKUP_PATH"
cp -r "$SERVICE_DIR" "$BACKUP_PATH"
print_status "Backup created successfully"

# Get current version info
cd "$SERVICE_DIR"
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
print_info "Current version: $CURRENT_BRANCH@${CURRENT_COMMIT:0:8}"

# Fetch latest changes
echo -e "\n${BLUE}🔄 Fetching Updates${NC}"
print_info "Fetching latest changes from repository..."

# Check if we're in a git repository
if [[ ! -d ".git" ]]; then
    print_error "Not a git repository. Cannot update automatically."
    print_info "Please reinstall using the installation script."
    exit 1
fi

# Fetch and check for updates
git fetch origin
LATEST_COMMIT=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)

if [[ "$CURRENT_COMMIT" == "$LATEST_COMMIT" ]]; then
    print_status "Already up to date!"
    
    # Ask if user wants to continue anyway (for dependency updates, etc.)
    read -p "Force update anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Update cancelled."
        rm -rf "$BACKUP_PATH"
        exit 0
    fi
else
    print_status "Updates available"
    print_info "Latest version: ${LATEST_COMMIT:0:8}"
fi

# Pull latest changes
print_info "Pulling latest changes..."
git pull origin $(git branch --show-current)
NEW_COMMIT=$(git rev-parse HEAD)
print_status "Updated to: ${NEW_COMMIT:0:8}"

# Stop the service
echo -e "\n${BLUE}🛑 Stopping Service${NC}"
if ! $SERVICE_WAS_STOPPED; then
    print_info "Stopping $SERVICE_NAME service..."
    systemctl stop "$SERVICE_NAME"
    print_status "Service stopped"
fi

# Update dependencies
echo -e "\n${BLUE}📦 Updating Dependencies${NC}"
print_info "Installing/updating npm dependencies..."
sudo -u "$SERVICE_USER" npm ci --production
print_status "Dependencies updated"

# Check for configuration changes
echo -e "\n${BLUE}⚙️ Checking Configuration${NC}"

# Check if nginx config was updated
if [[ -f "deploy/nginx-namada-rpc-proxy.conf" ]]; then
    if ! diff -q "$NGINX_CONFIG" "deploy/nginx-namada-rpc-proxy.conf" >/dev/null 2>&1; then
        print_warning "Nginx configuration has been updated"
        read -p "Update nginx configuration? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "deploy/nginx-namada-rpc-proxy.conf" "$NGINX_CONFIG"
            nginx -t && systemctl reload nginx
            print_status "Nginx configuration updated"
        fi
    fi
fi

# Check if systemd service was updated
if [[ -f "deploy/namada-rpc-proxy.service" ]]; then
    if ! diff -q "/etc/systemd/system/namada-rpc-proxy.service" "deploy/namada-rpc-proxy.service" >/dev/null 2>&1; then
        print_warning "Systemd service configuration has been updated"
        print_info "This update includes Node.js compatibility fixes (MemoryDenyWriteExecute disabled)"
        read -p "Update systemd service? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "deploy/namada-rpc-proxy.service" "/etc/systemd/system/"
            systemctl daemon-reload
            print_status "Systemd service updated"
        fi
    fi
fi

# Check if .env needs updates
if [[ -f "deploy/production.env" ]] && [[ -f ".env" ]]; then
    print_info "Checking for new environment variables..."
    
    # Extract variable names from both files
    NEW_VARS=$(grep -E '^[A-Z_]+=.*' deploy/production.env | cut -d= -f1 | sort)
    CURRENT_VARS=$(grep -E '^[A-Z_]+=.*' .env | cut -d= -f1 | sort)
    
    # Find missing variables
    MISSING_VARS=$(comm -23 <(echo "$NEW_VARS") <(echo "$CURRENT_VARS"))
    
    if [[ -n "$MISSING_VARS" ]]; then
        print_warning "New environment variables found:"
        echo "$MISSING_VARS"
        print_info "Please review and add these to your .env file if needed"
    else
        print_status "Environment configuration is up to date"
    fi
fi

# Update file permissions
echo -e "\n${BLUE}🔧 Updating Permissions${NC}"
chown -R "$SERVICE_USER:$SERVICE_USER" "$SERVICE_DIR"
chmod +x "$SERVICE_DIR/deploy"/*.sh 2>/dev/null || true
print_status "Permissions updated"

# Start the service
echo -e "\n${BLUE}🚀 Starting Service${NC}"
print_info "Starting $SERVICE_NAME service..."
systemctl start "$SERVICE_NAME"

# Wait a moment for service to start
sleep 3

# Verify service is running
if systemctl is-active --quiet "$SERVICE_NAME"; then
    print_status "Service started successfully"
else
    print_error "Service failed to start!"
    rollback
fi

# Health check
echo -e "\n${BLUE}🔍 Health Check${NC}"
print_info "Performing health check..."

# Wait for service to be ready
sleep 5

# Test health endpoint
if curl -f -s http://localhost:3001/health >/dev/null; then
    print_status "Health check passed"
else
    print_error "Health check failed!"
    rollback
fi

# Test RPC endpoints
if curl -f -s http://localhost:3001/namada/status >/dev/null; then
    print_status "RPC endpoints responding"
else
    print_warning "RPC endpoints may be initializing (this is normal)"
fi

# Cleanup old backups (keep last 5)
echo -e "\n${BLUE}🧹 Cleanup${NC}"
print_info "Cleaning up old backups..."
cd "$BACKUP_DIR"
ls -t | tail -n +6 | xargs -r rm -rf
print_status "Old backups cleaned up"

# Remove temp directory
rm -rf "$TEMP_DIR"

# Final status
echo -e "\n${BLUE}📊 Update Summary${NC}"
echo "Previous version: $CURRENT_BRANCH@${CURRENT_COMMIT:0:8}"
echo "Current version:  $(git -C "$SERVICE_DIR" branch --show-current)@${NEW_COMMIT:0:8}"
echo "Backup location:  $BACKUP_PATH"
echo "Service status:   $(systemctl is-active "$SERVICE_NAME")"
echo ""

print_status "Update completed successfully!"
echo ""
print_info "Useful commands:"
echo "  Service status:  sudo systemctl status $SERVICE_NAME"
echo "  Service logs:    sudo journalctl -u $SERVICE_NAME -f"
echo "  Health check:    curl http://localhost:3001/health"
echo "  Rollback:        sudo systemctl stop $SERVICE_NAME && sudo rm -rf $SERVICE_DIR && sudo cp -r $BACKUP_PATH $SERVICE_DIR && sudo chown -R $SERVICE_USER:$SERVICE_USER $SERVICE_DIR && sudo systemctl start $SERVICE_NAME" 