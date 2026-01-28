// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DocumentRegistry
 * @dev Smart contract for storing and verifying digital documents with XAI analysis
 * @notice This contract is part of a thesis: "A Hybrid Framework Using Explainable AI 
 *         and Blockchain for Transparent Digital Document Verification"
 */
contract DocumentRegistry {
    
    // Structure to store document information
    struct Document {
        bytes32 documentHash;        // SHA-256 hash of the document
        string documentName;          // Name of the document
        address uploader;             // Address of the person who uploaded
        uint256 timestamp;            // When the document was registered
        bool isVerified;              // Verification status
        string xaiAnalysis;           // XAI analysis result (JSON string)
        string verificationStatus;    // Status: "pending", "verified", "rejected"
        uint256 confidenceScore;      // Confidence score from XAI (0-100)
    }
    
    // Mapping from document hash to Document struct
    mapping(bytes32 => Document) public documents;
    
    // Array to keep track of all document hashes
    bytes32[] public documentHashes;
    
    // Events
    event DocumentRegistered(
        bytes32 indexed documentHash,
        string documentName,
        address indexed uploader,
        uint256 timestamp
    );
    
    event DocumentVerified(
        bytes32 indexed documentHash,
        bool isVerified,
        string verificationStatus,
        uint256 confidenceScore,
        uint256 timestamp
    );
    
    event XAIAnalysisAdded(
        bytes32 indexed documentHash,
        string xaiAnalysis,
        uint256 timestamp
    );
    
    /**
     * @dev Register a new document on the blockchain
     * @param _documentHash SHA-256 hash of the document
     * @param _documentName Name of the document
     */
    function registerDocument(
        bytes32 _documentHash,
        string memory _documentName
    ) public {
        // Check if document already exists
        require(documents[_documentHash].timestamp == 0, "Document already registered");
        require(_documentHash != bytes32(0), "Invalid document hash");
        require(bytes(_documentName).length > 0, "Document name cannot be empty");
        
        // Create new document record
        documents[_documentHash] = Document({
            documentHash: _documentHash,
            documentName: _documentName,
            uploader: msg.sender,
            timestamp: block.timestamp,
            isVerified: false,
            xaiAnalysis: "",
            verificationStatus: "pending",
            confidenceScore: 0
        });
        
        // Add to document hashes array
        documentHashes.push(_documentHash);
        
        // Emit event
        emit DocumentRegistered(_documentHash, _documentName, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Add XAI analysis results to a document
     * @param _documentHash SHA-256 hash of the document
     * @param _xaiAnalysis JSON string containing XAI analysis results
     */
    function addXAIAnalysis(
        bytes32 _documentHash,
        string memory _xaiAnalysis
    ) public {
        // Check if document exists
        require(documents[_documentHash].timestamp != 0, "Document not found");
        require(bytes(_xaiAnalysis).length > 0, "XAI analysis cannot be empty");
        
        // Update XAI analysis
        documents[_documentHash].xaiAnalysis = _xaiAnalysis;
        
        // Emit event
        emit XAIAnalysisAdded(_documentHash, _xaiAnalysis, block.timestamp);
    }
    
    /**
     * @dev Verify a document with XAI confidence score
     * @param _documentHash SHA-256 hash of the document
     * @param _isVerified Verification result
     * @param _verificationStatus Status string ("verified", "rejected", etc.)
     * @param _confidenceScore Confidence score from XAI (0-100)
     */
    function verifyDocument(
        bytes32 _documentHash,
        bool _isVerified,
        string memory _verificationStatus,
        uint256 _confidenceScore
    ) public {
        // Check if document exists
        require(documents[_documentHash].timestamp != 0, "Document not found");
        require(_confidenceScore <= 100, "Confidence score must be between 0 and 100");
        require(bytes(_verificationStatus).length > 0, "Verification status cannot be empty");
        
        // Update verification details
        documents[_documentHash].isVerified = _isVerified;
        documents[_documentHash].verificationStatus = _verificationStatus;
        documents[_documentHash].confidenceScore = _confidenceScore;
        
        // Emit event
        emit DocumentVerified(
            _documentHash,
            _isVerified,
            _verificationStatus,
            _confidenceScore,
            block.timestamp
        );
    }
    
    /**
     * @dev Get document details by hash
     * @param _documentHash SHA-256 hash of the document
     * @return documentHash The document hash
     * @return documentName The document name
     * @return uploader The address of the uploader
     * @return timestamp Registration timestamp
     * @return isVerified Verification status
     * @return xaiAnalysis XAI analysis result
     * @return verificationStatus Verification status string
     * @return confidenceScore Confidence score from XAI
     */
    function getDocument(bytes32 _documentHash) 
        public 
        view 
        returns (
            bytes32 documentHash,
            string memory documentName,
            address uploader,
            uint256 timestamp,
            bool isVerified,
            string memory xaiAnalysis,
            string memory verificationStatus,
            uint256 confidenceScore
        ) 
    {
        require(documents[_documentHash].timestamp != 0, "Document not found");
        
        Document memory doc = documents[_documentHash];
        return (
            doc.documentHash,
            doc.documentName,
            doc.uploader,
            doc.timestamp,
            doc.isVerified,
            doc.xaiAnalysis,
            doc.verificationStatus,
            doc.confidenceScore
        );
    }
    
    /**
     * @dev Check if a document exists
     * @param _documentHash SHA-256 hash of the document
     * @return bool indicating if document exists
     */
    function documentExists(bytes32 _documentHash) public view returns (bool) {
        return documents[_documentHash].timestamp != 0;
    }
    
    /**
     * @dev Get total number of registered documents
     * @return uint256 total count of documents
     */
    function getTotalDocuments() public view returns (uint256) {
        return documentHashes.length;
    }
    
    /**
     * @dev Get document hash by index
     * @param _index Index in the documentHashes array
     * @return bytes32 document hash
     */
    function getDocumentHashByIndex(uint256 _index) public view returns (bytes32) {
        require(_index < documentHashes.length, "Index out of bounds");
        return documentHashes[_index];
    }
    
    /**
     * @dev Get verification status of a document
     * @param _documentHash SHA-256 hash of the document
     * @return isVerified Whether the document is verified
     * @return verificationStatus The verification status string
     * @return confidenceScore The confidence score from XAI
     */
    function getVerificationStatus(bytes32 _documentHash) 
        public 
        view 
        returns (
            bool isVerified,
            string memory verificationStatus,
            uint256 confidenceScore
        ) 
    {
        require(documents[_documentHash].timestamp != 0, "Document not found");
        
        Document memory doc = documents[_documentHash];
        return (doc.isVerified, doc.verificationStatus, doc.confidenceScore);
    }
}
