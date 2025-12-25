# Enhanced Document Verification Platform - Setup Guide

## 🎯 Overview

This enhanced version includes:
- ✅ Real Python-based XAI analysis modules (Plagiarism, AI Detection, Certificate Forgery)
- ✅ PostgreSQL database for production-grade data storage
- ✅ Improved integration layer between XAI and Blockchain
- ✅ Enhanced API server with better error handling

## 📋 Prerequisites

1. **Node.js** v18+ (v20+ recommended)
2. **Python 3** (3.8 or higher)
3. **PostgreSQL** 12+ (optional but recommended for production)
4. **npm** or **yarn**

## 🚀 Quick Start (3 Steps)

### Step 1: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Verify Python installation
python3 --version
```

### Step 2: Start Blockchain Node

```bash
# Terminal 1 - Keep this running
npm run node
```

This starts a local Ethereum blockchain on `http://127.0.0.1:8545`

### Step 3: Deploy Contract & Start Server

```bash
# Terminal 2 - Deploy smart contract
npm run deploy

# Terminal 3 - Start API server
npm start
```

Server will be available at: **http://localhost:3000**

## 🔧 Setup PostgreSQL (Optional)

For production use with PostgreSQL database:

### 1. Install PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Fedora:**
```bash
sudo dnf install postgresql-server postgresql-contrib
sudo systemctl start postgresql
```

### 2. Run Database Setup Script

```bash
cd database
chmod +x setup-db.sh
./setup-db.sh
```

This will:
- Create database `document_verification`
- Run schema migrations
- Create `.env` file with configuration

### 3. Configure Environment

Edit `.env` file in the project root:

```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=document_verification
DB_USER=postgres
DB_PASSWORD=your_password_here

# Python Configuration
PYTHON_PATH=python3

# Application Configuration
PORT=3000
NODE_ENV=development
```

### 4. Switch to PostgreSQL Handler

Update [api/server.js](api/server.js):

```javascript
// Replace this line:
const dbHandler = require('./database/handler');

// With:
const dbHandler = require('./database/postgres-handler');
```

Restart the server.

## 🐍 XAI Modules

The platform includes three real Python-based XAI analyzers:

### 1. Enhanced Plagiarism Checker
**Location:** [xai_module/enhanced_plagiarism_check.py](xai_module/enhanced_plagiarism_check.py)

**Features:**
- N-gram extraction (3-5 word sequences)
- Jaccard similarity calculation
- Cosine similarity with TF-IDF
- Matching segment detection
- Database comparison against known documents

**Test standalone:**
```bash
python3 xai_module/enhanced_plagiarism_check.py test_document.txt
```

### 2. AI Content Detector
**Location:** [xai_module/ai_content_detector.py](xai_module/ai_content_detector.py)

**Features:**
- Perplexity score analysis
- Sentence structure uniformity detection
- Repetitive pattern recognition
- Vocabulary richness (TTR) calculation
- Generic transition word detection

**Test standalone:**
```bash
python3 xai_module/ai_content_detector.py test_document.txt
```

### 3. Certificate Forgery Detector
**Location:** [xai_module/certificate_forgery_detector.py](xai_module/certificate_forgery_detector.py)

**Features:**
- Information extraction (name, date, cert number, authority)
- Template matching against known certificates
- Similarity scoring
- Forgery evidence collection

**Test standalone:**
```bash
python3 xai_module/certificate_forgery_detector.py test_certificate.txt
```

## 📊 Database Schema

The PostgreSQL schema includes:

### Core Tables
- `documents` - Main document storage
- `xai_analysis` - Analysis results from Python modules
- `blockchain_records` - Blockchain transaction records
- `matching_parts` - Plagiarism matching segments
- `known_documents` - Reference corpus for plagiarism detection
- `known_certificates` - Verified certificate templates
- `users` - User management
- `audit_log` - System audit trail

### Views
- `document_summary` - Comprehensive document overview
- `verification_stats` - Platform statistics

### Helper Functions
- `add_known_document()` - Add to reference corpus
- `add_known_certificate()` - Add verified certificate template

## 🔄 System Architecture

```
┌─────────────────┐
│  Web Interface  │
│  (React/HTML)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   API Server    │ ◄──► PostgreSQL Database
│   (Express.js)  │
└────────┬────────┘
         │
    ┌────┴─────┬─────────────┬──────────────┐
    ▼          ▼             ▼              ▼
┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Python│  │  Python  │  │  Python  │  │Blockchain│
│Plagia│  │AI Content│  │Certificate│  │Connector │
│rism  │  │ Detector │  │  Forgery │  │(Ethers.js)│
└──────┘  └──────────┘  └──────────┘  └─────┬────┘
                                             │
                                             ▼
                                      ┌─────────────┐
                                      │ Smart       │
                                      │ Contract    │
                                      │(Solidity)   │
                                      └─────────────┘
```

## 🧪 Testing

### Run Smart Contract Tests
```bash
npm test
```

### Test Individual XAI Modules

**1. Test Plagiarism Checker:**
```bash
# Create test file
echo "This is a sample document with some content for testing plagiarism detection." > test.txt

# Run analyzer
python3 xai_module/enhanced_plagiarism_check.py test.txt
```

**2. Test AI Content Detector:**
```bash
echo "The utilization of artificial intelligence in contemporary society demonstrates significant implications." > ai_test.txt

python3 xai_module/ai_content_detector.py ai_test.txt
```

**3. Test Certificate Forgery Detector:**
```bash
cat > cert_test.txt << EOF
CERTIFICATE OF ACHIEVEMENT

This is to certify that John Smith has successfully completed
the Advanced Machine Learning Course on January 15, 2024.

Certificate Number: ML-2024-001
Issued by: Tech University
EOF

python3 xai_module/certificate_forgery_detector.py cert_test.txt
```

### Test Full Integration

1. Start all services (blockchain, server)
2. Open http://localhost:3000
3. Upload a document
4. Check console logs for XAI analysis execution
5. Verify blockchain registration

## 📝 API Endpoints

### Upload Document
```http
POST /api/document/upload
Content-Type: multipart/form-data

{
  "file": <file>,
  "documentType": "research_paper" | "certificate" | "journal"
}
```

### Get All Documents
```http
GET /api/documents
```

### Get Specific Document
```http
GET /api/document/:id
```

### Get Statistics
```http
GET /api/stats
```

### Verify Document Hash
```http
POST /api/document/verify
Content-Type: application/json

{
  "documentHash": "0x..."
}
```

## 🎨 Features

### ✅ Real XAI Analysis
- Actual plagiarism detection algorithms (n-grams, Jaccard, cosine similarity)
- Multi-factor AI content detection (perplexity, patterns, vocabulary)
- Certificate forgery detection with template matching

### ✅ Blockchain Integration
- Immutable document registration
- Smart contract verification
- Transaction hash tracking
- Gas usage optimization

### ✅ Database Options
- **JSON File** (default) - Quick setup, development
- **PostgreSQL** (recommended) - Production-grade, scalable

### ✅ Web Interface
- Drag-and-drop file upload
- Real-time analysis results
- Blockchain transaction tracking
- Statistics dashboard

## 🔒 Security Features

1. **Document Hashing** - SHA-256 cryptographic hashing
2. **Blockchain Immutability** - Tamper-proof records
3. **XAI Transparency** - Explainable verification decisions
4. **Audit Trail** - Complete history in database

## 🐛 Troubleshooting

### Python Script Not Found
```bash
# Check Python path
which python3

# Update .env file
PYTHON_PATH=/usr/bin/python3
```

### PostgreSQL Connection Error
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start if needed
sudo systemctl start postgresql

# Verify connection
psql -U postgres -d document_verification -c "SELECT 1;"
```

### Contract Deployment Failed
```bash
# Make sure blockchain node is running
npm run node  # Terminal 1

# Redeploy
npm run deploy  # Terminal 2
```

### Module Not Found Error
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "Document already registered" Error
This is expected behavior - the blockchain prevents duplicate documents based on hash.
Each unique document content can only be registered once.

## 📦 Project Structure

```
server/
├── api/
│   ├── server.js                    # Main Express server
│   ├── blockchain/
│   │   └── connector.js             # Blockchain interface
│   ├── xai/
│   │   ├── analyzer.js              # Old simulated analyzer
│   │   └── real-analyzer.js         # ✨ New real Python integration
│   └── database/
│       ├── handler.js               # JSON file handler
│       └── postgres-handler.js      # PostgreSQL handler
├── xai_module/
│   ├── enhanced_plagiarism_check.py # ✨ Real plagiarism detection
│   ├── ai_content_detector.py       # ✨ Real AI detection
│   └── certificate_forgery_detector.py # ✨ Real forgery detection
├── database/
│   ├── schema.sql                   # PostgreSQL schema
│   └── setup-db.sh                  # Database setup script
├── contracts/
│   └── DocumentRegistry.sol         # Smart contract
├── ignition/
│   └── deploy.js                    # Deployment script
├── public/
│   └── index.html                   # Web interface
├── test/
│   └── DocumentRegistry.test.js     # Contract tests
├── hardhat.config.js                # Hardhat configuration
└── package.json                     # Dependencies

```

## 🔗 Useful Links

- Smart Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Blockchain RPC: `http://127.0.0.1:8545`
- API Server: `http://localhost:3000`
- Web Interface: `http://localhost:3000`

## 📚 Documentation

- [Blockchain Guide](BLOCKCHAIN_GUIDE.md)
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Quick Start](QUICK_START.md)

## 🤝 Contributing

When adding new features:

1. **XAI Modules** - Add Python scripts to `xai_module/`
2. **API Endpoints** - Update `api/server.js`
3. **Smart Contract** - Modify `contracts/DocumentRegistry.sol`
4. **Database Schema** - Update `database/schema.sql`

## 📄 License

This project is for academic/research purposes.

## 🆘 Support

If you encounter issues:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Verify all prerequisites are installed
3. Ensure all three terminals are running
4. Check console logs for detailed error messages

## 🎓 Usage Example

```bash
# Terminal 1: Start blockchain
npm run node

# Terminal 2: Deploy contract (wait for Terminal 1 to be ready)
npm run deploy

# Terminal 3: Start server (wait for Terminal 2 to complete)
npm start

# Open browser
firefox http://localhost:3000

# Upload a document and watch the magic! ✨
```

---

**Status:** ✅ Enhanced version with real Python XAI modules and PostgreSQL support

**Last Updated:** 2024

**Version:** 2.0 (Enhanced)
