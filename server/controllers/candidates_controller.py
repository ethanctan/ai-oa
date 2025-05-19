from database.db import get_connection
import pandas as pd
from werkzeug.utils import secure_filename
import os

def get_all_candidates():
    """Get all candidates from the database with their assigned tests"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get all candidates
        cursor.execute('SELECT * FROM candidates')
        candidates = [dict(row) for row in cursor.fetchall()]
        
        # For each candidate, get their assigned tests
        for candidate in candidates:
            cursor.execute('''
                SELECT t.id, t.name
                FROM tests t
                JOIN test_candidates tc ON t.id = tc.test_id
                WHERE tc.candidate_id = ?
            ''', (candidate['id'],))
            
            assigned_tests = [dict(row) for row in cursor.fetchall()]
            candidate['testsAssigned'] = assigned_tests
            
        return candidates
    finally:
        conn.close()

def get_candidate(candidate_id):
    """Get a specific candidate by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT * FROM candidates WHERE id = ?', (candidate_id,))
        candidate = cursor.fetchone()
        
        if not candidate:
            return None
        
        return dict(candidate)
    finally:
        conn.close()

def create_candidate(data):
    """Create a new candidate"""
    name = data.get('name')
    email = data.get('email')
    
    if not name or not email:
        raise ValueError('Name and email are required')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if email already exists
        cursor.execute('SELECT id FROM candidates WHERE email = ?', (email,))
        existing = cursor.fetchone()
        
        if existing:
            raise ValueError(f"Candidate with email {email} already exists")
        
        # Insert new candidate
        cursor.execute(
            'INSERT INTO candidates (name, email, completed) VALUES (?, ?, ?)',
            (name, email, 0)
        )
        conn.commit()
        
        # Get the inserted candidate
        candidate_id = cursor.lastrowid
        cursor.execute('SELECT * FROM candidates WHERE id = ?', (candidate_id,))
        
        return dict(cursor.fetchone())
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def update_candidate(candidate_id, data):
    """Update a candidate"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if candidate exists
        cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Candidate with ID {candidate_id} not found")
        
        # Build update statement
        update_fields = []
        update_values = []
        
        if 'name' in data:
            update_fields.append('name = ?')
            update_values.append(data['name'])
        
        if 'email' in data:
            update_fields.append('email = ?')
            update_values.append(data['email'])
        
        if 'completed' in data:
            update_fields.append('completed = ?')
            update_values.append(1 if data['completed'] else 0)
        
        if not update_fields:
            # Nothing to update
            return get_candidate(candidate_id)
        
        # Update the candidate
        query = f"UPDATE candidates SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        update_values.append(candidate_id)
        
        cursor.execute(query, update_values)
        conn.commit()
        
        # Return updated candidate
        return get_candidate(candidate_id)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def delete_candidate(candidate_id):
    """Delete a candidate"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if candidate exists
        cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Candidate with ID {candidate_id} not found")
        
        # Delete the candidate
        cursor.execute('DELETE FROM candidates WHERE id = ?', (candidate_id,))
        conn.commit()
        
        return {"success": True, "message": f"Candidate {candidate_id} deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_candidate_tests(candidate_id):
    """Get all tests assigned to a candidate"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if candidate exists
        cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Candidate with ID {candidate_id} not found")
        
        # Get tests assigned to candidate
        cursor.execute('''
            SELECT t.*, tc.completed as test_completed
            FROM tests t
            JOIN test_candidates tc ON t.id = tc.test_id
            WHERE tc.candidate_id = ?
        ''', (candidate_id,))
        
        tests = [dict(row) for row in cursor.fetchall()]
        return tests
    finally:
        conn.close()

def create_candidates_from_file(df):
    """Create multiple candidates from a pandas DataFrame"""
    conn = get_connection()
    cursor = conn.cursor()
    
    results = {
        'success': [],
        'errors': []
    }
    
    try:
        # Process each row in the DataFrame
        for _, row in df.iterrows():
            try:
                name = str(row['Name']).strip()
                email = str(row['Email']).strip()
                
                if not name or not email:
                    results['errors'].append({
                        'row': row.to_dict(),
                        'error': 'Name and email are required'
                    })
                    continue
                
                # Check if email already exists
                cursor.execute('SELECT id FROM candidates WHERE email = ?', (email,))
                existing = cursor.fetchone()
                
                if existing:
                    results['errors'].append({
                        'row': row.to_dict(),
                        'error': f'Candidate with email {email} already exists'
                    })
                    continue
                
                # Insert new candidate
                cursor.execute(
                    'INSERT INTO candidates (name, email, completed) VALUES (?, ?, ?)',
                    (name, email, 0)
                )
                
                # Get the inserted candidate
                candidate_id = cursor.lastrowid
                cursor.execute('SELECT * FROM candidates WHERE id = ?', (candidate_id,))
                new_candidate = dict(cursor.fetchone())
                
                results['success'].append(new_candidate)
                
            except Exception as e:
                results['errors'].append({
                    'row': row.to_dict(),
                    'error': str(e)
                })
        
        conn.commit()
        return results
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def handle_file_upload(file):
    """Handle file upload and validation"""
    if not file:
        raise ValueError('No file provided')
        
    if file.filename == '':
        raise ValueError('No file selected')
        
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise ValueError('File must be CSV or Excel format')
        
    # Read the file based on its extension
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
            
        # Validate required columns
        required_columns = {'Email', 'Name'}
        if not all(col in df.columns for col in required_columns):
            raise ValueError('File must contain Email and Name columns')
            
        return create_candidates_from_file(df)
    except pd.errors.EmptyDataError:
        raise ValueError('The file is empty')
    except pd.errors.ParserError:
        raise ValueError('Error parsing the file. Please ensure it is properly formatted')
    except Exception as e:
        raise ValueError(f'Error processing file: {str(e)}') 