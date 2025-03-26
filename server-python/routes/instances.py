from flask import Blueprint, request, jsonify
from controllers.instances_controller import create_instance, list_instances, delete_instance

instances_bp = Blueprint('instances', __name__)

@instances_bp.route('', methods=['GET'])
def get_instances():
    """Get all active instances"""
    try:
        instances = list_instances()
        return jsonify(instances)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@instances_bp.route('', methods=['POST'])
def create_new_instance():
    """Create a new instance"""
    try:
        data = request.json
        
        # Extract parameters
        instance_name = data.get('instanceName')
        github_repo = data.get('githubRepo')
        github_token = data.get('githubToken')
        port_mapping = data.get('portMapping')
        initial_prompt = data.get('initialPrompt')
        final_prompt = data.get('finalPrompt')
        assessment_prompt = data.get('assessmentPrompt')
        
        if not instance_name:
            return jsonify({'error': 'Instance name is required'}), 400
        
        # Create instance
        instance = create_instance(
            instance_name=instance_name,
            github_repo=github_repo,
            github_token=github_token,
            port_mapping=port_mapping,
            initial_prompt=initial_prompt,
            final_prompt=final_prompt,
            assessment_prompt=assessment_prompt
        )
        
        return jsonify(instance), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@instances_bp.route('/<instance_id>', methods=['DELETE'])
def delete_existing_instance(instance_id):
    """Delete an instance by ID"""
    try:
        result = delete_instance(instance_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500 