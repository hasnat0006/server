const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DocumentRegistry Contract", function () {
  let documentRegistry;
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
    const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
    documentRegistry = await DocumentRegistry.deploy();
    await documentRegistry.waitForDeployment();
  });
  
  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await documentRegistry.getAddress()).to.be.properAddress;
    });
    
    it("Should start with zero documents", async function () {
      expect(await documentRegistry.getTotalDocuments()).to.equal(0);
    });
  });
  
  describe("Document Registration", function () {
    it("Should register a new document successfully", async function () {
      await expect(documentRegistry.registerDocument(documentHash, documentName))
        .to.emit(documentRegistry, "DocumentRegistered")
        .withArgs(documentHash, documentName, owner.address, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));
      
      expect(await documentRegistry.getTotalDocuments()).to.equal(1);
      expect(await documentRegistry.documentExists(documentHash)).to.be.true;
    });
    
    it("Should not allow registering the same document twice", async function () {
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
      const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
      await expect(
        documentRegistry.registerDocument(zeroHash, documentName)
      ).to.be.revertedWith("Invalid document hash");
    });
    
    it("Should store correct document information", async function () {
      await documentRegistry.registerDocument(documentHash, documentName);
      
      const doc = await documentRegistry.getDocument(documentHash);
      expect(doc.documentHash).to.equal(documentHash);
      expect(doc.documentName).to.equal(documentName);
      expect(doc.uploader).to.equal(owner.address);
      expect(doc.isVerified).to.be.false;
      expect(doc.verificationStatus).to.equal("pending");
      expect(doc.confidenceScore).to.equal(0);
    });
  });
  
  describe("XAI Analysis", function () {
    beforeEach(async function () {
      await documentRegistry.registerDocument(documentHash, documentName);
    });
    
    it("Should add XAI analysis to a document", async function () {
      await expect(documentRegistry.addXAIAnalysis(documentHash, xaiAnalysis))
        .to.emit(documentRegistry, "XAIAnalysisAdded")
        .withArgs(documentHash, xaiAnalysis, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));
      
      const doc = await documentRegistry.getDocument(documentHash);
      expect(doc.xaiAnalysis).to.equal(xaiAnalysis);
    });
    
    it("Should not allow adding analysis to non-existent document", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Document"));
      
      await expect(
        documentRegistry.addXAIAnalysis(fakeHash, xaiAnalysis)
      ).to.be.revertedWith("Document not found");
    });
    
    it("Should not allow empty XAI analysis", async function () {
      await expect(
        documentRegistry.addXAIAnalysis(documentHash, "")
      ).to.be.revertedWith("XAI analysis cannot be empty");
    });
  });
  
  describe("Document Verification", function () {
    beforeEach(async function () {
      await documentRegistry.registerDocument(documentHash, documentName);
    });
    
    it("Should verify a document successfully", async function () {
      const isVerified = true;
      const status = "verified";
      const confidence = 95;
      
      await expect(
        documentRegistry.verifyDocument(documentHash, isVerified, status, confidence)
      ).to.emit(documentRegistry, "DocumentVerified")
        .withArgs(documentHash, isVerified, status, confidence, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));
      
      const verificationStatus = await documentRegistry.getVerificationStatus(documentHash);
      expect(verificationStatus.isVerified).to.be.true;
      expect(verificationStatus.verificationStatus).to.equal(status);
      expect(verificationStatus.confidenceScore).to.equal(confidence);
    });
    
    it("Should reject a document", async function () {
      const isVerified = false;
      const status = "rejected";
      const confidence = 30;
      
      await documentRegistry.verifyDocument(documentHash, isVerified, status, confidence);
      
      const doc = await documentRegistry.getDocument(documentHash);
      expect(doc.isVerified).to.be.false;
      expect(doc.verificationStatus).to.equal(status);
      expect(doc.confidenceScore).to.equal(confidence);
    });
    
    it("Should not allow verification of non-existent document", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Document"));
      
      await expect(
        documentRegistry.verifyDocument(fakeHash, true, "verified", 95)
      ).to.be.revertedWith("Document not found");
    });
    
    it("Should not allow confidence score above 100", async function () {
      await expect(
        documentRegistry.verifyDocument(documentHash, true, "verified", 101)
      ).to.be.revertedWith("Confidence score must be between 0 and 100");
    });
    
    it("Should not allow empty verification status", async function () {
      await expect(
        documentRegistry.verifyDocument(documentHash, true, "", 95)
      ).to.be.revertedWith("Verification status cannot be empty");
    });
  });
  
  describe("Document Retrieval", function () {
    it("Should get document by hash", async function () {
      await documentRegistry.registerDocument(documentHash, documentName);
      
      const doc = await documentRegistry.getDocument(documentHash);
      expect(doc.documentHash).to.equal(documentHash);
      expect(doc.documentName).to.equal(documentName);
    });
    
    it("Should fail to get non-existent document", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Document"));
      
      await expect(
        documentRegistry.getDocument(fakeHash)
      ).to.be.revertedWith("Document not found");
    });
    
    it("Should get total documents count", async function () {
      expect(await documentRegistry.getTotalDocuments()).to.equal(0);
      
      await documentRegistry.registerDocument(documentHash, documentName);
      expect(await documentRegistry.getTotalDocuments()).to.equal(1);
      
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("Document 2"));
      await documentRegistry.registerDocument(hash2, "document2.pdf");
      expect(await documentRegistry.getTotalDocuments()).to.equal(2);
    });
    
    it("Should get document hash by index", async function () {
      await documentRegistry.registerDocument(documentHash, documentName);
      
      const retrievedHash = await documentRegistry.getDocumentHashByIndex(0);
      expect(retrievedHash).to.equal(documentHash);
    });
    
    it("Should fail to get document hash with invalid index", async function () {
      await expect(
        documentRegistry.getDocumentHashByIndex(0)
      ).to.be.revertedWith("Index out of bounds");
    });
    
    it("Should check if document exists", async function () {
      expect(await documentRegistry.documentExists(documentHash)).to.be.false;
      
      await documentRegistry.registerDocument(documentHash, documentName);
      expect(await documentRegistry.documentExists(documentHash)).to.be.true;
    });
  });
  
  describe("Complete Workflow", function () {
    it("Should complete a full document verification workflow", async function () {
      // Step 1: Register document
      await documentRegistry.registerDocument(documentHash, documentName);
      expect(await documentRegistry.documentExists(documentHash)).to.be.true;
      
      // Step 2: Add XAI analysis
      await documentRegistry.addXAIAnalysis(documentHash, xaiAnalysis);
      let doc = await documentRegistry.getDocument(documentHash);
      expect(doc.xaiAnalysis).to.equal(xaiAnalysis);
      
      // Step 3: Verify document
      await documentRegistry.verifyDocument(documentHash, true, "verified", 95);
      doc = await documentRegistry.getDocument(documentHash);
      expect(doc.isVerified).to.be.true;
      expect(doc.verificationStatus).to.equal("verified");
      expect(doc.confidenceScore).to.equal(95);
    });
  });
  
  describe("Multiple Documents", function () {
    it("Should handle multiple documents correctly", async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("Document 1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("Document 2"));
      const hash3 = ethers.keccak256(ethers.toUtf8Bytes("Document 3"));
      
      await documentRegistry.registerDocument(hash1, "doc1.pdf");
      await documentRegistry.registerDocument(hash2, "doc2.pdf");
      await documentRegistry.registerDocument(hash3, "doc3.pdf");
      
      expect(await documentRegistry.getTotalDocuments()).to.equal(3);
      
      // Verify each document exists
      expect(await documentRegistry.documentExists(hash1)).to.be.true;
      expect(await documentRegistry.documentExists(hash2)).to.be.true;
      expect(await documentRegistry.documentExists(hash3)).to.be.true;
      
      // Check retrieval by index
      expect(await documentRegistry.getDocumentHashByIndex(0)).to.equal(hash1);
      expect(await documentRegistry.getDocumentHashByIndex(1)).to.equal(hash2);
      expect(await documentRegistry.getDocumentHashByIndex(2)).to.equal(hash3);
    });
  });
});
