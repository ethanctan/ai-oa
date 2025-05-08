from flask import Blueprint, request, jsonify
from controllers.instances_controller import get_all_instances, create_instance, get_instance, stop_instance, upload_project_to_github
from controllers.reports_controller import get_report

# Create a Blueprint for instances routes
instances_bp = Blueprint('instances', __name__)

# GET /instances - Get all instances
@instances_bp.route('/', methods=['GET'])
def get_instances():
    try:
        instances = get_all_instances()
        return jsonify(instances)
    except Exception as e:
        print(f'Error getting instances: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /instances - Create a new instance
@instances_bp.route('/', methods=['POST'])
def instances_create():
    try:
        data = request.json
        instance = create_instance(data)
        return jsonify(instance)
    except Exception as e:
        print(f'Error creating instance: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /instances/:id - Get a single instance
@instances_bp.route('/<int:instance_id>', methods=['GET'])
def get_single_instance(instance_id):
    try:
        instance = get_instance(instance_id)
        if not instance:
            return jsonify({'error': f'Instance {instance_id} not found'}), 404
        return jsonify(instance)
    except Exception as e:
        print(f'Error getting instance: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /instances/:id/stop - Stop an instance
@instances_bp.route('/<int:instance_id>/stop', methods=['POST'])
def stop_instance_route(instance_id):
    try:
        result = stop_instance(instance_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error stopping instance: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /instances/:id/report - Get a report for an instance
@instances_bp.route('/<int:instance_id>/report', methods=['GET'])
def get_instance_report(instance_id):
    try:
        report = get_report(instance_id)
        return jsonify(report)
    except Exception as e:
        print(f'Error getting report: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /instances/:instance_id/upload-to-github - Upload project files to GitHub
@instances_bp.route('/<int:instance_id>/upload-to-github', methods=['POST'])
def upload_to_github_route(instance_id):
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part in the request'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        if file and file.filename.endswith('.zip'):
            result = upload_project_to_github(instance_id, file)
            return jsonify(result)
        else:
            return jsonify({'error': 'Invalid file type, please upload a ZIP file'}), 400
            
    except Exception as e:
        print(f'Error uploading to GitHub: {str(e)}')
        return jsonify({'error': str(e)}), 500

# TODO: Route for uploading to gh. Should be separate from report submission route