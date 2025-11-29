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

# Function to clone target repository to temp directory
clone_target_repo_to_temp() {
    local temp_dir="$1"
    if [ -n "$TARGET_GITHUB_REPO" ]; then
        echo "Found TARGET_GITHUB_REPO: $TARGET_GITHUB_REPO"
        echo "Cloning target repository to temp directory..."
        
        cd /tmp
        if clone_repo_with_auth "$TARGET_GITHUB_REPO" "$TARGET_GITHUB_TOKEN" "$temp_dir" "true"; then
            echo "Successfully cloned target repository to temp directory"
            sudo chown -R coder:coder "$temp_dir"
            return 0
        else
            echo "⚠️ Target repository clone failed"
            return 1
        fi
    else
        echo "ℹ️ No TARGET_GITHUB_REPO specified, skipping target repo clone"
        return 1
    fi
}

# Function to commit and push submission directory to target repo from temp directory
commit_and_push_submission_dir() {
    local temp_dir="$1"
    if [ -n "$TARGET_GITHUB_REPO" ] && [ -d "$temp_dir/.git" ]; then
        local submission_dir="${SUBMISSION_DIR:-submission}"
        local submission_path="$temp_dir/$submission_dir"
        
        # Only proceed if submission directory exists and has content
        if [ -d "$submission_path" ] && [ "$(ls -A "$submission_path" 2>/dev/null)" ]; then
            echo "Committing and pushing $submission_dir to target repository from temp directory..."
            
            # Prepare commit message
            local commit_message="Upload project template"
            
            # Run git commands as coder user
            sudo -u coder bash <<EOF
cd "$temp_dir"

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

# Function to clone template repository into temp directory's submission subdirectory
# This copies the contents (excluding .git) so they can be committed to TARGET_GITHUB_REPO
clone_template_repo_to_temp() {
    local temp_dir="$1"
    if [ -n "$GITHUB_REPO" ]; then
        echo "Found GITHUB_REPO: $GITHUB_REPO"
        
        # Determine submission directory name
        local submission_dir="${SUBMISSION_DIR:-submission}"
        local submission_path="$temp_dir/$submission_dir"
        
        echo "Cloning template repository contents into $submission_path..."
        
        # Ensure parent directory exists
        sudo mkdir -p "$submission_path"
        sudo chown coder:coder "$submission_path"
        
        cd /tmp
        if clone_repo_with_auth "$GITHUB_REPO" "$GITHUB_TOKEN" temp_template_repo "false"; then
            # Copy contents excluding .git directory so files can be committed to TARGET_GITHUB_REPO
            # Use rsync if available (preferred), otherwise use cp with explicit exclusion
            if command -v rsync >/dev/null 2>&1; then
                sudo rsync -a --exclude='.git' temp_template_repo/ "$submission_path/"
            else
                # Fallback: use shopt to handle hidden files and copy everything except .git
                (
                    cd temp_template_repo
                    shopt -s dotglob nullglob
                    for item in *; do
                        if [ "$item" != ".git" ]; then
                            sudo cp -r "$item" "$submission_path/"
                        fi
                    done
                )
            fi
            
            # Clean up temp directory
            rm -rf temp_template_repo
            
            # Ensure correct ownership
            sudo chown -R coder:coder "$submission_path"
            echo "Successfully copied template repository contents into $submission_dir (ready to commit to target repo)"
            return 0
        else
            echo "⚠️ Submission repository clone failed"
            return 1
        fi
    else
        echo "ℹ️ No GITHUB_REPO specified, skipping template repo clone"
        return 1
    fi
}

# Function to copy submission directory contents from temp to project directory
copy_submission_to_project() {
    local temp_dir="$1"
    local submission_dir="${SUBMISSION_DIR:-submission}"
    local temp_submission_path="$temp_dir/$submission_dir"
    local project_path="/home/coder/project"
    
    if [ -d "$temp_submission_path" ] && [ "$(ls -A "$temp_submission_path" 2>/dev/null)" ]; then
        echo "Copying contents of $submission_dir from temp directory to /home/coder/project/..."
        
        # Ensure project directory exists
        sudo mkdir -p "$project_path"
        
        # Copy contents directly into project directory (not into a subdirectory)
        # Use rsync if available, otherwise use cp
        if command -v rsync >/dev/null 2>&1; then
            sudo rsync -a "$temp_submission_path/" "$project_path/"
        else
            # Fallback: use cp with shopt to handle hidden files
            (
                cd "$temp_submission_path"
                shopt -s dotglob nullglob
                for item in *; do
                    sudo cp -r "$item" "$project_path/"
                done
            )
        fi
        
        # Ensure correct ownership
        sudo chown -R coder:coder "$project_path"
        echo "Successfully copied $submission_dir contents to /home/coder/project/"
    else
        echo "ℹ️ Submission directory $submission_dir is empty or doesn't exist in temp directory, nothing to copy"
    fi
}

# Main workflow: clone to temp directory, commit/push, then copy submission to project
TEMP_WORK_DIR="/tmp/target_repo_work_$$"

# Only proceed if project directory is empty
if [ ! "$(ls -A /home/coder/project 2>/dev/null)" ]; then
    # Clone target repository to temp directory
    if clone_target_repo_to_temp "$TEMP_WORK_DIR"; then
        # Clone template repository into temp directory's submission subdirectory
        clone_template_repo_to_temp "$TEMP_WORK_DIR" || echo "⚠️ Template repo clone failed, continuing anyway..."
        
        # Commit and push from temp directory
        commit_and_push_submission_dir "$TEMP_WORK_DIR" || echo "⚠️ Failed to commit/push, continuing anyway..."
        
        # Copy only submission directory contents to project directory
        copy_submission_to_project "$TEMP_WORK_DIR"
        
        # Clean up temp directory
        rm -rf "$TEMP_WORK_DIR"
        echo "Cleaned up temp work directory"
    else
        echo "⚠️ Target repository clone failed, project directory will remain empty"
    fi
else
    echo "Project directory not empty, skipping repository operations"
fi

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