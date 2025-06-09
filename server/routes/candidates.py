from flask import Blueprint, request, jsonify
from controllers.candidates_controller import (
    get_all_candidates, 
    get_candidate, 
    create_candidate, 
    update_candidate, 
    delete_candidate, 
    get_candidate_tests,
    handle_file_upload,
    handle_duplicate_resolution
)
from controllers.auth_controller import require_session_auth
import pandas as pd
from werkzeug.utils import secure_filename
import os

# Create a Blueprint for candidates routes
candidates_bp = Blueprint('candidates', __name__)

def get_user_company_id():
    """Get the company_id from the authenticated user"""
    if hasattr(request, 'user') and request.user:
        # Now this comes from the session-based auth
        return request.user.get('company_id')
    return None

# GET /candidates - Get all candidates
@candidates_bp.route('/', methods=['GET'])
@require_session_auth
def get_candidates():
    try:
        company_id = get_user_company_id()
        candidates = get_all_candidates(company_id)
        return jsonify(candidates)
    except Exception as e:
        print(f'Error getting candidates: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /candidates/:id - Get a single candidate
@candidates_bp.route('/<int:candidate_id>', methods=['GET'])
@require_session_auth
def get_single_candidate(candidate_id):
    try:
        company_id = get_user_company_id()
        candidate = get_candidate(candidate_id, company_id)
        if not candidate:
            return jsonify({'error': f'Candidate {candidate_id} not found'}), 404
        return jsonify(candidate)
    except Exception as e:
        print(f'Error getting candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /candidates - Create a new candidate
@candidates_bp.route('/', methods=['POST'])
@require_session_auth
def create_new_candidate():
    try:
        data = request.json
        company_id = get_user_company_id()
        candidate = create_candidate(data, company_id)
        return jsonify(candidate)
    except Exception as e:
        print(f'Error creating candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# PUT /candidates/:id - Update a candidate
@candidates_bp.route('/<int:candidate_id>', methods=['PUT'])
@require_session_auth
def update_single_candidate(candidate_id):
    try:
        data = request.json
        company_id = get_user_company_id()
        candidate = update_candidate(candidate_id, data, company_id)
        return jsonify(candidate)
    except Exception as e:
        print(f'Error updating candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# DELETE /candidates/:id - Delete a candidate
@candidates_bp.route('/<int:candidate_id>', methods=['DELETE'])
@require_session_auth
def delete_single_candidate(candidate_id):
    try:
        company_id = get_user_company_id()
        result = delete_candidate(candidate_id, company_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error deleting candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /candidates/:id/tests - Get tests for a candidate
@candidates_bp.route('/<int:candidate_id>/tests', methods=['GET'])
@require_session_auth
def get_tests_for_candidate(candidate_id):
    try:
        company_id = get_user_company_id()
        tests = get_candidate_tests(candidate_id, company_id)
        return jsonify(tests)
    except Exception as e:
        print(f'Error getting tests for candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /candidates/upload - Upload candidates from file
@candidates_bp.route('/upload', methods=['POST'])
@require_session_auth
def upload_candidates():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
            
        file = request.files['file']
        company_id = get_user_company_id()
        # Note: handle_file_upload will need to be updated to support company_id
        results = handle_file_upload(file, company_id)
        return jsonify(results)
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'Error uploading candidates: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

# POST /candidates/resolve-duplicates - Handle duplicate resolution
@candidates_bp.route('/resolve-duplicates', methods=['POST'])
@require_session_auth
def resolve_duplicates():
    try:
        data = request.json
        if not data or not isinstance(data, list):
            return jsonify({'error': 'Invalid request data'}), 400
        
        company_id = get_user_company_id()
        # Note: handle_duplicate_resolution will need to be updated to support company_id
        results = handle_duplicate_resolution(data, company_id)
        return jsonify(results)
        
    except Exception as e:
        print(f'Error resolving duplicates: {str(e)}')
        return jsonify({'error': str(e)}), 500 