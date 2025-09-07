#!/bin/bash
set -e

echo "[DEPRECATED] simple-startup.sh is deprecated. Use startup.sh instead."

# Ensure project directory exists with correct permissions
sudo mkdir -p /home/coder/project
sudo chown coder:coder /home/coder/project

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
                AUTHENTICATED_URL="https://x-access-token:${GITHUB_TOKEN}@${REPO_URL_NO_PROTOCOL}"
                
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

echo "📡 Starting code-server on HTTP port 80..."

# Start code-server directly on port 80 (nginx proxy handles HTTPS)
# Pass environment variables needed by the VS Code extension
exec /usr/local/bin/startup.sh

