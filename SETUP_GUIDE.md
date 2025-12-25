# Document Verification Platform - Complete Setup Guide

## 🎯 Quick Start (For Demo)

### Prerequisites
- Node.js v18+ installed
- npm installed
- 3 terminal windows

### Setup Steps

**1. Install & Setup (One-time)**
```bash
chmod +x setup.sh
./setup.sh
```

**2. Run the Demo (Every time)**

**Terminal 1: Start Blockchain**
```bash
npm run node
```
Keep this running. You'll see accounts with ETH balances.

**Terminal 2: Deploy Contract** (Wait for Terminal 1 to be ready)
```bash
npm run deploy
```
This will create `deployment-info.json` with the contract address.

**Terminal 3: Start API Server**
```bash
npm start
```
Or use the quick start script:
```bash
chmod +x start-demo.sh
./start-demo.sh
```

**4. Open Browser**
```
http://localhost:3000
```

## 📋 Complete Workflow

### 1. Upload Document
- Drag & drop or click to upload
- Supported: PDF, DOC, DOCX, TXT (max 50MB)
- Enter document type and your name

### 2. XAI Analysis
The system will automatically:
- ✅ Calculate document hash (SHA-256)
- ✅ Check for plagiarism (similarity detection)
- ✅ Detect AI-generated content
- ✅ Check certificate forgery (if certificate type)
- ✅ Generate explainable results

### 3. Blockchain Registration
If document passes verification:
- ✅ Register on blockchain with immutable hash
- ✅ Store XAI analysis results
- ✅ Record timestamp and uploader
- ✅ Generate transaction proof

### 4. Results
You'll see:
- **Status**: Verified ✅ or Rejected ❌
- **Confidence Score**: 0-100%
- **XAI Analysis**: Detailed breakdown
- **Blockchain Proof**: Transaction hash, block number
- **Explanation**: Why accepted/rejected with evidence

## 🏗️ Architecture

```
┌──────────────┐
│   Frontend   │ (public/index.html)
│   (Browser)  │
└──────┬───────┘
       │ HTTP
       ▼
┌──────────────┐
│  API Server  │ (api/server.js)
│  (Express)   │
└──┬────────┬──┘
   │        │
   ▼        ▼
┌─────┐  ┌──────────┐
│ XAI │  │Blockchain│
│Module│  │Connector │
└─────┘  └────┬─────┘
              │
              ▼
     ┌─────────────────┐
     │ Smart Contract  │
     │(DocumentRegistry)│
     └─────────────────┘
```

## 📁 Project Structure

```
server/
├── api/                          # Backend API
│   ├── server.js                 # Express server
│   ├── blockchain/
│   │   └── connector.js          # Blockchain integration
│   ├── xai/
│   │   └── analyzer.js           # XAI analysis engine
│   └── database/
│       └── handler.js            # Data persistence
├── contracts/
│   └── DocumentRegistry.sol      # Smart contract
├── ignition/
│   └── deploy.js                 # Deployment script
├── scripts/
│   └── DocumentRegistry.test.js  # Tests
├── public/
│   └── index.html                # Web interface
├── xai_module/                   # Python XAI modules
│   ├── plagiarism_check.py
│   └── embeddings.py
├── hardhat.config.js             # Hardhat config
├── package.json                  # Dependencies
├── setup.sh                      # Setup script
└── start-demo.sh                 # Quick start script
```

## 🔧 API Endpoints

### Health Check
```
GET /api/health
```

### Upload Document
```
POST /api/document/upload
Body: FormData with 'document' file
```

### Get Document
```
GET /api/document/:id
```

### Verify on Blockchain
```
GET /api/blockchain/verify/:documentHash
```

### Get Statistics
```
GET /api/blockchain/stats
```

## 🧪 Testing

Run contract tests:
```bash
npm test
```

Run specific test:
```bash
npx hardhat test scripts/DocumentRegistry.test.js
```

## 🎨 Features

### XAI Analysis
- **Plagiarism Detection**: Finds similar content in database
- **AI Content Detection**: Identifies AI-generated text
- **Certificate Forgery**: Checks for duplicate credentials
- **Explainability**: Shows WHY document was rejected with evidence

### Blockchain
- **Immutable Storage**: Document hashes stored permanently
- **Timestamping**: Proof of existence at specific time
- **Transparency**: All transactions visible
- **Tamper-Proof**: Cannot be altered or deleted

### Web Interface
- **Drag & Drop**: Easy file upload
- **Real-time Analysis**: See progress
- **Detailed Results**: Complete verification report
- **Statistics**: Platform-wide stats

## 🐛 Troubleshooting

### "Contract not deployed"
```bash
# Make sure blockchain is running
npm run node

# Then deploy
npm run deploy
```

### "Port 3000 already in use"
```bash
# Kill the process
lsof -ti:3000 | xargs kill -9

# Or change port in api/server.js
```

### "Cannot connect to blockchain"
```bash
# Restart blockchain node
# Make sure it's running on http://127.0.0.1:8545
```

### "Module not found"
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

## 📊 Demo Scenarios

### Scenario 1: Legitimate Document
1. Upload original research paper
2. Should pass all checks
3. Gets registered on blockchain
4. Status: Verified ✅

### Scenario 2: Plagiarized Content
1. Upload document with copied content
2. XAI detects similarity
3. Shows matching parts
4. Status: Rejected ❌

### Scenario 3: AI-Generated Paper
1. Upload AI-written paper
2. XAI detects AI patterns
3. Shows indicators
4. Status: Rejected ❌

### Scenario 4: Forged Certificate
1. Upload duplicate certificate
2. Matches existing in database
3. Shows original holder
4. Status: Rejected ❌

## 🚀 Production Deployment

For production, you'll need to:

1. **Use real blockchain**: Ethereum, Polygon, etc.
2. **Implement real XAI models**: Use actual AI detectors
3. **Add authentication**: User login system
4. **Use proper database**: PostgreSQL, MongoDB
5. **Add file storage**: IPFS, AWS S3
6. **Enhance security**: Rate limiting, input validation
7. **Add monitoring**: Logging, error tracking

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review logs in terminal
3. Verify all steps completed

## 📄 License

MIT License - Thesis Project
