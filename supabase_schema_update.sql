-- Additional Schema Updates for AI-OA Assessment Platform
-- Run this AFTER the main schema script to add missing columns

-- Add missing columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auth0_organization_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS approved INTEGER DEFAULT 1;

-- Add missing columns to tests table  
ALTER TABLE tests ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id);

-- Add missing company_id columns that might be NULL in SQLite
-- These were added in the main schema but let's ensure they have proper defaults
UPDATE companies SET approved = 1 WHERE approved IS NULL;

-- Update the test_instances table to handle missing company_id
UPDATE test_instances SET company_id = 1 WHERE company_id IS NULL;
UPDATE test_candidates SET company_id = 1 WHERE company_id IS NULL;
UPDATE access_tokens SET company_id = 1 WHERE company_id IS NULL;

-- Show updated schema
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('companies', 'tests', 'test_instances')
ORDER BY table_name, ordinal_position; 