from flask import Blueprint, request, jsonify
from controllers.tests_controller import get_all_tests, get_test, create_test, update_test, delete_test, get_test_candidates, assign_candidate_to_test, remove_candidate_from_test, update_candidate_deadline
from controllers.auth_controller import require_session_auth

# Create a Blueprint for tests routes
tests_bp = Blueprint('tests', __name__)

def get_user_company_id():
    """Get the company_id from the authenticated user"""
    if hasattr(request, 'user') and request.user:
        return request.user.get('company_id')
    return None

# GET /tests - Get all tests
@tests_bp.route('/', methods=['GET'])
@require_session_auth
def get_tests():
    try:
        company_id = get_user_company_id()
        tests = get_all_tests(company_id)
        return jsonify(tests)
    except Exception as e:
        print(f'Error getting tests: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /tests/:id - Get a single test
@tests_bp.route('/<int:test_id>', methods=['GET'])
@require_session_auth
def get_single_test(test_id):
    try:
        company_id = get_user_company_id()
        test = get_test(test_id, company_id)
        if not test:
            return jsonify({'error': f'Test {test_id} not found'}), 404
        return jsonify(test)
    except Exception as e:
        print(f'Error getting test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /tests - Create a new test
@tests_bp.route('/', methods=['POST'])
@require_session_auth
def create_new_test():
    try:
        # Handle both JSON and form data
        if request.is_json:
            data = request.json
        else:
            # Handle multipart/form-data or application/x-www-form-urlencoded
            form_data = request.form.to_dict(flat=True)  # Use flat=True for simple values
            data = {}
            
            # Process each field, special handling for candidateIds
            for key in request.form:
                if key == 'candidateIds':
                    # Get all values for candidateIds and convert to integers
                    data['candidateIds'] = [int(id) for id in request.form.getlist('candidateIds')]
                else:
                    data[key] = form_data[key]
            
            # Check if candidateIds was in the form but not processed (could be single value)
            if 'candidateIds' not in data and 'candidateIds' in form_data:
                try:
                    # Try to convert to an integer if it's a single value
                    data['candidateIds'] = [int(form_data['candidateIds'])]
                except (ValueError, TypeError):
                    # If conversion fails, use raw value
                    data['candidateIds'] = [form_data['candidateIds']]
        
        company_id = get_user_company_id()
        data['company_id'] = company_id  # Add company_id to test data
        print(f"Creating test with data: {data}")
        test = create_test(data)
        return jsonify(test)
    except Exception as e:
        print(f'Error creating test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# PUT /tests/:id - Update a test
@tests_bp.route('/<int:test_id>', methods=['PUT'])
@require_session_auth
def update_single_test(test_id):
    try:
        data = request.json
        company_id = get_user_company_id()
        test = update_test(test_id, data, company_id)
        return jsonify(test)
    except Exception as e:
        print(f'Error updating test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# DELETE /tests/:id - Delete a test
@tests_bp.route('/<int:test_id>', methods=['DELETE'])
@require_session_auth
def delete_single_test(test_id):
    try:
        company_id = get_user_company_id()
        result = delete_test(test_id, company_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error deleting test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /tests/:id/candidates - Get candidates for a test
@tests_bp.route('/<int:test_id>/candidates', methods=['GET'])
@require_session_auth
def get_candidates_for_test(test_id):
    try:
        company_id = get_user_company_id()
        candidates = get_test_candidates(test_id, company_id)
        return jsonify(candidates)
    except Exception as e:
        print(f'Error getting candidates for test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /tests/:id/candidates/:candidateId - Assign candidate to test
@tests_bp.route('/<int:test_id>/candidates/<int:candidate_id>', methods=['POST'])
@require_session_auth
def assign_candidate(test_id, candidate_id):
    try:
        data = request.json or {}
        deadline = data.get('deadline')
        company_id = get_user_company_id()
        result = assign_candidate_to_test(test_id, candidate_id, deadline, company_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error assigning candidate to test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# DELETE /tests/:id/candidates/:candidateId - Remove candidate from test
@tests_bp.route('/<int:test_id>/candidates/<int:candidate_id>', methods=['DELETE'])
@require_session_auth
def remove_candidate(test_id, candidate_id):
    try:
        company_id = get_user_company_id()
        result = remove_candidate_from_test(test_id, candidate_id, company_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error removing candidate from test: {str(e)}')
        return jsonify({'error': str(e)}), 500

# PUT /tests/:id/candidates/:candidateId/deadline - Update candidate deadline
@tests_bp.route('/<int:test_id>/candidates/<int:candidate_id>/deadline', methods=['PUT'])
@require_session_auth
def update_candidate_deadline_route(test_id, candidate_id):
    try:
        data = request.json
        deadline = data.get('deadline')
        company_id = get_user_company_id()
        
        # Allow null deadline to remove the deadline
        # No validation needed - null is acceptable
            
        result = update_candidate_deadline(test_id, candidate_id, deadline, company_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error updating candidate deadline: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /tests/:id/try - Try a test (for admins)
@tests_bp.route('/<int:test_id>/try', methods=['POST'])
@require_session_auth
def try_test(test_id):
    try:
        data = request.json
        company_id = get_user_company_id()
        
        # For "try test", we need to create a temporary candidate or use a default one
        # For now, let's create a temporary candidate for admin testing
        from controllers.candidates_controller import create_candidate
        
        # Create a temporary candidate for admin testing
        temp_candidate_data = {
            'name': data.get('adminUser', {}).get('name', 'Admin Test User'),
            'email': f'admin-test-{test_id}@example.com',
            'tags': 'admin-test'
        }
        
        try:
            temp_candidate = create_candidate(temp_candidate_data, company_id)
            candidate_id = temp_candidate['id']
        except ValueError as e:
            if "already exists" in str(e):
                # If candidate already exists, get the existing one
                from controllers.candidates_controller import get_all_candidates
                candidates = get_all_candidates(company_id)
                existing_candidate = next((c for c in candidates if c['email'] == temp_candidate_data['email']), None)
                if existing_candidate:
                    candidate_id = existing_candidate['id']
                else:
                    raise e
            else:
                raise e
        
        # Import here to avoid circular imports
        from controllers.instances_controller import create_instance
        
        instance = create_instance(test_id, candidate_id, company_id)
        
        # Format the response with the specific fields the frontend expects
        response_data = {
            'success': True,
            'instanceId': instance['id'],
            'accessUrl': instance.get('access_url'),
            'instance': {
                'id': instance['id'],
                'port': instance.get('port'),
                'testName': instance.get('test_name', 'Test'),
                'dockerId': instance.get('docker_instance_id'),
            }
        }
        
        print(f"Responding with instance data: {response_data}")
        return jsonify(response_data)
    except Exception as e:
        print(f'Error trying test: {str(e)}')
        return jsonify({'error': str(e), 'success': False}), 500

# POST /tests/:id/send - Send test to candidates
@tests_bp.route('/<int:test_id>/send', methods=['POST'])
@require_session_auth
def send_test(test_id):
    try:
        data = request.json
        candidate_ids = data.get('candidateIds', [])
        company_id = get_user_company_id()
        
        if not candidate_ids:
            return jsonify({'error': 'No candidates specified'}), 400
        
        # Import here to avoid circular imports
        from controllers.instances_controller import create_instance
        
        results = []
        for candidate_id in candidate_ids:
            try:
                instance = create_instance(test_id, candidate_id, company_id)
                results.append({
                    'candidateId': candidate_id,
                    'instanceId': instance['id'],
                    'success': True
                })
            except Exception as e:
                results.append({
                    'candidateId': candidate_id,
                    'error': str(e),
                    'success': False
                })
        
        return jsonify({
            'success': True,
            'candidates': results
        })
    except Exception as e:
        print(f'Error sending test: {str(e)}')
        return jsonify({'error': str(e)}), 500 