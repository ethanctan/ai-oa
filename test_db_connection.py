#!/usr/bin/env python3
"""
Test PostgreSQL connection to Supabase
"""

import sys
import os
from dotenv import load_dotenv

# Add server directory to path
sys.path.append('server')

# Load environment variables
load_dotenv('server/.env')

# Test the connection
try:
    from server.database.db_postgresql import test_connection, get_connection
    
    print("🔍 Testing Supabase PostgreSQL connection...")
    
    # Test basic connection
    result = test_connection()
    print(result)
    
    # Test a simple query
    print("\n🔍 Testing basic queries...")
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check tables exist
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
    """)
    
    tables = cursor.fetchall()
    print(f"✅ Found {len(tables)} tables:")
    for table in tables:
        print(f"   - {table['table_name']}")
    
    # Check sample data
    cursor.execute("SELECT COUNT(*) FROM companies")
    company_count = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) FROM candidates")
    candidate_count = cursor.fetchone()['count']
    
    print(f"\n📊 Data counts:")
    print(f"   - Companies: {company_count}")
    print(f"   - Candidates: {candidate_count}")
    
    conn.close()
    print("\n✅ All database tests passed!")
    print("🚀 Ready to start Flask app!")
    
except Exception as e:
    print(f"❌ Database connection failed: {str(e)}")
    print("\n💡 Check your .env file contains:")
    print("   DATABASE_URL=postgresql://postgres:A0JmOJxhebRupzI8@db.hjlerkuwfbeempqjttts.supabase.co:5432/postgres")
    sys.exit(1) 