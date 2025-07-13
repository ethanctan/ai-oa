#!/bin/bash
set -e

echo "🚀 Starting AI OA code-server container..."

# Ensure project directory exists with correct permissions
sudo mkdir -p /home/coder/project
sudo chown coder:coder /home/coder/project

# Create SSL directory and generate self-signed certificates
echo "🔒 Setting up SSL certificates..."
sudo mkdir -p /home/coder/.ssl
cd /home/coder/.ssl

# Generate self-signed certificate if it doesn't exist
if [ ! -f server.crt ] || [ ! -f server.key ]; then
    echo "📜 Generating self-signed SSL certificate..."
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout server.key \
        -out server.crt \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:167.99.52.130"
    
    # Set correct permissions
    sudo chown coder:coder server.crt server.key
    sudo chmod 600 server.key
    sudo chmod 644 server.crt
    
    echo "✅ SSL certificate generated successfully"
else
    echo "✅ SSL certificate already exists"
fi

# Function to clone repository if needed
clone_repo_if_needed() {
    if [ -n "$GITHUB_REPO" ]; then
        echo "📦 Found GITHUB_REPO: $GITHUB_REPO"
        
        # Only clone if project directory is empty
        if [ ! "$(ls -A /home/coder/project 2>/dev/null)" ]; then
            echo "📁 Project directory is empty, cloning repository..."
            
            cd /home/coder
            if [ -n "$GITHUB_TOKEN" ]; then
                echo "🔑 Using GitHub token for authentication"
                # Create URL with token
                if [[ "$GITHUB_REPO" == https://* ]]; then
                    REPO_URL_NO_PROTOCOL="${GITHUB_REPO#https://}"
                else
                    REPO_URL_NO_PROTOCOL="$GITHUB_REPO"
                fi
                AUTHENTICATED_URL="https://${GITHUB_TOKEN}@${REPO_URL_NO_PROTOCOL}"
                
                if git clone "$AUTHENTICATED_URL" temp_repo; then
                    echo "✅ Successfully cloned repository with token"
                    sudo mv temp_repo/* /home/coder/project/ 2>/dev/null || true
                    sudo mv temp_repo/.* /home/coder/project/ 2>/dev/null || true
                    rm -rf temp_repo
                else
                    echo "⚠️ Failed to clone with token, trying without..."
                    git clone "$GITHUB_REPO" temp_repo || echo "❌ Repository clone failed, continuing anyway..."
                    if [ -d temp_repo ]; then
                        sudo mv temp_repo/* /home/coder/project/ 2>/dev/null || true
                        sudo mv temp_repo/.* /home/coder/project/ 2>/dev/null || true
                        rm -rf temp_repo
                    fi
                fi
            else
                echo "🔓 Cloning repository without authentication"
                if git clone "$GITHUB_REPO" temp_repo; then
                    echo "✅ Successfully cloned repository"
                    sudo mv temp_repo/* /home/coder/project/ 2>/dev/null || true
                    sudo mv temp_repo/.* /home/coder/project/ 2>/dev/null || true
                    rm -rf temp_repo
                else
                    echo "⚠️ Repository clone failed, continuing anyway..."
                fi
            fi
            
            # Ensure correct ownership
            sudo chown -R coder:coder /home/coder/project
        else
            echo "📁 Project directory not empty, skipping clone"
        fi
    else
        echo "ℹ️ No GITHUB_REPO specified, skipping clone"
    fi
}

# Clone repository as root (for permissions)
clone_repo_if_needed

echo "🔧 Starting code-server with HTTPS..."

# Switch to coder user and start code-server with HTTPS
exec sudo -u coder code-server \
    --auth none \
    --bind-addr 0.0.0.0:8443 \
    --cert /home/coder/.ssl/server.crt \
    --cert-key /home/coder/.ssl/server.key \
    --disable-telemetry \
    --disable-update-check \
    /home/coder/project 