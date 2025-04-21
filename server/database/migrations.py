"""
Database migrations to handle schema changes. 
This is automatically run on server startup to ensure the database is up-to-date.
"""
import sqlite3
from pathlib import Path
import os

def get_connection():
    """Get a connection to the SQLite database"""
    # Determine the database path
    db_path = Path(__file__).parent / 'data.sqlite'
    
    # Create a connection
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # This enables column access by name
    
    return conn

def run_migrations():
    """Run all migrations in order"""
    print("Running database migrations...")
    
    # Add timer configuration columns to tests table if they don't exist
    add_timer_config_columns()
    
    print("Migrations completed successfully.")

"""
Whenever we make a new change to the database schema, we should add a new migration function below.
"""

def add_timer_config_columns():
    """Add timer configuration columns to the tests table"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # First check if the columns already exist
        cursor.execute("PRAGMA table_info(tests)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add 'enable_timer' column if it doesn't exist
        if 'enable_timer' not in columns:
            print("Adding 'enable_timer' column to tests table...")
            cursor.execute("ALTER TABLE tests ADD COLUMN enable_timer INTEGER DEFAULT 1")
        
        # Add 'timer_duration' column if it doesn't exist
        if 'timer_duration' not in columns:
            print("Adding 'timer_duration' column to tests table...")
            cursor.execute("ALTER TABLE tests ADD COLUMN timer_duration INTEGER DEFAULT 10")
        
        conn.commit()
        print("Timer configuration columns added successfully.")
    except Exception as e:
        print(f"Error adding timer configuration columns: {str(e)}")
    finally:
        conn.close()

if __name__ == "__main__":
    run_migrations() 