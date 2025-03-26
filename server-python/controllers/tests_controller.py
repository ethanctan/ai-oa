import os
from database.db import Session, Test, TestInstance, TestCandidate, Candidate
from controllers.instances_controller import create_instance, delete_instance
from datetime import datetime

def get_all_tests():
    """
    Get all tests.
    
    Returns:
        list: List of test dictionaries
    """
    session = Session()
    try:
        tests = session.query(Test).order_by(Test.created_at.desc()).all()
        return [test.to_dict() for test in tests]
    except Exception as e:
        raise Exception(f"Error fetching tests: {str(e)}")
    finally:
        session.close()

def get_test_by_id(test_id):
    """
    Get a specific test by ID.
    
    Args:
        test_id (int): The test ID
        
    Returns:
        dict: Test details
    """
    session = Session()
    try:
        test = session.query(Test).filter(Test.id == test_id).first()
        if not test:
            raise Exception("Test not found")
        
        return test.to_dict()
    except Exception as e:
        raise Exception(f"Error fetching test: {str(e)}")
    finally:
        session.close()

def create_test(instance_name, github_repo=None, github_token=None, initial_prompt=None, 
                final_prompt=None, assessment_prompt=None, candidate_ids=None):
    """
    Create a new test and Docker instance.
    
    Args:
        instance_name (str): Name for the test/instance
        github_repo (str, optional): GitHub repository URL
        github_token (str, optional): GitHub token for private repos
        initial_prompt (str, optional): Initial interview prompt
        final_prompt (str, optional): Final interview prompt
        assessment_prompt (str, optional): Assessment criteria prompt
        candidate_ids (list, optional): List of candidate IDs to assign
        
    Returns:
        dict: Created test details
    """
    # Convert empty list to None
    if candidate_ids is not None and len(candidate_ids) == 0:
        candidate_ids = None
    
    session = Session()
    try:
        # Create test record
        test = Test(
            name=instance_name,
            github_repo=github_repo,
            github_token=github_token,
            initial_prompt=initial_prompt,
            final_prompt=final_prompt,
            assessment_prompt=assessment_prompt,
            candidates_assigned=len(candidate_ids) if candidate_ids else 0,
            candidates_completed=0
        )
        session.add(test)
        session.flush()  # Get the test ID
        
        # Create Docker container
        container_info = create_instance(
            instance_name=instance_name,
            github_repo=github_repo,
            github_token=github_token,
            initial_prompt=initial_prompt,
            final_prompt=final_prompt,
            assessment_prompt=assessment_prompt
        )
        
        # Create test instance record
        test_instance = TestInstance(
            test_id=test.id,
            docker_instance_id=container_info['containerId'],
            port=container_info['port']
        )
        session.add(test_instance)
        
        # Assign candidates to the test if provided
        if candidate_ids:
            for candidate_id in candidate_ids:
                # Check if candidate exists
                candidate = session.query(Candidate).filter(Candidate.id == candidate_id).first()
                if candidate:
                    test_candidate = TestCandidate(
                        test_id=test.id,
                        candidate_id=candidate_id,
                        completed=False
                    )
                    session.add(test_candidate)
        
        session.commit()
        
        # Return comprehensive test details
        return {
            'id': test.id,
            'name': instance_name,
            'dockerId': container_info['containerId'],
            'port': container_info['port']
        }
    except Exception as e:
        session.rollback()
        raise Exception(f"Error creating test: {str(e)}")
    finally:
        session.close()

def delete_test(test_id):
    """
    Delete a test and its associated Docker instance.
    
    Args:
        test_id (int): The test ID
        
    Returns:
        dict: Status message
    """
    session = Session()
    try:
        # Get test and instances
        test = session.query(Test).filter(Test.id == test_id).first()
        if not test:
            raise Exception("Test not found")
        
        instances = session.query(TestInstance).filter(TestInstance.test_id == test_id).all()
        
        # Stop and remove Docker containers
        for instance in instances:
            try:
                delete_instance(instance.docker_instance_id)
            except Exception as e:
                # Log error but continue with database cleanup
                print(f"Error removing container: {str(e)}")
        
        # Delete related records
        session.query(TestCandidate).filter(TestCandidate.test_id == test_id).delete()
        session.query(TestInstance).filter(TestInstance.test_id == test_id).delete()
        session.delete(test)
        
        session.commit()
        
        return {
            'success': True,
            'message': 'Test deleted successfully'
        }
    except Exception as e:
        session.rollback()
        raise Exception(f"Error deleting test: {str(e)}")
    finally:
        session.close() 