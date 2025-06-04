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

# Check prerequisites
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

# Update service file with correct user and paths
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
sed "s|User=ubuntu|User=$SERVICE_USER|g; s|Group=ubuntu|Group=$SERVICE_USER|g; s|/home/ubuntu/namada-rpc-proxy|$INSTALL_DIR|g" \
    "$INSTALL_DIR/deploy/namada-rpc-proxy.service" > "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
print_status "Systemd service installed and enabled"

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