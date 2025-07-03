import os
import time
import docker
import subprocess
import shutil
import tempfile # For temporary directories and files
import zipfile # For handling zip files
from pathlib import Path
from database.db_postgresql import get_connection
from controllers.timer_controller import start_instance_timer

# Base directory for project repositories
BASE_PROJECTS_DIR = Path(__file__).parent.parent / 'projects'

# Ensure projects directory exists
os.makedirs(BASE_PROJECTS_DIR, exist_ok=True)
print(f"Project directory set up at: {BASE_PROJECTS_DIR}")

def get_docker_client():
    """Get Docker client - try remote host first, fallback to local"""
    try:
        # Get certificate paths from environment variables
        ca_cert = os.getenv('DOCKER_CA_CERT')
        client_cert = os.getenv('DOCKER_CLIENT_CERT')
        client_key = os.getenv('DOCKER_CLIENT_KEY')
        docker_host = os.getenv('DOCKER_HOST', 'tcp://167.99.52.130:2376')

        if not all([ca_cert, client_cert, client_key]):
            print("Missing Docker TLS certificates in environment variables")
            raise Exception("Docker TLS certificates not configured")

        # Create temporary files for the certificates
        import tempfile
        import atexit

        cert_files = []
        def cleanup_cert_files():
            for f in cert_files:
                try:
                    os.remove(f)
                    print(f"Cleaned up temporary file: {f}")
                except Exception as e:
                    print(f"Failed to clean up {f}: {str(e)}")

        atexit.register(cleanup_cert_files)

        def write_temp_cert(content, suffix):
            try:
                temp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                temp.write(content.encode('utf-8'))
                temp.flush()
                cert_files.append(temp.name)
                print(f"Created temporary {suffix} file: {temp.name}")
                # Verify the file contents
                with open(temp.name, 'r') as f:
                    content_check = f.read()
                    print(f"Verified {suffix} file contents length: {len(content_check)}")
                return temp.name
            except Exception as e:
                print(f"Error creating temporary {suffix} file: {str(e)}")
                raise

        ca_cert_path = write_temp_cert(ca_cert, '.ca.pem')
        client_cert_path = write_temp_cert(client_cert, '.cert.pem')
        client_key_path = write_temp_cert(client_key, '.key.pem')

        print("\nAttempting to connect to Docker with:")
        print(f"CA cert path: {ca_cert_path}")
        print(f"Client cert path: {client_cert_path}")
        print(f"Client key path: {client_key_path}")

        # Try to connect to remote Docker host
        client = docker.DockerClient(
            base_url=docker_host,
            tls=docker.tls.TLSConfig(
                ca_cert=ca_cert_path,
                client_cert=(client_cert_path, client_key_path),
                verify=True
            )
        )
        
        # Test the connection
        client.ping()
        print("\nSuccessfully connected to remote Docker host")
        return client
    except Exception as e:
        print(f"\nFailed to connect to remote Docker host: {str(e)}")
        try:
            # Try to connect to the local Docker socket instead
            client = docker.DockerClient(base_url='unix://var/run/docker.sock')
            client.ping()
            print("Connected to local Docker socket")
            return client
        except Exception as local_e:
            print(f"Failed to connect to local Docker: {str(local_e)}")
            return None

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
        
        # Try to connect to Docker, but handle gracefully if not available
        running_instances = []
        
        try:
            client = get_docker_client()
            
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
                    
        except Exception as e:
            print(f"Docker not available or connection failed: {str(e)}")
            # If Docker is not available, return database instances with basic info
            for db_instance in db_instances:
                instance = {
                    'Id': db_instance['docker_instance_id'] or 'unknown',
                    'Names': [f"/test-instance-{db_instance['id']}"],
                    'Image': 'unknown',
                    'ImageID': 'unknown',
                    'Command': '',
                    'Created': str(db_instance['created_at']) if db_instance['created_at'] else '',
                    'Ports': [],
                    'Status': 'unknown',
                    'State': {},
                    # Add the DB fields as well
                    'test_id': db_instance['test_id'],
                    'candidate_id': db_instance['candidate_id'],
                    'test_name': db_instance['test_name'],
                    'candidate_name': db_instance['candidate_name'],
                    'id': db_instance['id']
                }
                running_instances.append(instance)
        
        return running_instances
    
    except Exception as e:
        print(f"Error getting instances: {str(e)}")
        return []
    
    finally:
        conn.close()

def get_instances(company_id=None):
    """Get all test instances, optionally filtered by company"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if company_id:
            cursor.execute('SELECT * FROM test_instances WHERE company_id = %s', (company_id,))
        else:
            cursor.execute('SELECT * FROM test_instances')
        instances = [dict(row) for row in cursor.fetchall()]
        return instances
    finally:
        conn.close()

def get_instance(instance_id, company_id=None):
    """Get a test instance by ID, optionally checking company_id"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if company_id:
            cursor.execute('SELECT * FROM test_instances WHERE id = %s AND company_id = %s', (instance_id, company_id))
        else:
            cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
        instance = cursor.fetchone()
        return dict(instance) if instance else None
    finally:
        conn.close()

def cleanup_admin_test_candidates():
    """Clean up temporary admin test candidates and their instances"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Find admin test candidates older than 1 hour
        cursor.execute('''
            SELECT id FROM candidates 
            WHERE email LIKE 'admin-test-%@example.com'
            AND created_at < NOW() - INTERVAL '1 hour'
        ''')
        old_candidates = cursor.fetchall()
        
        for candidate in old_candidates:
            candidate_id = candidate['id']
            print(f"Cleaning up old admin test candidate {candidate_id}")
            
            # Delete associated instances first
            cursor.execute('DELETE FROM test_instances WHERE candidate_id = %s', (candidate_id,))
            # Then delete the candidate
            cursor.execute('DELETE FROM candidates WHERE id = %s', (candidate_id,))
        
        conn.commit()
        print(f"Cleaned up {len(old_candidates)} old admin test candidates")
    except Exception as e:
        print(f"Error cleaning up admin test candidates: {str(e)}")
        conn.rollback()
    finally:
        conn.close()

def create_instance(test_id, candidate_id, company_id):
    """Create a new test instance"""
    # Clean up old admin test candidates first
    cleanup_admin_test_candidates()
    
    conn = get_connection()
    cursor = conn.cursor()
    try:
        print(f"\nAttempting to create instance for test_id: {test_id}, candidate_id: {candidate_id}, company_id: {company_id}")
        
        # Check if test exists and belongs to company
        cursor.execute('SELECT * FROM tests WHERE id = %s AND company_id = %s', (test_id, company_id))
        test = cursor.fetchone()
        if not test:
            print(f"Test not found for test_id: {test_id} and company_id: {company_id}")
            raise ValueError('Test not found')
        print(f"Found test: {dict(test)}")
        
        # Check if candidate exists and belongs to company
        cursor.execute('SELECT * FROM candidates WHERE id = %s AND company_id = %s', (candidate_id, company_id))
        candidate = cursor.fetchone()
        if not candidate:
            print(f"Candidate not found for candidate_id: {candidate_id} and company_id: {company_id}")
            raise ValueError('Candidate not found')
        print(f"Found candidate: {dict(candidate)}")
        
        # Check if instance already exists
        cursor.execute('''
            SELECT id, test_id, candidate_id, docker_instance_id, port, created_at 
            FROM test_instances 
            WHERE test_id = %s AND candidate_id = %s''',
            (test_id, candidate_id))
        existing = cursor.fetchone()
        if existing:
            print(f"Found existing instance: {dict(existing)}")
            raise ValueError('Test instance already exists for this candidate')
        
        # Create instance
        print("Creating new instance...")
        cursor.execute(
            '''INSERT INTO test_instances (test_id, candidate_id, company_id, created_at, updated_at)
               VALUES (%s, %s, %s, NOW(), NOW()) RETURNING id''',
            (test_id, candidate_id, company_id)
        )
        instance_id = cursor.fetchone()['id']
        conn.commit()
        print(f"Created instance with ID: {instance_id}")
        
        # Get the created instance
        cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
        instance = dict(cursor.fetchone())
        print(f"Retrieved instance details: {instance}")
        
        # Create the Docker container
        try:
            docker_info = create_docker_container(instance_id, test_id, candidate_id, company_id)
            if docker_info:
                instance.update(docker_info)
                # Update instance with Docker info
                cursor.execute(
                    'UPDATE test_instances SET docker_instance_id = %s, port = %s WHERE id = %s',
                    (docker_info.get('container_id'), docker_info.get('port'), instance_id)
                )
                conn.commit()
                print(f"Updated instance with Docker info: {docker_info}")
            else:
                print("No Docker info returned from create_docker_container")
        except Exception as e:
            print(f"Failed to create Docker container: {str(e)}")
            # Continue without Docker container - instance still created in DB
            instance['error'] = str(e)
        
        return instance
    except Exception as e:
        conn.rollback()
        print(f"Error in create_instance: {str(e)}")
        raise e
    finally:
        conn.close()

def update_instance(instance_id, data, company_id=None):
    """Update a test instance, optionally checking company_id"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Check if instance exists and belongs to company
        if company_id:
            cursor.execute('SELECT id FROM test_instances WHERE id = %s AND company_id = %s', (instance_id, company_id))
        else:
            cursor.execute('SELECT id FROM test_instances WHERE id = %s', (instance_id,))
        if not cursor.fetchone():
            raise ValueError('Instance not found')
            
        # Build update query dynamically based on provided fields
        update_fields = []
        update_values = []
        
        for field in ['docker_instance_id', 'port']:
            if field in data:
                update_fields.append(f'{field} = %s')
                update_values.append(data[field])
                
        if not update_fields:
            raise ValueError('No fields to update')
        
        # Add instance_id to values
        update_values.append(instance_id)
            
        # Execute update
        query = f'''UPDATE test_instances 
                   SET {", ".join(update_fields)}, updated_at = NOW() 
                   WHERE id = %s'''
        cursor.execute(query, update_values)
        conn.commit()
        
        # Get updated instance
        cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
        return dict(cursor.fetchone())
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def delete_instance(instance_id, company_id=None):
    """Delete a test instance, optionally checking company_id"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Check if instance exists and belongs to company
        if company_id:
            cursor.execute('SELECT id FROM test_instances WHERE id = %s AND company_id = %s', (instance_id, company_id))
        else:
            cursor.execute('SELECT id FROM test_instances WHERE id = %s', (instance_id,))
        if not cursor.fetchone():
            raise ValueError('Instance not found')
        
        # Delete instance
        cursor.execute('DELETE FROM test_instances WHERE id = %s', (instance_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_instance_with_details(instance_id, company_id=None):
    """Get a test instance with test and candidate details"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Check if instance exists and belongs to company
        if company_id:
            cursor.execute('SELECT * FROM test_instances WHERE id = %s AND company_id = %s', (instance_id, company_id))
        else:
            cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
        
        instance = cursor.fetchone()
        if not instance:
            return None
        
        instance_dict = dict(instance)
    
        # Get test details
        cursor.execute('SELECT * FROM tests WHERE id = %s', (instance['test_id'],))
        test = cursor.fetchone()
        if test:
            instance_dict['test'] = dict(test)
        
        # Get candidate details
        cursor.execute('SELECT * FROM candidates WHERE id = %s', (instance['candidate_id'],))
        candidate = cursor.fetchone()
        if candidate:
            instance_dict['candidate'] = dict(candidate)
        
        return instance_dict
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
            client = get_docker_client()
            
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

def create_docker_container(instance_id, test_id, candidate_id, company_id):
    """Create a Docker container for a test instance"""
    conn = None
    try:
        # Get Docker client
        try:
            print("\nAttempting to connect to Docker daemon...")
            client = get_docker_client()
            if not client:
                raise Exception("Could not connect to Docker daemon")
            print("Successfully got Docker client")
            
            # Test Docker connection
            try:
                info = client.info()
                print(f"Docker version: {info.get('ServerVersion')}")
                print(f"Total containers: {info.get('Containers')}")
                print(f"Running containers: {info.get('ContainersRunning')}")
            except Exception as e:
                print(f"Warning: Could not get Docker info: {str(e)}")
            
        except Exception as e:
            print(f"Error connecting to Docker: {str(e)}")
            if hasattr(e, 'stderr'):
                print(f"Docker stderr: {e.stderr}")
            return None
        
        # Get test details
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM tests WHERE id = %s', (test_id,))
        test = cursor.fetchone()
        if not test:
            raise ValueError('Test not found')
        
        test = dict(test)
        print(f"Retrieved test details: {test}")
        
        # Generate a unique container name
        container_name = f"ai-oa-instance-{instance_id}"
        print(f"Generated container name: {container_name}")
        
        # Pull the Docker image if it doesn't exist
        try:
            image_name = 'ectan/ai-oa-public:latest'
            try:
                print(f"Checking for existing image {image_name}...")
                image = client.images.get(image_name)
                print(f"Using existing {image_name} image (ID: {image.id})")
            except docker.errors.ImageNotFound:
                print(f"\nPulling {image_name} from Docker Hub...")
                try:
                    image = client.images.pull(image_name)
                    print(f"Successfully pulled {image_name} (ID: {image.id})")
                except Exception as pull_error:
                    print(f"Error pulling image: {str(pull_error)}")
                    if hasattr(pull_error, 'stderr'):
                        print(f"Pull stderr: {pull_error.stderr}")
                    raise
        except Exception as e:
            print(f"Error with Docker image: {str(e)}")
            return None
        
        # Enhanced port allocation logic
        def find_free_port():
            """Find a free port using an expanded range and better availability checking"""
            import socket
            from contextlib import closing
            import random
            
            # Get list of ports already in use by Docker
            try:
                containers = client.containers.list()
                used_ports = set()
                for container in containers:
                    container_data = client.api.inspect_container(container.id)
                    port_bindings = container_data['HostConfig']['PortBindings'] or {}
                    for binding in port_bindings.values():
                        if binding:
                            for port_info in binding:
                                if 'HostPort' in port_info:
                                    used_ports.add(int(port_info['HostPort']))
                print(f"Ports currently in use by Docker: {sorted(list(used_ports))}")
            except Exception as e:
                print(f"Warning: Could not get Docker port usage: {str(e)}")
                used_ports = set()

            def is_port_available(port):
                """Check if a port is available both through socket binding and Docker"""
                if port in used_ports:
                    return False
                
                try:
                    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
                        # Set socket timeout to speed up checks
                        sock.settimeout(0.2)
                        # Try to bind to the port
                        result = sock.bind(('', port))
                        return True
                except:
                    return False

            # Define multiple port ranges to try
            # Primary range: 8000-8999 (1000 ports)
            # Secondary range: 9000-9999 (1000 ports)
            # Fallback range: 10000-65535 (for high load scenarios)
            port_ranges = [
                (8000, 8999),   # Primary range
                (9000, 9999),   # Secondary range
                (10000, 65535)  # Fallback range (large)
            ]

            max_attempts = 50  # Limit number of attempts to prevent infinite loops
            attempts = 0
            
            for start_port, end_port in port_ranges:
                if attempts >= max_attempts:
                    break
                
                # Create a list of ports in this range and shuffle it
                ports = list(range(start_port, end_port + 1))
                random.shuffle(ports)  # Randomize port selection within range
                
                for port in ports:
                    attempts += 1
                    if attempts >= max_attempts:
                        break
                        
                    if is_port_available(port):
                        print(f"Found available port: {port} (after {attempts} attempts)")
                        return port
            
            raise Exception(f"No free ports found after {attempts} attempts")
            
        # Try to find a free port
        try:
            port = find_free_port()
            print(f"Selected port {port} for container")
        except Exception as e:
            print(f"Error finding free port: {str(e)}")
            return None

        # Create and run the container
        try:
            print(f"\nCreating container with port mapping 8080/tcp -> {port}")
            print("Container configuration:")
            print(f"- Image: {image_name}")
            print(f"- Name: {container_name}")
            print(f"- Port mapping: 8080/tcp -> {port}")
            print(f"- Environment variables:")
            print(f"  - TEST_ID: {test_id}")
            print(f"  - CANDIDATE_ID: {candidate_id}")
            print(f"  - INSTANCE_ID: {instance_id}")
            
            # Prepare environment variables including GitHub repo info
            env_vars = {
                'TEST_ID': str(test_id),
                'CANDIDATE_ID': str(candidate_id),
                'INSTANCE_ID': str(instance_id),
                'SERVER_URL': 'http://167.99.52.130:3000'  # Use the actual server IP
            }
            
            # Add GitHub repo info if available
            if test.get('github_repo'):
                env_vars['GITHUB_REPO'] = test['github_repo']
                if test.get('github_token'):
                    env_vars['GITHUB_TOKEN'] = test['github_token']
            
            # Create a startup script to clone the repo
            startup_script = """#!/bin/bash
cd /home/coder/project

# Clone repository if GITHUB_REPO is set
if [ ! -z "$GITHUB_REPO" ]; then
    if [ ! -z "$GITHUB_TOKEN" ]; then
        REPO_URL=$(echo $GITHUB_REPO | sed 's#https://#https://'$GITHUB_TOKEN'@#')
    else
        REPO_URL=$GITHUB_REPO
    fi
    
    # Remove any existing content
    rm -rf /home/coder/project/*
    
    # Clone the repository
    git clone $REPO_URL .
    
    if [ $? -ne 0 ]; then
        echo "Failed to clone repository"
        exit 1
    fi
fi

# Start code-server
code-server --auth none --bind-addr 0.0.0.0:8080 --disable-telemetry --disable-update-check /home/coder/project
"""
            
            # Create a temporary file for the startup script
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
                f.write(startup_script)
                startup_script_path = f.name
            
            # Create the container with the startup script
            container = client.containers.run(
                image_name,
                name=container_name,
                ports={'8080/tcp': port},
                environment=env_vars,
                volumes={
                    startup_script_path: {
                        'bind': '/startup.sh',
                        'mode': 'ro'
                    }
                },
                command=["/bin/bash", "/startup.sh"],
                detach=True,
                healthcheck={
                    "test": ["CMD", "curl", "-f", "http://localhost:8080"],
                    "interval": 1000000000,  # 1 second in nanoseconds
                    "timeout": 1000000000,
                    "retries": 30
                }
            )
            
            print(f"\nCreated Docker container {container.id} for instance {instance_id} on port {port}")
            
            # Clean up the temporary startup script
            import os
            os.unlink(startup_script_path)
            
            # Wait for container to be healthy (up to 30 seconds)
            max_wait = 30
            wait_interval = 1
            for i in range(max_wait):
                try:
                    container.reload()
                    status = container.status
                    health = container.attrs.get('State', {}).get('Health', {}).get('Status', 'unknown')
                    print(f"Container status: {status}, health: {health}")
                    
                    if status == 'running' and health == 'healthy':
                        break
                    elif status in ['exited', 'dead']:
                        print("\nContainer logs before failure:")
                        print(container.logs().decode('utf-8'))
                        raise Exception(f"Container failed to start. Status: {status}")
                        
                    time.sleep(wait_interval)
                except docker.errors.NotFound:
                    print("Container was removed unexpectedly")
                    raise Exception("Container was removed unexpectedly")
                except Exception as e:
                    print(f"Error checking container status: {str(e)}")
                    if i == max_wait - 1:  # Last iteration
                        raise Exception("Container failed to become healthy")
                    continue
            
            # Get container logs
            print("\nContainer logs:")
            print(container.logs().decode('utf-8'))
            
            # Get detailed container info
            inspect_info = client.api.inspect_container(container.id)
            print("\nContainer network settings:")
            print(f"IP Address: {inspect_info.get('NetworkSettings', {}).get('IPAddress', 'N/A')}")
            print(f"Gateway: {inspect_info.get('NetworkSettings', {}).get('Gateway', 'N/A')}")
            print(f"Ports: {inspect_info.get('NetworkSettings', {}).get('Ports', {})}")
            
            # Use the DigitalOcean droplet's IP directly instead of Railway domain
            access_url = f"http://167.99.52.130:{port}"
            print(f"\nGenerated access URL: {access_url}")
            
            return {
                'container_id': container.id,
                'port': port,
                'access_url': access_url
            }
        except docker.errors.APIError as e:
            print(f"\nDocker API error creating container: {str(e)}")
            if hasattr(e, 'explanation'):
                print(f"API error explanation: {e.explanation}")
            if hasattr(e, 'stderr'):
                print(f"API error stderr: {e.stderr}")
            return None
        except Exception as e:
            print(f"\nError creating Docker container: {str(e)}")
            if hasattr(e, 'stderr'):
                print(f"Error stderr: {e.stderr}")
            return None
            
    except Exception as e:
        print(f"\nError in create_docker_container: {str(e)}")
        if hasattr(e, 'stderr'):
            print(f"Error stderr: {e.stderr}")
        return None
    finally:
        if conn:
            conn.close() 