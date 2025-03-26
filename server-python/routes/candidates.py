from flask import Blueprint, request, jsonify
from controllers.candidates_controller import get_all_candidates, get_candidate_by_id, update_candidate_status

candidates_bp = Blueprint('candidates', __name__)

@candidates_bp.route('', methods=['GET'])
def get_candidates():
    """Get all candidates"""
    try:
        candidates = get_all_candidates()
        return jsonify(candidates)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@candidates_bp.route('/<int:candidate_id>', methods=['GET'])
def get_single_candidate(candidate_id):
    """Get a candidate by ID"""
    try:
        candidate = get_candidate_by_id(candidate_id)
        return jsonify(candidate)
    except Exception as e:
        return jsonify({'error': str(e)}), 404 if 'not found' in str(e).lower() else 500

@candidates_bp.route('/<int:candidate_id>', methods=['PUT'])
def update_candidate(candidate_id):
    """Update a candidate's status"""
    try:
        data = request.json
        completed = data.get('completed')
        
        if completed is None:
            return jsonify({'error': 'Completed status is required'}), 400
        
        candidate = update_candidate_status(candidate_id, completed)
        return jsonify(candidate)
    except Exception as e:
        return jsonify({'error': str(e)}), 404 if 'not found' in str(e).lower() else 500 