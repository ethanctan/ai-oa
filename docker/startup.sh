#!/bin/bash
set -e

echo "Starting simplified AI OA code-server container..."

# Ensure project directory exists with correct permissions
sudo mkdir -p /home/coder/project
sudo chown coder:coder /home/coder/project

# Helper function to clone a repository with authentication
clone_repo_with_auth() {
    local repo_url="$1"
    local token="$2"
    local target_dir="$3"
    local use_sparse="${4:-false}"
    
    if [ "$use_sparse" = "true" ]; then
        local clone_cmd="git clone --sparse --depth 1"
    else
        local clone_cmd="git clone --depth 1"
    fi

    if [ -n "$token" ]; then
        echo "Using GitHub token for authentication"
        # Build x-access-token URL for HTTPS cloning (works for PATs and GitHub App tokens)
        if [[ "$repo_url" == https://* ]]; then
            REPO_URL_NO_PROTOCOL="${repo_url#https://}"
        else
            REPO_URL_NO_PROTOCOL="$repo_url"
        fi
        AUTHENTICATED_URL="https://x-access-token:${token}@${REPO_URL_NO_PROTOCOL}"
        if $clone_cmd "$AUTHENTICATED_URL" "$target_dir"; then
            echo "Successfully cloned repository with x-access-token"
            return 0
        else
            echo "⚠️ Failed to clone with token, trying without..."
            if $clone_cmd "$repo_url" "$target_dir"; then
                echo "Successfully cloned repository without token"
                return 0
            else
                echo "Repository clone failed"
                return 1
            fi
        fi
    else
        echo "🔓 Cloning repository without authentication"
        if $clone_cmd "$repo_url" "$target_dir"; then
            echo "Successfully cloned repository"
            return 0
        else
            echo "⚠️ Repository clone failed"
            return 1
        fi
    fi
}

# Function to clone target repository if needed
clone_target_repo_if_needed() {
    if [ -n "$TARGET_GITHUB_REPO" ]; then
        echo "Found TARGET_GITHUB_REPO: $TARGET_GITHUB_REPO"
        
        # Only clone if project directory is empty
        if [ ! "$(ls -A /home/coder/project 2>/dev/null)" ]; then
            echo "Project directory is empty, cloning target repository..."
            
            cd /home/coder
            if clone_repo_with_auth "$TARGET_GITHUB_REPO" "$TARGET_GITHUB_TOKEN" temp_repo "true"; then
                sudo mv temp_repo/* /home/coder/project/ 2>/dev/null || true
                sudo mv temp_repo/.* /home/coder/project/ 2>/dev/null || true
                rm -rf temp_repo
            else
                echo "⚠️ Target repository clone failed, continuing anyway..."
            fi
            
            # Ensure correct ownership
            sudo chown -R coder:coder /home/coder/project
        else
            echo "Project directory not empty, skipping target repo clone"
        fi
    else
        echo "ℹ️ No TARGET_GITHUB_REPO specified, skipping target repo clone"
    fi
}

# Function to commit and push submission directory to target repo
commit_and_push_submission_dir() {
    if [ -n "$TARGET_GITHUB_REPO" ] && [ -d "/home/coder/project/.git" ]; then
        local submission_dir="${SUBMISSION_DIR:-submission}"
        local submission_path="/home/coder/project/$submission_dir"
        
        # Only proceed if submission directory exists and has content
        if [ -d "$submission_path" ] && [ "$(ls -A "$submission_path" 2>/dev/null)" ]; then
            echo "Committing and pushing $submission_dir to target repository..."
            
            # Prepare commit message
            local commit_message="Upload project template"
            
            # Run git commands as coder user
            sudo -u coder bash <<EOF
cd /home/coder/project

# Configure git user if not already configured
if [ -z "\$(git config user.name)" ]; then
    git config user.name "AI OA System" || true
fi
if [ -z "\$(git config user.email)" ]; then
    git config user.email "ai-oa-system@localhost" || true
fi

# Add the submission directory
git add --sparse "$submission_dir" || {
    echo "⚠️ Failed to git add $submission_dir"
    exit 1
}

# Commit the changes
git commit -m "$commit_message" || {
    echo "⚠️ Failed to commit (may be no changes to commit)"
    exit 0  # Not an error if there's nothing to commit
}

# Set up remote URL with authentication if token is provided
if [ -n "$TARGET_GITHUB_TOKEN" ]; then
    repo_url_no_protocol=""
    if [[ "$TARGET_GITHUB_REPO" == https://* ]]; then
        repo_url_no_protocol="${TARGET_GITHUB_REPO#https://}"
    else
        repo_url_no_protocol="$TARGET_GITHUB_REPO"
    fi
    authenticated_url="https://x-access-token:${TARGET_GITHUB_TOKEN}@\${repo_url_no_protocol}"
    git remote set-url origin "\$authenticated_url" || git remote add origin "\$authenticated_url" || true
fi

# Push to target repository
git push origin HEAD || {
    echo "⚠️ Failed to push to target repository"
    exit 1
}

echo "Successfully committed and pushed $submission_dir to target repository"
EOF
        else
            echo "ℹ️ Submission directory $submission_dir is empty or doesn't exist, skipping commit/push"
        fi
    else
        echo "ℹ️ Target repository not configured or not a git repository, skipping commit/push"
    fi
}

# Function to clone template repository into subdirectory if needed
# This copies the contents (excluding .git) so they can be committed to TARGET_GITHUB_REPO
clone_template_repo_if_needed() {
    if [ -n "$GITHUB_REPO" ]; then
        echo "Found GITHUB_REPO: $GITHUB_REPO"
        
        # Determine submission directory name
        local submission_dir="${SUBMISSION_DIR:-submission}"
        local submission_path="/home/coder/project/$submission_dir"
        
        # Only clone if submission directory doesn't exist or is empty
        if [ ! -d "$submission_path" ] || [ ! "$(ls -A "$submission_path" 2>/dev/null)" ]; then
            echo "Cloning template repository contents into $submission_path..."
            
            # Ensure parent directory exists
            sudo mkdir -p "$submission_path"
            sudo chown coder:coder "$submission_path"
            
            cd /home/coder
            if clone_repo_with_auth "$GITHUB_REPO" "$GITHUB_TOKEN" temp_submission "false"; then
                # Copy contents excluding .git directory so files can be committed to TARGET_GITHUB_REPO
                # Use rsync if available (preferred), otherwise use cp with explicit exclusion
                if command -v rsync >/dev/null 2>&1; then
                    sudo rsync -a --exclude='.git' temp_submission/ "$submission_path/"
                else
                    # Fallback: use shopt to handle hidden files and copy everything except .git
                    (
                        cd temp_submission
                        shopt -s dotglob nullglob
                        for item in *; do
                            if [ "$item" != ".git" ]; then
                                sudo cp -r "$item" "$submission_path/"
                            fi
                        done
                    )
                fi
                
                # Clean up temp directory
                rm -rf temp_submission
                
                # Ensure correct ownership
                sudo chown -R coder:coder "$submission_path"
                echo "Successfully copied template repository contents into $submission_dir (ready to commit to target repo)"
                
                # Commit and push to target repository
                commit_and_push_submission_dir || echo "⚠️ Failed to commit/push submission directory, continuing anyway..."
            else
                echo "⚠️ Submission repository clone failed, continuing anyway..."
            fi
        else
            echo "Submission directory $submission_dir not empty, skipping clone"
        fi
    else
        echo "ℹ️ No GITHUB_REPO specified, skipping template repo clone"
    fi
}

# Clone repositories as root (for permissions)
# First clone the target repo, then clone the submission repo into a subdirectory
clone_target_repo_if_needed
clone_template_repo_if_needed

echo "Starting code-server on HTTP port 80..."

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
    --disable-workspace-trust \
    /home/coder/project