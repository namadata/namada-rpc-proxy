#!/bin/bash

# Namada RPC Proxy Deployment Script
# This script sets up the systemd service and nginx configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="namada-rpc-proxy"
NGINX_SITE_NAME="namada-rpc-proxy"
SERVICE_USER="namada-rpc-proxy"
SERVICE_HOME="/home/${SERVICE_USER}"
INSTALL_DIR="${SERVICE_HOME}/namada-rpc-proxy"

echo -e "${BLUE}🚀 Namada RPC Proxy Deployment Script${NC}"
echo -e "${BLUE}=====================================${NC}"
echo "Project Directory: $PROJECT_DIR"
echo "Service User: $SERVICE_USER"
echo "Install Directory: $INSTALL_DIR"
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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root to create system user and install services."
    print_info "Please run: sudo $0"
    exit 1
fi

# Important warning about overwriting existing configuration
echo -e "${YELLOW}⚠️  IMPORTANT WARNING ⚠️${NC}"
echo -e "${YELLOW}========================${NC}"
echo ""
print_warning "This installation script will:"
echo "  • Overwrite existing nginx configuration with HTTP-only setup"
echo "  • Replace any existing SSL/HTTPS configuration"
echo "  • Reset the service to default configuration"
echo ""

# Check for existing SSL certificates
SSL_EXISTS=false
HTTPS_CONFIG_EXISTS=false

if [[ -d "/etc/letsencrypt/live" ]]; then
    SSL_DOMAINS=$(ls /etc/letsencrypt/live/ 2>/dev/null | grep -v README)
    if [[ -n "$SSL_DOMAINS" ]]; then
        SSL_EXISTS=true
        print_warning "Found existing SSL certificates for: $SSL_DOMAINS"
    fi
fi

# Check for existing HTTPS nginx config
if [[ -f "/etc/nginx/sites-available/namada-rpc-proxy" ]]; then
    if grep -q "listen 443 ssl" "/etc/nginx/sites-available/namada-rpc-proxy" 2>/dev/null; then
        HTTPS_CONFIG_EXISTS=true
        print_warning "Found existing HTTPS configuration in nginx"
    fi
fi

if [[ "$SSL_EXISTS" == true ]] || [[ "$HTTPS_CONFIG_EXISTS" == true ]]; then
    echo ""
    print_error "EXISTING SSL/HTTPS SETUP DETECTED!"
    echo "This script will replace your HTTPS configuration with HTTP-only setup."
    echo "After installation, you will need to:"
    echo "  1. Switch back to HTTPS config: sudo cp $INSTALL_DIR/deploy/nginx-namada-rpc-proxy.conf /etc/nginx/sites-available/namada-rpc-proxy"
    echo "  2. Update SSL paths in the config"
    echo "  3. Test and reload nginx: sudo nginx -t && sudo systemctl reload nginx"
    echo ""
    
    read -p "Do you want to continue and overwrite the existing setup? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installation cancelled by user."
        print_info "To update without overwriting nginx config, use: sudo $INSTALL_DIR/deploy/update.sh"
        exit 0
    fi
    
    print_warning "Proceeding with installation. Your SSL setup will be overwritten."
    echo ""
fi

# Additional confirmation for production systems
if systemctl is-active --quiet namada-rpc-proxy 2>/dev/null; then
    print_warning "Namada RPC Proxy service is currently running."
    read -p "This will stop and reconfigure the running service. Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installation cancelled by user."
        exit 0
    fi
fi

echo -e "${BLUE}📋 Checking Prerequisites${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi
print_status "Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi
print_status "npm found: $(npm --version)"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    print_warning "Nginx is not installed. Installing nginx..."
    apt-get update
    apt-get install -y nginx
fi
print_status "Nginx found: $(nginx -v 2>&1)"

# Create service user
echo -e "\n${BLUE}👤 Creating Service User${NC}"
if id "$SERVICE_USER" &>/dev/null; then
    print_warning "User $SERVICE_USER already exists"
else
    useradd --system --create-home --shell /bin/bash --comment "Namada RPC Proxy Service" "$SERVICE_USER"
    print_status "Created user: $SERVICE_USER"
fi

# Create install directory and copy files
echo -e "\n${BLUE}📁 Setting up Installation Directory${NC}"
if [[ -d "$INSTALL_DIR" ]]; then
    print_warning "Installation directory exists, backing up..."
    cp -r "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
fi

mkdir -p "$INSTALL_DIR"
cp -r "$PROJECT_DIR"/* "$INSTALL_DIR"/
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
print_status "Files copied to $INSTALL_DIR"

# Install dependencies
echo -e "\n${BLUE}📦 Installing Dependencies${NC}"
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm install --production
print_status "Dependencies installed"

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/logs"
print_status "Logs directory created"

# Setup environment configuration
echo -e "\n${BLUE}⚙️ Setting up Environment Configuration${NC}"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    cp "$INSTALL_DIR/deploy/production.env" "$INSTALL_DIR/.env"
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
    print_status "Environment file created from template"
    print_warning "Edit $INSTALL_DIR/.env with your specific configuration"
else
    print_warning ".env file already exists, skipping..."
fi

# Setup systemd service
echo -e "\n${BLUE}🔧 Setting up Systemd Service${NC}"

# Copy service file directly (already configured for the correct user and paths)
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
cp "$INSTALL_DIR/deploy/namada-rpc-proxy.service" "$SERVICE_FILE"

# Replace generic paths with actual install directory in service file
sed -i "s|/home/namada-rpc-proxy/namada-rpc-proxy|$INSTALL_DIR|g" "$SERVICE_FILE"

print_status "Systemd service installed (optimized for Node.js compatibility)"
print_info "Service configured with MemoryDenyWriteExecute disabled for Node.js JIT support"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
print_status "Systemd service enabled"

# Setup nginx configuration
echo -e "\n${BLUE}🌐 Setting up Nginx Configuration${NC}"
NGINX_CONFIG_FILE="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
cp "$INSTALL_DIR/deploy/nginx-namada-rpc-proxy-http.conf" "$NGINX_CONFIG_FILE"

# Enable nginx site
ln -sf "/etc/nginx/sites-available/${NGINX_SITE_NAME}" "/etc/nginx/sites-enabled/"
print_status "Nginx HTTP configuration installed"

# Test nginx configuration
if nginx -t; then
    print_status "Nginx configuration is valid"
else
    print_error "Nginx configuration has errors. Please check manually."
    exit 1
fi

# Start the service
echo -e "\n${BLUE}🚀 Starting Service${NC}"
systemctl start "$SERVICE_NAME"
sleep 3

if systemctl is-active --quiet "$SERVICE_NAME"; then
    print_status "Service started successfully"
else
    print_error "Service failed to start. Check logs with: journalctl -u $SERVICE_NAME"
fi

# Reload nginx
systemctl reload nginx
print_status "Nginx reloaded"

# SSL Setup reminder
echo -e "\n${BLUE}🔒 SSL Certificate Setup${NC}"
print_warning "IMPORTANT: SSL is not yet configured. The service is running on HTTP only."
print_info "To add SSL security, follow these steps:"
echo ""
echo "1. Install certbot (if not already installed):"
echo -e "${YELLOW}sudo apt install certbot python3-certbot-nginx${NC}"
echo ""
echo "2. Get SSL certificate for your domain:"
echo -e "${YELLOW}sudo certbot --nginx -d namacall.namadata.xyz${NC}"
echo ""
echo "3. (Optional) Switch to full HTTPS configuration:"
echo -e "${YELLOW}sudo cp $INSTALL_DIR/deploy/nginx-namada-rpc-proxy.conf $NGINX_CONFIG_FILE${NC}"
echo -e "${YELLOW}sudo nginx -t && sudo systemctl reload nginx${NC}"
echo ""
print_info "The current HTTP configuration will work for testing, but HTTPS is required for production."

# Firewall configuration
echo -e "${BLUE}🔥 Firewall Configuration${NC}"
if command -v ufw &> /dev/null; then
    print_info "Configuring UFW firewall..."
    ufw allow 'Nginx Full'
    print_status "Firewall rules updated"
else
    print_warning "UFW not found. Make sure ports 80 and 443 are open in your firewall"
fi

# Final status check
echo -e "\n${BLUE}🔍 Final Status Check${NC}"
echo "Service Status:"
systemctl status "$SERVICE_NAME" --no-pager -l

echo -e "\nNginx Status:"
nginx -t && echo "✓ Nginx configuration is valid" || echo "✗ Nginx configuration has errors"

echo -e "\n${BLUE}📝 Next Steps${NC}"
echo "1. Test the service: curl http://namacall.namadata.xyz/health"
echo "2. Install SSL certificate: sudo certbot --nginx -d namacall.namadata.xyz"
echo "3. Test with SSL: curl https://namacall.namadata.xyz/health"
echo "4. (Optional) Switch to full HTTPS config: sudo cp $INSTALL_DIR/deploy/nginx-namada-rpc-proxy.conf $NGINX_CONFIG_FILE"
echo "5. Edit environment if needed: nano $INSTALL_DIR/.env"
echo ""

echo -e "${BLUE}🔍 Useful Commands${NC}"
echo "Service status:           sudo systemctl status ${SERVICE_NAME}"
echo "Service logs:             sudo journalctl -u ${SERVICE_NAME} -f"
echo "Restart service:          sudo systemctl restart ${SERVICE_NAME}"
echo "Edit configuration:       sudo nano $INSTALL_DIR/.env"
echo "Edit nginx config:        sudo nano $NGINX_CONFIG_FILE"
echo "Test nginx:               sudo nginx -t"
echo "Reload nginx:             sudo systemctl reload nginx"
echo "View nginx logs:          sudo tail -f /var/log/nginx/namada-rpc-proxy.access.log"
echo ""

echo -e "${GREEN}🎉 Installation complete!${NC}"
echo "Your Namada RPC Proxy is now running as user '$SERVICE_USER'"
echo "Complete the SSL setup and domain configuration to finish."

# Reminder for users who had SSL certificates
if [[ "$SSL_EXISTS" == true ]] || [[ "$HTTPS_CONFIG_EXISTS" == true ]]; then
    echo ""
    echo -e "${YELLOW}🔒 SSL CONFIGURATION REMINDER${NC}"
    echo -e "${YELLOW}==============================${NC}"
    print_warning "You had existing SSL certificates. To restore HTTPS:"
    echo ""
    echo "1. Switch to HTTPS configuration:"
    echo -e "${BLUE}sudo cp $INSTALL_DIR/deploy/nginx-namada-rpc-proxy.conf /etc/nginx/sites-available/namada-rpc-proxy${NC}"
    echo ""
    echo "2. Update SSL certificate paths:"
    for domain in $SSL_DOMAINS; do
        echo -e "${BLUE}sudo sed -i 's|/etc/ssl/certs/ssl-cert-snakeoil.pem|/etc/letsencrypt/live/$domain/fullchain.pem|g' /etc/nginx/sites-available/namada-rpc-proxy${NC}"
        echo -e "${BLUE}sudo sed -i 's|/etc/ssl/private/ssl-cert-snakeoil.key|/etc/letsencrypt/live/$domain/privkey.pem|g' /etc/nginx/sites-available/namada-rpc-proxy${NC}"
        break # Only show for the first domain
    done
    echo ""
    echo "3. Test and reload nginx:"
    echo -e "${BLUE}sudo nginx -t && sudo systemctl reload nginx${NC}"
    echo ""
    echo "4. Test HTTPS:"
    echo -e "${BLUE}curl -I https://namacall.namadata.xyz/health${NC}"
    echo ""
fi

# Setup update scripts
echo -e "\n${BLUE}🔄 Setting up Update Scripts${NC}"
chmod +x "$INSTALL_DIR/deploy/update.sh"
chmod +x "$INSTALL_DIR/deploy/maintenance.sh"
print_status "Update scripts configured"

# Offer to setup automatic maintenance
echo -e "\n${BLUE}⏰ Automatic Maintenance Setup${NC}"
read -p "Would you like to set up automatic daily maintenance checks? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Create cron job for daily maintenance
    CRON_JOB="0 2 * * * $INSTALL_DIR/deploy/maintenance.sh >/dev/null 2>&1"
    
    # Check if cron job already exists
    if ! crontab -l 2>/dev/null | grep -q "maintenance.sh"; then
        (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
        print_status "Daily maintenance cron job added (runs at 2 AM)"
    else
        print_warning "Maintenance cron job already exists"
    fi
    
    # Create log rotation for maintenance logs
    cat > /etc/logrotate.d/namada-rpc-proxy << EOF
/var/log/namada-rpc-proxy-maintenance.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
    print_status "Log rotation configured for maintenance logs"
fi

echo -e "\n${BLUE}🔍 Update & Maintenance Commands${NC}"
echo "Update service:           sudo $INSTALL_DIR/deploy/update.sh"
echo "Maintenance check:        sudo $INSTALL_DIR/deploy/maintenance.sh"
echo "View maintenance logs:    sudo tail -f /var/log/namada-rpc-proxy-maintenance.log"

# Update file permissions
echo -e "\n${BLUE}🔧 Updating Permissions${NC}"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/deploy"/*.sh 2>/dev/null || true
print_status "Permissions updated" 