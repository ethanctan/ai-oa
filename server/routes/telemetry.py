from flask import Blueprint, request, jsonify
from controllers.telemetry_controller import insert_telemetry_events


telemetry_bp = Blueprint('telemetry', __name__)


@telemetry_bp.route('/', methods=['POST'])
def post_telemetry():
    try:
        data = request.json or {}
        instance_id = data.get('instanceId')
        session_id = data.get('sessionId') or 'unknown'
        events = data.get('events') or []

        if not instance_id:
            return jsonify({'success': False, 'error': 'instanceId is required'}), 400

        inserted = insert_telemetry_events(instance_id, session_id, events)
        return jsonify({'success': True, 'inserted': inserted})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


