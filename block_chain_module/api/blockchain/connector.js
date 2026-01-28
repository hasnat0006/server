const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class BlockchainConnector {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.contractAddress = null;
  }

  async initialize() {
    try {
      // Load deployment info
      const deploymentPath = path.join(__dirname, '..', '..', 'deployment-info.json');
      
      if (!fs.existsSync(deploymentPath)) {
        throw new Error('Deployment info not found. Please deploy the contract first using: npm run deploy');
      }

      const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      this.contractAddress = deploymentInfo.contractAddress;

      // Connect to local Hardhat network
      this.provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      
      // Get signer (first account from Hardhat)
      this.signer = await this.provider.getSigner();

      // Load contract ABI
      const artifactPath = path.join(__dirname, '..', '..', 'artifacts', 'contracts', 'DocumentRegistry.sol', 'DocumentRegistry.json');
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

      // Create contract instance
      this.contract = new ethers.Contract(
        this.contractAddress,
        artifact.abi,
        this.signer
      );

      console.log('✅ Blockchain connector initialized');
      console.log(`📍 Contract address: ${this.contractAddress}`);

      return true;
    } catch (error) {
      console.error('❌ Blockchain initialization error:', error.message);
      throw error;
    }
  }

  async getStatus() {
    if (!this.contract) {
      await this.initialize();
    }

    try {
      const totalDocs = await this.contract.getTotalDocuments();
      const network = await this.provider.getNetwork();
      const signerAddress = await this.signer.getAddress();

      return {
        connected: true,
        contractAddress: this.contractAddress,
        network: network.name,
        chainId: Number(network.chainId),
        totalDocuments: Number(totalDocs),
        signerAddress: signerAddress
      };
    } catch (error) {
      throw new Error(`Failed to get blockchain status: ${error.message}`);
    }
  }

  async registerDocument({ documentName, documentHash, xaiAnalysis, confidenceScore }) {
    if (!this.contract) {
      await this.initialize();
    }

    try {
      console.log(`📝 Registering document: ${documentName}`);
      
      // Convert hash to bytes32 if it's a hex string
      const hashBytes32 = documentHash.startsWith('0x') 
        ? documentHash 
        : '0x' + documentHash;

      // Step 1: Register document
      console.log('⏳ Sending transaction...');
      const tx1 = await this.contract.registerDocument(hashBytes32, documentName);
      const receipt1 = await tx1.wait();
      console.log(`✅ Document registered. Gas used: ${receipt1.gasUsed.toString()}`);

      // Step 2: Add XAI analysis (SUMMARY ONLY - not full details)
      // Blockchain stores only critical metadata, not full fuzzy match results
      const xaiSummary = JSON.stringify({
        status: xaiAnalysis.status || 'unknown',
        similarityScore: xaiAnalysis.plagiarismCheck?.similarityScore || 0,
        aiProbability: xaiAnalysis.aiDetection?.aiProbability || 0,
        matchCount: xaiAnalysis.plagiarismCheck?.similarSections || 0
      });
      
      const tx2 = await this.contract.addXAIAnalysis(hashBytes32, xaiSummary);
      const receipt2 = await tx2.wait();
      console.log(`✅ XAI analysis added. Gas used: ${receipt2.gasUsed.toString()}`);

      // Step 3: Verify document
      const tx3 = await this.contract.verifyDocument(
        hashBytes32,
        true,
        'verified',
        confidenceScore
      );
      const receipt3 = await tx3.wait();
      console.log(`✅ Document verified. Gas used: ${receipt3.gasUsed.toString()}`);

      return {
        success: true,
        documentHash: hashBytes32,
        transactionHash: receipt1.hash,
        blockNumber: receipt1.blockNumber,
        gasUsed: (Number(receipt1.gasUsed) + Number(receipt2.gasUsed) + Number(receipt3.gasUsed)).toString(),
        contractAddress: this.contractAddress
      };
    } catch (error) {
      console.error('❌ Registration error:', error);
      throw new Error(`Failed to register document on blockchain: ${error.message}`);
    }
  }

  async verifyDocument(documentHash) {
    if (!this.contract) {
      await this.initialize();
    }

    try {
      const hashBytes32 = documentHash.startsWith('0x') 
        ? documentHash 
        : '0x' + documentHash;

      const exists = await this.contract.documentExists(hashBytes32);
      
      if (!exists) {
        return {
          exists: false,
          message: 'Document not found on blockchain'
        };
      }

      const document = await this.contract.getDocument(hashBytes32);
      
      return {
        exists: true,
        documentHash: document[0],
        documentName: document[1],
        uploader: document[2],
        timestamp: Number(document[3]),
        isVerified: document[4],
        xaiAnalysis: document[5],
        verificationStatus: document[6],
        confidenceScore: Number(document[7])
      };
    } catch (error) {
      throw new Error(`Failed to verify document: ${error.message}`);
    }
  }

  async getDocument(documentHash) {
    return this.verifyDocument(documentHash);
  }

  async getStats() {
    if (!this.contract) {
      await this.initialize();
    }

    try {
      const totalDocs = await this.contract.getTotalDocuments();
      const total = Number(totalDocs);

      let verified = 0;
      let pending = 0;
      let rejected = 0;

      // Sample up to 100 documents for stats (to avoid gas issues)
      const sampleSize = Math.min(total, 100);
      
      for (let i = 0; i < sampleSize; i++) {
        try {
          const hash = await this.contract.getDocumentHashByIndex(i);
          const status = await this.contract.getVerificationStatus(hash);
          
          if (status.verificationStatus === 'verified') verified++;
          else if (status.verificationStatus === 'rejected') rejected++;
          else pending++;
        } catch (error) {
          console.error(`Error fetching document ${i}:`, error.message);
        }
      }

      return {
        totalDocuments: total,
        verified: verified,
        rejected: rejected,
        pending: pending,
        contractAddress: this.contractAddress
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }
}

// Create singleton instance
const blockchainConnector = new BlockchainConnector();

module.exports = blockchainConnector;
