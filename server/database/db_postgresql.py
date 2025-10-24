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
    try:
        # Get database URL from environment
        database_url = os.environ.get('DATABASE_URL')
        
        if not database_url:
            raise ValueError("DATABASE_URL environment variable not set")
        
        # Create connection
        conn = psycopg2.connect(
            database_url,
            cursor_factory=psycopg2.extras.RealDictCursor  # Return rows as dictionaries
        )
        
        # Set autocommit for better compatibility
        conn.autocommit = False
        
        return conn
        
    except psycopg2.Error as e:
        logger.error(f"Database connection error: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error connecting to database: {e}")
        raise

def init_database():
    """Initialize the database - PostgreSQL version"""
    logger.info("🗄️ PostgreSQL database initialization - schema should already exist in Supabase")
    
    # Test the connection
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Test query to verify connection and schema
        cursor.execute("SELECT COUNT(*) FROM companies")
        company_count = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM candidates")  
        candidate_count = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM tests")
        test_count = cursor.fetchone()['count']
        
        logger.info(f"Database connection successful!")
        logger.info(f"   - Companies: {company_count}")
        logger.info(f"   - Candidates: {candidate_count}")
        logger.info(f"   - Tests: {test_count}")
        
        # Ensure we have at least the default company
        if company_count == 0:
            logger.info("Creating default company...")
            cursor.execute("""
                INSERT INTO companies (name, domain, created_at, updated_at) 
                VALUES ('Default Company', 'localhost', NOW(), NOW())
                ON CONFLICT DO NOTHING
            """)
            conn.commit()
            logger.info("Default company created")
        
        # Add some basic test candidates if none exist
        if candidate_count == 0:
            logger.info("Creating basic test candidates...")
            candidates_data = [
                ('Jane Smith', 'jane.smith@example.com', True),
                ('John Doe', 'john.doe@mail.com', False),  # Admin test user
                ('Alex Johnson', 'alex.johnson@example.com', True),
                ('Sam Wilson', 'sam.wilson@example.com', True)
            ]
            
            for name, email, completed in candidates_data:
                cursor.execute("""
                    INSERT INTO candidates (name, email, completed, company_id, created_at, updated_at) 
                    VALUES (%s, %s, %s, 1, NOW(), NOW())
                    ON CONFLICT (email) DO NOTHING
                """, (name, email, completed))
            
            conn.commit()
            logger.info("Basic test candidates created")
        
        conn.close()
        logger.info("Database initialization completed successfully")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise

def test_connection():
    """Test the database connection"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT version()")
        version = cursor.fetchone()
        conn.close()
        return f"PostgreSQL connection successful: {version['version']}"
    except Exception as e:
        return f"PostgreSQL connection failed: {str(e)}" 