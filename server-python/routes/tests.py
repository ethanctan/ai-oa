from flask import Blueprint, request, jsonify
from controllers.tests_controller import get_all_tests, get_test_by_id, create_test, delete_test

tests_bp = Blueprint('tests', __name__)

@tests_bp.route('', methods=['GET'])
def get_tests():
    """Get all tests"""
    try:
        tests = get_all_tests()
        return jsonify(tests)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@tests_bp.route('/<int:test_id>', methods=['GET'])
def get_single_test(test_id):
    """Get a test by ID"""
    try:
        test = get_test_by_id(test_id)
        return jsonify(test)
    except Exception as e:
        return jsonify({'error': str(e)}), 404 if 'not found' in str(e).lower() else 500

@tests_bp.route('', methods=['POST'])
def create_new_test():
    """Create a new test"""
    try:
        data = request.json
        
        # Extract parameters
        instance_name = data.get('instanceName')
        github_repo = data.get('githubRepo')
        github_token = data.get('githubToken')
        initial_prompt = data.get('initialPrompt')
        final_prompt = data.get('finalPrompt')
        assessment_prompt = data.get('assessmentPrompt')
        candidate_ids = data.get('candidateIds', [])
        
        if not instance_name:
            return jsonify({'error': 'Test name is required'}), 400
        
        # Create test
        test = create_test(
            instance_name=instance_name,
            github_repo=github_repo,
            github_token=github_token,
            initial_prompt=initial_prompt,
            final_prompt=final_prompt,
            assessment_prompt=assessment_prompt,
            candidate_ids=candidate_ids
        )
        
        return jsonify(test), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@tests_bp.route('/<int:test_id>', methods=['DELETE'])
def delete_existing_test(test_id):
    """Delete a test by ID"""
    try:
        result = delete_test(test_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 404 if 'not found' in str(e).lower() else 500 