# PostgreSQL Setup for Vector Search

## Quick Setup (Option 1: Use Docker)

```bash
# Start PostgreSQL with Docker
docker run -d \
  --name postgres-doc-verification \
  -e POSTGRES_USER=docverify \
  -e POSTGRES_PASSWORD=securepassword123 \
  -e POSTGRES_DB=document_verification \
  -p 5432:5432 \
  postgres:14

# Create .env file
cat > /home/engr/thesis/server/.env << 'EOF'
DATABASE_URL=postgresql://docverify:securepassword123@localhost:5432/document_verification
EOF

# Run migrations
docker exec -i postgres-doc-verification psql -U docverify -d document_verification < /home/engr/thesis/server/xai_module/migrations/002_create_documents_chunks.sql
```

## Manual Setup (Option 2: Install PostgreSQL)

### 1. Install PostgreSQL
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
```

### 2. Create Database and User
```bash
sudo -u postgres psql

-- In PostgreSQL shell:
CREATE DATABASE document_verification;
CREATE USER docverify WITH PASSWORD 'securepassword123';
GRANT ALL PRIVILEGES ON DATABASE document_verification TO docverify;
\q
```

### 3. Create Tables
```bash
psql -U docverify -d document_verification -f /home/engr/thesis/server/xai_module/migrations/002_create_documents_chunks.sql
```

### 4. Configure Environment
```bash
# Create .env file in project root
cat > /home/engr/thesis/server/.env << 'EOF'
DATABASE_URL=postgresql://docverify:securepassword123@localhost:5432/document_verification
EOF
```

### 5. Test Connection
```bash
# Test if PostgreSQL is accessible
psql -U docverify -d document_verification -c "SELECT version();"
```

## What You Get With PostgreSQL

### With PostgreSQL:
- ✅ **Chunk-based matching** - Finds partial similarity
- ✅ **Vector search** - Fast hash-based lookups
- ✅ **Granular analysis** - Shows which sections match
- ✅ **Scalability** - Handles millions of documents

### Without PostgreSQL (Current - JSON-based):
- ✅ **Document-level matching** - Basic duplicate detection
- ✅ **Simpler setup** - No additional database needed
- ⚠️ **Limited granularity** - Can't identify partial matches
- ⚠️ **Less scalable** - File-based storage

## Current System (JSON-based)

Your system currently works with the JSON database for:
- Storing document metadata
- Tracking verification status
- Recording blockchain transactions
- Basic duplicate detection

The XAI Python analyzers (plagiarism, AI detection) still work independently.

## Recommendation

**For Development/Demo:** Use JSON-based system (current setup)
- No additional setup required
- Works out of the box
- Good for testing

**For Production:** Set up PostgreSQL
- Better similarity detection
- Scalable to large document corpus
- Professional-grade search capabilities
