import os
import time
import docker
import subprocess
import shutil
import json
import tempfile # For temporary directories and files
import zipfile # For handling zip files
from pathlib import Path
from database.db import get_connection
from controllers.timer_controller import start_instance_timer
from pydantic import Field, BaseModel
from pydantic.json_schema import GenerateJsonSchema

# Base directory for project repositories
BASE_PROJECTS_DIR = Path(__file__).parent.parent / 'projects'

# Ensure projects directory exists
os.makedirs(BASE_PROJECTS_DIR, exist_ok=True)
print(f"Project directory set up at: {BASE_PROJECTS_DIR}")

def sanitize_name(name):
    """Sanitize a name for Docker container use"""
    return name.replace(' ', '-').replace('_', '-').lower()

def exec_command(command):
    """Execute a shell command and return result"""
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        raise Exception(f"Command failed: {e.stderr}")

async def clone_repo(repo_url, target_folder, token=None, exec_fn=None):
    """Clone a GitHub repository to the target folder"""
    # Create parent directory if it doesn't exist
    os.makedirs(os.path.dirname(target_folder), exist_ok=True)
    
    # Use token if provided
    if token:
        # Extract URL without protocol
        if repo_url.startswith('https://'):
            repo_url_without_protocol = repo_url[8:]
        else:
            repo_url_without_protocol = repo_url
        
        command = f"git clone https://{token}@{repo_url_without_protocol} {target_folder}"
    else:
        command = f"git clone {repo_url} {target_folder}"
    
    if exec_fn:
        return await exec_fn(command)
    else:
        return exec_command(command)

def get_all_instances():
    """Get all instances from the database and format them for the frontend"""
    # Connect to the database
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get all instances from the database
        cursor.execute('''
            SELECT ti.*, t.name as test_name, c.name as candidate_name, c.email as candidate_email
            FROM test_instances ti
            LEFT JOIN tests t ON ti.test_id = t.id
            LEFT JOIN candidates c ON ti.candidate_id = c.id
            WHERE ti.docker_instance_id != 'pending'
        ''')
        
        db_instances = [dict(row) for row in cursor.fetchall()]
        
        # Connect to Docker to get container info
        client = docker.from_env()
        
        # Get all running containers
        running_instances = []
        
        for db_instance in db_instances:
            try:
                # Try to get the container info
                container = client.containers.get(db_instance['docker_instance_id'])
                
                # If the container exists, format it for the frontend
                if container:
                    container_info = client.api.inspect_container(container.id)
                    
                    # Get container ports (similar to what Docker CLI would show)
                    ports = []
                    if 'NetworkSettings' in container_info and 'Ports' in container_info['NetworkSettings']:
                        for port_key, bindings in container_info['NetworkSettings']['Ports'].items():
                            if bindings:
                                for binding in bindings:
                                    ports.append({
                                        'PrivatePort': int(port_key.split('/')[0]),
                                        'PublicPort': int(binding['HostPort']),
                                        'Type': port_key.split('/')[1]
                                    })
                    
                    # Format the instance for the frontend
                    instance = {
                        'Id': container.id,
                        'Names': [f"/{container.name}"],  # Frontend expects an array of names with leading slash
                        'Image': container.image.tags[0] if container.image.tags else 'unknown',
                        'ImageID': container.image.id,
                        'Command': container_info.get('Config', {}).get('Cmd', [''])[0] if container_info.get('Config', {}).get('Cmd') else '',
                        'Created': container_info.get('Created', ''),
                        'Ports': ports,
                        'Status': container.status,
                        'State': container_info.get('State', {}),
                        # Add the DB fields as well
                        'test_id': db_instance['test_id'],
                        'candidate_id': db_instance['candidate_id'],
                        'test_name': db_instance['test_name'],
                        'candidate_name': db_instance['candidate_name'],
                        'id': db_instance['id']  # Include the database ID
                    }
                    
                    running_instances.append(instance)
            except docker.errors.NotFound:
                # Container not found in Docker, skip it
                continue
            except Exception as e:
                print(f"Error getting container info for instance {db_instance['id']}: {str(e)}")
                continue
        
        return running_instances
    
    except Exception as e:
        print(f"Error getting instances: {str(e)}")
        return []
    
    finally:
        conn.close()

def create_instance(data):
    """
    Creates a new Code-Server instance for a test and candidate.
    
    Args:
        data (dict): The instance configuration data including:
            test_id: ID of the test this instance is for
            candidate_id: (optional) ID of the candidate this instance is for
            github_url: (optional) GitHub repository URL to clone
            github_token: (optional) GitHub token for private repos
            admin_user: (optional) User information for admin testing
    
    Returns:
        dict: Object containing instance details
    """
    print(f"Creating instance with data: {data}")
    test_id = data.get('testId')
    candidate_id = data.get('candidateId')
    github_url = data.get('githubUrl')
    github_token = data.get('githubToken')
    admin_user = data.get('adminUser')
    
    effective_candidate_id = candidate_id

    if not test_id:
        raise ValueError('Test ID is required')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # If adminUser is present (from "Try Test"), use/create the dummy admin candidate
        if admin_user:
            admin_candidate_email = "john.doe@mail.com"
            admin_candidate_name = "John Doe (Admin Test User)"
            cursor.execute("SELECT id FROM candidates WHERE email = ?", (admin_candidate_email,))
            admin_cand_record = cursor.fetchone()
            if admin_cand_record:
                effective_candidate_id = admin_cand_record['id']
                print(f"Found existing admin test candidate ID: {effective_candidate_id}")
            else:
                cursor.execute(
                    'INSERT INTO candidates (name, email, completed) VALUES (?, ?, ?)',
                    (admin_candidate_name, admin_candidate_email, 0)
                )
                conn.commit() # Commit candidate creation
                effective_candidate_id = cursor.lastrowid
                print(f"Created new admin test candidate ID: {effective_candidate_id}")
        elif not candidate_id:
             # If not admin and no candidateId, this is an issue unless it's a general test link scenario (not yet handled)
            print("Warning: No candidateId provided and not an admin test. Instance will not be tied to a specific candidate.")
            effective_candidate_id = None # Explicitly set to None

        # Get the test details
        cursor.execute('SELECT * FROM tests WHERE id = ?', (test_id,))
        test = cursor.fetchone()
        
        if not test:
            raise ValueError(f"Test with ID {test_id} not found")
        
        # Convert test to dict to access properties
        test = dict(test)
        
        # Generate a unique instance name
        instance_name = f"test-{test_id}-candidate-{candidate_id}-{int(time.time())}" if candidate_id else f"test-{test_id}-admin-{int(time.time())}"
        
        # Sanitize name for Docker
        sanitized_name = sanitize_name(instance_name)
        
        final_project_path = None
        
        # If a GitHub repo is provided, clone it
        if github_url or test.get('github_repo'):
            repo_url = github_url or test.get('github_repo')
            target_folder = os.path.join(BASE_PROJECTS_DIR, sanitized_name)
            
            try:
                # Ensure directory exists
                os.makedirs(BASE_PROJECTS_DIR, exist_ok=True)
                
                # Clone the repository
                token = github_token or test.get('github_token')
                exec_command(f"git clone {repo_url} {target_folder}" if not token else 
                             f"git clone https://{token}@{repo_url.replace('https://', '')} {target_folder}")
                
                final_project_path = target_folder
            except Exception as e:
                raise Exception(f"Error cloning repo: {str(e)}")
        
        # First create the instance record to get an ID
        cursor.execute(
            'INSERT INTO test_instances (test_id, candidate_id, docker_instance_id, port) VALUES (?, ?, ?, ?)',
            (test_id, effective_candidate_id, 'pending', 0)
        )
        conn.commit()
        
        # Get the last inserted ID
        instance_id = cursor.lastrowid
        print(f"Created instance record with ID: {instance_id}")
        
        # Connect to Docker
        client = docker.from_env()
        
        # Environment variables for the container
        env_vars = [
            f"DOCKER_USER={os.environ.get('USER', 'coder')}",
            f"GITHUB_REPO={github_url or test.get('github_repo', '')}",
            f"INITIAL_PROMPT={test.get('initial_prompt', '')}",
            f"FINAL_PROMPT={test.get('final_prompt', '')}",
            f"ASSESSMENT_PROMPT={test.get('assessment_prompt', '')}",
            f"INSTANCE_ID={instance_id}",
            # Add target repo details if available
            f"TARGET_GITHUB_REPO={test.get('target_github_repo', '')}", 
            f"TARGET_GITHUB_TOKEN={test.get('target_github_token', '')}", 
            # Add project timer settings from the test definition
            f"ENABLE_INITIAL_TIMER={test.get('enable_timer', 1)}",
            f"INITIAL_DURATION_MINUTES={test.get('timer_duration', 10)}",
            f"ENABLE_PROJECT_TIMER={test.get('enable_project_timer', 1)}",
            f"PROJECT_DURATION_MINUTES={test.get('project_timer_duration', 60)}"
        ]
        
        # Define volumes if we have a project path
        volumes = {}
        if final_project_path:
            volumes[final_project_path] = {'bind': '/home/coder/project', 'mode': 'rw'}
        
        try:
            # Create and start container
            container = client.containers.run(
                'my-code-server-with-extension',  # Use the correct image name
                name=sanitized_name,
                detach=True,
                environment=env_vars,
                ports={'8080/tcp': None},  # Let Docker assign a port
                volumes=volumes if volumes else None
            )
            
            print(f"Container created: {container.id}")
            
            # Get the assigned port
            container_info = client.api.inspect_container(container.id)
            docker_id = container_info['Id']
            
            # Wait briefly for port mappings to be set up
            time.sleep(1)
            
            # Refresh container info after waiting
            container_info = client.api.inspect_container(container.id)
            
            # Try multiple approaches to find the port
            port = None
            
            # Approach 1: Check NetworkSettings.Ports directly
            if 'NetworkSettings' in container_info and 'Ports' in container_info['NetworkSettings']:
                port_bindings = container_info['NetworkSettings']['Ports'].get('8080/tcp')
                if port_bindings and len(port_bindings) > 0:
                    port = port_bindings[0]['HostPort']
                    print(f"Found port via NetworkSettings.Ports: {port}")
            
            # Approach 2: Check HostConfig.PortBindings
            if not port and 'HostConfig' in container_info and 'PortBindings' in container_info['HostConfig']:
                port_bindings = container_info['HostConfig']['PortBindings'].get('8080/tcp')
                if port_bindings and len(port_bindings) > 0:
                    port = port_bindings[0]['HostPort']
                    print(f"Found port via HostConfig.PortBindings: {port}")
            
            # Approach 3: Get port via Docker client containers list (backup)
            if not port:
                # List all containers and find ours to get the port
                for container_entry in client.containers.list():
                    if container_entry.id == container.id:
                        # Get detailed info directly from the container
                        ports = container_entry.ports
                        if '8080/tcp' in ports and ports['8080/tcp']:
                            port = ports['8080/tcp'][0]['HostPort']
                            print(f"Found port via containers list: {port}")
                            break
            
            # Final check - if we still don't have a port, try one more time with a longer delay
            if not port:
                print("Port not found on first attempts, waiting longer...")
                time.sleep(3)
                container_info = client.api.inspect_container(container.id)
                
                if 'NetworkSettings' in container_info and 'Ports' in container_info['NetworkSettings']:
                    port_bindings = container_info['NetworkSettings']['Ports'].get('8080/tcp')
                    if port_bindings and len(port_bindings) > 0:
                        port = port_bindings[0]['HostPort']
                        print(f"Found port after longer wait: {port}")
            
            if not port:
                # Clean up if we couldn't get a port
                container.stop()
                container.remove()
                raise Exception('Failed to retrieve assigned port for the container')
            
            print(f"Container running on port: {port}")
            
            # Update the instance record with the docker ID and port
            cursor.execute(
                'UPDATE test_instances SET docker_instance_id = ?, port = ? WHERE id = ?',
                (docker_id, port, instance_id)
            )
            conn.commit()
            
            # If this is for a candidate, make sure the test_candidates relationship exists
            if effective_candidate_id:
                # Check if the test-candidate relationship exists
                cursor.execute(
                    'SELECT * FROM test_candidates WHERE test_id = ? AND candidate_id = ?',
                    (test_id, effective_candidate_id)
                )
                existing_relation = cursor.fetchone()
                
                if not existing_relation:
                    # Create a new test-candidate relationship
                    cursor.execute(
                        'INSERT INTO test_candidates (test_id, candidate_id, completed) VALUES (?, ?, ?)',
                        (test_id, effective_candidate_id, 0)
                    )
                    
                    # Increment the candidates_assigned count for the test
                    cursor.execute(
                        'UPDATE tests SET candidates_assigned = candidates_assigned + 1 WHERE id = ?',
                        (test_id,)
                    )
                    conn.commit()
            
            # Start a timer for this instance
            # Get the timer configuration from the test
            enable_timer = test.get('enable_timer', 1)
            timer_duration = test.get('timer_duration', 10)
            
            # Convert minutes to seconds and pass to timer
            duration_seconds = timer_duration * 60 if enable_timer else 0
            start_instance_timer(instance_id, duration_seconds)
            
            # Get the complete instance info
            cursor.execute(
                '''
                SELECT ti.*, t.name as test_name, c.name as candidate_name, c.email as candidate_email
                FROM test_instances ti
                LEFT JOIN tests t ON ti.test_id = t.id
                LEFT JOIN candidates c ON ti.candidate_id = c.id
                WHERE ti.id = ?
                ''',
                (instance_id,)
            )
            
            instance = dict(cursor.fetchone())
            
            # Add access URL
            instance['access_url'] = f"http://localhost:{port}"
            
            return instance
            
        except docker.errors.ImageNotFound as e:
            raise Exception(f"Docker image 'my-code-server-with-extension' not found. Please build the image first: {str(e)}")
        except docker.errors.APIError as e:
            raise Exception(f"Docker API error: {str(e)}")
    
    except Exception as e:
        # Roll back transaction on error
        conn.rollback()
        raise e
    
    finally:
        conn.close()

def get_instance(instance_id):
    """Get a specific instance by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            '''
            SELECT ti.*, t.name as test_name, c.name as candidate_name, c.email as candidate_email
            FROM test_instances ti
            LEFT JOIN tests t ON ti.test_id = t.id
            LEFT JOIN candidates c ON ti.candidate_id = c.id
            WHERE ti.id = ?
            ''',
            (instance_id,)
        )
        
        instance = cursor.fetchone()
        
        if not instance:
            return None
        
        return dict(instance)
    
    finally:
        conn.close()

def stop_instance(instance_id):
    """Stop a Docker instance and update its status"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get the instance details
        cursor.execute('SELECT * FROM test_instances WHERE id = ?', (instance_id,))
        instance = cursor.fetchone()
        
        if not instance:
            raise ValueError(f"Instance with ID {instance_id} not found")
        
        instance = dict(instance)
        docker_id = instance['docker_instance_id']
        
        if docker_id and docker_id != 'pending':
            # Connect to Docker
            client = docker.from_env()
            
            try:
                # Get the container and stop it
                container = client.containers.get(docker_id)
                container.stop()
                container.remove()
                
                # Update the instance status
                cursor.execute(
                    'UPDATE test_instances SET status = ? WHERE id = ?',
                    ('stopped', instance_id)
                )
                conn.commit()
                
                print(f"Instance {instance_id} (Docker ID: {docker_id}) stopped and removed successfully")
                return {"success": True, "message": f"Instance {instance_id} stopped successfully"}
            
            except docker.errors.NotFound:
                # Container doesn't exist anymore
                cursor.execute(
                    'UPDATE test_instances SET status = ? WHERE id = ?',
                    ('not_found', instance_id)
                )
                conn.commit()
                
                print(f"Container for instance {instance_id} not found in Docker, marked as not_found")
                return {"success": True, "message": f"Container for instance {instance_id} not found in Docker but marked as removed"}
            
            except Exception as e:
                print(f"Error stopping instance {instance_id}: {str(e)}")
                return {"success": False, "message": f"Error stopping instance: {str(e)}"}
        else:
            print(f"No valid Docker instance ID found for instance {instance_id}")
            return {"success": False, "message": "No valid Docker instance ID found"}
    
    except Exception as e:
        print(f"Error in stop_instance: {str(e)}")
        return {"success": False, "message": f"Error: {str(e)}"}
    
    finally:
        conn.close()

def get_report(instance_id):
    """
    Get a report for a test instance
    
    Args:
        instance_id (int): The instance ID
    
    Returns:
        dict: The report data or a message if no report exists
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if instance exists
        cursor.execute(
            '''
            SELECT ti.*, t.name as test_name, t.assessment_prompt
            FROM test_instances ti
            LEFT JOIN tests t ON ti.test_id = t.id
            WHERE ti.id = ?
            ''',
            (instance_id,)
        )
        
        instance = cursor.fetchone()
        
        if not instance:
            return {"message": f"Instance with ID {instance_id} not found"}
        
        # Check if a report already exists
        cursor.execute(
            'SELECT * FROM reports WHERE instance_id = ?',
            (instance_id,)
        )
        
        report = cursor.fetchone()
        
        if report:
            return dict(report)
        
        return {"message": f"No report exists for instance {instance_id}"}
    
    except Exception as e:
        conn.rollback()
        raise e
    
    finally:
        conn.close()

def create_report(instance_id, data):
    """
    Create a new report for a test instance
    
    Args:
        instance_id (int): The instance ID
        data (dict): The instance workspace content as JSON
    
    Returns:
        dict: The created report data
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if instance exists and get test data
        cursor.execute('''
            SELECT t.initial_prompt, t.final_prompt 
            FROM test_instances ti
            JOIN tests t ON ti.test_id = t.id
            WHERE ti.id = ?
        ''', (instance_id,))
        test_data = cursor.fetchone()
        
        if not test_data:
            return {"message": f"Instance with ID {instance_id} not found"}
        
        # Convert data to JSON string
        content = json.dumps(data)
        
        # Check if a report already exists
        cursor.execute('SELECT * FROM reports WHERE instance_id = ?', (instance_id,))
        existing_report = cursor.fetchone()
        
        if existing_report:
            # Update existing report
            cursor.execute(
                'UPDATE reports SET content = ? WHERE instance_id = ?',
                (content, instance_id)
            )
        else:
            # Create new report
            fields = {
                'code_summary': (str, Field(title='Code Summary', description='A short summary of the code, including the key choices made by the candidate in implementing the solution'))
            }
            
            if test_data['initial_prompt']:
                fields['initial_interview_summary'] = (str, Field(title='Initial Interview Summary', description='A summary of the initial interview with the candidate, including the key insights and areas of concern'))
            
            if test_data['final_prompt']:
                fields['final_interview_summary'] = (str, Field(title='Final Interview Summary', description='A summary of the final interview with the candidate, including the key insights and areas of concern'))
            
            ReportSchema = type('ReportSchema', (BaseModel,), fields)
            
            cursor.execute(
                'INSERT INTO reports (instance_id, content) VALUES (?, ?)',
                (instance_id, content)
            )
        
        conn.commit()
        
        # Get the report
        cursor.execute('SELECT * FROM reports WHERE instance_id = ?', (instance_id,))
        report = dict(cursor.fetchone())
        
        # Convert content back to JSON for the response
        report['content'] = json.loads(report['content'])
        return report
    
    except Exception as e:
        conn.rollback()
        raise e
    
    finally:
        conn.close()

def upload_project_to_github(instance_id, file_storage):
    """Uploads the candidate's project files to the specified target GitHub repository."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Get instance details to find candidate_id and test_id
        cursor.execute('''
            SELECT ti.candidate_id, ti.test_id, c.name as candidate_name, c.email as candidate_email
            FROM test_instances ti
            LEFT JOIN candidates c ON ti.candidate_id = c.id
            WHERE ti.id = ?
        ''', (instance_id,))
        instance_details = cursor.fetchone()

        if not instance_details:
            raise ValueError(f"Instance with ID {instance_id} not found.")

        candidate_id = instance_details['candidate_id']
        test_id = instance_details['test_id']
        candidate_name = instance_details['candidate_name'] or f"candidate_{candidate_id}"

        if not candidate_id:
            # This case should ideally not happen if an instance is properly associated
            raise ValueError(f"Instance {instance_id} is not associated with a candidate.")

        # Get test details to find target_github_repo and target_github_token
        cursor.execute('''
            SELECT target_github_repo, target_github_token 
            FROM tests 
            WHERE id = ?
        ''', (test_id,))
        test_details = cursor.fetchone()

        if not test_details:
            raise ValueError(f"Test with ID {test_id} not found for instance {instance_id}.")

        target_repo_url = test_details['target_github_repo']
        target_repo_token = test_details['target_github_token']

        if not target_repo_url:
            return {"success": False, "message": "No target GitHub repository configured for this test."}

        # Proceed with file handling and Git operations
        # Create a temporary directory to store the uploaded zip and its extracted contents
        with tempfile.TemporaryDirectory() as temp_dir_base_path:
            temp_dir_path = Path(temp_dir_base_path)
            zip_file_path = temp_dir_path / file_storage.filename
            file_storage.save(str(zip_file_path))

            extracted_files_path = temp_dir_path / 'extracted_project'
            os.makedirs(extracted_files_path, exist_ok=True)
            with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                zip_ref.extractall(extracted_files_path)
            
            print(f"Files extracted to: {extracted_files_path}")

            # Create another temporary directory for cloning the target repository
            with tempfile.TemporaryDirectory() as clone_dir_base_path:
                clone_dir_path = Path(clone_dir_base_path)
                
                # Clone the target repository
                repo_url_for_clone = target_repo_url
                if target_repo_token:
                    if repo_url_for_clone.startswith('https://'):
                        repo_url_for_clone = f"https://{target_repo_token}@{repo_url_for_clone[8:]}"
                    else:
                        # Fallback or handle other protocols if necessary, for now assume https
                        repo_url_for_clone = f"https://{target_repo_token}@{repo_url_for_clone}"
                
                try:
                    exec_command(f"git clone --depth 1 {repo_url_for_clone} {str(clone_dir_path)}")
                    print(f"Cloned target repo {target_repo_url} to {clone_dir_path}")
                except Exception as e:
                    raise Exception(f"Failed to clone target repository {target_repo_url}: {str(e)}")

                # Define the subdirectory for the candidate's submission
                submission_dir_name = f"submission_candidate_{candidate_id}_instance_{instance_id}"
                submission_path = clone_dir_path / submission_dir_name

                # If directory exists, remove it to ensure a clean state (or decide on update strategy)
                if submission_path.exists():
                    shutil.rmtree(submission_path)
                os.makedirs(submission_path, exist_ok=True)

                # Copy extracted files into the submission subdirectory
                for item in extracted_files_path.iterdir():
                    if item.is_dir():
                        shutil.copytree(item, submission_path / item.name)
                    else:
                        shutil.copy2(item, submission_path / item.name)
                
                print(f"Copied project files to {submission_path}")

                # Git operations: add, commit, push
                original_cwd = os.getcwd()
                os.chdir(clone_dir_path)
                try:
                    exec_command("git config user.name \"Automated Uploader\"")
                    exec_command("git config user.email \"uploader@example.com\"") # Placeholder because git requires an uploader email
                    exec_command("git add .")
                    commit_message = f"feat: Upload project submission for candidate {candidate_name} (ID: {candidate_id}), Instance: {instance_id}"
                    exec_command(f'git commit -m "{commit_message}"' )
                    
                    # Determine current branch
                    current_branch = exec_command("git rev-parse --abbrev-ref HEAD").strip()
                    
                    # Construct the push URL with token if available
                    push_url = target_repo_url
                    if target_repo_token:
                        if push_url.startswith('https://'):
                            push_url = f"https://{target_repo_token}@{push_url[8:]}"
                        else:
                            # Assuming https, adjust if other protocols are used for target_repo_url
                            push_url = f"https://{target_repo_token}@{push_url}" 
                    
                    push_command = f"git push {push_url} {current_branch}"
                    exec_command(push_command)
                    print(f"Successfully pushed changes to {target_repo_url} on branch {current_branch}")
                except Exception as e:
                    # Attempt to reset if commit/push fails to avoid leaving repo in bad state
                    # Check if there are any commits to reset before attempting
                    try:
                        # Check if HEAD^ exists. If `git rev-parse HEAD^` fails, there is no parent commit.
                        exec_command("git rev-parse --verify HEAD^") 
                        exec_command("git reset --hard HEAD^") # Revert last commit if push failed and parent exists
                        print("Git state reset to HEAD^ after push failure.")
                    except Exception as reset_e:
                        print(f"Could not reset git state after push failure (or no parent commit to reset to): {reset_e}")
                    raise Exception(f"Git operations failed: {str(e)}")
                finally:
                    os.chdir(original_cwd) # Important to change back CWD

        return {"success": True, "message": f"Project for candidate {candidate_id} uploaded successfully to {target_repo_url}/{submission_dir_name}"}

    except ValueError as ve:
        print(f'ValueError in upload_project_to_github: {str(ve)}')
        return {"success": False, "message": str(ve)}
    except Exception as e:
        conn.rollback() # Rollback if any DB operations were pending, though none here currently.
        print(f'Error in upload_project_to_github: {str(e)}')
        return {"success": False, "message": f"An unexpected error occurred: {str(e)}"}
    finally:
        if conn:
            conn.close() 