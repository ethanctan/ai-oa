import requests
import jwt
from jwt import PyJWKClient
from database.db_postgresql import get_connection
import os
from functools import wraps
from flask import request, jsonify
import traceback
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def require_session_auth(f):
    """Middleware for session-based authentication (used with Remix Auth)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.info(f"🔐 SESSION AUTH: Checking session authentication for {request.endpoint}")
        
        # Check for custom headers from frontend session
        user_id = request.headers.get('X-User-ID')
        company_id = request.headers.get('X-Company-ID') 
        auth0_user_id = request.headers.get('X-Auth0-User-ID')
        
        logger.info(f"📋 SESSION AUTH: Headers received:")
        logger.info(f"   - X-User-ID: {user_id}")
        logger.info(f"   - X-Company-ID: {company_id}")
        logger.info(f"   - X-Auth0-User-ID: {auth0_user_id}")
        
        if not user_id or not company_id or not auth0_user_id:
            logger.warning("❌ SESSION AUTH: Missing required authentication headers")
            logger.warning(f"   - User ID: {'✓' if user_id else '✗'}")
            logger.warning(f"   - Company ID: {'✓' if company_id else '✗'}")
            logger.warning(f"   - Auth0 User ID: {'✓' if auth0_user_id else '✗'}")
            return jsonify({'error': 'Authentication required'}), 401
        
        try:
            # Verify user exists in database
            conn = get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT u.*, c.name as company_name 
                FROM users u
                JOIN companies c ON u.company_id = c.id
                WHERE u.id = ? AND u.company_id = ? AND u.auth0_user_id = ?
            ''', (user_id, company_id, auth0_user_id))
            
            user = cursor.fetchone()
            conn.close()
            
            if not user:
                logger.warning(f"❌ SESSION AUTH: User not found or data mismatch")
                logger.warning(f"   - Attempted lookup: user_id={user_id}, company_id={company_id}, auth0_user_id={auth0_user_id}")
                return jsonify({'error': 'User not found'}), 401
            
            # Convert to dict and attach to request
            request.user = dict(user)
            logger.info(f"✅ SESSION AUTH: Authentication successful for user: {request.user['email']}")
            logger.info(f"   - User ID: {request.user['id']}")
            logger.info(f"   - Company: {request.user['company_name']}")
            
            return f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f'❌ SESSION AUTH: Database error during authentication: {str(e)}')
            logger.error(f'❌ SESSION AUTH: Full traceback: {traceback.format_exc()}')
            return jsonify({'error': 'Authentication failed'}), 401
    
    return decorated_function

def require_auth(f):
    """Middleware to require authentication - moved from routes to controller"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.info(f"🔐 AUTH MIDDLEWARE: Checking authentication for {request.endpoint}")
        
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            logger.warning("❌ AUTH MIDDLEWARE: No authorization header found")
            return jsonify({'error': 'No authorization header'}), 401
        
        logger.info(f"🔑 AUTH MIDDLEWARE: Found auth header: {auth_header[:20]}...")
        
        try:
            # Extract token from "Bearer <token>"
            token = auth_header.split(' ')[1] if auth_header.startswith('Bearer ') else auth_header
            logger.info(f"🎫 AUTH MIDDLEWARE: Extracted token: {token[:30]}...")
            
            user_data = validate_auth0_token(token)
            logger.info(f"✅ AUTH MIDDLEWARE: Token validated successfully for user: {user_data.get('sub', 'unknown')}")
            
            request.user = user_data
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f'❌ AUTH MIDDLEWARE: Auth error: {str(e)}')
            logger.error(f'❌ AUTH MIDDLEWARE: Full traceback: {traceback.format_exc()}')
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function

def validate_auth0_token(token):
    """Validate an Auth0 JWT token and return user info"""
    logger.info("🔍 TOKEN VALIDATION: Starting Auth0 token validation")
    
    try:
        # Get Auth0 domain from environment
        auth0_domain = os.environ.get('AUTH0_DOMAIN')
        if not auth0_domain:
            logger.error("❌ TOKEN VALIDATION: AUTH0_DOMAIN environment variable not set")
            raise ValueError('AUTH0_DOMAIN environment variable not set')
        
        logger.info(f"🌐 TOKEN VALIDATION: Using Auth0 domain: {auth0_domain}")
        
        # Get the JWKS URL for your Auth0 domain
        jwks_url = f"https://{auth0_domain}/.well-known/jwks.json"
        logger.info(f"🔗 TOKEN VALIDATION: JWKS URL: {jwks_url}")
        
        # Create a PyJWKClient instance
        jwks_client = PyJWKClient(jwks_url)
        
        # Get the signing key from the JWT token
        logger.info("🔑 TOKEN VALIDATION: Getting signing key from JWT token")
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Decode and validate the token (without audience validation for basic auth)
        logger.info("🔓 TOKEN VALIDATION: Decoding and validating token")
        decoded_token = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            # Removed audience validation - not needed for basic user authentication
            issuer=f"https://{auth0_domain}/"
        )
        
        logger.info(f"✅ TOKEN VALIDATION: Token validated successfully for user: {decoded_token.get('sub', 'unknown')}")
        logger.info(f"📋 TOKEN VALIDATION: Token contains: {list(decoded_token.keys())}")
        
        return decoded_token
        
    except jwt.ExpiredSignatureError as e:
        logger.error(f"⏰ TOKEN VALIDATION: Token has expired: {str(e)}")
        raise ValueError('Token has expired')
    except jwt.InvalidTokenError as e:
        logger.error(f"🚫 TOKEN VALIDATION: Invalid token: {str(e)}")
        raise ValueError(f'Invalid token: {str(e)}')
    except Exception as e:
        logger.error(f"💥 TOKEN VALIDATION: Token validation failed: {str(e)}")
        logger.error(f"💥 TOKEN VALIDATION: Full traceback: {traceback.format_exc()}")
        raise ValueError(f'Token validation failed: {str(e)}')

def get_user_info_from_auth0(access_token):
    """Get user information from Auth0 userinfo endpoint"""
    logger.info("👤 USER INFO: Getting user information from Auth0")
    
    try:
        auth0_domain = os.environ.get('AUTH0_DOMAIN')
        userinfo_url = f"https://{auth0_domain}/userinfo"
        
        logger.info(f"🌐 USER INFO: Calling Auth0 userinfo endpoint: {userinfo_url}")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(userinfo_url, headers=headers)
        response.raise_for_status()
        
        user_info = response.json()
        logger.info(f"✅ USER INFO: Successfully retrieved user info for: {user_info.get('email', 'unknown')}")
        logger.info(f"📋 USER INFO: User info contains: {list(user_info.keys())}")
        
        return user_info
        
    except requests.RequestException as e:
        logger.error(f"❌ USER INFO: Failed to get user info from Auth0: {str(e)}")
        logger.error(f"❌ USER INFO: Full traceback: {traceback.format_exc()}")
        raise ValueError(f'Failed to get user info from Auth0: {str(e)}')

def get_approved_domains_from_env():
    """Get approved domains from environment variable"""
    logger.info("🏢 DOMAINS: Getting approved domains from environment")
    
    approved_domains_str = os.environ.get('APPROVED_DOMAINS', '')
    if not approved_domains_str:
        logger.error("❌ DOMAINS: APPROVED_DOMAINS environment variable not set")
        raise ValueError('APPROVED_DOMAINS environment variable not set. Please configure approved business domains.')
    
    # Support comma-separated list: "company1.com,company2.com,company3.com"
    domains = [domain.strip() for domain in approved_domains_str.split(',') if domain.strip()]
    logger.info(f"✅ DOMAINS: Found approved domains: {domains}")
    
    return domains

def is_domain_approved(domain):
    """Check if domain is approved"""
    logger.info(f"🔍 DOMAIN CHECK: Checking if domain '{domain}' is approved")
    
    try:
        approved_domains = get_approved_domains_from_env()
        is_approved = domain.lower() in [d.lower() for d in approved_domains]
        
        if is_approved:
            logger.info(f"✅ DOMAIN CHECK: Domain '{domain}' is approved")
        else:
            logger.warning(f"❌ DOMAIN CHECK: Domain '{domain}' is NOT approved")
            
        return is_approved
    except ValueError as e:
        logger.error(f"❌ DOMAIN CHECK: Error checking domain approval: {str(e)}")
        # If no approved domains configured, reject all
        return False

def get_or_create_company_from_email(email):
    """Get or create company based on email domain - only allows approved domains"""
    logger.info(f"🏢 COMPANY: Getting or creating company for email: {email}")
    
    # Extract domain from email
    domain = email.split('@')[1] if '@' in email else 'unknown.com'
    logger.info(f"🏢 COMPANY: Extracted domain: {domain}")
    
    # Check if domain is approved
    if not is_domain_approved(domain):
        logger.error(f"❌ COMPANY: Domain {domain} is not authorized")
        raise ValueError(f'Domain {domain} is not authorized. Only approved business domains can access this platform.')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if company exists with this domain
        logger.info(f"🔍 COMPANY: Checking if company exists for domain: {domain}")
        cursor.execute('SELECT * FROM companies WHERE domain = %s', (domain,))
        company = cursor.fetchone()
        
        if company:
            company_dict = dict(company)
            logger.info(f"✅ COMPANY: Found existing company: {company_dict['name']} (ID: {company_dict['id']})")
            return company_dict
        
        # Create new company (since domain is approved)
        company_name = f"{domain.split('.')[0].title()} Company"
        logger.info(f"🆕 COMPANY: Creating new company: {company_name}")
        
        # Use RETURNING clause to get the created company in one query
        cursor.execute(
            '''INSERT INTO companies (name, domain, approved) 
               VALUES (%s, %s, %s)
               RETURNING *''',
            (company_name, domain, 1)
        )
        new_company = dict(cursor.fetchone())
        conn.commit()
        
        logger.info(f"✅ COMPANY: Created new company: {new_company['name']} (ID: {new_company['id']})")
        return new_company
        
    except Exception as e:
        logger.error(f"❌ COMPANY: Error getting/creating company: {str(e)}")
        logger.error(f"❌ COMPANY: Full traceback: {traceback.format_exc()}")
        conn.rollback()
        raise e
    finally:
        conn.close()

def create_or_get_user_from_profile(auth0_user_id, email, name):
    """Create or get user from Auth0 profile data - only for approved domains"""
    logger.info(f"👤 USER PROFILE: Creating or getting user profile")
    logger.info(f"👤 USER PROFILE: Auth0 User ID: {auth0_user_id}")
    logger.info(f"👤 USER PROFILE: Email: {email}")
    logger.info(f"👤 USER PROFILE: Name: {name}")
    
    try:
        if not auth0_user_id or not email:
            logger.error("❌ USER PROFILE: Invalid user info from Auth0 - missing auth0_user_id or email")
            raise ValueError('Invalid user info from Auth0')
        
        # Check if user's domain is approved (this will raise an error if not)
        logger.info("🏢 USER PROFILE: Validating company/domain")
        company = get_or_create_company_from_email(email)
        logger.info(f"✅ USER PROFILE: Company validation successful: {company['name']}")
        
        conn = get_connection()
        cursor = conn.cursor()
        
        try:
            # Check if user already exists
            logger.info(f"🔍 USER PROFILE: Checking if user exists: {auth0_user_id}")
            cursor.execute('SELECT * FROM users WHERE auth0_user_id = %s', (auth0_user_id,))
            existing_user = cursor.fetchone()
            
            if existing_user:
                user = dict(existing_user)
                logger.info(f"✅ USER PROFILE: Found existing user: {user['email']} (ID: {user['id']})")
                
                # Get company info
                cursor.execute('SELECT * FROM companies WHERE id = %s', (user['company_id'],))
                company = dict(cursor.fetchone())
                user['companyName'] = company['name']
                
                logger.info(f"📋 USER PROFILE: Returning existing user data: {user}")
                return user
            
            # Create new user (company already validated above)
            logger.info("🆕 USER PROFILE: Creating new user")
            cursor.execute(
                '''INSERT INTO users (auth0_user_id, email, name, company_id, role) 
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING *''',
                (auth0_user_id, email, name, company['id'], 'recruiter')
            )
            user = dict(cursor.fetchone())
            user['companyName'] = company['name']
            conn.commit()
            
            logger.info(f"✅ USER PROFILE: Created new user: {user['email']} (ID: {user['id']})")
            logger.info(f"📋 USER PROFILE: Returning new user data: {user}")
            
            return user
            
        except Exception as e:
            logger.error(f"❌ USER PROFILE: Database error: {str(e)}")
            logger.error(f"❌ USER PROFILE: Full traceback: {traceback.format_exc()}")
            conn.rollback()
            raise e
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"❌ USER PROFILE: Access denied: {str(e)}")
        logger.error(f"❌ USER PROFILE: Full traceback: {traceback.format_exc()}")
        raise ValueError(f'Access denied: {str(e)}') 