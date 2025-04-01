from flask import Blueprint, request, jsonify
from controllers.reports_controller import get_report

# Create a Blueprint for reports routes
reports_bp = Blueprint('reports', __name__)

# GET /reports/:instance_id - Get a report for an instance
@reports_bp.route('/<int:instance_id>', methods=['GET'])
def get_instance_report(instance_id):
    try:
        report = get_report(instance_id)
        return jsonify(report)
    except Exception as e:
        print(f'Error getting report: {str(e)}')
        return jsonify({'error': str(e)}), 500 