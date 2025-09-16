from datetime import datetime, timezone
import secrets
from database.db_postgresql import get_connection

"""
More routes under /instances.
Placed in a separate file for better organization.
"""

def validate_access_token(token):
    """Validate an access token and return the associated instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Get token details
        cursor.execute('SELECT * FROM access_tokens WHERE token = %s', (token,))
        token_record = cursor.fetchone()
        if not token_record:
            return None
        
        # Check if token is expired
        if token_record['expires_at'] and token_record['expires_at'] < datetime.now():
            return None
        
        # Get instance details
        cursor.execute('SELECT * FROM test_instances WHERE id = %s', (token_record['instance_id'],))
        instance = cursor.fetchone()
        if not instance:
            return None
        
        return dict(instance)
    finally:
        conn.close()

def store_access_token(instance_id, token, expires_at=None):
    """Store an access token for an instance"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            '''INSERT INTO access_tokens (instance_id, token, created_at, expires_at)
               VALUES (%s, %s, NOW(), %s)''',
            (instance_id, token, expires_at)
        )
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def revoke_access_token(token):
    """Revoke an access token"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM access_tokens WHERE token = %s', (token,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def generate_instance_access_token(instance_id, candidate_id, expires_at=None):
    """Generate a secure token for instance access"""
    token = secrets.token_urlsafe(32)
    # Store in access_tokens for routing usage
    store_access_token(instance_id, token, expires_at)
    return token

def validate_instance_access(token, instance_id):
    """Validate instance access token"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Get token details with instance validation
        cursor.execute('''
            SELECT iat.*, ti.port 
            FROM instance_access_tokens iat
            JOIN test_instances ti ON iat.instance_id = ti.id
            WHERE iat.token = %s 
            AND iat.instance_id = %s
            AND iat.created_at > NOW() - INTERVAL '24 hours'
        ''', (token, instance_id))
        
        token_data = cursor.fetchone()
        return token_data is not None
    finally:
        conn.close()

def get_instance_url(port, instance_id, access_token):
    """Get the instance URL from port with secure access token.
    Updated to direct to the folder param so code-server opens /home/coder/project on first load.
    """
    # For production, instances are routed via subdomains; however this legacy URL remains for direct access.
    # Append folder query param to ensure initial workspace opens even if session restore is empty.
    return f"https://instance-{instance_id}.verihire.me/?access_token={access_token}&folder=/home/coder/project"

def validate_access_token_for_redirect(token):
    """Validate an access token for redirect without marking it as used"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get token details and the CURRENT deadline from test_candidates table
        cursor.execute('''
            SELECT at.*, ti.port, ti.docker_instance_id, c.name as candidate_name, t.name as test_name,
                   tc.deadline as current_deadline, ti.id as instance_id, c.id as candidate_id
            FROM access_tokens at
            JOIN test_instances ti ON at.instance_id = ti.id
            JOIN candidates c ON ti.candidate_id = c.id
            JOIN tests t ON ti.test_id = t.id
            JOIN test_candidates tc ON t.id = tc.test_id AND c.id = tc.candidate_id
            WHERE at.token = %s
        ''', (token,))
        
        token_data = cursor.fetchone()
        
        if not token_data:
            return None
        
        token_dict = dict(token_data)
        # Generate instance access token
        instance_access_token = generate_instance_access_token(token_dict['instance_id'], token_dict['candidate_id'])
        token_dict['instance_access_token'] = instance_access_token
        # Use the current deadline from test_candidates, not the static one from access_tokens
        token_dict['deadline'] = token_dict['current_deadline']
        
        return token_dict
        
    except Exception as e:
        print(f"Error validating access token: {e}")
        return None
    finally:
        conn.close()

def check_deadline_expired(deadline_str):
    """Check if a deadline has expired"""
    if not deadline_str:
        return False, None
    
    try:
        deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
        is_expired = datetime.now(timezone.utc) > deadline
        deadline_formatted = deadline.strftime('%B %d, %Y at %I:%M %p EST')
        return is_expired, deadline_formatted
    except Exception as e:
        print(f"Error parsing deadline: {e}")
        return True, None  # Treat invalid deadlines as expired 