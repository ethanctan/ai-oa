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
import pandas as pd
from werkzeug.utils import secure_filename
import os

# Create a Blueprint for candidates routes
candidates_bp = Blueprint('candidates', __name__)

# GET /candidates - Get all candidates
@candidates_bp.route('/', methods=['GET'])
def get_candidates():
    try:
        candidates = get_all_candidates()
        return jsonify(candidates)
    except Exception as e:
        print(f'Error getting candidates: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /candidates/:id - Get a single candidate
@candidates_bp.route('/<int:candidate_id>', methods=['GET'])
def get_single_candidate(candidate_id):
    try:
        candidate = get_candidate(candidate_id)
        if not candidate:
            return jsonify({'error': f'Candidate {candidate_id} not found'}), 404
        return jsonify(candidate)
    except Exception as e:
        print(f'Error getting candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /candidates - Create a new candidate
@candidates_bp.route('/', methods=['POST'])
def create_new_candidate():
    try:
        data = request.json
        candidate = create_candidate(data)
        return jsonify(candidate)
    except Exception as e:
        print(f'Error creating candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# PUT /candidates/:id - Update a candidate
@candidates_bp.route('/<int:candidate_id>', methods=['PUT'])
def update_single_candidate(candidate_id):
    try:
        data = request.json
        candidate = update_candidate(candidate_id, data)
        return jsonify(candidate)
    except Exception as e:
        print(f'Error updating candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# DELETE /candidates/:id - Delete a candidate
@candidates_bp.route('/<int:candidate_id>', methods=['DELETE'])
def delete_single_candidate(candidate_id):
    try:
        result = delete_candidate(candidate_id)
        return jsonify(result)
    except Exception as e:
        print(f'Error deleting candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# GET /candidates/:id/tests - Get tests for a candidate
@candidates_bp.route('/<int:candidate_id>/tests', methods=['GET'])
def get_tests_for_candidate(candidate_id):
    try:
        tests = get_candidate_tests(candidate_id)
        return jsonify(tests)
    except Exception as e:
        print(f'Error getting tests for candidate: {str(e)}')
        return jsonify({'error': str(e)}), 500

# POST /candidates/upload - Upload candidates from file
@candidates_bp.route('/upload', methods=['POST'])
def upload_candidates():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
            
        file = request.files['file']
        results = handle_file_upload(file)
        return jsonify(results)
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'Error uploading candidates: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

# POST /candidates/resolve-duplicates - Handle duplicate resolution
@candidates_bp.route('/resolve-duplicates', methods=['POST'])
def resolve_duplicates():
    try:
        data = request.json
        if not data or not isinstance(data, list):
            return jsonify({'error': 'Invalid request data'}), 400
            
        results = handle_duplicate_resolution(data)
        return jsonify(results)
        
    except Exception as e:
        print(f'Error resolving duplicates: {str(e)}')
        return jsonify({'error': str(e)}), 500 