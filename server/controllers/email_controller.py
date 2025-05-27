import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
import secrets
import hashlib
from database.db import get_connection
from controllers.instances_controller import create_instance

"""
More routes under /instances.
Placed in a separate file for better organization.
"""

def send_test_invitation(test_id, candidate_ids, deadline=None):
    """
    Send test invitations to multiple candidates
    
    Args:
        test_id: ID of the test to send
        candidate_ids: List of candidate IDs to send to
        deadline: Optional deadline for the test (ISO format)
    
    Returns:
        dict: Results of sending emails
    """
    results = {
        'success': [],
        'errors': []
    }
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get test details
        cursor.execute('SELECT * FROM tests WHERE id = ?', (test_id,))
        test = cursor.fetchone()
        
        if not test:
            raise ValueError(f"Test with ID {test_id} not found")
        
        test = dict(test)
        
        for candidate_id in candidate_ids:
            try:
                # Get candidate details
                cursor.execute('SELECT * FROM candidates WHERE id = ?', (candidate_id,))
                candidate = cursor.fetchone()
                
                if not candidate:
                    results['errors'].append({
                        'candidate_id': candidate_id,
                        'error': 'Candidate not found'
                    })
                    continue
                
                candidate = dict(candidate)
                
                # Create a test instance for this candidate
                instance_data = {
                    'testId': test_id,
                    'candidateId': candidate_id,
                    'githubUrl': test.get('github_repo'),
                    'githubToken': test.get('github_token')
                }
                
                instance = create_instance(instance_data)
                
                # Generate secure access token
                access_token = generate_access_token(instance['id'], candidate_id, deadline)
                
                # Store the access token in database
                store_access_token(instance['id'], access_token, deadline)
                
                # Generate the redirect access URL using the instances route
                access_url = f"http://localhost:3000/instances/access/{access_token}"
                
                # Send email
                email_sent = send_email(
                    to_email=candidate['email'],
                    candidate_name=candidate['name'],
                    test_name=test['name'],
                    access_url=access_url,
                    deadline=deadline
                )
                
                if email_sent:
                    results['success'].append({
                        'candidate_id': candidate_id,
                        'candidate_name': candidate['name'],
                        'candidate_email': candidate['email'],
                        'instance_id': instance['id'],
                        'access_url': access_url
                    })
                else:
                    results['errors'].append({
                        'candidate_id': candidate_id,
                        'error': 'Failed to send email'
                    })
                    
            except Exception as e:
                results['errors'].append({
                    'candidate_id': candidate_id,
                    'error': str(e)
                })
        
        return results
        
    except Exception as e:
        raise e
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
        # Create access_tokens table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS access_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instance_id INTEGER,
                token TEXT UNIQUE,
                deadline TIMESTAMP,
                used BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (instance_id) REFERENCES test_instances(id)
            )
        ''')
        
        # Insert the token
        cursor.execute(
            'INSERT INTO access_tokens (instance_id, token, deadline) VALUES (?, ?, ?)',
            (instance_id, token, deadline)
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

def send_email(to_email, candidate_name, test_name, access_url, deadline=None):
    """
    Send an email invitation to a candidate
    
    Args:
        to_email: Recipient email address
        candidate_name: Name of the candidate
        test_name: Name of the test
        access_url: Secure access URL for the test
        deadline: Test deadline (ISO format)
    
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
        msg['Subject'] = f"Assessment Invitation: {test_name}"
        
        # Format deadline for display
        deadline_text = ""
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
                deadline_text = deadline_dt.strftime('%B %d, %Y at %I:%M %p EST')
            except:
                deadline_text = deadline
        
        # Email body
        body = f"""
Dear {candidate_name},

You have been invited to complete a technical assessment: {test_name}

Assessment Details:
- Test Name: {test_name}
{f"- Deadline: {deadline_text}" if deadline_text else ""}

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