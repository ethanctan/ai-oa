from database.db import get_connection
import time

def get_report(instance_id):
    """
    Get a report for a test instance
    
    Args:
        instance_id (int): The instance ID
    
    Returns:
        dict: The report data or a message if no report exists
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if instance exists
        cursor.execute(
            '''
            SELECT ti.*, t.name as test_name, t.assessment_prompt
            FROM test_instances ti
            LEFT JOIN tests t ON ti.test_id = t.id
            WHERE ti.id = ?
            ''',
            (instance_id,)
        )
        
        instance = cursor.fetchone()
        
        if not instance:
            return {"message": f"Instance with ID {instance_id} not found"}
        
        # Check if a report already exists
        cursor.execute(
            'SELECT * FROM reports WHERE instance_id = ?',
            (instance_id,)
        )
        
        report = cursor.fetchone()
        
        if report:
            return dict(report)
        
        # No report exists yet, generate a placeholder
        # In a real application, this would actually generate a report based on code and chat
        placeholder_content = f"""
Assessment Report for Test: {instance['test_name']}

This is a placeholder report. In a production environment, this would be a
detailed assessment of the candidate's code and interview responses.

The assessment would be based on criteria including:
- Code quality and organization
- Problem-solving approach
- Communication skills
- Technical understanding

Time of assessment: {time.strftime('%Y-%m-%d %H:%M:%S')}
        """
        
        # Insert the placeholder report
        cursor.execute(
            'INSERT INTO reports (instance_id, content) VALUES (?, ?)',
            (instance_id, placeholder_content)
        )
        conn.commit()
        
        # Get the inserted report
        cursor.execute(
            'SELECT * FROM reports WHERE instance_id = ?',
            (instance_id,)
        )
        
        return dict(cursor.fetchone())
    
    except Exception as e:
        conn.rollback()
        raise e
    
    finally:
        conn.close() 