from flask import Blueprint, request, jsonify
from controllers.timer_controller import start_instance_timer, get_timer_status, reset_timer, set_interview_started, start_project_timer, set_final_interview_started

# Create a Blueprint for timer routes
timer_bp = Blueprint('timer', __name__)

# POST /timer/start - Start a timer for an instance
@timer_bp.route('/start', methods=['POST'])
def start_timer():
    try:
        data = request.json
        instance_id = data.get('instanceId')
        enable_timer = data.get('enableTimer', True)  # Default to enabled if not specified
        
        # If timer is disabled, set duration to 0
        if enable_timer:
            duration = data.get('duration', 60 * 10)  # Default: 10 minutes in seconds
        else:
            duration = 0  # A duration of 0 will be treated as disabled in the controller
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        # Start the timer
        timer_info = start_instance_timer(instance_id, duration)
        
        return jsonify({
            'success': True,
            'timer': timer_info
        })
    except Exception as e:
        print(f"Error starting timer: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# POST /timer/project/start - Start a project timer for the work phase
@timer_bp.route('/project/start', methods=['POST'])
def start_project_timer_route():
    try:
        data = request.json
        instance_id = data.get('instanceId')
        enable_timer = data.get('enableTimer', True)  # Default to enabled if not specified
        
        # If timer is disabled, set duration to 0
        if enable_timer:
            duration = data.get('duration', 60 * 60)  # Default: 60 minutes in seconds
        else:
            duration = 0  # A duration of 0 will be treated as disabled in the controller
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        # Start the project timer
        timer_info = start_project_timer(instance_id, duration)
        
        return jsonify({
            'success': True,
            'timer': timer_info
        })
    except Exception as e:
        print(f"Error starting project timer: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# GET /timer/status - Get status of a timer
@timer_bp.route('/status', methods=['GET'])
def timer_status():
    try:
        instance_id = request.args.get('instanceId')
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        timer = get_timer_status(instance_id)
        if not timer:
            return jsonify({
                'success': False,
                'error': 'No timer found for this instance'
            }), 404
        
        return jsonify({
            'success': True,
            'timer': timer
        })
    except Exception as e:
        print(f"Error getting timer status: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# POST /timer/reset - Reset a timer for an instance
@timer_bp.route('/reset', methods=['POST'])
def reset_instance_timer():
    try:
        data = request.json
        instance_id = data.get('instanceId')
        enable_timer = data.get('enableTimer', True)  # Default to enabled if not specified
        timer_type = data.get('timerType', None)  # Optional timer type
        
        # If timer is disabled, set duration to 0
        if enable_timer:
            duration = data.get('duration', 60 * 10)  # Default: 10 minutes in seconds
        else:
            duration = 0  # A duration of 0 will be treated as disabled in the controller
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        # Reset the timer
        timer_info = reset_timer(instance_id, duration, timer_type)
        
        return jsonify({
            'success': True,
            'timer': timer_info
        })
    except Exception as e:
        print(f"Error resetting timer: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# POST /timer/interview-started - Mark an interview as started
@timer_bp.route('/interview-started', methods=['POST'])
def mark_interview_started():
    try:
        data = request.json
        instance_id = data.get('instanceId')
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        # Update timer with interview started flag
        timer = set_interview_started(instance_id, True)
        
        if not timer:
            return jsonify({
                'success': False,
                'error': 'No timer found for this instance'
            }), 404
        
        # Return the updated timer status
        return jsonify({
            'success': True,
            'timer': timer,
            'interviewStarted': True
        })
    except Exception as e:
        print(f"Error marking interview started: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# POST /timer/final-interview-started - Mark final interview as started
@timer_bp.route('/final-interview-started', methods=['POST'])
def mark_final_interview_started():
    try:
        data = request.json
        instance_id = data.get('instanceId')
        
        if not instance_id:
            return jsonify({
                'success': False,
                'error': 'Instance ID is required'
            }), 400
        
        # Update timer with final interview started flag
        timer = set_final_interview_started(instance_id, True)
        
        if not timer:
            return jsonify({
                'success': False,
                'error': 'No timer found for this instance'
            }), 404
        
        # Return the updated timer status
        return jsonify({
            'success': True,
            'timer': timer,
            'finalInterviewStarted': True
        })
    except Exception as e:
        print(f"Error marking final interview started: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500 