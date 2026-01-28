require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const blockchainConnector = require('./blockchain/connector');
// const xaiAnalyzer = require('./xai/analyzer'); // Old simulated analyzer
const xaiAnalyzer = require('./xai/real-analyzer'); // Real Python-based analyzer
const dbHandler = require('./database/handler');
const ChunkingService = require('./services/chunking-service');

const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize chunking service
let chunkingService = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed!'));
    }
  }
});

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Get blockchain status
app.get('/api/blockchain/status', async (req, res) => {
  try {
    const status = await blockchainConnector.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Blockchain status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload and analyze document
app.post('/api/document/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { originalname, filename, path: filePath, size } = req.file;
    const { documentType, uploaderName } = req.body;

    console.log(`\n📄 New document upload: ${originalname}`);
    console.log(`📦 File size: ${(size / 1024).toFixed(2)} KB`);

    // Step 1: Store initial document info in database
    const documentRecord = await dbHandler.createDocument({
      originalName: originalname,
      fileName: filename,
      filePath: filePath,
      fileSize: size,
      documentType: documentType || 'research_paper',
      uploaderName: uploaderName || 'Anonymous',
      status: 'analyzing'
    });

    console.log(`✅ Document saved to database with ID: ${documentRecord.id}`);

    // Step 2: Perform XAI Analysis (includes text extraction)
    console.log('🔍 Starting XAI analysis...');
    const xaiResults = await xaiAnalyzer.analyzeDocument(filePath, {
      documentId: documentRecord.id,
      documentType: documentType || 'research_paper',
      originalName: originalname
    });

    // Step 2.5: Create chunks from extracted text
    console.log('✂️  Creating document chunks for similarity search...');
    try {
      const documentText = xaiResults.documentText || '';
      console.log(`📝 Extracted text length: ${documentText.length} characters`);
      
      if (documentText && documentText.length > 100) {
        console.log(`✂️  Processing ${documentText.length} characters into chunks...`);
        const chunks = await chunkingService.processDocument(documentRecord.id, documentText, {
          original_name: originalname,
          document_type: documentType,
          file_hash: xaiResults.documentHash
        });
        console.log(`✅ Created ${chunks.length} chunks in database`);
        
        // Enhance plagiarism results with chunk-based matching
        if (documentText.length > 500) {
          console.log('🔍 Running chunk-based similarity search...');
          const chunkMatches = await chunkingService.findSimilarChunks(documentText, documentRecord.id, 0.4);
          
          if (chunkMatches.length > 0) {
            const aggregated = chunkingService.aggregateMatchesByDocument(chunkMatches);
            console.log(`📊 Found ${aggregated.length} documents with similar content`);
            
            // Add to XAI results
            xaiResults.chunkBasedMatches = aggregated.slice(0, 5); // Top 5 matches
            
            // Update plagiarism score if chunk matches found
            if (aggregated.length > 0 && aggregated[0].average_similarity > 0.5) {
              xaiResults.plagiarismCheck.similarityScore = Math.max(
                xaiResults.plagiarismCheck.similarityScore,
                aggregated[0].average_similarity * 100
              );
              xaiResults.plagiarismCheck.chunkMatches = aggregated.slice(0, 3);
            }
          }
        }
      } else {
        console.warn('⚠️  No text extracted or text too short, skipping chunking');
      }
    } catch (chunkError) {
      console.error('❌ Chunking error:', chunkError);
      console.error('Stack:', chunkError.stack);
    }

    console.log(`📊 XAI Analysis complete: ${xaiResults.status}`);

    // Step 3: If passed, register on blockchain
    let blockchainData = null;
    if (xaiResults.status === 'verified') {
      console.log('⛓️  Registering on blockchain...');
      blockchainData = await blockchainConnector.registerDocument({
        documentName: originalname,
        documentHash: xaiResults.documentHash,
        xaiAnalysis: JSON.stringify(xaiResults),
        confidenceScore: xaiResults.confidenceScore
      });
      
      console.log(`✅ Blockchain registration successful!`);
      console.log(`📍 Transaction hash: ${blockchainData.transactionHash}`);
    }

    // Step 4: Update database with results (JSON + PostgreSQL)
    await dbHandler.updateDocument(documentRecord.id, {
      status: xaiResults.status,
      xaiResults: xaiResults,
      blockchainData: blockchainData,
      documentHash: xaiResults.documentHash
    });

    // Return response
    res.json({
      success: true,
      data: {
        documentId: documentRecord.id,
        originalName: originalname,
        status: xaiResults.status,
        xaiAnalysis: xaiResults,
        blockchain: blockchainData,
        message: xaiResults.status === 'verified' 
          ? 'Document verified and registered on blockchain!' 
          : 'Document analysis complete but not verified.'
      }
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get document details
app.get('/api/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await dbHandler.getDocument(id);
    
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    res.json({ success: true, data: document });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify document on blockchain
app.get('/api/blockchain/verify/:documentHash', async (req, res) => {
  try {
    const { documentHash } = req.params;
    const verification = await blockchainConnector.verifyDocument(documentHash);
    
    res.json({ success: true, data: verification });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all documents
app.get('/api/documents', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const documents = await dbHandler.getDocuments({ status, limit, offset });
    
    res.json({ success: true, data: documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get blockchain statistics
app.get('/api/blockchain/stats', async (req, res) => {
  try {
    const stats = await blockchainConnector.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database
    console.log('📦 Initializing database...');
    await dbHandler.initialize();
    
    // Initialize chunking service
    console.log('✂️  Initializing chunking service...');
    chunkingService = new ChunkingService(dbHandler);
    console.log('✅ Chunking service ready');
    
    // Check blockchain connection
    console.log('⛓️  Checking blockchain connection...');
    const blockchainStatus = await blockchainConnector.getStatus();
    console.log(`✅ Connected to blockchain at ${blockchainStatus.contractAddress}`);
    
    // Start server
    app.listen(PORT, () => {
      console.log('\n========================================');
      console.log('🚀 Server started successfully!');
      console.log('========================================');
      console.log(`📡 API Server: http://localhost:${PORT}`);
      console.log(`🌐 Web Interface: http://localhost:${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api/health`);
      console.log('========================================\n');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
