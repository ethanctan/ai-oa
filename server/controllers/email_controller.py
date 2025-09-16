import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
import secrets
import hashlib
from database.db_postgresql import get_connection
from controllers.instances_controller import create_instance
from typing import List

"""
More routes under /instances.
Placed in a separate file for better organization.
"""

def send_test_invitation(test_id, candidate_id, company_id, deadline=None):
    """Send a test invitation email to a candidate (single)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Get test details
        cursor.execute('SELECT * FROM tests WHERE id = %s', (test_id,))
        test = cursor.fetchone()
        if not test:
            raise ValueError('Test not found')
        
        # Get candidate details
        cursor.execute('SELECT * FROM candidates WHERE id = %s', (candidate_id,))
        candidate = cursor.fetchone()
        if not candidate:
            raise ValueError('Candidate not found')
        
        # Create test instance
        cursor.execute(
            '''INSERT INTO test_instances (test_id, candidate_id, company_id, created_at, updated_at)
               VALUES (%s, %s, %s, NOW(), NOW())''',
            (test_id, candidate_id, company_id)
        )
        conn.commit()
        
        # Get the created instance
        instance_id = cursor.lastrowid
        cursor.execute('SELECT * FROM test_instances WHERE id = %s', (instance_id,))
        instance = cursor.fetchone()
        
        # Build access URL (tokenized flow can be added later)
        access_url = f"https://instance-{instance_id}.verihire.me"

        # Send email using current send_email signature
        send_email(
            candidate['email'],
            candidate.get('name') or '',
            test.get('name') or 'Assessment',
            access_url,
            deadline
        )
        
        return dict(instance)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def send_test_invitations(test_id: int, candidate_ids: List[int], deadline: str = None):
    """Send invitations to multiple candidates; returns summary with successes/errors.

    Uses the test's company_id for instance creation.
    """
    conn = get_connection()
    cursor = conn.cursor()
    results = { 'success': [], 'errors': [] }
    try:
        # Fetch test once to get company_id and details
        cursor.execute('SELECT * FROM tests WHERE id = %s', (test_id,))
        test = cursor.fetchone()
        if not test:
            raise ValueError('Test not found')
        company_id = test.get('company_id') if isinstance(test, dict) else test['company_id']

        for cid in candidate_ids:
            try:
                # Ensure integer id
                candidate_id = int(cid)
                # Fetch candidate for name/email
                cursor.execute('SELECT name, email FROM candidates WHERE id = %s', (candidate_id,))
                cand = cursor.fetchone() or {'name': '', 'email': ''}
                instance = send_test_invitation(test_id, candidate_id, company_id, deadline)
                results['success'].append({ 'candidateId': candidate_id, 'instanceId': instance['id'], 'candidate_name': cand.get('name'), 'candidate_email': cand.get('email') })
            except Exception as e:
                results['errors'].append({ 'candidateId': cid, 'error': str(e) })
        return results
    finally:
        conn.close()

def generate_access_token(instance_id, candidate_id, deadline=None):
    """Generate a secure access token for the test instance"""
    # Create a unique token using instance_id, candidate_id, and a random secret
    secret = secrets.token_urlsafe(32)
    data = f"{instance_id}:{candidate_id}:{deadline}:{secret}"
    token = hashlib.sha256(data.encode()).hexdigest()
    return token

def store_access_token(instance_id, token, deadline=None):
    """Store the access token in the database"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Create access_tokens table if it doesn't exist (without deadline column)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS access_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instance_id INTEGER,
                token TEXT UNIQUE,
                used BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (instance_id) REFERENCES test_instances(id)
            )
        ''')
        
        # Insert the token (without deadline)
        cursor.execute(
            'INSERT INTO access_tokens (instance_id, token) VALUES (?, ?)',
            (instance_id, token)
        )
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def validate_access_token(token):
    """Validate an access token and return instance details if valid (legacy function - marks as used)"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get token details
        cursor.execute('''
            SELECT at.*, ti.port, ti.docker_instance_id, c.name as candidate_name, t.name as test_name
            FROM access_tokens at
            JOIN test_instances ti ON at.instance_id = ti.id
            JOIN candidates c ON ti.candidate_id = c.id
            JOIN tests t ON ti.test_id = t.id
            WHERE at.token = ? AND at.used = 0
        ''', (token,))
        
        token_data = cursor.fetchone()
        
        if not token_data:
            return None
        
        token_data = dict(token_data)
        
        # Check if token has expired
        if token_data['deadline']:
            deadline = datetime.fromisoformat(token_data['deadline'].replace('Z', '+00:00'))
            if datetime.now(timezone.utc) > deadline:
                return None
        
        # Mark token as used
        cursor.execute(
            'UPDATE access_tokens SET used = 1 WHERE token = ?',
            (token,)
        )
        conn.commit()
        
        return token_data
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def send_email(to_email, candidate_name, test_name, access_url, deadline=None, is_deadline_update=False):
    """
    Send an email invitation to a candidate
    
    Args:
        to_email: Recipient email address
        candidate_name: Name of the candidate
        test_name: Name of the test
        access_url: Secure access URL for the test
        deadline: Test deadline (ISO format) - optional
        is_deadline_update: Whether this is a deadline update email
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        # Email configuration from environment variables
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_username = os.environ.get('SMTP_USERNAME')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        from_email = os.environ.get('FROM_EMAIL', smtp_username)
        
        if not smtp_username or not smtp_password:
            print("Warning: SMTP credentials not configured. Email will not be sent.")
            print("Please set SMTP_USERNAME and SMTP_PASSWORD environment variables.")
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = from_email
        msg['To'] = to_email
        
        # Set subject based on email type
        if is_deadline_update:
            msg['Subject'] = f"Assessment Deadline Update: {test_name}"
        else:
            msg['Subject'] = f"Assessment Invitation: {test_name}"
        
        # Format deadline for display
        deadline_text = ""
        has_deadline = False
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
                deadline_text = deadline_dt.strftime('%B %d, %Y at %I:%M %p EST')
                has_deadline = True
            except:
                deadline_text = deadline
                has_deadline = True
        
        # Email body - different content based on email type and deadline
        if is_deadline_update:
            # Deadline update email
            if has_deadline:
                body = f"""
Dear {candidate_name},

This is an update regarding your technical assessment: {test_name}

DEADLINE UPDATE:
- Test Name: {test_name}
- New Deadline: {deadline_text}

Your assessment link remains the same:
{access_url}

Important Notes:
- This link is unique to you and will expire on the new deadline
- You can access the link multiple times before the deadline
- Please complete the assessment before the new deadline
- If you encounter any technical issues, please contact the assessment administrator

Best regards,
Assessment Team
                """.strip()
            else:
                body = f"""
Dear {candidate_name},

This is an update regarding your technical assessment: {test_name}

DEADLINE UPDATE:
- Test Name: {test_name}
- Deadline: REMOVED - No deadline set

Your assessment link remains the same:
{access_url}

Important Notes:
- This link is unique to you and will remain valid indefinitely
- You can access the link multiple times
- Please complete the assessment when convenient
- If you encounter any technical issues, please contact the assessment administrator

Best regards,
Assessment Team
                """.strip()
        else:
            # Original invitation email
            if has_deadline:
                body = f"""
Dear {candidate_name},

You have been invited to complete a technical assessment: {test_name}

Assessment Details:
- Test Name: {test_name}
- Deadline: {deadline_text}

To begin your assessment, please click the link below:
{access_url}

Important Notes:
- This link is unique to you and will expire on the deadline
- You can access the link multiple times before the deadline
- Please complete the assessment before the deadline
- If you encounter any technical issues, please contact the assessment administrator

Best regards,
Assessment Team
                """.strip()
            else:
                body = f"""
Dear {candidate_name},

You have been invited to complete a technical assessment: {test_name}

Assessment Details:
- Test Name: {test_name}
- No deadline set - complete at your convenience

To begin your assessment, please click the link below:
{access_url}

Important Notes:
- This link is unique to you and will remain valid indefinitely
- You can access the link multiple times
- Please complete the assessment when convenient
- If you encounter any technical issues, please contact the assessment administrator

Best regards,
Assessment Team
                """.strip()
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_username, smtp_password)
        text = msg.as_string()
        server.sendmail(from_email, to_email, text)
        server.quit()
        
        print(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        print(f"Failed to send email to {to_email}: {str(e)}")
        return False 