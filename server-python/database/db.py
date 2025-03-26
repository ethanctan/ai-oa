import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, Table, MetaData, DateTime, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, scoped_session
from datetime import datetime
import json

# Get the absolute path to the database file
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.path.join(BASE_DIR, os.getenv('DATABASE_PATH', 'data.sqlite'))

# Create engine and session
engine = create_engine(f'sqlite:///{DB_PATH}', echo=False)
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)
Base = declarative_base()

# Define models
class Candidate(Base):
    __tablename__ = 'candidates'
    
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    tests = relationship('TestCandidate', back_populates='candidate')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'completed': self.completed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'testsAssigned': [
                {
                    'id': tc.test.id,
                    'name': tc.test.name,
                    'completed': tc.completed
                } for tc in self.tests
            ] if self.tests else []
        }

class Test(Base):
    __tablename__ = 'tests'
    
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    github_repo = Column(String, nullable=True)
    github_token = Column(String, nullable=True)
    initial_prompt = Column(String(1000), nullable=True)
    final_prompt = Column(String(1000), nullable=True)
    assessment_prompt = Column(String(1000), nullable=True)
    candidates_assigned = Column(Integer, default=0)
    candidates_completed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    instances = relationship('TestInstance', back_populates='test', cascade='all, delete-orphan')
    candidates = relationship('TestCandidate', back_populates='test', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'github_repo': self.github_repo,
            'github_token': self.github_token,
            'initial_prompt': self.initial_prompt,
            'final_prompt': self.final_prompt,
            'assessment_prompt': self.assessment_prompt,
            'candidates_assigned': self.candidates_assigned,
            'candidates_completed': self.candidates_completed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'instances': [instance.to_dict() for instance in self.instances],
            'assignedCandidates': [
                {
                    'id': tc.candidate.id,
                    'name': tc.candidate.name,
                    'email': tc.candidate.email,
                    'completed': tc.completed
                } for tc in self.candidates
            ] if self.candidates else []
        }

class TestInstance(Base):
    __tablename__ = 'test_instances'
    
    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey('tests.id'))
    docker_instance_id = Column(String)
    port = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    test = relationship('Test', back_populates='instances')
    
    def to_dict(self):
        return {
            'id': self.id,
            'test_id': self.test_id,
            'docker_instance_id': self.docker_instance_id,
            'port': self.port,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class TestCandidate(Base):
    __tablename__ = 'test_candidates'
    
    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey('tests.id'))
    candidate_id = Column(Integer, ForeignKey('candidates.id'))
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Add unique constraint to prevent duplicate assignments
    __table_args__ = (UniqueConstraint('test_id', 'candidate_id', name='_test_candidate_uc'),)
    
    # Relationships
    test = relationship('Test', back_populates='candidates')
    candidate = relationship('Candidate', back_populates='tests')
    
    def to_dict(self):
        return {
            'id': self.id,
            'test_id': self.test_id,
            'candidate_id': self.candidate_id,
            'completed': self.completed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

def init_database():
    """Initialize the database tables and add dummy data"""
    Base.metadata.create_all(engine)
    
    # Check if candidates table has data
    session = Session()
    try:
        candidate_count = session.query(Candidate).count()
        
        # If no candidates, add dummy data
        if candidate_count == 0:
            dummy_candidates = [
                Candidate(name='Jane Smith', email='jane.smith@example.com', completed=True),
                Candidate(name='John Doe', email='john.doe@example.com', completed=False),
                Candidate(name='Alex Johnson', email='alex.johnson@example.com', completed=True),
                Candidate(name='Sam Wilson', email='sam.wilson@example.com', completed=False)
            ]
            session.add_all(dummy_candidates)
            session.commit()
            print("Created candidates table with dummy data")
    except Exception as e:
        session.rollback()
        print(f"Error initializing database: {str(e)}")
    finally:
        session.close()

# Create tables and initialize data
if __name__ == "__main__":
    init_database() 