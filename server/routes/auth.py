from flask import Blueprint, request, jsonify
import jwt
from controllers.auth_controller import (
    create_or_get_user_from_profile, 
    validate_auth0_token, 
    get_approved_domains_from_env,
    require_auth
)
import logging
import traceback

# Set up logging
logger = logging.getLogger(__name__)

# Create a Blueprint for auth routes
auth_bp = Blueprint('auth', __name__)

# POST /auth/profile - Get or create user from Auth0 profile data
@auth_bp.route('/profile', methods=['POST'])
def get_user_profile():
    
    try:

        data = request.json
        if not data:
            logger.error("AUTH ROUTE: No JSON data received in request")
            return jsonify({'error': 'No JSON data provided'}), 400
            
        
        auth0_user_id = data.get('auth0UserId')
        email = data.get('email')
        name = data.get('name')
    
        
        if not auth0_user_id or not email:
            logger.error("AUTH ROUTE: Auth0 user ID and email are required")
            return jsonify({'error': 'Auth0 user ID and email are required'}), 400
        
        # Create or get user based on profile data
        user = create_or_get_user_from_profile(auth0_user_id, email, name)
                
        return jsonify(user)
        
    except Exception as e:
        logger.error(f'AUTH ROUTE: Error creating/getting user: {str(e)}')
        logger.error(f'AUTH ROUTE: Full traceback: {traceback.format_exc()}')
        return jsonify({'error': str(e)}), 500

# GET /auth/approved-domains - List approved domains 
@auth_bp.route('/approved-domains', methods=['GET'])
@require_auth
def get_approved_domains():
    logger.info("AUTH ROUTE: /auth/approved-domains - Starting approved domains request")
    
    try:
        logger.info("AUTH ROUTE: Getting approved domains from environment")
        domains = get_approved_domains_from_env()
        
        response_data = {
            'source': 'environment',
            'domains': domains,
            'note': 'Domains are managed via APPROVED_DOMAINS environment variable'
        }
        
        logger.info(f"AUTH ROUTE: Successfully retrieved approved domains: {domains}")
        logger.info(f"📤 AUTH ROUTE: Returning response: {response_data}")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f'AUTH ROUTE: Error getting approved domains: {str(e)}')
        logger.error(f'AUTH ROUTE: Full traceback: {traceback.format_exc()}')
        return jsonify({'error': str(e)}), 500 