#!/bin/bash
set -e

echo "🚀 Starting simplified AI OA code-server container..."

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
                # Build x-access-token URL for HTTPS cloning (works for PATs and GitHub App tokens)
                if [[ "$GITHUB_REPO" == https://* ]]; then
                    REPO_URL_NO_PROTOCOL="${GITHUB_REPO#https://}"
                else
                    REPO_URL_NO_PROTOCOL="$GITHUB_REPO"
                fi
                AUTHENTICATED_URL="https://x-access-token:${GITHUB_TOKEN}@${REPO_URL_NO_PROTOCOL}"
                if git clone "$AUTHENTICATED_URL" temp_repo; then
                    echo "✅ Successfully cloned repository with x-access-token"
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
exec sudo -u coder \
    INSTANCE_ID="$INSTANCE_ID" \
    INITIAL_PROMPT="$INITIAL_PROMPT" \
    FINAL_PROMPT="$FINAL_PROMPT" \
    ASSESSMENT_PROMPT="$ASSESSMENT_PROMPT" \
    ENABLE_INITIAL_TIMER="$ENABLE_INITIAL_TIMER" \
    INITIAL_DURATION_MINUTES="$INITIAL_DURATION_MINUTES" \
    ENABLE_PROJECT_TIMER="$ENABLE_PROJECT_TIMER" \
    PROJECT_DURATION_MINUTES="$PROJECT_DURATION_MINUTES" \
    SERVER_URL="$SERVER_URL" \
    code-server \
    --auth none \
    --bind-addr 0.0.0.0:80 \
    --disable-telemetry \
    --disable-update-check \
    /home/coder/project