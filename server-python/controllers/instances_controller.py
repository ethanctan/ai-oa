import os
import docker
import json
from datetime import datetime
from pathlib import Path
from helpers.git_helpers import clone_repo

# Base directory where cloned repositories will be stored
BASE_PROJECTS_DIR = os.getenv('PROJECTS_PATH', '/tmp/code-server-projects')
DOCKER_IMAGE = os.getenv('DOCKER_IMAGE', 'my-code-server-with-extension')

# Ensure the base directory exists
if not os.path.exists(BASE_PROJECTS_DIR):
    os.makedirs(BASE_PROJECTS_DIR, exist_ok=True)

# Initialize Docker client
client = docker.from_env()

def create_instance(instance_name, project_path=None, github_repo=None, github_token=None, 
                   port_mapping=None, initial_prompt=None, final_prompt=None, assessment_prompt=None):
    """
    Create a new Code-Server instance.
    
    Args:
        instance_name (str): Unique name for the instance
        project_path (str, optional): Local project path
        github_repo (str, optional): GitHub repository URL to clone
        github_token (str, optional): GitHub token for private repos
        port_mapping (str, optional): Host port mapping for container
        initial_prompt (str, optional): Initial interview prompt
        final_prompt (str, optional): Final interview prompt
        assessment_prompt (str, optional): Assessment criteria prompt
        
    Returns:
        dict: Instance details including container ID and port
    """
    # Determine final project path
    final_project_path = project_path
    
    # If GitHub repo provided, clone it
    if github_repo:
        target_folder = os.path.join(BASE_PROJECTS_DIR, f"{instance_name}-{int(datetime.now().timestamp())}")
        clone_success = clone_repo(github_repo, target_folder, github_token)
        if clone_success:
            final_project_path = target_folder
        else:
            raise Exception("Failed to clone repository")
    
    # Define container configuration
    volumes = {}
    if final_project_path:
        volumes[final_project_path] = {'bind': '/home/coder/project', 'mode': 'rw'}
    
    # Setup the command to create prompt files
    cmd = [
        "/bin/sh",
        "-c",
        f"echo '{initial_prompt or ''}' > .initialPrompt.txt && "
        f"echo '{final_prompt or ''}' > .finalPrompt.txt && "
        f"echo '{assessment_prompt or ''}' > .assessmentPrompt.txt"
    ]
    
    # Create and start the container
    try:
        container = client.containers.create(
            image=DOCKER_IMAGE,
            name=instance_name,
            environment={
                'DOCKER_USER': os.getenv('USER', 'coder')
            },
            command=cmd,
            ports={'8080/tcp': port_mapping or None},
            volumes=volumes
        )
        
        container.start()
        
        # Get container info to determine assigned port
        container_info = client.containers.get(container.id)
        port = None
        
        # Extract the port information
        ports = container_info.attrs['NetworkSettings']['Ports']
        if '8080/tcp' in ports and ports['8080/tcp']:
            port = ports['8080/tcp'][0]['HostPort']
        
        return {
            'containerId': container.id,
            'instanceName': instance_name,
            'port': port or 'unknown'
        }
        
    except Exception as e:
        raise Exception(f"Error creating container: {str(e)}")

def list_instances():
    """
    List all active Code-Server instances.
    
    Returns:
        list: List of active containers
    """
    try:
        # Get only running containers
        containers = client.containers.list(all=False)
        
        # Convert to a list of dictionaries with the same format as the Node.js API
        container_list = []
        for container in containers:
            # Get container info to extract ports
            container_info = container.attrs
            
            # Build ports information
            ports = []
            if 'Ports' in container_info['NetworkSettings']:
                for port_config in container_info['NetworkSettings']['Ports'].items():
                    if port_config[1]:
                        for mapping in port_config[1]:
                            ports.append({
                                'IP': mapping.get('HostIp', '0.0.0.0'),
                                'PrivatePort': int(port_config[0].split('/')[0]),
                                'PublicPort': int(mapping.get('HostPort', 0)),
                                'Type': port_config[0].split('/')[1]
                            })
            
            # Add container to list
            container_list.append({
                'Id': container.id,
                'Names': [container.name],
                'Image': container.image.tags[0] if container.image.tags else container.image.id,
                'Status': container.status,
                'Ports': ports
            })
            
        return container_list
    except Exception as e:
        raise Exception(f"Error listing containers: {str(e)}")

def delete_instance(instance_id):
    """
    Terminate a Code-Server instance.
    
    Args:
        instance_id (str): The Docker container ID
        
    Returns:
        dict: Status message
    """
    try:
        container = client.containers.get(instance_id)
        container.stop()
        container.remove()
        return {
            'message': 'Instance terminated',
            'containerId': instance_id
        }
    except Exception as e:
        raise Exception(f"Error deleting container: {str(e)}") 