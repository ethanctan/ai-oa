"""
Database migrations for PostgreSQL - Supabase version
This handles any schema changes that might be needed after initial setup.
"""
import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

def get_connection():
    """Get a connection to the PostgreSQL database"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    
    conn = psycopg2.connect(
        database_url,
        cursor_factory=psycopg2.extras.RealDictCursor
    )
    conn.autocommit = False
    return conn

def run_migrations():
    """Run all PostgreSQL migrations in order"""
    logger.info("🔄 Running PostgreSQL database migrations...")
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Check if we need to add any missing columns that might not be in the base schema
        # This is mostly a safety check since the schema should be complete
        
        # Check for missing columns and add them if needed
        ensure_all_columns_exist(cursor, conn)
        
        # Set default values where needed
        set_default_values(cursor, conn)
        
        # Add instance_access_tokens table
        create_instance_access_tokens_table(cursor)
        
        # Add chat_history table
        create_chat_history_table(cursor)
        
        conn.close()
        logger.info("✅ PostgreSQL migrations completed successfully.")
        
    except Exception as e:
        logger.error(f"❌ PostgreSQL migration failed: {str(e)}")
        raise

def ensure_all_columns_exist(cursor, conn):
    """Ensure all expected columns exist in tables"""
    
    # Check companies table
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'companies' AND table_schema = 'public'
    """)
    companies_columns = [row['column_name'] for row in cursor.fetchall()]
    
    expected_companies_columns = [
        'auth0_organization_id', 'approved', 'approved_domains'
    ]
    
    for column in expected_companies_columns:
        if column not in companies_columns:
            if column == 'auth0_organization_id':
                cursor.execute("ALTER TABLE companies ADD COLUMN auth0_organization_id TEXT")
                logger.info(f"✅ Added {column} to companies table")
            elif column == 'approved':
                cursor.execute("ALTER TABLE companies ADD COLUMN approved INTEGER DEFAULT 1")
                logger.info(f"✅ Added {column} to companies table")
            elif column == 'approved_domains':
                cursor.execute("ALTER TABLE companies ADD COLUMN approved_domains TEXT")
                logger.info(f"✅ Added {column} to companies table")
    
    # Check tests table
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tests' AND table_schema = 'public'
    """)
    tests_columns = [row['column_name'] for row in cursor.fetchall()]
    
    if 'created_by_user_id' not in tests_columns:
        cursor.execute("ALTER TABLE tests ADD COLUMN created_by_user_id BIGINT REFERENCES users(id)")
        logger.info("✅ Added created_by_user_id to tests table")
    
    conn.commit()

def set_default_values(cursor, conn):
    """Set default values for any NULL fields that should have defaults"""
    
    # Set default company_id for any records that don't have one
    cursor.execute("UPDATE candidates SET company_id = 1 WHERE company_id IS NULL")
    cursor.execute("UPDATE tests SET company_id = 1 WHERE company_id IS NULL")
    cursor.execute("UPDATE test_instances SET company_id = 1 WHERE company_id IS NULL")
    cursor.execute("UPDATE test_candidates SET company_id = 1 WHERE company_id IS NULL")
    cursor.execute("UPDATE reports SET company_id = 1 WHERE company_id IS NULL")
    cursor.execute("UPDATE access_tokens SET company_id = 1 WHERE company_id IS NULL") 
    
    # Set approved = 1 for companies that don't have it set
    cursor.execute("UPDATE companies SET approved = 1 WHERE approved IS NULL")
    
    conn.commit()
    logger.info("✅ Default values set for all tables")

def test_migration():
    """Test that migrations work properly"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Test basic queries
        cursor.execute("SELECT COUNT(*) FROM companies")
        companies = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM candidates")
        candidates = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM tests")
        tests = cursor.fetchone()['count']
        
        conn.close()
        
        return {
            'success': True,
            'message': f'Migration test successful - Companies: {companies}, Candidates: {candidates}, Tests: {tests}'
        }
        
    except Exception as e:
        return {
            'success': False,
            'message': f'Migration test failed: {str(e)}'
        }

# Add instance_access_tokens table
def create_instance_access_tokens_table(cursor):
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS instance_access_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) NOT NULL UNIQUE,
        instance_id INTEGER NOT NULL REFERENCES test_instances(id) ON DELETE CASCADE,
        candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(instance_id, candidate_id)
    );
    CREATE INDEX IF NOT EXISTS idx_instance_access_tokens_token ON instance_access_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_instance_access_tokens_instance ON instance_access_tokens(instance_id);
    """)
    logger.info("✅ Added instance_access_tokens table")

# Add chat_history table
def create_chat_history_table(cursor):
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        instance_id INTEGER NOT NULL REFERENCES test_instances(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_history_instance ON chat_history(instance_id);
    CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);
    """)
    logger.info("✅ Added chat_history table")

# List of all migrations
migrations = [
    # ... existing migrations ...
    create_instance_access_tokens_table,
    create_chat_history_table,
]

if __name__ == "__main__":
    """Run migrations when script is executed directly"""
    run_migrations() 