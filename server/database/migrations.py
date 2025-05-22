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
    
    # Add project timer configuration columns to tests table if they don't exist
    add_project_timer_config_columns()
    
    # Add assessment prompt columns and remove old one
    migrate_assessment_prompt_columns()
    
    # Add deadline field to test_candidates table
    add_deadline_field()
    
    # Add tags column to candidates table
    add_candidate_tags_column()
    
    # Clean up 'nan' tags
    clean_up_nan_tags()
    
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

def add_project_timer_config_columns():
    """Add project timer configuration columns to the tests table"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # First check if the columns already exist
        cursor.execute("PRAGMA table_info(tests)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add 'enable_project_timer' column if it doesn't exist
        if 'enable_project_timer' not in columns:
            print("Adding 'enable_project_timer' column to tests table...")
            cursor.execute("ALTER TABLE tests ADD COLUMN enable_project_timer INTEGER DEFAULT 1")
        
        # Add 'project_timer_duration' column if it doesn't exist
        if 'project_timer_duration' not in columns:
            print("Adding 'project_timer_duration' column to tests table...")
            cursor.execute("ALTER TABLE tests ADD COLUMN project_timer_duration INTEGER DEFAULT 60")
        
        conn.commit()
        print("Project timer configuration columns added successfully.")
    except Exception as e:
        print(f"Error adding project timer configuration columns: {str(e)}")
    finally:
        conn.close()

def migrate_assessment_prompt_columns():
    """
    Remove the old assessment_prompt column and 
    add qualitative_assessment_prompt and quantitative_assessment_prompt columns to the tests table.
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("PRAGMA table_info(tests)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add new columns if they don't exist
        if 'qualitative_assessment_prompt' not in columns:
            print("Adding 'qualitative_assessment_prompt' column to tests table...")
            cursor.execute("ALTER TABLE tests ADD COLUMN qualitative_assessment_prompt TEXT")
        
        if 'quantitative_assessment_prompt' not in columns:
            print("Adding 'quantitative_assessment_prompt' column to tests table...")
            cursor.execute("ALTER TABLE tests ADD COLUMN quantitative_assessment_prompt TEXT")
            
        # Check if the old 'assessment_prompt' column exists
        if 'assessment_prompt' in columns:
            print("Removing old 'assessment_prompt' column from tests table...")
            # SQLite doesn't directly support DROP COLUMN for older versions easily without recreating table.
            # A common workaround is to create a new table, copy data, drop old table, rename new table.
            # However, for simplicity in this auto-migration, if users have old data, they might need manual adjustment
            # or a more robust migration script. Here, we'll attempt a simple drop if supported, 
            # or if not, acknowledge its presence.
            # For very old SQLite versions, this might error. Modern SQLite supports it.
            try:
                # Check SQLite version, sqlite_version_info was added in 3.7.17
                # If it's a modern enough SQLite, we can try to drop the column.
                # Python's sqlite3 module typically links against a recent SQLite.
                cursor.execute("ALTER TABLE tests DROP COLUMN assessment_prompt")
                print("'assessment_prompt' column removed.")
            except sqlite3.OperationalError as e:
                if "near \"DROP\": syntax error" in str(e) or "Cannot drop a column" in str(e):
                    print("Warning: SQLite version may not support DROP COLUMN. 'assessment_prompt' was not removed.")
                    print("Consider a manual migration (backup, new table, copy data, drop old, rename new) if this column needs to be removed.")
                else:
                    raise # Re-raise other operational errors
        
        conn.commit()
        print("Assessment prompt columns migrated successfully.")
    except Exception as e:
        print(f"Error migrating assessment prompt columns: {str(e)}")
    finally:
        conn.close()

def add_deadline_field():
    """Add deadline field to the test_candidates table"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # First check if the column already exists
        cursor.execute("PRAGMA table_info(test_candidates)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add 'deadline' column if it doesn't exist
        if 'deadline' not in columns:
            print("Adding 'deadline' column to test_candidates table...")
            cursor.execute("ALTER TABLE test_candidates ADD COLUMN deadline TIMESTAMP")
            print("Deadline column added successfully.")
        
        conn.commit()
    except Exception as e:
        print(f"Error adding deadline field: {str(e)}")
    finally:
        conn.close()

def add_candidate_tags_column():
    """Add tags column to the candidates table"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # First check if the column already exists
        cursor.execute("PRAGMA table_info(candidates)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add 'tags' column if it doesn't exist
        if 'tags' not in columns:
            print("Adding 'tags' column to candidates table...")
            cursor.execute("ALTER TABLE candidates ADD COLUMN tags TEXT")
            print("Tags column added successfully.")
        
        conn.commit()
    except Exception as e:
        print(f"Error adding tags column: {str(e)}")
    finally:
        conn.close()

def clean_up_nan_tags():
    """Clean up 'nan' tags in the candidates table"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Update any 'nan' tags to NULL
        cursor.execute("""
            UPDATE candidates 
            SET tags = NULL 
            WHERE tags = 'nan' OR tags = 'NaN' OR tags = 'NAN'
        """)
        
        # Count how many rows were updated
        rows_updated = cursor.rowcount
        
        conn.commit()
        print(f"Cleaned up {rows_updated} 'nan' tags in candidates table.")
    except Exception as e:
        print(f"Error cleaning up 'nan' tags: {str(e)}")
    finally:
        conn.close()

if __name__ == "__main__":
    run_migrations() 