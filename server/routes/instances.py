from flask import Blueprint, request, jsonify, redirect, render_template_string
from controllers.instances_controller import get_all_instances, create_instance, get_instance, stop_instance, upload_project_to_github
from controllers.timer_controller import delete_timer, load_timers
from controllers.reports_controller import get_report
from controllers.email_controller import send_test_invitation
from controllers.access_controller import validate_access_token_for_redirect, check_deadline_expired, get_instance_url

# Create a Blueprint for instances routes
instances_bp = Blueprint('instances', __name__)

# GET /instances/access/<token> - Access test instance via token with deadline validation
@instances_bp.route('/access/<token>')
def access_test_instance(token):
    """
    Handle access token redirect - validate deadline and redirect to test instance
    """
    try:
        # Validate the access token and get instance details
        token_data = validate_access_token_for_redirect(token)
        
        if not token_data:
            return render_error_page("Invalid or expired access link", 
                                   "This link is not valid. Please contact the administrator for a new link.")
        
        # Check if deadline has passed
        is_expired, deadline_formatted = check_deadline_expired(token_data['deadline'])
        if is_expired:
            if deadline_formatted:
                message = f"The deadline for this assessment was {deadline_formatted}. You can no longer access this test."
            else:
                message = "There was an issue with the deadline configuration. Please contact the administrator."
            return render_error_page("Assessment Deadline Passed", message)
        
        # Generate the secure instance URL with access token
        instance_url = get_instance_url(
            token_data['port'],
            token_data['instance_id'],
            token_data['instance_access_token']
        )
        return redirect(instance_url)
        
    except Exception as e:
        print(f"Error in access_test_instance: {str(e)}")
        return render_error_page("Access Error", 
                               "There was an error accessing your test. Please contact the administrator.")

# GET /instances/<instance_id>/validate - Validate instance access
@instances_bp.route('/instances/<int:instance_id>/validate')
def validate_instance_access_token(instance_id):
    """Validate instance access token"""
    access_token = request.args.get('access_token')
    if not access_token:
        return jsonify({'valid': False, 'error': 'No access token provided'}), 401
    
    try:
        is_valid = validate_instance_access(access_token, instance_id)
        return jsonify({'valid': is_valid}), 200 if is_valid else 401
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 500

def render_error_page(title, message):
    """Render a simple error page"""
    html_template = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{{ title }}</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #f9fafb;
                margin: 0;
                padding: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }
            .container {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                padding: 2rem;
                max-width: 500px;
                text-align: center;
            }
            .title {
                color: #dc2626;
                font-size: 1.5rem;
                font-weight: 600;
                margin-bottom: 1rem;
            }
            .message {
                color: #374151;
                line-height: 1.6;
                margin-bottom: 1.5rem;
            }
            .contact {
                color: #6b7280;
                font-size: 0.875rem;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">{{ title }}</div>
            <div class="message">{{ message }}</div>
            <div class="contact">
                If you believe this is an error, please contact your assessment administrator.
            </div>
        </div>
    </body>
    </html>
    """
    return render_template_string(html_template, title=title, message=message), 400

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
        # Stop the container
        result = stop_instance(instance_id)
        # Also delete timer state for this instance
        try:
            delete_timer(instance_id)
        except Exception as e:
            print(f"Warning: failed to delete timer for instance {instance_id}: {str(e)}")
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

# POST /instances/send-invitations - Send test invitations via email
@instances_bp.route('/send-invitations', methods=['POST'])
def send_invitations():
    try:
        data = request.json
        test_id = data.get('testId')
        candidate_ids = data.get('candidateIds', [])
        deadline = data.get('deadline')
        
        if not test_id:
            return jsonify({'error': 'Test ID is required'}), 400
        
        if not candidate_ids:
            return jsonify({'error': 'At least one candidate ID is required'}), 400
        
        # Send invitations
        results = send_test_invitation(test_id, candidate_ids, deadline)
        
        return jsonify({
            'success': True,
            'message': f'Sent {len(results["success"])} invitations successfully, {len(results["errors"])} failed',
            'results': results
        })
        
    except Exception as e:
        print(f'Error sending invitations: {str(e)}')
        return jsonify({'error': str(e)}), 500