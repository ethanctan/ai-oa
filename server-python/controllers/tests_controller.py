from database.db import get_connection

def get_all_tests():
    """Get all tests from the database"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT * FROM tests')
        tests = [dict(row) for row in cursor.fetchall()]
        return tests
    finally:
        conn.close()

def get_test(test_id):
    """Get a specific test by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT * FROM tests WHERE id = ?', (test_id,))
        test = cursor.fetchone()
        
        if not test:
            return None
        
        return dict(test)
    finally:
        conn.close()

def create_test(data):
    """Create a new test"""
    # Check for both 'name' and 'instanceName' to handle frontend form field naming
    name = data.get('name') or data.get('instanceName')
    candidate_ids = data.get('candidateIds', [])
    
    if not name:
        raise ValueError('Test name is required')
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Insert new test with optional fields
        cursor.execute(
            '''
            INSERT INTO tests (
                name, github_repo, github_token, 
                initial_prompt, final_prompt, assessment_prompt,
                candidates_assigned, candidates_completed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                name,
                data.get('githubRepo'),
                data.get('githubToken'),
                data.get('initialPrompt'),
                data.get('finalPrompt'),
                data.get('assessmentPrompt'),
                0,  # candidates_assigned (will be updated if candidates are assigned)
                0   # candidates_completed
            )
        )
        conn.commit()
        
        # Get the inserted test ID
        test_id = cursor.lastrowid
        
        # If candidate_ids were provided, assign them to the test
        if candidate_ids:
            # Convert to list if it's a single value
            if not isinstance(candidate_ids, list):
                candidate_ids = [candidate_ids]
            
            # Track number of candidates assigned
            assigned_count = 0
            
            # Assign each candidate to the test
            for candidate_id in candidate_ids:
                try:
                    # Ensure candidate_id is an integer
                    try:
                        candidate_id = int(candidate_id)
                    except (ValueError, TypeError):
                        print(f"Invalid candidate ID: {candidate_id}")
                        continue  # Skip this ID and move to the next
                    
                    # Check if candidate exists
                    cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
                    candidate = cursor.fetchone()
                    
                    if candidate:
                        # Check if already assigned
                        cursor.execute(
                            'SELECT id FROM test_candidates WHERE test_id = ? AND candidate_id = ?',
                            (test_id, candidate_id)
                        )
                        existing = cursor.fetchone()
                        
                        if not existing:
                            # Create test-candidate relationship
                            cursor.execute(
                                'INSERT INTO test_candidates (test_id, candidate_id, completed) VALUES (?, ?, ?)',
                                (test_id, candidate_id, 0)
                            )
                            assigned_count += 1
                except Exception as e:
                    print(f"Error assigning candidate {candidate_id}: {str(e)}")
                    # Continue with other candidates even if one fails
            
            # Update candidates_assigned count if any were assigned
            if assigned_count > 0:
                cursor.execute(
                    'UPDATE tests SET candidates_assigned = ? WHERE id = ?',
                    (assigned_count, test_id)
                )
                conn.commit()
        
        # Get the inserted test
        cursor.execute('SELECT * FROM tests WHERE id = ?', (test_id,))
        
        return dict(cursor.fetchone())
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def update_test(test_id, data):
    """Update a test"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if test exists
        cursor.execute('SELECT id FROM tests WHERE id = ?', (test_id,))
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Test with ID {test_id} not found")
        
        # Build update statement
        update_fields = []
        update_values = []
        
        # Map JavaScript camelCase to Python snake_case database fields
        field_mapping = {
            'name': 'name',
            'instanceName': 'name',  # Also handle instanceName
            'githubRepo': 'github_repo',
            'githubToken': 'github_token',
            'initialPrompt': 'initial_prompt',
            'finalPrompt': 'final_prompt',
            'assessmentPrompt': 'assessment_prompt',
            'candidatesAssigned': 'candidates_assigned',
            'candidatesCompleted': 'candidates_completed'
        }
        
        for js_field, db_field in field_mapping.items():
            if js_field in data:
                update_fields.append(f'{db_field} = ?')
                update_values.append(data[js_field])
        
        if not update_fields:
            # Nothing to update
            return get_test(test_id)
        
        # Update the test
        query = f"UPDATE tests SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        update_values.append(test_id)
        
        cursor.execute(query, update_values)
        conn.commit()
        
        # Return updated test
        return get_test(test_id)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def delete_test(test_id):
    """Delete a test and all associated instances"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if test exists
        cursor.execute('SELECT id FROM tests WHERE id = ?', (test_id,))
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Test with ID {test_id} not found")
        
        # Get all associated instances
        cursor.execute('SELECT id, docker_instance_id FROM test_instances WHERE test_id = ?', (test_id,))
        instances = cursor.fetchall()
        
        # Connect to Docker if needed
        docker_client = None
        if instances:
            try:
                import docker
                docker_client = docker.from_env()
                print(f"Connected to Docker to clean up {len(instances)} instances")
            except Exception as e:
                print(f"Warning: Unable to connect to Docker for instance cleanup: {str(e)}")
        
        # Stop and remove Docker containers for each instance
        for instance in instances:
            docker_id = instance['docker_instance_id']
            if docker_client and docker_id and docker_id != 'pending':
                try:
                    # Get the container and stop it
                    container = docker_client.containers.get(docker_id)
                    if container:
                        print(f"Stopping container {docker_id} for instance {instance['id']}")
                        container.stop(timeout=1)
                        container.remove(force=True)
                except docker.errors.NotFound:
                    print(f"Container {docker_id} for instance {instance['id']} not found")
                except Exception as e:
                    print(f"Error stopping container {docker_id}: {str(e)}")
        
        # Delete test instances
        instance_count = len(instances)
        if instance_count > 0:
            cursor.execute('DELETE FROM test_instances WHERE test_id = ?', (test_id,))
            print(f"Deleted {instance_count} instances associated with test {test_id}")
        
        # Delete test-candidate relationships
        cursor.execute('DELETE FROM test_candidates WHERE test_id = ?', (test_id,))
        
        # Delete the test
        cursor.execute('DELETE FROM tests WHERE id = ?', (test_id,))
        conn.commit()
        
        return {"success": True, "message": f"Test {test_id} deleted successfully with {instance_count} associated instances"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_test_candidates(test_id):
    """Get all candidates assigned to a test"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if test exists
        cursor.execute('SELECT id FROM tests WHERE id = ?', (test_id,))
        existing = cursor.fetchone()
        
        if not existing:
            raise ValueError(f"Test with ID {test_id} not found")
        
        # Get candidates assigned to test
        cursor.execute('''
            SELECT c.*, tc.completed as test_completed
            FROM candidates c
            JOIN test_candidates tc ON c.id = tc.candidate_id
            WHERE tc.test_id = ?
        ''', (test_id,))
        
        candidates = [dict(row) for row in cursor.fetchall()]
        return candidates
    finally:
        conn.close()

def assign_candidate_to_test(test_id, candidate_id):
    """Assign a candidate to a test"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check if test exists
        cursor.execute('SELECT id FROM tests WHERE id = ?', (test_id,))
        test = cursor.fetchone()
        
        if not test:
            raise ValueError(f"Test with ID {test_id} not found")
        
        # Check if candidate exists
        cursor.execute('SELECT id FROM candidates WHERE id = ?', (candidate_id,))
        candidate = cursor.fetchone()
        
        if not candidate:
            raise ValueError(f"Candidate with ID {candidate_id} not found")
        
        # Check if relationship already exists
        cursor.execute(
            'SELECT id FROM test_candidates WHERE test_id = ? AND candidate_id = ?',
            (test_id, candidate_id)
        )
        existing = cursor.fetchone()
        
        if existing:
            return {"success": True, "message": "Candidate already assigned to this test"}
        
        # Create the relationship
        cursor.execute(
            'INSERT INTO test_candidates (test_id, candidate_id, completed) VALUES (?, ?, ?)',
            (test_id, candidate_id, 0)
        )
        
        # Update test's candidates_assigned count
        cursor.execute(
            'UPDATE tests SET candidates_assigned = candidates_assigned + 1 WHERE id = ?',
            (test_id,)
        )
        
        conn.commit()
        
        return {"success": True, "message": f"Candidate {candidate_id} assigned to test {test_id}"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close() 