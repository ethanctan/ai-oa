import os
import time
import docker
import subprocess
import shutil
from pathlib import Path
from database.db import get_connection
from controllers.timer_controller import start_instance_timer

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
    
    if not test_id:
        raise ValueError('Test ID is required')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
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
            (test_id, candidate_id, 'pending', 0)
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
            f"INSTANCE_ID={instance_id}"
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
            if candidate_id:
                # Check if the test-candidate relationship exists
                cursor.execute(
                    'SELECT * FROM test_candidates WHERE test_id = ? AND candidate_id = ?',
                    (test_id, candidate_id)
                )
                existing = cursor.fetchone()
                
                if not existing:
                    # Create a new test-candidate relationship
                    cursor.execute(
                        'INSERT INTO test_candidates (test_id, candidate_id, completed) VALUES (?, ?, ?)',
                        (test_id, candidate_id, 0)
                    )
                    
                    # Increment the candidates_assigned count for the test
                    cursor.execute(
                        'UPDATE tests SET candidates_assigned = candidates_assigned + 1 WHERE id = ?',
                        (test_id,)
                    )
                    conn.commit()
            
            # Start a timer for this instance
            start_instance_timer(instance_id)
            
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