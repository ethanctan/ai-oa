-- AI-OA Assessment Platform - PostgreSQL Schema
-- This script recreates the SQLite database structure in PostgreSQL
-- Run this in Supabase SQL Editor

-- Enable UUID extension for better IDs (optional but recommended)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create companies table (multi-tenant support)
CREATE TABLE IF NOT EXISTS companies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    approved_domains TEXT, -- JSON array of approved domains
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table (Auth0 integration)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    auth0_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    company_id BIGINT REFERENCES companies(id),
    role TEXT DEFAULT 'user', -- 'admin', 'user', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create candidates table
CREATE TABLE IF NOT EXISTS candidates (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    completed BOOLEAN DEFAULT FALSE,
    tags TEXT, -- JSON array or comma-separated tags
    company_id BIGINT REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tests table
CREATE TABLE IF NOT EXISTS tests (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    github_repo TEXT,
    github_token TEXT,
    target_github_repo TEXT,
    target_github_token TEXT,
    initial_prompt TEXT,
    final_prompt TEXT,
    qualitative_assessment_prompt TEXT,
    quantitative_assessment_prompt TEXT,
    candidates_assigned INTEGER DEFAULT 0,
    candidates_completed INTEGER DEFAULT 0,
    enable_timer INTEGER DEFAULT 1,
    timer_duration INTEGER DEFAULT 10,
    enable_project_timer INTEGER DEFAULT 1,
    project_timer_duration INTEGER DEFAULT 60,
    company_id BIGINT REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create test_instances table
CREATE TABLE IF NOT EXISTS test_instances (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT REFERENCES tests(id),
    candidate_id BIGINT REFERENCES candidates(id),
    docker_instance_id TEXT,
    port TEXT,
    company_id BIGINT REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create test_candidates junction table
CREATE TABLE IF NOT EXISTS test_candidates (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT REFERENCES tests(id),
    candidate_id BIGINT REFERENCES candidates(id),
    completed BOOLEAN DEFAULT FALSE,
    deadline TIMESTAMP WITH TIME ZONE,
    company_id BIGINT REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(test_id, candidate_id)
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT REFERENCES test_instances(id),
    content TEXT NOT NULL,
    company_id BIGINT REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create access_tokens table for secure email invitations
CREATE TABLE IF NOT EXISTS access_tokens (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT REFERENCES test_instances(id),
    token TEXT UNIQUE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    company_id BIGINT REFERENCES companies(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_candidates_company_id ON candidates(company_id);
CREATE INDEX IF NOT EXISTS idx_users_auth0_user_id ON users(auth0_user_id);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_tests_company_id ON tests(company_id);
CREATE INDEX IF NOT EXISTS idx_test_instances_test_id ON test_instances(test_id);
CREATE INDEX IF NOT EXISTS idx_test_instances_candidate_id ON test_instances(candidate_id);
CREATE INDEX IF NOT EXISTS idx_test_instances_company_id ON test_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_test_candidates_test_id ON test_candidates(test_id);
CREATE INDEX IF NOT EXISTS idx_test_candidates_candidate_id ON test_candidates(candidate_id);
CREATE INDEX IF NOT EXISTS idx_test_candidates_company_id ON test_candidates(company_id);
CREATE INDEX IF NOT EXISTS idx_reports_instance_id ON reports(instance_id);
CREATE INDEX IF NOT EXISTS idx_reports_company_id ON reports(company_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_token ON access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_access_tokens_company_id ON access_tokens(company_id);

-- Insert a default company (for migration from single-tenant)
INSERT INTO companies (name, domain, created_at, updated_at) 
VALUES ('Default Company', 'localhost', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insert dummy candidates data (matching your SQLite data)
INSERT INTO candidates (name, email, completed, company_id, created_at, updated_at) 
VALUES 
    ('Jane Smith', 'jane.smith@example.com', TRUE, 1, NOW(), NOW()),
    ('John Doe', 'john.doe@mail.com', FALSE, 1, NOW(), NOW()),
    ('Alex Johnson', 'alex.johnson@example.com', TRUE, 1, NOW(), NOW()),
    ('Sam Wilson', 'sam.wilson@example.com', TRUE, 1, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_instances_updated_at BEFORE UPDATE ON test_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_candidates_updated_at BEFORE UPDATE ON test_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Show tables created
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename; 