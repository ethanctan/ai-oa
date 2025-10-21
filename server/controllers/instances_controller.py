import os
import time
import docker
import subprocess
import shutil
import tempfile # For temporary directories and files
import zipfile # For handling zip files
import json
from pathlib import Path
from database.db_postgresql import get_connection
from controllers.timer_controller import delete_timer, start_instance_timer
from controllers.chat_controller import get_chat_history, create_report_completion
from pydantic import Field, BaseModel, create_model, validator

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
                except Exception as e:
                    print(f"Failed to clean up {f}: {str(e)}")

        atexit.register(cleanup_cert_files)

        def write_temp_cert(content, suffix):
            try:
                temp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                temp.write(content.encode('utf-8'))
                temp.flush()
                cert_files.append(temp.name)
                return temp.name
            except Exception as e:
                print(f"Error creating temporary {suffix} file: {str(e)}")
                raise

        ca_cert_path = write_temp_cert(ca_cert, '.ca.pem')
        client_cert_path = write_temp_cert(client_cert, '.cert.pem')
        client_key_path = write_temp_cert(client_key, '.key.pem')



        # Try to connect to remote Docker host with increased timeouts
        client = docker.DockerClient(
            base_url=docker_host,
            tls=docker.tls.TLSConfig(
                ca_cert=ca_cert_path,
                client_cert=(client_cert_path, client_key_path),
                verify=True
            ),
            timeout=120  # Increase timeout to 120 seconds
        )
        
        # Test the connection with timeout
        client.ping()
        return client
    except Exception as e:
        print(f"\nFailed to connect to remote Docker host: {str(e)}")
        try:
            # Try to connect to the local Docker socket instead
            client = docker.DockerClient(
                base_url='unix://var/run/docker.sock',
                timeout=120  # Same timeout for local connection
            )
            client.ping()
            print("Connected to local Docker socket")
            return client
        except Exception as local_e:
            print(f"Failed to connect to local Docker: {str(local_e)}")
            raise  # Raise the exception instead of returning None

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
        
        command = f"git clone https://x-access-token:{token}@{repo_url_without_protocol} {target_folder}"
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

def resolve_instance_id_by_test_and_candidate(test_id: int, candidate_id: int):
    """Resolve latest test_instances.id by test_id and candidate_id."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'SELECT id FROM test_instances WHERE test_id = %s AND candidate_id = %s ORDER BY id DESC LIMIT 1',
            (test_id, candidate_id)
        )
        row = cursor.fetchone()
        return row['id'] if row else None
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
        
        # Reset any stale timer state for this instance id
        try:
            if delete_timer(instance_id):
                print(f"Deleted stale timer for instance {instance_id} before container creation")
        except Exception as e:
            print(f"Warning: could not delete stale timer for instance {instance_id}: {str(e)}")

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
                # Do not start initial timer here; start after extension loads/consent screen redirect
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
        cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
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
                    'UPDATE test_instances SET status = %s WHERE id = %s',
                    ('stopped', instance_id)
                )
                conn.commit()
                
                print(f"Instance {instance_id} (Docker ID: {docker_id}) stopped and removed successfully")
                return {"success": True, "message": f"Instance {instance_id} stopped successfully"}
            
            except docker.errors.NotFound:
                # Container doesn't exist anymore
                cursor.execute(
                    'UPDATE test_instances SET status = %s WHERE id = %s',
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
            WHERE ti.id = %s
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
            WHERE id = %s
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
                        repo_url_for_clone = f"https://x-access-token:{target_repo_token}@{repo_url_for_clone[8:]}"
                    else:
                        # Fallback or handle other protocols if necessary, for now assume https
                        repo_url_for_clone = f"https://x-access-token:{target_repo_token}@{repo_url_for_clone}"
                
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
                    
                    # Prefer Authorization header for pushes when token is available
                    if target_repo_token:
                        push_command = f"git -c http.extraHeader=\"Authorization: Bearer {target_repo_token}\" push origin {current_branch}"
                    else:
                        push_command = f"git push origin {current_branch}"
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
        
        # Generate a unique container name that matches nginx routing pattern
        container_name = f"instance-{instance_id}"
        print(f"Generated container name: {container_name}")
        
        # Use the existing simple Docker image for instances
        try:
            print(f"Using existing image for instance {instance_id}...")
            
            # Force usage of the public image (simple image deprecated)
            image_name = 'ectan/ai-oa-public:latest'
            image = client.images.get(image_name)
            print(f"Using image for instance {instance_id}: {image_name}")
                    
        except Exception as e:
            print(f"Error with Docker image: {str(e)}")
            return None
        
        # Ensure the ai-oa-network exists
        try:
            network = client.networks.get('ai-oa-network')
            print(f"Using existing Docker network: ai-oa-network")
        except docker.errors.NotFound:
            print("Creating Docker network: ai-oa-network")
            network = client.networks.create('ai-oa-network', driver='bridge')
        except Exception as e:
            print(f"Error with Docker network: {str(e)}")
            return None

        # Create the container
        try:
            print(f"\nCreating container for Docker network communication")
            print("Container configuration:")
            print(f"- Image: {image_name}")
            print(f"- Name: {container_name}")
            print(f"- Network: ai-oa-network (internal communication)")
            print(f"- Environment variables:")
            print(f"  - TEST_ID: {test_id}")
            print(f"  - CANDIDATE_ID: {candidate_id}")
            print(f"  - INSTANCE_ID: {instance_id}")
            print(f"  - INITIAL_PROMPT: {'SET' if test.get('initial_prompt') else 'NOT SET'}")
            print(f"  - FINAL_PROMPT: {'SET' if test.get('final_prompt') else 'NOT SET'}")
            print(f"  - ASSESSMENT_PROMPT: {'SET' if test.get('qualitative_assessment_prompt') else 'NOT SET'}")
            print(f"  - ENABLE_INITIAL_TIMER: {test.get('enable_timer', 1)}")
            print(f"  - INITIAL_DURATION_MINUTES: {test.get('timer_duration', 10)}")
            print(f"  - ENABLE_PROJECT_TIMER: {test.get('enable_project_timer', 1)}")
            print(f"  - PROJECT_DURATION_MINUTES: {test.get('project_timer_duration', 60)}")
            
            # Prepare environment variables including GitHub repo info
            env_vars = {
                'TEST_ID': str(test_id),
                'CANDIDATE_ID': str(candidate_id),
                'INSTANCE_ID': str(instance_id),
                'SERVER_URL': 'https://ai-oa-production.up.railway.app' 
            }
            
            # Add GitHub repo info if available
            if test.get('github_repo'):
                env_vars['GITHUB_REPO'] = test['github_repo']
                if test.get('github_token'):
                    env_vars['GITHUB_TOKEN'] = test['github_token']
            
            # Add test prompts and timer configuration for the extension
            if test.get('initial_prompt'):
                env_vars['INITIAL_PROMPT'] = test['initial_prompt']
            if test.get('final_prompt'):
                env_vars['FINAL_PROMPT'] = test['final_prompt']
            if test.get('qualitative_assessment_prompt'):
                env_vars['ASSESSMENT_PROMPT'] = test['qualitative_assessment_prompt']
            
            # Add timer configuration
            env_vars['ENABLE_INITIAL_TIMER'] = '1' if test.get('enable_timer', 1) else '0'
            env_vars['INITIAL_DURATION_MINUTES'] = str(test.get('timer_duration', 10))
            env_vars['ENABLE_PROJECT_TIMER'] = '1' if test.get('enable_project_timer', 1) else '0'
            env_vars['PROJECT_DURATION_MINUTES'] = str(test.get('project_timer_duration', 60))

            # Create the container without port mapping (network communication only)
            container = client.containers.create(
                image_name,
                name=container_name,
                environment=env_vars,
                detach=True,
                network='ai-oa-network',
                healthcheck={
                    "test": ["CMD", "sh", "-c", "curl -f http://localhost:80 || exit 1"],
                    "interval": 1000000000,  # 1 second
                    "timeout": 5000000000,   # 5 seconds
                    "retries": 30,
                    "start_period": 3000000000  # 3 seconds
                }
            )
            
            # Start the container
            container.start()
            print(f"\nCreated and started Docker container {container.id} for instance {instance_id}")
            
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
            networks = inspect_info.get('NetworkSettings', {}).get('Networks', {})
            if 'ai-oa-network' in networks:
                network_info = networks['ai-oa-network']
                print(f"Network IP: {network_info.get('IPAddress', 'N/A')}")
                print(f"Gateway: {network_info.get('Gateway', 'N/A')}")
            
            # Generate subdomain URL (nginx proxy routes to this container)
            access_url = f"https://instance-{instance_id}.verihire.me"
            print(f"\nGenerated access URL: {access_url}")
            print(f"Nginx will route this subdomain to container '{container_name}' on the ai-oa-network")
            
            return {
                'container_id': container.id,
                'port': 80,  # Always port 80 for internal network communication
                'access_url': access_url
            }
        except docker.errors.APIError as e:
            print(f"\nDocker API error creating container: {str(e)}")
            if hasattr(e, 'explanation'):
                print(f"API error explanation: {e.explanation}")
            if hasattr(e, 'stderr'):
                print(f"API error stderr: {e.stderr}")
            raise
        except Exception as e:
            print(f"\nError creating Docker container: {str(e)}")
            if hasattr(e, 'stderr'):
                print(f"Error stderr: {e.stderr}")
            raise
            
    except Exception as e:
        print(f"\nError in create_docker_container: {str(e)}")
        if hasattr(e, 'stderr'):
            print(f"Error stderr: {e.stderr}")
        return None
    finally:
        if conn:
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
        cursor.execute('''
            SELECT t.initial_prompt, t.final_prompt, t.qualitative_assessment_prompt, t.quantitative_assessment_prompt, ti.company_id
            FROM test_instances ti
            JOIN tests t ON ti.test_id = t.id
            WHERE ti.id = %s
        ''', (instance_id,))
        test_record = cursor.fetchone()
        if not test_record:
            print(f"instance with ID {instance_id} not found")
            return {"message": f"Instance with ID {instance_id} not found"}
        
        # Check if a report already exists
        cursor.execute(
            'SELECT * FROM reports WHERE instance_id = %s',
            (instance_id,)
        )
        report_row = cursor.fetchone()
        if not report_row:
            return {"message": f"No report exists for instance {instance_id}"}
        
        return report_row['content']
        
    
    except Exception as e:
        conn.rollback()
        raise e
    
    finally:
        conn.close()

def create_report(instance_id, workspace_content):
    """
    Create a new report for a test instance
    
    Args:
        instance_id (int): The instance ID
        workspace_content (str): The instance workspace content as JSON
    
    Returns:
        dict: The created report data
    """

    # Prompts
    developer_prompt = """You are a technical interviewer analyzing a software engineering candidate's coding project.

    You will be given a codebase that the candidate has written.
    You may be given a chat history of the candidate's responses to your questions in an initial interview, before they start coding, and a final interview, after they have finished coding.
    You may also be given a list of qualitative and quantitative criteria that you will use to evaluate the candidate's performance.

    Your main task is to generate a structured evaluation report in the exact JSON format described in the schema.

    Use only the information provided to you to generate the report.
    If the schema requires a field that you do not have information for, do NOT include false information. Instead, raise this warning in the "report_warnings" field of the report.

    <chat_history>
    The chat history is formatted as follows, where message.role is either "user" or "assistant". "user" messages are the candidate's messages, and "assistant" messages are your messages.

    {
      "role": "user",
      "content": "I am ready to start the initial interview."
    },
    {
      "role": "assistant",
      "content": "Great! Let's start with the project design phase. How would you approach understanding the requirements specified in the README.md file and translating them into a design plan?"
    },
    // ... further messages ...
    </chat_history>

    <code_citations>
    When using markdown in the report, use backticks to format file, directory, function, and class names. Use \( and \) for inline math, \[ and \] for block math.
    
    Anyone reading this report can see the entire file, so they prefer to only read the updates to the code. So, when citing code, prefer to cite short snippets of code rather than the entire file.

    You MUST use the following format when citing code regions or blocks:
    ```12:15:app/components/Todo.tsx
    // ... existing code ...
    ```
    This is the ONLY acceptable format for code citations. The format is ```startLine:endLine:filepath where startLine and endLine are line numbers.
    </code_citations>


    """
    report_instructions = "Your report should contain the following sections:\n"
    input_data = "In generating the report, use only information referenced from the following input data provided:\n"

    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if instance exists and get test data
        cursor.execute('''
            SELECT t.initial_prompt, t.final_prompt, t.qualitative_assessment_prompt, t.quantitative_assessment_prompt, ti.company_id
            FROM test_instances ti
            JOIN tests t ON ti.test_id = t.id
            WHERE ti.id = %s
        ''', (instance_id,))
        test_record = cursor.fetchone()
        if not test_record:
            print(f"instance with ID {instance_id} not found")
            return {"message": f"Instance with ID {instance_id} not found"}
        
        test_data = dict(test_record)
        print("test data:", test_data)
        
        
        # Check if a report already exists
        cursor.execute('SELECT * FROM reports WHERE instance_id = %s', (instance_id,))
        existing_report = cursor.fetchone()
        
        if existing_report:
            # Update existing report
            # cursor.execute(
            #     'UPDATE reports SET content = %s WHERE instance_id = %s',
            #     (content, instance_id)
            # )
            print("Report already exists, ignoring")
            return json.loads(existing_report)
        
        # Create new report
        print("Creating new report")
        field_definitions = {}
        
        field_definitions['code_summary'] = (
            str,
            Field(title="Code Summary", description="Concise summary of the code architecture and implementation.")
        )
        report_instructions += "- Code Summary, based on the content of <input_codebase>\n"
        input_data += "<input_codebase>\n" + workspace_content + "\n</input_codebase>\n"
        
        if test_data['initial_prompt'] or test_data['final_prompt']:
            chat_history_list = get_chat_history(instance_id)
            chat_history = ",\n".join(str(msg) for msg in chat_history_list)
            input_data += "<input_chat_logs>\n" + chat_history + "\n/<input_chat_logs>\n"
        
        if test_data['initial_prompt']:
            field_definitions['initial_interview_summary'] = (
                str,
                Field(title="Initial Interview Summary", description="Summary of the initial interview chat logs.")
            )
            # initial_interview = "placeholder initial" 
            # report_instructions += "- Initial Interview Summary, based on the content of <input_initial_interview>\n"
            # input_data += "<input_initial_interview>\n" + initial_interview + "\n</input_initial_interview>\n"
            report_instructions += "- Final Interview Summary, based on the content of <input_chat_logs> before 'PHASE_MARKER: initial'"
        
        if test_data['final_prompt']:
            field_definitions['final_interview_summary'] = (
                str,
                Field(title="Final Interview Summary", description="Summary of the final interview chat logs.")
            )
            # final_interview = "placeholder final" 
            # report_instructions += "- Final Interview Summary, based on the content of <input_final_interview>\n"
            # input_data += "<input_final_interview>\n" + final_interview + "\n</input_final_interview>\n"
            report_instructions += "- Final Interview Summary, based on the content of <input_chat_logs> after 'PHASE_MARKER: final_started'"

        if test_data['qualitative_assessment_prompt'] != "[]":
            class QualitativeCriterionModel(BaseModel):
                title: str = Field(title="Title", description="Title of the criterion")
                description: str = Field(title="Description", description="Description of the candidate's performance on this criterion")
            
            qualitative_criteria_list = json.loads(test_data['qualitative_assessment_prompt'])
            criteria_count = len(qualitative_criteria_list)
            qualitative_desc = "Qualitative criteria performance assessments:\n"
            qualitative_desc += f"The following {criteria_count} criteria are used to assess the candidate's performance on the project:\n"
            
            for qc in qualitative_criteria_list:
                qualitative_desc += f"- {qc['title']}: {qc['description']}\n"

            field_definitions['qualitative_criteria'] = (
                list[QualitativeCriterionModel],
                Field(title="Qualitative Criteria", description=qualitative_desc)
            )
        
        if test_data['quantitative_assessment_prompt'] != "[]":
            class QuantitativeCriterionModel(BaseModel):
                title: str = Field(title="Title", description="Title of the criterion")
                score: int = Field(title="Score", description="Numerical score for this criterion according to the scoring rubric")
                explanation: str = Field(title="Explanation", description="Justification for the given score")

            quantitative_criteria_list = json.loads(test_data['quantitative_assessment_prompt'])
            criteria_count = len(quantitative_criteria_list)
            quantitative_desc = "Quantitative criteria performance assessments:\n"
            quantitative_desc += f"The following {criteria_count} criteria are used to assess the candidate's performance on the project:\n"

            quantitative_metadata = {}

            for qc in quantitative_criteria_list:
                title = qc["title"]
                descriptors = {k: v for k, v in qc.items() if k != "title" and str(k).isdigit()}
                min_score = min(int(k) for k in descriptors.keys())
                max_score = max(int(k) for k in descriptors.keys())
                quantitative_metadata[title] = {
                    "min_score": min_score,
                    "max_score": max_score,
                    "descriptors": descriptors
                }
            
                quantitative_desc += f"- {title} (score range: {min_score}-{max_score}):\n"
                for k, v in sorted(descriptors.items()):
                    quantitative_desc += f"  {k}: {v}\n"

            # Build a case-insensitive lookup map for quantitative criteria titles
            quantitative_metadata_ci = {title.casefold(): meta for title, meta in quantitative_metadata.items()}

            field_definitions['quantitative_criteria'] = (
                list[QuantitativeCriterionModel],
                Field(title="Quantitative Criteria", description=quantitative_desc)
            )
        
        field_definitions['report_warnings'] = (
            str,
            Field(title="Report Warnings", description="Any critical issues with report generation, such as missing required information, should be explained here.")
        )
        print("added all fields")
        # Step 3: Create the base model dynamically
        DynamicModel = create_model('DynamicModel', **field_definitions)
        print("dynamic model created")
        # Step 4: Define the model with validators (conditional)
        class ReportSchema(DynamicModel):
            class Config:
                extra = 'forbid'

            # Conditional validator for qualitative_criteria
            if test_data['qualitative_assessment_prompt'] != "[]":
                @validator('qualitative_criteria')
                def validate_qualitative_keys(cls, v):
                    expected_keys_ci = {qc['title'].casefold() for qc in qualitative_criteria_list}
                    v_keys_ci = {qc.title.casefold() for qc in v}
                    print(v)
                    print("v_keys (ci):", v_keys_ci)
                    if v_keys_ci != expected_keys_ci:
                        missing_ci = expected_keys_ci - v_keys_ci
                        extra_ci = v_keys_ci - expected_keys_ci
                        error_parts = []
                        if missing_ci:
                            error_parts.append(f"Missing keys (case-insensitive): {missing_ci}")
                        if extra_ci:
                            error_parts.append(f"Extra keys (case-insensitive): {extra_ci}")
                        raise ValueError(", ".join(error_parts))
                    return v

            # Conditional validator for quantitative_criteria
            if test_data['quantitative_assessment_prompt'] != "[]":
                @validator('quantitative_criteria')
                def validate_quantitative_scores(cls, v):
                    for criterion in v:
                        key_ci = criterion.title.casefold()
                        if key_ci not in quantitative_metadata_ci:
                            raise ValueError(f"Unexpected criterion: {criterion.title}")
                        meta = quantitative_metadata_ci[key_ci]
                        score = criterion.score
                        if not (meta["min_score"] <= score <= meta["max_score"]):
                            raise ValueError(
                                f"Score for '{criterion.title}' must be between {meta['min_score']} and {meta['max_score']}"
                            )
                    return v

        print("schema created")
        # Prompt
        messages = []
        messages.append({"role": "developer",
                         "content": developer_prompt + report_instructions})
        messages.append({"role": "user",
                         "content": input_data})
        report_obj = create_report_completion(messages, ReportSchema)
        # Convert Pydantic model to dictionary for JSON serialization
        if hasattr(report_obj, 'model_dump'):
            report = report_obj.model_dump()
        elif hasattr(report_obj, 'dict'):
            report = report_obj.dict()
        else:
            # Fallback to vars if it's not a Pydantic model
            report = vars(report_obj)

        print("api returned")
        print(report)
        
        cursor.execute(
            'INSERT INTO reports (instance_id, company_id, content, created_at, updated_at) VALUES (%s, %s, %s, NOW(), NOW())',
            (instance_id, test_data['company_id'], json.dumps(report))
        ) #TODO: no way to update reports, updated and created are the same
        conn.commit()
        print("report inserted")

        return report
    
    
    except Exception as e:
        conn.rollback()
        raise e
    
    finally:
        conn.close()
