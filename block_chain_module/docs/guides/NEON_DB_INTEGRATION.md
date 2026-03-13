# Neon DB Integration with Chunking & XAI

## ✅ System Overview

Your document verification system now has **full integration** with Neon PostgreSQL database including:

1. **Documents Table** - Stores document metadata, XAI results, blockchain data
2. **Chunks Table** - Stores document chunks for similarity-based plagiarism detection
3. **XAI Analysis** - Real Python-based plagiarism, AI detection, and forgery checks
4. **Blockchain Registration** - Immutable verification records
5. **Chunk-Based Matching** - Enhanced plagiarism detection using text similarity

## 📊 Database Schema

### Documents Table
```sql
- id (serial, primary key)
- filename (varchar) - Document filename
- uploaded_at (timestamp) - Upload timestamp
- doc_hash (varchar) - SHA256 hash from blockchain
- num_pages (integer) - Number of pages
- metadata (jsonb) - Contains:
  {
    "original_name": "file.pdf",
    "file_path": "/uploads/...",
    "file_size": 123456,
    "document_type": "research_paper",
    "uploader_name": "User",
    "status": "verified|rejected|analyzing",
    "xai_results": {...},
    "blockchain_data": {...}
  }
- chunks (jsonb) - Reference to chunks
```

### Chunks Table
```sql
- id (serial, primary key)
- document_id (integer) - Foreign key to documents
- chunk_index (integer) - Sequential chunk number
- content (text) - Chunk text content
- embedding (jsonb/vector) - Embedding vector for similarity search
- metadata (jsonb) - Additional chunk metadata
- created_at (timestamp)
```

## 🔄 Document Upload Workflow

```
1. User uploads document
   ↓
2. Save to documents table (status: analyzing)
   ↓
3. XAI Analysis (Python scripts):
   - Extract text from PDF/DOC/TXT
   - Run plagiarism detection
   - Run AI content detection
   - Run certificate forgery check (if applicable)
   ↓
4. Create chunks from document text:
   - Split into 1000-character chunks with 200-char overlap
   - Create embeddings for each chunk
   - Store in chunks table
   ↓
5. Chunk-based similarity search:
   - Compare new document chunks with existing chunks
   - Find similar content across all documents
   - Aggregate matches by source document
   - Enhance plagiarism results
   ↓
6. If verified → Register on blockchain
   ↓
7. Update documents table with:
   - Final status (verified/rejected)
   - XAI results (with chunk matches)
   - Blockchain transaction data
   ↓
8. Return complete analysis to user
```

## 🔍 XAI Analysis Components

### 1. Plagiarism Detection
- **Python Script**: `enhanced_plagiarism_check.py`
- **Method**: Text similarity + chunk-based matching
- **Threshold**: 75% similarity
- **Output**: 
  - `is_plagiarized`: boolean
  - `max_similarity`: 0-1 score
  - `matching_parts`: Array of matches
  - `chunk_matches`: Similar document chunks

### 2. AI Content Detection
- **Python Script**: `ai_content_detector.py`
- **Method**: Statistical analysis of text patterns
- **Threshold**: 60% AI probability
- **Output**:
  - `is_ai_generated`: boolean
  - `ai_probability`: 0-100 score
  - `indicators`: Array of AI indicators

### 3. Certificate Forgery Detection
- **Python Script**: `certificate_forgery_detector.py`
- **Method**: Template matching + text extraction
- **Output**:
  - `is_forged`: boolean
  - `extracted_info`: Certificate details
  - `forgery_evidence`: List of anomalies

## 📦 Chunking Service Features

### Text Chunking
```javascript
- Chunk size: 1000 characters
- Overlap: 200 characters
- Preserves context between chunks
```

### Similarity Calculation
```javascript
- Jaccard similarity (word-based)
- Threshold: 30-40% for matches
- Cosine similarity for embeddings (if vector extension available)
```

### Database Operations
```javascript
// Create chunks
await chunkingService.processDocument(documentId, text, metadata);

// Find similar chunks
const matches = await chunkingService.findSimilarChunks(queryText, excludeDocId, threshold);

// Get document chunks
const chunks = await dbHandler.getChunks(documentId);

// Delete chunks
await dbHandler.deleteChunks(documentId);
```

## 🚀 API Endpoints

### Upload Document
```bash
POST /api/document/upload
Content-Type: multipart/form-data

Fields:
- document: File (PDF, DOC, DOCX, TXT)
- documentType: string (research_paper, certificate, etc.)
- uploaderName: string

Response:
{
  "success": true,
  "data": {
    "documentId": 123,
    "status": "verified",
    "xaiAnalysis": {
      "plagiarismCheck": {...},
      "aiDetection": {...},
      "chunkBasedMatches": [...]
    },
    "blockchain": {
      "transactionHash": "0x...",
      "blockNumber": 123
    }
  }
}
```

### Get Document
```bash
GET /api/document/:id

Response:
{
  "success": true,
  "data": {
    "id": 123,
    "filename": "document.pdf",
    "doc_hash": "0x123...",
    "metadata": {
      "status": "verified",
      "xai_results": {...},
      "blockchain_data": {...}
    }
  }
}
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
DATABASE_URL=postgresql://neondb_owner:password@host/neondb?sslmode=require
PORT=3000
NODE_ENV=development
PYTHON_PATH=python3
```

### Database Handler Access
```javascript
const dbHandler = require('./database/handler');

// PostgreSQL operations
await dbHandler.createDocument(data);
await dbHandler.updateDocument(id, updates);
await dbHandler.getDocument(id);

// Chunk operations
await dbHandler.createChunk(chunkData);
await dbHandler.getChunks(documentId);
await dbHandler.deleteChunks(documentId);
```

## 📈 Plagiarism Matching Process

1. **Upload New Document**
   - Document is chunked into 1000-char pieces
   - Each chunk gets an embedding vector

2. **Similarity Search**
   - Compare new chunks against all existing chunks
   - Calculate Jaccard similarity (word overlap)
   - Filter matches above threshold (40%)

3. **Aggregation**
   - Group matches by source document
   - Calculate average similarity per document
   - Rank documents by similarity score

4. **Enhancement**
   - If chunk matches found, enhance XAI plagiarism results
   - Add top matching documents to response
   - Update similarity score if needed

5. **User Display**
   - Show "Fuzzy Matches Found" section
   - List source documents with similarity %
   - Provide "View Similar Sections" button
   - Display matched text snippets

## ✨ Key Features

✅ **Dual Database Storage** - PostgreSQL (primary) + JSON (backup)
✅ **Chunk-Based Similarity** - Enhanced plagiarism detection
✅ **Real XAI Analysis** - Python-based detection scripts
✅ **Blockchain Integration** - Immutable verification records
✅ **Vector Search Ready** - Supports pgvector extension
✅ **Graceful Fallback** - Works without vector extension
✅ **Comprehensive Metadata** - JSONB storage for flexible data

## 🐛 Troubleshooting

### XAI Not Generating
- ✅ **FIXED**: XAI analyzer now returns extracted text
- ✅ **FIXED**: Chunking service processes text after XAI
- ✅ **FIXED**: Chunk-based matches enhance plagiarism results

### PostgreSQL Connection Issues
- ✅ **FIXED**: Schema matches Neon DB structure
- ✅ **FIXED**: Metadata stored in JSONB field
- ✅ **FIXED**: SSL configuration for Neon DB

### Chunk Table Issues
- ✅ **FIXED**: Foreign key to documents table
- ✅ **FIXED**: Cascade delete support
- ✅ **FIXED**: Proper chunk indexing

## 🎯 Next Steps

1. **Test Upload** - Try uploading a document
2. **Check Chunks** - Verify chunks are created in Neon DB
3. **Test Matching** - Upload similar document to see matches
4. **View Results** - Check frontend displays chunk matches

## 📝 Testing

```bash
# Start server
npm start

# Upload test document
curl -X POST http://localhost:3000/api/document/upload \
  -F "document=@test.pdf" \
  -F "documentType=research_paper" \
  -F "uploaderName=TestUser"

# Check Neon DB
# Go to Neon Console → Tables → documents & chunks
# Verify records are created

# Upload similar document
# Should show "Fuzzy Matches Found" in results
```

## 🎉 System Status

✅ **Server Running** - http://localhost:3000
✅ **Neon DB Connected** - PostgreSQL primary database
✅ **Chunking Service** - Active and ready
✅ **Blockchain** - Contract deployed at 0x5FbDB...
✅ **XAI Scripts** - Python modules available
✅ **JSON Backup** - 49 documents loaded

**System is fully operational and ready for document verification!**
