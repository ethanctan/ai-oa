from flask import Blueprint, request, jsonify
from controllers.instances_controller import get_all_instances, create_instance, get_instance, stop_instance
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