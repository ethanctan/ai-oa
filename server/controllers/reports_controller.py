from database.db_postgresql import get_connection
import time

'''
Note: Nothing in this file is currently used.
'''

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
            WHERE ti.id = %s
            ''',
            (instance_id,)
        )
        
        instance = cursor.fetchone()
        
        if not instance:
            return {"message": f"Instance with ID {instance_id} not found"}
        
        # Check if a report already exists
        cursor.execute(
            'SELECT * FROM reports WHERE instance_id = %s',
            (instance_id,)
        )
        
        report = cursor.fetchone()
        
        if report:
            return dict(report)
        
        # No report exists yet, generate a placeholder
        placeholder_content = f"""
        Report not found.
        """
        
        # Insert the placeholder report
        cursor.execute(
            'INSERT INTO reports (instance_id, content) VALUES (%s, %s)',
            (instance_id, placeholder_content)
        )
        conn.commit()
        
        # Get the inserted report
        cursor.execute(
            'SELECT * FROM reports WHERE instance_id = %s',
            (instance_id,)
        )
        
        return dict(cursor.fetchone())
    
    except Exception as e:
        conn.rollback()
        raise e
    
    finally:
        conn.close()

def get_test_report(test_id, company_id):
    """Get a report for a specific test"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Get test details
        cursor.execute('SELECT * FROM tests WHERE id = %s AND company_id = %s', (test_id, company_id))
        test = cursor.fetchone()
        if not test:
            raise ValueError('Test not found')
        
        # Get all instances for this test
        cursor.execute('''
            SELECT ti.*, c.name as candidate_name, c.email as candidate_email
            FROM test_instances ti
            JOIN candidates c ON ti.candidate_id = c.id
            WHERE ti.test_id = %s AND ti.company_id = %s
        ''', (test_id, company_id))
        instances = [dict(row) for row in cursor.fetchall()]
        
        # Get test-candidate relationships
        cursor.execute('''
            SELECT tc.*, c.name as candidate_name, c.email as candidate_email
            FROM test_candidates tc
            JOIN candidates c ON tc.candidate_id = c.id
            WHERE tc.test_id = %s AND tc.company_id = %s
        ''', (test_id, company_id))
        test_candidates = [dict(row) for row in cursor.fetchall()]
        
        return {
            'test': dict(test),
            'instances': instances,
            'test_candidates': test_candidates
        }
    finally:
        conn.close()

def get_candidate_report(candidate_id, company_id):
    """Get a report for a specific candidate"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Get candidate details
        cursor.execute('SELECT * FROM candidates WHERE id = %s AND company_id = %s', (candidate_id, company_id))
        candidate = cursor.fetchone()
        if not candidate:
            raise ValueError('Candidate not found')
        
        # Get all instances for this candidate
        cursor.execute('''
            SELECT ti.*, t.name as test_name
            FROM test_instances ti
            JOIN tests t ON ti.test_id = t.id
            WHERE ti.candidate_id = %s AND ti.company_id = %s
        ''', (candidate_id, company_id))
        instances = [dict(row) for row in cursor.fetchall()]
        
        # Get test-candidate relationships
        cursor.execute('''
            SELECT tc.*, t.name as test_name
            FROM test_candidates tc
            JOIN tests t ON tc.test_id = t.id
            WHERE tc.candidate_id = %s AND tc.company_id = %s
        ''', (candidate_id, company_id))
        test_candidates = [dict(row) for row in cursor.fetchall()]
        
        return {
            'candidate': dict(candidate),
            'instances': instances,
            'test_candidates': test_candidates
        }
    finally:
        conn.close()

def get_company_report(company_id):
    """Get a report for a company"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Get company details
        cursor.execute('SELECT * FROM companies WHERE id = %s', (company_id,))
        company = cursor.fetchone()
        if not company:
            raise ValueError('Company not found')
        
        # Get all tests
        cursor.execute('SELECT * FROM tests WHERE company_id = %s', (company_id,))
        tests = [dict(row) for row in cursor.fetchall()]
        
        # Get all candidates
        cursor.execute('SELECT * FROM candidates WHERE company_id = %s', (company_id,))
        candidates = [dict(row) for row in cursor.fetchall()]
        
        # Get all instances
        cursor.execute('''
            SELECT ti.*, t.name as test_name, c.name as candidate_name
            FROM test_instances ti
            JOIN tests t ON ti.test_id = t.id
            JOIN candidates c ON ti.candidate_id = c.id
            WHERE ti.company_id = %s
        ''', (company_id,))
        instances = [dict(row) for row in cursor.fetchall()]
        
        return {
            'company': dict(company),
            'tests': tests,
            'candidates': candidates,
            'instances': instances
        }
    finally:
        conn.close() 