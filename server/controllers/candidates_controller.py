from database.db_postgresql import get_connection
import pandas as pd
from werkzeug.utils import secure_filename
import os
import numpy as np

def get_all_candidates(company_id=None):
    """Get all candidates from the database with their assigned tests, filtered by company"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Get candidates filtered by company if provided
        if company_id:
            cursor.execute('SELECT * FROM candidates WHERE company_id = ?', (company_id,))
        else:
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

def get_candidate(candidate_id, company_id=None):
    """Get a specific candidate by ID, optionally filtered by company"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if company_id:
            cursor.execute('SELECT * FROM candidates WHERE id = ? AND company_id = ?', (candidate_id, company_id))
        else:
            cursor.execute('SELECT * FROM candidates WHERE id = ?', (candidate_id,))
        
        candidate = cursor.fetchone()
        
        if not candidate:
            return None
        
        return dict(candidate)
    finally:
        conn.close()

def create_candidate(data, company_id=None):
    """Create a new candidate"""
    name = data.get('name')
    email = data.get('email')
    tags = data.get('tags', '')
    
    if not name or not email:
        raise ValueError('Name and email are required')
    
    if not company_id:
        raise ValueError('Company ID is required for multi-tenant support')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if email already exists in the same company
        cursor.execute('SELECT id FROM candidates WHERE email = ? AND company_id = ?', (email, company_id))
        existing = cursor.fetchone()
        
        if existing:
            raise ValueError(f"Candidate with email {email} already exists in your organization")
        
        # Insert new candidate with company_id
        cursor.execute(
            'INSERT INTO candidates (name, email, tags, company_id, completed) VALUES (?, ?, ?, ?, ?)',
            (name, email, tags, company_id, 0)
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

def update_candidate(candidate_id, data, company_id=None):
    """Update a candidate, ensuring it belongs to the user's company"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if candidate exists and belongs to the company
        if company_id:
            cursor.execute('SELECT id FROM candidates WHERE id = ? AND company_id = ?', (candidate_id, company_id))
        else:
            cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Candidate with ID {candidate_id} not found in your organization")
        
        # Build update statement
        update_fields = []
        update_values = []
        
        if 'name' in data:
            update_fields.append('name = ?')
            update_values.append(data['name'])
        
        if 'email' in data:
            # Check for email conflicts within the same company
            cursor.execute('SELECT id FROM candidates WHERE email = ? AND company_id = ? AND id != ?', 
                         (data['email'], company_id or 1, candidate_id))
            email_conflict = cursor.fetchone()
            if email_conflict:
                raise ValueError(f"Email {data['email']} is already used by another candidate in your organization")
            
            update_fields.append('email = ?')
            update_values.append(data['email'])
        
        if 'completed' in data:
            update_fields.append('completed = ?')
            update_values.append(1 if data['completed'] else 0)
        
        if 'tags' in data:
            update_fields.append('tags = ?')
            update_values.append(data['tags'])
        
        if not update_fields:
            # Nothing to update
            return get_candidate(candidate_id, company_id)
        
        # Update the candidate
        query = f"UPDATE candidates SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        update_values.append(candidate_id)
        
        cursor.execute(query, update_values)
        conn.commit()
        
        # Return updated candidate
        return get_candidate(candidate_id, company_id)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def delete_candidate(candidate_id, company_id=None):
    """Delete a candidate, ensuring it belongs to the user's company"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if candidate exists and belongs to the company
        if company_id:
            cursor.execute('SELECT id FROM candidates WHERE id = ? AND company_id = ?', (candidate_id, company_id))
        else:
            cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Candidate with ID {candidate_id} not found in your organization")
        
        # Delete the candidate
        cursor.execute('DELETE FROM candidates WHERE id = ?', (candidate_id,))
        conn.commit()
        
        return {"success": True, "message": f"Candidate {candidate_id} deleted successfully"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_candidate_tests(candidate_id, company_id=None):
    """Get all tests assigned to a candidate, ensuring candidate belongs to user's company"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if candidate exists and belongs to the company
        if company_id:
            cursor.execute('SELECT id FROM candidates WHERE id = ? AND company_id = ?', (candidate_id, company_id))
        else:
            cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Candidate with ID {candidate_id} not found in your organization")
        
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

def create_candidates_from_file(df, company_id=None):
    """Create multiple candidates from a pandas DataFrame"""
    if not company_id:
        raise ValueError('Company ID is required for multi-tenant support')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    results = {
        'success': [],
        'errors': [],
        'duplicates': []  # New field to track potential duplicates
    }
    
    try:
        # Process each row in the DataFrame
        for _, row in df.iterrows():
            try:
                name = str(row['Name']).strip()
                email = str(row['Email']).strip()
                # Handle tags - properly handle NaN values and ensure they're semicolon-separated
                tags_value = row.get('Tags', '')
                if pd.isna(tags_value) or tags_value == '' or str(tags_value).lower() == 'nan':
                    tags = ''
                else:
                    # Clean up tags and join with semicolons
                    tags = ';'.join(tag.strip() for tag in str(tags_value).split(';') if tag.strip())
                
                if not name or not email:
                    results['errors'].append({
                        'row': row.to_dict(),
                        'error': 'Name and email are required'
                    })
                    continue
                
                # Check for existing candidates with same email or name within the same company
                cursor.execute('''
                    SELECT id, name, email, tags 
                    FROM candidates 
                    WHERE (email = ? OR name = ?) AND company_id = ?
                ''', (email, name, company_id))
                existing = cursor.fetchall()
                
                if existing:
                    # Add to duplicates list for frontend resolution
                    results['duplicates'].append({
                        'new': {
                            'name': name,
                            'email': email,
                            'tags': tags
                        },
                        'existing': [dict(row) for row in existing]
                    })
                    continue
                
                # Insert new candidate with company_id
                cursor.execute(
                    'INSERT INTO candidates (name, email, tags, company_id, completed) VALUES (?, ?, ?, ?, ?)',
                    (name, email, tags, company_id, 0)
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

def handle_file_upload(file, company_id=None):
    """Handle file upload and validation"""
    if not file:
        raise ValueError('No file provided')
        
    if file.filename == '':
        raise ValueError('No file selected')
        
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise ValueError('File must be CSV or Excel format')
    
    if not company_id:
        raise ValueError('Company ID is required for multi-tenant support')
        
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
            
        return create_candidates_from_file(df, company_id)
    except pd.errors.EmptyDataError:
        raise ValueError('The file is empty')
    except pd.errors.ParserError:
        raise ValueError('Error parsing the file. Please ensure it is properly formatted')
    except Exception as e:
        raise ValueError(f'Error processing file: {str(e)}')

def handle_duplicate_resolution(decisions, company_id=None):
    """Handle the resolution of duplicate candidates based on user decisions"""
    if not company_id:
        raise ValueError('Company ID is required for multi-tenant support')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    results = {
        'success': [],
        'errors': []
    }
    
    try:
        for decision in decisions:
            try:
                new_data = decision['new']
                action = decision['action']  # 'create_new', 'update', or 'skip'
                existing_id = decision.get('existing_id')  # Only present for 'update' action
                
                if action == 'create_new':
                    # Insert as new candidate with company_id
                    cursor.execute(
                        'INSERT INTO candidates (name, email, tags, company_id, completed) VALUES (?, ?, ?, ?, ?)',
                        (new_data['name'], new_data['email'], new_data['tags'], company_id, 0)
                    )
                    candidate_id = cursor.lastrowid
                    cursor.execute('SELECT * FROM candidates WHERE id = ?', (candidate_id,))
                    results['success'].append(dict(cursor.fetchone()))
                    
                elif action == 'update' and existing_id:
                    # Update existing candidate, but verify it belongs to the same company
                    cursor.execute(
                        'UPDATE candidates SET name = ?, email = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
                        (new_data['name'], new_data['email'], new_data['tags'], existing_id, company_id)
                    )
                    cursor.execute('SELECT * FROM candidates WHERE id = ? AND company_id = ?', (existing_id, company_id))
                    updated_candidate = cursor.fetchone()
                    if updated_candidate:
                        results['success'].append(dict(updated_candidate))
                    else:
                        results['errors'].append({
                            'data': new_data,
                            'error': 'Candidate not found or access denied'
                        })
                    
                elif action == 'skip':
                    # Do nothing, just skip this entry
                    continue
                    
            except Exception as e:
                results['errors'].append({
                    'data': new_data,
                    'error': str(e)
                })
        
        conn.commit()
        return results
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close() 