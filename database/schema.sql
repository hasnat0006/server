-- PostgreSQL Database Schema for Document Verification Platform
-- Create database: CREATE DATABASE document_verification;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_hash VARCHAR(66) UNIQUE, -- SHA-256 hash with 0x prefix
    uploader_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'analyzing', -- analyzing, verified, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- XAI Analysis Results table
CREATE TABLE xai_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    
    -- Plagiarism Check Results
    is_plagiarized BOOLEAN NOT NULL DEFAULT FALSE,
    plagiarism_similarity NUMERIC(5,2), -- 0-100
    plagiarism_threshold NUMERIC(5,2),
    plagiarism_details JSONB,
    
    -- AI Detection Results
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ai_probability NUMERIC(5,2), -- 0-100
    ai_threshold NUMERIC(5,2),
    ai_indicators JSONB,
    
    -- Certificate Forgery Results (if applicable)
    is_forged BOOLEAN,
    forgery_evidence JSONB,
    
    -- Overall Analysis
    rejection_reasons JSONB,
    explanation JSONB,
    raw_results JSONB, -- Store complete analysis
    
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Blockchain Records table
CREATE TABLE blockchain_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_hash VARCHAR(66) NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    gas_used VARCHAR(50),
    network VARCHAR(50) NOT NULL DEFAULT 'localhost',
    chain_id INTEGER NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Matching Parts table (for plagiarism evidence)
CREATE TABLE matching_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    xai_analysis_id UUID NOT NULL REFERENCES xai_analysis(id) ON DELETE CASCADE,
    source_document VARCHAR(255) NOT NULL,
    matched_text TEXT NOT NULL,
    similarity_score NUMERIC(5,2) NOT NULL,
    length_words INTEGER,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Known Documents Database (for comparison)
CREATE TABLE known_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id VARCHAR(255) UNIQUE NOT NULL,
    document_text TEXT NOT NULL,
    document_hash VARCHAR(66),
    metadata JSONB,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Known Certificates Database
CREATE TABLE known_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id VARCHAR(255) UNIQUE NOT NULL,
    certificate_text TEXT NOT NULL,
    holder_name VARCHAR(255),
    certificate_number VARCHAR(100),
    issuing_authority VARCHAR(255),
    issue_date DATE,
    qualification VARCHAR(255),
    extracted_info JSONB,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table (optional, for future authentication)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user', -- user, admin
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Audit Log table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_document_hash ON documents(document_hash);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_xai_analysis_document_id ON xai_analysis(document_id);
CREATE INDEX idx_blockchain_records_document_id ON blockchain_records(document_id);
CREATE INDEX idx_blockchain_records_transaction_hash ON blockchain_records(transaction_hash);
CREATE INDEX idx_matching_parts_xai_analysis_id ON matching_parts(xai_analysis_id);
CREATE INDEX idx_known_documents_document_hash ON known_documents(document_hash);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for documents table
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries

-- View: Document Summary
CREATE VIEW document_summary AS
SELECT 
    d.id,
    d.original_name,
    d.document_type,
    d.document_hash,
    d.uploader_name,
    d.status,
    d.created_at,
    x.confidence_score,
    x.is_plagiarized,
    x.is_ai_generated,
    x.is_forged,
    b.transaction_hash,
    b.block_number
FROM documents d
LEFT JOIN xai_analysis x ON d.id = x.document_id
LEFT JOIN blockchain_records b ON d.id = b.document_id;

-- View: Verification Statistics
CREATE VIEW verification_stats AS
SELECT 
    COUNT(*) as total_documents,
    COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_count,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN status = 'analyzing' THEN 1 END) as analyzing_count,
    AVG(CASE WHEN status = 'verified' THEN xai.confidence_score END) as avg_confidence_verified,
    COUNT(CASE WHEN xai.is_plagiarized = TRUE THEN 1 END) as plagiarism_count,
    COUNT(CASE WHEN xai.is_ai_generated = TRUE THEN 1 END) as ai_generated_count,
    COUNT(CASE WHEN xai.is_forged = TRUE THEN 1 END) as forged_count
FROM documents d
LEFT JOIN xai_analysis xai ON d.id = xai.document_id;

-- Sample data insertion functions

-- Function to add a known document
CREATE OR REPLACE FUNCTION add_known_document(
    p_document_id VARCHAR,
    p_document_text TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_hash VARCHAR;
BEGIN
    v_hash := '0x' || encode(digest(p_document_text, 'sha256'), 'hex');
    
    INSERT INTO known_documents (document_id, document_text, document_hash, metadata)
    VALUES (p_document_id, p_document_text, v_hash, p_metadata)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add a known certificate
CREATE OR REPLACE FUNCTION add_known_certificate(
    p_certificate_id VARCHAR,
    p_certificate_text TEXT,
    p_holder_name VARCHAR DEFAULT NULL,
    p_cert_number VARCHAR DEFAULT NULL,
    p_issuing_authority VARCHAR DEFAULT NULL,
    p_extracted_info JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO known_certificates (
        certificate_id, certificate_text, holder_name, 
        certificate_number, issuing_authority, extracted_info
    )
    VALUES (
        p_certificate_id, p_certificate_text, p_holder_name,
        p_cert_number, p_issuing_authority, p_extracted_info
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample known documents for testing
INSERT INTO known_documents (document_id, document_text, metadata) VALUES
('sample_paper_1', 'This is a sample research paper about machine learning algorithms and their applications in modern computing.', '{"type": "research_paper", "year": 2024}'::jsonb),
('sample_paper_2', 'Deep learning and neural networks have revolutionized the field of artificial intelligence research in recent years.', '{"type": "research_paper", "year": 2024}'::jsonb),
('sample_paper_3', 'Blockchain technology provides a decentralized and secure method for storing and verifying digital transactions.', '{"type": "research_paper", "year": 2024}'::jsonb);

-- Insert sample known certificate
INSERT INTO known_certificates (certificate_id, certificate_text, holder_name, certificate_number, issuing_authority, extracted_info) VALUES
('CERT-2024-001', 
'Certificate of Achievement. This is to certify that John Smith has successfully completed the Advanced Machine Learning course. Issued by University of Technology. Certificate Number: UOT-2024-12345. Date: 15-06-2024',
'John Smith',
'UOT-2024-12345',
'University of Technology',
'{"issue_date": "2024-06-15", "course": "Advanced Machine Learning"}'::jsonb);

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;

COMMENT ON TABLE documents IS 'Main documents table storing all uploaded documents';
COMMENT ON TABLE xai_analysis IS 'XAI analysis results for each document';
COMMENT ON TABLE blockchain_records IS 'Blockchain registration records for verified documents';
COMMENT ON TABLE matching_parts IS 'Evidence of plagiarism - matching text segments';
COMMENT ON TABLE known_documents IS 'Database of known documents for plagiarism comparison';
COMMENT ON TABLE known_certificates IS 'Database of known certificates for forgery detection';
