from database.db import Session, Candidate, Test, TestCandidate

def get_all_candidates():
    """
    Get all candidates with their assigned tests.
    
    Returns:
        list: List of candidate dictionaries
    """
    session = Session()
    try:
        candidates = session.query(Candidate).all()
        return [candidate.to_dict() for candidate in candidates]
    except Exception as e:
        raise Exception(f"Error fetching candidates: {str(e)}")
    finally:
        session.close()

def get_candidate_by_id(candidate_id):
    """
    Get a specific candidate by ID.
    
    Args:
        candidate_id (int): The candidate ID
        
    Returns:
        dict: Candidate details
    """
    session = Session()
    try:
        candidate = session.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise Exception("Candidate not found")
        
        return candidate.to_dict()
    except Exception as e:
        raise Exception(f"Error fetching candidate: {str(e)}")
    finally:
        session.close()

def update_candidate_status(candidate_id, completed):
    """
    Update a candidate's completion status.
    
    Args:
        candidate_id (int): The candidate ID
        completed (bool): New completion status
        
    Returns:
        dict: Updated candidate details
    """
    session = Session()
    try:
        candidate = session.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise Exception("Candidate not found")
        
        candidate.completed = completed
        session.commit()
        
        return candidate.to_dict()
    except Exception as e:
        session.rollback()
        raise Exception(f"Error updating candidate: {str(e)}")
    finally:
        session.close() 