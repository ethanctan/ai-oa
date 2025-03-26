import os
import subprocess
import shutil
from pathlib import Path

def clone_repo(repo_url, target_dir, token=None):
    """
    Clone a git repository to a target directory
    
    Args:
        repo_url (str): The URL of the repository to clone
        target_dir (str): Path to the directory where to clone
        token (str, optional): GitHub token for private repos
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Create target directory if it doesn't exist
        Path(target_dir).mkdir(parents=True, exist_ok=True)
        
        # Prepare git clone command
        if token and repo_url.startswith('https://'):
            # Insert token into URL for private repos
            parts = repo_url.split('://')
            repo_url = f"{parts[0]}://{token}@{parts[1]}"
        
        # Execute git clone
        subprocess.run(
            ['git', 'clone', repo_url, target_dir],
            check=True,
            capture_output=True,
            text=True
        )
        
        return True
    except subprocess.CalledProcessError as e:
        print(f"Git clone error: {e.stderr}")
        # Clean up directory if clone failed
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
        return False
    except Exception as e:
        print(f"Error cloning repository: {str(e)}")
        # Clean up directory if clone failed
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
        return False 