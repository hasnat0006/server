const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DocumentVerification Contract", function () {
  let documentVerification;
  let owner;
  let addr1;
  let addr2;
  
  // Sample document data
  const documentHash = ethers.keccak256(ethers.toUtf8Bytes("Sample Document Content"));
  const documentName = "thesis_document.pdf";
  const xaiAnalysis = JSON.stringify({
    features: ["feature1", "feature2"],
    confidence: 85,
    analysis: "Document appears authentic"
  });
  
  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy contract before each test
    const DocumentVerification = await ethers.getContractFactory("DocumentVerification");
    documentVerification = await DocumentVerification.deploy();
    await documentVerification.waitForDeployment();
  });
  
  describe("Document Registration", function () {
    it("Should register a new document successfully", async function () {
      const tx = await documentRegistry.registerDocument(documentHash, documentName);
      const receipt = await tx.wait();
      
      // Verify document exists
      expect(await documentRegistry.documentExists(documentHash)).to.be.true;
      
      // Verify event was emitted
      expect(tx).to.emit(documentRegistry, "DocumentRegistered");
    });
    
    it("Should not allow duplicate document registration", async function () {
      await documentRegistry.registerDocument(documentHash, documentName);
      
      await expect(
        documentRegistry.registerDocument(documentHash, documentName)
      ).to.be.revertedWith("Document already registered");
    });
    
    it("Should not allow empty document name", async function () {
      await expect(
        documentRegistry.registerDocument(documentHash, "")
      ).to.be.revertedWith("Document name cannot be empty");
    });
    
    it("Should not allow zero hash", async function () {
      await expect(
        documentRegistry.registerDocument(ethers.ZeroHash, documentName)
      ).to.be.revertedWith("Invalid document hash");
    });
    
    it("Should increment total documents count", async function () {
      expect(await documentRegistry.getTotalDocuments()).to.equal(0);
      
      await documentRegistry.registerDocument(documentHash, documentName);
      expect(await documentRegistry.getTotalDocuments()).to.equal(1);
      
      const documentHash2 = ethers.keccak256(ethers.toUtf8Bytes("Another Document"));
      await documentRegistry.registerDocument(documentHash2, "document2.pdf");
      expect(await documentRegistry.getTotalDocuments()).to.equal(2);
    });
  });
  
  describe("XAI Analysis", function () {
    beforeEach(async function () {
      // Register a document first
      await documentRegistry.registerDocument(documentHash, documentName);
    });
    
    it("Should add XAI analysis successfully", async function () {
      const tx = await documentRegistry.addXAIAnalysis(documentHash, xaiAnalysis);
      await tx.wait();
      
      const doc = await documentRegistry.getDocument(documentHash);
      expect(doc.xaiAnalysis).to.equal(xaiAnalysis);
      
      // Verify event was emitted
      expect(tx).to.emit(documentRegistry, "XAIAnalysisAdded");
    });
    
    it("Should not allow empty XAI analysis", async function () {
      await expect(
        documentRegistry.addXAIAnalysis(documentHash, "")
      ).to.be.revertedWith("XAI analysis cannot be empty");
    });
    
    it("Should not add XAI analysis to non-existent document", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Document"));
      
      await expect(
        documentRegistry.addXAIAnalysis(fakeHash, xaiAnalysis)
      ).to.be.revertedWith("Document not found");
    });
  });
  
  describe("Document Verification", function () {
    beforeEach(async function () {
      // Register a document first
      await documentRegistry.registerDocument(documentHash, documentName);
    });
    
    it("Should verify document successfully", async function () {
      const isVerified = true;
      const status = "verified";
      const confidence = 85;
      
      const tx = await documentRegistry.verifyDocument(documentHash, isVerified, status, confidence);
      await tx.wait();
      
      const verificationStatus = await documentRegistry.getVerificationStatus(documentHash);
      expect(verificationStatus.isVerified).to.be.true;
      expect(verificationStatus.verificationStatus).to.equal(status);
      expect(verificationStatus.confidenceScore).to.equal(confidence);
      
      // Verify event was emitted
      expect(tx).to.emit(documentRegistry, "DocumentVerified");
    });
    
    it("Should not allow confidence score > 100", async function () {
      await expect(
        documentRegistry.verifyDocument(documentHash, true, "verified", 101)
      ).to.be.revertedWith("Confidence score must be between 0 and 100");
    });
    
    it("Should not allow empty verification status", async function () {
      await expect(
        documentRegistry.verifyDocument(documentHash, true, "", 85)
      ).to.be.revertedWith("Verification status cannot be empty");
    });
    
    it("Should not verify non-existent document", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Document"));
      
      await expect(
        documentRegistry.verifyDocument(fakeHash, true, "verified", 85)
      ).to.be.revertedWith("Document not found");
    });
  });
  
  describe("Document Retrieval", function () {
    beforeEach(async function () {
      // Register and verify a document
      await documentRegistry.registerDocument(documentHash, documentName);
      await documentRegistry.addXAIAnalysis(documentHash, xaiAnalysis);
      await documentRegistry.verifyDocument(documentHash, true, "verified", 85);
    });
    
    it("Should retrieve complete document details", async function () {
      const doc = await documentRegistry.getDocument(documentHash);
      
      expect(doc.documentHash).to.equal(documentHash);
      expect(doc.documentName).to.equal(documentName);
      expect(doc.uploader).to.equal(owner.address);
      expect(doc.isVerified).to.be.true;
      expect(doc.xaiAnalysis).to.equal(xaiAnalysis);
      expect(doc.verificationStatus).to.equal("verified");
      expect(doc.confidenceScore).to.equal(85);
    });
    
    it("Should get document hash by index", async function () {
      const hash = await documentRegistry.getDocumentHashByIndex(0);
      expect(hash).to.equal(documentHash);
    });
    
    it("Should revert when index out of bounds", async function () {
      await expect(
        documentRegistry.getDocumentHashByIndex(999)
      ).to.be.revertedWith("Index out of bounds");
    });
    
    it("Should check document existence correctly", async function () {
      expect(await documentRegistry.documentExists(documentHash)).to.be.true;
      
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake"));
      expect(await documentRegistry.documentExists(fakeHash)).to.be.false;
    });
  });
  
  describe("Complete Workflow", function () {
    it("Should handle complete document lifecycle", async function () {
      // 1. Register document
      await documentRegistry.registerDocument(documentHash, documentName);
      expect(await documentRegistry.documentExists(documentHash)).to.be.true;
      
      // 2. Add XAI analysis
      await documentRegistry.addXAIAnalysis(documentHash, xaiAnalysis);
      let doc = await documentRegistry.getDocument(documentHash);
      expect(doc.xaiAnalysis).to.equal(xaiAnalysis);
      
      // 3. Verify document
      await documentRegistry.verifyDocument(documentHash, true, "verified", 90);
      doc = await documentRegistry.getDocument(documentHash);
      expect(doc.isVerified).to.be.true;
      expect(doc.confidenceScore).to.equal(90);
      
      // 4. Check final state
      const status = await documentRegistry.getVerificationStatus(documentHash);
      expect(status.isVerified).to.be.true;
      expect(status.verificationStatus).to.equal("verified");
      expect(status.confidenceScore).to.equal(90);
    });
  });
  
  // Helper function to get current block timestamp
  async function getCurrentTimestamp() {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    return block.timestamp;
  }
});
