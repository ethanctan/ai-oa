import sqlite3
import os
from pathlib import Path

# Database file path
DB_PATH = Path(__file__).parent / 'data.sqlite'

def get_connection():
    """Get a connection to the SQLite database"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row  # Return rows as dictionaries
    return conn

def init_database():
    """Initialize the database with necessary tables"""
    # Create the database directory if it doesn't exist
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create candidates table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        completed BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Check if candidates table is empty, and insert dummy data if it is
    cursor.execute('SELECT COUNT(*) FROM candidates')
    count = cursor.fetchone()[0]
    if count == 0:
        # Insert dummy data
        candidates_data = [
            ('Jane Smith', 'jane.smith@example.com', 1),
            ('John Doe', 'john.doe@example.com', 1),
            ('Alex Johnson', 'alex.johnson@example.com', 1),
            ('Sam Wilson', 'sam.wilson@example.com', 1)
        ]
        cursor.executemany(
            'INSERT INTO candidates (name, email, completed) VALUES (?, ?, ?)',
            candidates_data
        )
        print('Created candidates table with dummy data')
    
    # Create tests table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        github_repo TEXT,
        github_token TEXT,
        initial_prompt TEXT,
        final_prompt TEXT,
        assessment_prompt TEXT,
        candidates_assigned INTEGER DEFAULT 0,
        candidates_completed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create test_instances table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS test_instances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER,
        candidate_id INTEGER,
        docker_instance_id TEXT,
        port TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id),
        FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    )
    ''')
    
    # Create test_candidates junction table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS test_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER,
        candidate_id INTEGER,
        completed BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(test_id, candidate_id),
        FOREIGN KEY (test_id) REFERENCES tests(id),
        FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    )
    ''')
    
    # Create reports table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instance_id) REFERENCES test_instances(id)
    )
    ''')
    
    conn.commit()
    conn.close()
    
    print('Database initialized successfully') 