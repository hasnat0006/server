# Thesis Project: Blockchain + XAI Document Verification

A Hybrid Framework Using Explainable AI and Blockchain for Transparent Digital Document Verification

## 📁 Project Structure

```
Thesis-Project/
├── contracts/                    # Solidity Smart Contracts
│   └── DocumentRegistry.sol      # Main contract for document verification
├── ignition/                     # Deployment Scripts
│   └── deploy.js                 # Contract deployment script
├── scripts/                      # Testing Scripts
│   └── DocumentRegistry.test.js  # Comprehensive contract tests
├── xai_module/                   # XAI Python Modules
│   ├── plagiarism_check.py       # Plagiarism detection module
│   └── embeddings.py             # Document embeddings module
├── hardhat.config.js             # Hardhat configuration
├── package.json                  # Node.js dependencies
└── README.md                     # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Python 3.8+ (for XAI module)

### Installation

1. **Install Node.js dependencies:**
```bash
npm install
```

2. **Compile the smart contracts:**
```bash
npm run compile
```

## 🔧 Usage

### 1. Start Local Blockchain

Start a local Hardhat node:
```bash
npm run node
```

This will start a local Ethereum network at `http://127.0.0.1:8545`

### 2. Deploy Contract

In a new terminal, deploy the DocumentRegistry contract:
```bash
npm run deploy
```

This will:
- Deploy the contract to the local network
- Save deployment information to `deployment-info.json`
- Display the contract address

### 3. Run Tests

Run the comprehensive test suite:
```bash
npm test
```

### 4. Clean Build Artifacts

Remove compiled contracts and cache:
```bash
npm run clean
```

## 📝 Smart Contract Functions

### DocumentRegistry.sol

#### Main Functions:

1. **registerDocument(documentHash, documentName)**
   - Register a new document on the blockchain
   - Parameters:
     - `documentHash`: SHA-256 hash of the document
     - `documentName`: Name of the document
   - Emits: `DocumentRegistered` event

2. **addXAIAnalysis(documentHash, xaiAnalysis)**
   - Add XAI analysis results to a document
   - Parameters:
     - `documentHash`: Document hash
     - `xaiAnalysis`: JSON string with XAI results
   - Emits: `XAIAnalysisAdded` event

3. **verifyDocument(documentHash, isVerified, verificationStatus, confidenceScore)**
   - Verify a document with XAI confidence score
   - Parameters:
     - `documentHash`: Document hash
     - `isVerified`: Boolean verification result
     - `verificationStatus`: Status string ("verified", "rejected", etc.)
     - `confidenceScore`: Score from 0-100
   - Emits: `DocumentVerified` event

4. **getDocument(documentHash)**
   - Retrieve complete document information
   - Returns all document fields

5. **documentExists(documentHash)**
   - Check if a document exists
   - Returns: boolean

6. **getTotalDocuments()**
   - Get total number of registered documents
   - Returns: uint256

## 🐍 XAI Module

The `xai_module/` directory contains Python modules for:

- **plagiarism_check.py**: Detects document similarity and potential plagiarism
- **embeddings.py**: Generates document embeddings for semantic analysis

### Usage Example:

```python
from xai_module.plagiarism_check import PlagiarismChecker

checker = PlagiarismChecker()
checker.add_known_document("doc1", "Sample document text")
results = checker.check_document("New document text", "new_doc")
print(results)
```

## 🔐 Security Considerations

- All document hashes are SHA-256
- Documents cannot be registered twice
- Only valid data is accepted (non-empty names, valid hashes)
- Confidence scores are bounded (0-100)
- All state changes emit events for transparency

## 📊 Testing

The test suite covers:
- Contract deployment
- Document registration
- XAI analysis addition
- Document verification
- Error handling
- Complete workflows
- Multiple document management

## 🛠 Development Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile smart contracts |
| `npm run test` | Run test suite |
| `npm run deploy` | Deploy to local network |
| `npm run node` | Start local blockchain |
| `npm run clean` | Clean build artifacts |

## 📄 Configuration

### hardhat.config.js

- **Solidity Version**: 0.8.24
- **Network**: Localhost (127.0.0.1:8545)
- **Chain ID**: 1337
- **Optimizer**: Enabled (200 runs)

### Custom Paths

```javascript
paths: {
  sources: "./contracts",
  tests: "./scripts",
  cache: "./cache",
  artifacts: "./artifacts"
}
```

## 🎯 Workflow Example

1. **Deploy the contract:**
```bash
npm run node        # Terminal 1
npm run deploy      # Terminal 2
```

2. **Get contract address from deployment-info.json**

3. **Use the contract:**
```javascript
const contractAddress = "0x..."; // From deployment-info.json
const contract = await ethers.getContractAt("DocumentRegistry", contractAddress);

// Register a document
const hash = ethers.keccak256(ethers.toUtf8Bytes("Document content"));
await contract.registerDocument(hash, "thesis.pdf");

// Add XAI analysis
const analysis = JSON.stringify({ confidence: 95 });
await contract.addXAIAnalysis(hash, analysis);

// Verify document
await contract.verifyDocument(hash, true, "verified", 95);
```

## 📚 Additional Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Solidity Documentation](https://docs.soliditylang.org/)

## 🤝 Contributing

This is a thesis project. For questions or suggestions, please contact the project maintainer.

## 📄 License

MIT License

---

**Project**: A Hybrid Framework Using Explainable AI and Blockchain for Transparent Digital Document Verification

**Status**: Development

**Last Updated**: December 2025
