# Integrated Document Verification Platform

This is an integrated platform combining the blockchain module and XAI module for comprehensive document verification.

## Features

### 🔐 Blockchain Integration
- Immutable document registration on Ethereum blockchain
- Cryptographic hash verification
- Transaction tracking and proof of authenticity

### 🤖 Explainable AI Analysis
- AI-generated content detection
- Plagiarism checking with chunk-based similarity
- Certificate forgery detection
- Document authenticity verification

### 💾 Database Storage
- PostgreSQL for structured data
- Document chunking for similarity search
- Complete audit trail

## Architecture

```
integrated_app/
├── server.js              # Main integrated server
├── public/
│   └── index.html        # Frontend interface
├── uploads/              # Document storage
├── package.json
└── .env
```

## Setup

### 1. Prerequisites
- Node.js (v16 or higher)
- Hardhat blockchain node running (from block_chain_module)
- PostgreSQL database configured
- Python environment (for XAI analysis)

### 2. Install Dependencies
```bash
cd integrated_app
npm install
```

### 3. Environment Configuration
Create a `.env` file:
```env
PORT=3000
NODE_ENV=development

# Blockchain Configuration (from block_chain_module)
BLOCKCHAIN_NETWORK=localhost
CONTRACT_ADDRESS=<your_deployed_contract_address>

# Database Configuration
DATABASE_URL=<your_postgres_connection_string>
```

### 4. Start the Blockchain Node
In a separate terminal, from block_chain_module:
```bash
npm run node
```

### 5. Deploy Smart Contract
From block_chain_module:
```bash
npm run deploy
```

### 6. Start the Integrated Server
```bash
npm start
```

The platform will be available at `http://localhost:3000`

## API Endpoints

### Document Operations
- `POST /api/document/upload` - Upload and analyze document
- `GET /api/document/:id` - Get document details
- `GET /api/documents` - List all documents

### Blockchain Operations
- `GET /api/blockchain/status` - Check blockchain connection
- `GET /api/blockchain/verify/:hash` - Verify document on blockchain
- `GET /api/blockchain/stats` - Get blockchain statistics

### Health Check
- `GET /api/health` - Server health status

## How It Works

1. **Upload**: User uploads a document through the web interface
2. **XAI Analysis**: Document is analyzed for:
   - AI-generated content
   - Plagiarism (chunk-based similarity)
   - Forgery indicators
3. **Chunking**: Document text is split into chunks and stored for future similarity checks
4. **Verification**: If document passes all checks, it receives "verified" status
5. **Blockchain Registration**: Verified documents are registered on blockchain with:
   - Document hash
   - XAI analysis results
   - Confidence score
6. **Results**: User receives comprehensive analysis results including blockchain transaction

## Technology Stack

- **Backend**: Node.js + Express
- **Blockchain**: Ethereum (Hardhat) + Solidity
- **AI/ML**: Python (integrated through child process)
- **Database**: PostgreSQL
- **Frontend**: Pure HTML/CSS/JavaScript

## Security Features

- File type validation
- File size limits (50MB)
- Cryptographic hashing (SHA-256)
- Blockchain immutability
- Duplicate detection

## Usage Example

1. Open `http://localhost:3000` in your browser
2. Click or drag-and-drop to select a document
3. Choose document type (Research Paper, Thesis, Certificate, etc.)
4. Optionally enter your name
5. Click "Analyze & Verify Document"
6. View comprehensive results including:
   - AI detection score
   - Plagiarism score
   - Forgery risk score
   - Blockchain registration (if verified)
   - Similar documents found

## Troubleshooting

### Blockchain Connection Issues
- Ensure Hardhat node is running: `npm run node` in block_chain_module
- Check CONTRACT_ADDRESS in .env matches deployed contract

### Database Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Run database migrations if needed

### Python XAI Issues
- Ensure Python environment is properly configured
- Check Python dependencies are installed
- Verify xai_analyzer path in server.js

## Development

For development with auto-reload:
```bash
npm run dev
```

## License
MIT
