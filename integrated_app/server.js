require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import blockchain module components
const blockchainConnector = require('../block_chain_module/api/blockchain/connector');
const xaiAnalyzer = require('../block_chain_module/api/xai/real-analyzer');
const dbHandler = require('../block_chain_module/api/database/handler');
const ChunkingService = require('../block_chain_module/api/services/chunking-service');
const DocumentParser = require('./utils/document-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize chunking service
let chunkingService = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use original filename, sanitize for safety
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, sanitized);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Support wide range of document formats
    const allowedTypes = /pdf|doc|docx|txt|rtf|odt|ppt|pptx|xls|xlsx|csv|html|htm|md|tex/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Allow various MIME types
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'text/plain',
      'text/csv',
      'text/html',
      'text/markdown',
      'application/x-tex'
    ];
    
    const mimetypeAllowed = allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('text/');
    
    if (mimetypeAllowed || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Please upload document files (PDF, DOCX, TXT, RTF, ODT, PPT, XLS, etc.)'));
    }
  }
});

const smallDocUpload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for small docs
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|png|jpg|jpeg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp'
    ];

    const mimetypeAllowed = allowedMimeTypes.includes(file.mimetype);

    if (mimetypeAllowed || extname) {
      return cb(null, true);
    }

    cb(new Error('Unsupported small-document format. Use PDF/PNG/JPG/WEBP files.'));
  }
});

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve('0x' + hash.digest('hex')));
    stream.on('error', reject);
  });
}

function normalizeMetadata(metadata = {}) {
  const normalized = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const stringValue = String(value).trim();
    if (stringValue) {
      normalized[key] = stringValue;
    }
  });
  return normalized;
}

function buildMetadataFingerprint(metadata = {}) {
  const normalized = normalizeMetadata(metadata);
  const sortedKeys = Object.keys(normalized).sort();
  const stableObject = sortedKeys.reduce((acc, key) => {
    acc[key] = normalized[key].toLowerCase();
    return acc;
  }, {});
  return crypto.createHash('sha256').update(JSON.stringify(stableObject)).digest('hex');
}

function metadataTextConsistency(text, metadata = {}) {
  const normalizedText = (text || '').toLowerCase();
  const normalizedMetadata = normalizeMetadata(metadata);
  const keys = Object.keys(normalizedMetadata);

  if (keys.length === 0) {
    return { score: 100, missingFields: [], checkedFields: [] };
  }

  const checkedFields = [];
  const missingFields = [];

  keys.forEach((key) => {
    const value = normalizedMetadata[key].toLowerCase();
    const compactValue = value.replace(/\s+/g, ' ').trim();
    const found = compactValue && normalizedText.includes(compactValue);

    checkedFields.push({ key, value: normalizedMetadata[key], found });
    if (!found) {
      missingFields.push(key);
    }
  });

  const score = Math.max(0, Math.round(((keys.length - missingFields.length) / keys.length) * 100));
  return { score, missingFields, checkedFields };
}

function inferRiskLevel(riskScore) {
  if (riskScore >= 70) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
}

function parseMetadataFromBody(req) {
  const metadataRaw = req.body.metadata;
  if (!metadataRaw) return {};

  if (typeof metadataRaw === 'object') {
    return normalizeMetadata(metadataRaw);
  }

  try {
    return normalizeMetadata(JSON.parse(metadataRaw));
  } catch (error) {
    throw new Error('Invalid metadata payload. Send metadata as valid JSON.');
  }
}

async function runSmallDocumentForgeryAnalysis({ filePath, docType, metadata }) {
  let extractedText = '';
  try {
    extractedText = await DocumentParser.parseDocument(filePath);
  } catch (error) {
    console.warn('Small doc text extraction warning:', error.message);
  }

  const consistency = metadataTextConsistency(extractedText, metadata);
  const metadataMismatchRisk = 100 - consistency.score;

  let certificateForgery = null;
  if (docType === 'certificate') {
    try {
      certificateForgery = await xaiAnalyzer.runCertificateForgeryCheck(filePath, extractedText);
    } catch (error) {
      console.warn('Certificate forgery checker unavailable:', error.message);
    }
  }

  let riskScore = metadataMismatchRisk;
  const signals = [
    {
      type: 'metadata_consistency',
      score: consistency.score,
      riskContribution: metadataMismatchRisk,
      explanation: consistency.missingFields.length
        ? `Fields not detected in document text: ${consistency.missingFields.join(', ')}`
        : 'All provided metadata fields were detected in extracted text.'
    }
  ];

  if (certificateForgery) {
    const certRisk = certificateForgery.isForged ? 80 : 10;
    riskScore = Math.round((riskScore * 0.55) + (certRisk * 0.45));
    signals.push({
      type: 'certificate_forgery_model',
      score: certificateForgery.isForged ? 100 : 0,
      riskContribution: certRisk,
      explanation: certificateForgery.explanation || 'Certificate forgery model result included.'
    });
  }

  return {
    extractedTextLength: extractedText.length,
    metadataConsistency: consistency,
    certificateForgery,
    forgeryRiskScore: riskScore,
    forgeryRiskLevel: inferRiskLevel(riskScore),
    isLikelyForged: riskScore >= 70,
    signals
  };
}

// Initialize services
async function initializeServices() {
  try {
    console.log('🚀 Initializing services...');
    
    // Initialize database handler first
    await dbHandler.initialize();
    console.log('💾 Database handler initialized');
    
    // Initialize chunking service with dbHandler
    chunkingService = new ChunkingService(dbHandler);
    console.log('✅ Chunking service initialized');
    
    // Test blockchain connection
    const blockchainStatus = await blockchainConnector.getStatus();
    console.log('⛓️  Blockchain status:', blockchainStatus.connected ? 'Connected' : 'Disconnected');
    
    console.log('✨ All services initialized successfully!');
  } catch (error) {
    console.error('❌ Service initialization error:', error);
    console.log('⚠️  Server will continue but some features may not work');
  }
}

// Routes

// Root route - serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Integrated server is running',
    services: {
      blockchain: true,
      xai: true,
      database: true
    }
  });
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

app.post('/api/small-documents/issue', smallDocUpload.single('document'), async (req, res) => {
  let uploadedPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No small document uploaded' });
    }

    uploadedPath = req.file.path;
    const metadata = parseMetadataFromBody(req);
    const docType = (req.body.docType || 'certificate').toLowerCase();
    const issuerName = req.body.issuerName || 'Unknown Issuer';
    const fileHash = await calculateFileHash(uploadedPath);
    const metadataFingerprint = buildMetadataFingerprint(metadata);

    const existingIssuedDoc = await dbHandler.findSmallDocumentByHash(fileHash);
    if (existingIssuedDoc) {
      const existingIssuedId = existingIssuedDoc.issued_document_id || existingIssuedDoc.issuedDocumentId;
      const existingIssuer = existingIssuedDoc.issuer_name || existingIssuedDoc.issuerName || 'Unknown Issuer';
      const existingIssuedAt = existingIssuedDoc.issued_at || existingIssuedDoc.issuedAt;

      return res.status(409).json({
        success: false,
        error: 'Duplicate small document detected',
        message: 'This document hash already exists in the persistent database.',
        existingRecord: {
          issuedDocumentId: existingIssuedId,
          issuerName: existingIssuer,
          issuedAt: existingIssuedAt,
          fileHash
        }
      });
    }

    const analysis = await runSmallDocumentForgeryAnalysis({
      filePath: uploadedPath,
      docType,
      metadata
    });

    if (analysis.isLikelyForged) {
      return res.status(400).json({
        success: false,
        error: 'Issuance blocked: possible forgery detected before blockchain anchoring',
        data: {
          docType,
          metadata,
          analysis
        }
      });
    }

    const issuedDocumentId = `SD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const blockchainData = await blockchainConnector.registerDocument({
      documentName: `${docType.toUpperCase()}-${issuedDocumentId}`,
      documentHash: fileHash,
      xaiAnalysis: JSON.stringify({
        flow: 'small_document_issuance',
        docType,
        issuerName,
        metadataFingerprint,
        forgeryRiskScore: analysis.forgeryRiskScore,
        metadataConsistency: analysis.metadataConsistency.score
      }),
      confidenceScore: Math.max(0, 100 - analysis.forgeryRiskScore)
    });

    const issuedAt = new Date().toISOString();
    const qrPayload = {
      issuedDocumentId,
      docType,
      fileHash,
      metadataFingerprint,
      contractAddress: blockchainData.contractAddress,
      txHash: blockchainData.transactionHash,
      issuedAt
    };

    const newRecord = {
      issuedDocumentId,
      docType,
      issuerName,
      originalName: req.file.originalname,
      fileHash,
      metadata,
      metadataFingerprint,
      blockchain: blockchainData,
      analysis,
      issuedAt
    };

    await dbHandler.createSmallDocument(newRecord);

    res.json({
      success: true,
      data: {
        issuedDocumentId,
        issuerName,
        docType,
        fileHash,
        metadata,
        metadataFingerprint,
        analysis,
        blockchain: blockchainData,
        qrPayload,
        qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(JSON.stringify(qrPayload))}`,
        message: 'Small document issued and anchored on blockchain successfully.'
      }
    });
  } catch (error) {
    console.error('Small document issuance error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }
});

app.post('/api/small-documents/verify', smallDocUpload.single('document'), async (req, res) => {
  let uploadedPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No small document uploaded' });
    }

    uploadedPath = req.file.path;
    const metadata = parseMetadataFromBody(req);
    const docType = (req.body.docType || 'certificate').toLowerCase();
    const expectedDocumentId = req.body.issuedDocumentId || null;
    const fileHash = await calculateFileHash(uploadedPath);
    const metadataFingerprint = buildMetadataFingerprint(metadata);

    let matchedRecord = null;

    if (expectedDocumentId) {
      matchedRecord = await dbHandler.findSmallDocumentByIssuedId(expectedDocumentId);
    }

    if (!matchedRecord) {
      matchedRecord = await dbHandler.findSmallDocumentByHash(fileHash);
    }

    const matchedRecordMetadata = matchedRecord?.metadata
      ? (typeof matchedRecord.metadata === 'string' ? JSON.parse(matchedRecord.metadata) : matchedRecord.metadata)
      : {};

    const matchedRecordIssuedId = matchedRecord?.issued_document_id || matchedRecord?.issuedDocumentId || null;
    const matchedRecordFileHash = matchedRecord?.file_hash || matchedRecord?.fileHash || null;
    const matchedRecordFingerprint = matchedRecord?.metadata_fingerprint || matchedRecord?.metadataFingerprint || null;
    const matchedRecordIssuer = matchedRecord?.issuer_name || matchedRecord?.issuerName || null;
    const matchedRecordDocType = matchedRecord?.doc_type || matchedRecord?.docType || null;
    const matchedRecordIssuedAt = matchedRecord?.issued_at || matchedRecord?.issuedAt || null;

    const blockchainVerification = await blockchainConnector.verifyDocument(fileHash);

    const analysis = await runSmallDocumentForgeryAnalysis({
      filePath: uploadedPath,
      docType,
      metadata
    });

    const metadataMatchWithIssued = matchedRecord
      ? (matchedRecordFingerprint === metadataFingerprint)
      : false;

    const blockchainAuthentic = Boolean(blockchainVerification.exists && blockchainVerification.isVerified);
    const isAuthentic = blockchainAuthentic && !analysis.isLikelyForged && (matchedRecord ? metadataMatchWithIssued : true);

    res.json({
      success: true,
      data: {
        verdict: isAuthentic ? 'authentic' : 'suspicious',
        isAuthentic,
        checks: {
          blockchainAuthentic,
          hashMatchedIssuedRecord: Boolean(matchedRecord && matchedRecordFileHash === fileHash),
          metadataMatchedIssuedRecord: metadataMatchWithIssued,
          forgeryRiskLevel: analysis.forgeryRiskLevel,
          forgeryRiskScore: analysis.forgeryRiskScore
        },
        uploaded: {
          originalName: req.file.originalname,
          fileHash,
          metadata,
          metadataFingerprint,
          docType
        },
        issuedRecord: matchedRecord
          ? {
              issuedDocumentId: matchedRecordIssuedId,
              issuerName: matchedRecordIssuer,
              docType: matchedRecordDocType,
              issuedAt: matchedRecordIssuedAt,
              metadata: matchedRecordMetadata,
              metadataFingerprint: matchedRecordFingerprint
            }
          : null,
        blockchain: blockchainVerification,
        analysis,
        message: isAuthentic
          ? 'Document is authentic: blockchain and forgery checks passed.'
          : 'Document is suspicious: one or more authenticity checks failed.'
      }
    });
  } catch (error) {
    console.error('Small document verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }
});

// Upload and analyze document (Main endpoint combining blockchain + XAI)
app.post('/api/document/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { originalname, filename, path: filePath, size } = req.file;
    const { documentType, uploaderName } = req.body;

    console.log(`\n📄 New document upload: ${originalname}`);
    console.log(`📦 File size: ${(size / 1024).toFixed(2)} KB`);

    // Step 1: Quick analysis for duplicate detection (before database save)
    console.log('🔍 Performing initial analysis...');
    const xaiResults = await xaiAnalyzer.analyzeDocument(filePath, {
      documentId: null, // No ID yet
      documentType: documentType || 'research_paper',
      originalName: originalname
    });

    // Step 1.5: Check for exact duplicate by hash
    const existingDocByHash = await dbHandler.getDocumentByHash(xaiResults.documentHash);
    if (existingDocByHash) {
      // Delete uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: 'Duplicate file detected',
        message: 'This exact document already exists in the database. Upload rejected.',
        duplicateDocument: {
          id: existingDocByHash.id,
          name: existingDocByHash.originalName || existingDocByHash.metadata?.original_name,
          uploadedAt: existingDocByHash.uploadedAt || existingDocByHash.uploaded_at
        }
      });
    }

    // Step 1.6: Check exact duplicate on blockchain as an additional guard
    try {
      const chainVerification = await blockchainConnector.verifyDocument(xaiResults.documentHash);
      if (chainVerification?.exists) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          success: false,
          error: 'Duplicate file detected',
          message: 'This exact document hash is already anchored on blockchain. Upload rejected.',
          duplicateDocument: {
            id: 'on-chain',
            name: chainVerification.documentName || originalname,
            uploadedAt: chainVerification.timestamp
              ? new Date(chainVerification.timestamp * 1000).toISOString()
              : new Date().toISOString()
          }
        });
      }
    } catch (chainCheckError) {
      console.warn('⚠️  Blockchain duplicate pre-check unavailable:', chainCheckError.message);
    }

    // Step 2: DATABASE-BASED PLAGIARISM DETECTION WITH FUZZY MATCHING
    console.log('✂️  Starting database-based fuzzy plagiarism detection...');
    let maxSimilarity = 0;
    let fuzzyMatches = [];
    let similarDocuments = [];
    let totalSections = 0;
    let matchedSectionCount = 0;
    const CHUNK_MATCH_THRESHOLD = 0.25;
    let sectionBestSimilarities = [];
    
    try {
      const documentText = xaiResults.documentText || '';
      console.log(`📝 Extracted text length: ${documentText.length} characters`);
      
      if (documentText && documentText.length > 50 && chunkingService) {
        // Split current document into chunks for comparison
        const currentChunks = chunkingService.splitIntoChunks(documentText);
        totalSections = currentChunks.length;
        console.log(`✂️  Split document into ${currentChunks.length} sections`);
        
        // Compare each chunk against database
        console.log('🔍 Performing fuzzy matching against stored documents...');
        const allMatches = [];
        const matchedSections = new Set();
        
        for (const chunk of currentChunks) {
          const matches = await chunkingService.findSimilarChunks(chunk.content, null, CHUNK_MATCH_THRESHOLD);
          const bestSimilarity = matches.reduce((max, match) => Math.max(max, match.similarity || 0), 0);

          sectionBestSimilarities.push({
            section: chunk.index + 1,
            bestSimilarityRaw: bestSimilarity,
            bestSimilarityPct: Number((bestSimilarity * 100).toFixed(2))
          });

          if (bestSimilarity > CHUNK_MATCH_THRESHOLD) {
            matchedSections.add(chunk.index);
          }
          
          matches.forEach(match => {
            if (match.similarity > CHUNK_MATCH_THRESHOLD) {
              allMatches.push({
                yourSection: chunk.index + 1,
                yourText: chunk.content,
                matchedSection: match.matched_chunk?.chunk_index || 0,
                matchedText: match.matched_chunk?.content || match.matched_chunk,
                matchedDocument: match.source_document,
                matchedDocumentId: match.document_id,
                similarity: match.similarity,
                explanation: match.similarity > 0.6 
                  ? 'These sections have high similarity, indicating significant overlap in content.'
                  : match.similarity > 0.4
                  ? 'These sections have moderate similarity, sharing some common phrases or concepts.'
                  : 'These sections have low similarity, with minor commonalities.'
              });
            }
          });
        }

        matchedSectionCount = matchedSections.size;
        
        console.log(`📊 Found ${allMatches.length} section matches`);
        
        if (allMatches.length > 0) {
          // Group by document
          const docGroups = {};
          allMatches.forEach(match => {
            const docId = match.matchedDocumentId;
            if (!docGroups[docId]) {
              docGroups[docId] = {
                document_id: docId,
                document_name: match.matchedDocument,
                matches: [],
                total_similarity: 0,
                section_count: 0
              };
            }
            docGroups[docId].matches.push(match);
            docGroups[docId].total_similarity += match.similarity;
            docGroups[docId].section_count++;
          });
          
          // Calculate average similarity per document
          similarDocuments = Object.values(docGroups).map(doc => ({
            ...doc,
            average_similarity: doc.total_similarity / doc.section_count,
            original_name: doc.document_name
          })).sort((a, b) => b.average_similarity - a.average_similarity);
          
          maxSimilarity = similarDocuments[0]?.average_similarity || 0;
          fuzzyMatches = allMatches.sort((a, b) => b.similarity - a.similarity);
          
          console.log(`✅ Fuzzy matching complete: ${(maxSimilarity * 100).toFixed(1)}% max similarity`);
          console.log(`📄 Found ${fuzzyMatches.length} similar sections across ${similarDocuments.length} documents`);
        } else {
          console.log('✅ No similar documents found in database - appears original');
        }
      } else {
        console.log('⚠️  Database comparison skipped (PostgreSQL not configured or text too short)');
      }
    } catch (chunkError) {
      console.log('⚠️  Database comparison unavailable, using fallback detection');
      console.error('Error:', chunkError.message);
    }

    // Step 2.5: CHECK MATCH THRESHOLD - REJECT if matched portion > 60%
    const SIMILARITY_THRESHOLD = 60; // 60% threshold
    const similarityPercentage = maxSimilarity * 100;
    const matchedPortionPercentage = totalSections > 0
      ? (matchedSectionCount / totalSections) * 100
      : 0;

    // Precompute coverage profile so frontend can provide interactive threshold controls.
    const coverageThresholds = [20, 25, 30, 40, 50, 60, 70, 80, 90];
    const thresholdCoverage = {};
    coverageThresholds.forEach((thresholdPct) => {
      const thresholdRaw = thresholdPct / 100;
      const coveredSections = sectionBestSimilarities.filter(
        (sectionScore) => sectionScore.bestSimilarityRaw >= thresholdRaw
      ).length;
      thresholdCoverage[String(thresholdPct)] = {
        coveredSections,
        matchedPortionPercentage: totalSections > 0
          ? Number(((coveredSections / totalSections) * 100).toFixed(2))
          : 0
      };
    });
    
    if (matchedPortionPercentage > SIMILARITY_THRESHOLD) {
      // Delete uploaded file
      fs.unlinkSync(filePath);
      
      console.log(`❌ UPLOAD REJECTED: ${matchedPortionPercentage.toFixed(1)}% matched portion exceeds ${SIMILARITY_THRESHOLD}% threshold`);
      
      return res.status(400).json({
        success: false,
        error: 'Upload rejected - High similarity detected',
        message: `Upload failed: ${matchedPortionPercentage.toFixed(1)}% of document sections matched existing stored chunks. Threshold is ${SIMILARITY_THRESHOLD}%.`,
        similarity: {
          percentage: matchedPortionPercentage.toFixed(1),
          averageSimilarity: similarityPercentage.toFixed(1),
          threshold: SIMILARITY_THRESHOLD,
          totalSections,
          matchedSections: matchedSectionCount,
          chunkMatchThresholdPct: CHUNK_MATCH_THRESHOLD * 100,
          sectionBestSimilarities,
          thresholdCoverage,
          matchedDocuments: similarDocuments.map(doc => ({
            name: doc.document_name || doc.original_name || 'Unknown',
            documentId: doc.document_id,
            similarity: (doc.average_similarity * 100).toFixed(1) + '%',
            matchingChunks: doc.section_count,
            similarSections: doc.section_count
          })),
          fuzzyMatches: fuzzyMatches.slice(0, 10) // Top 10 section matches
        }
      });
    }

    // Update XAI results with fuzzy match comparison
    xaiResults.plagiarismCheck = {
      isPlagiarized: matchedPortionPercentage > SIMILARITY_THRESHOLD,
      similarityScore: matchedPortionPercentage,
      matchedPortionPercentage,
      averageSimilarityPercentage: similarityPercentage,
      threshold: SIMILARITY_THRESHOLD,
      fuzzyMatches: fuzzyMatches.slice(0, 20), // Top 20 matches
      matchedDocuments: similarDocuments,
      similarSections: fuzzyMatches.length,
      explanation: matchedPortionPercentage > SIMILARITY_THRESHOLD
        ? `Document rejected: ${matchedPortionPercentage.toFixed(1)}% of sections matched existing chunks (threshold ${SIMILARITY_THRESHOLD}%)`
        : fuzzyMatches.length > 0
        ? `Found ${fuzzyMatches.length} similar sections across stored chunks. Matched portion: ${matchedPortionPercentage.toFixed(1)}%, average similarity: ${similarityPercentage.toFixed(1)}%`
        : 'No similar content found - appears original',
      comparisonMethod: 'fuzzy-vector-matching'
    };
    
    xaiResults.fuzzyMatchResults = {
      totalMatches: fuzzyMatches.length,
      documents: similarDocuments.map(doc => ({
        documentId: doc.document_id,
        documentName: doc.document_name || doc.original_name,
        averageSimilarity: (doc.average_similarity * 100).toFixed(1) + '%',
        similarSections: doc.section_count,
        matches: doc.matches
      })),
      topMatches: fuzzyMatches.slice(0, 10),
      totalSections,
      matchedSections: matchedSectionCount,
      matchedPortionPercentage: matchedPortionPercentage.toFixed(1),
      chunkMatchThresholdPct: CHUNK_MATCH_THRESHOLD * 100,
      sectionBestSimilarities,
      thresholdCoverage
    };
    
    xaiResults.status = matchedPortionPercentage <= SIMILARITY_THRESHOLD ? 'verified' : 'rejected';
    xaiResults.confidenceScore = Math.max(0, Math.round(100 - (matchedPortionPercentage * 0.8)));

    console.log(`📊 XAI Analysis complete: ${xaiResults.status} (${matchedPortionPercentage.toFixed(1)}% matched portion, ${similarityPercentage.toFixed(1)}% average similarity)`);

    // Step 3: Save to database ONLY if passed threshold
    const documentRecord = await dbHandler.createDocument({
      originalName: originalname,
      fileName: filename,
      filePath: filePath,
      fileSize: size,
      documentType: documentType || 'research_paper',
      uploaderName: uploaderName || 'Anonymous',
      status: xaiResults.status,
      documentHash: xaiResults.documentHash
    });

    console.log(`✅ Document saved to database with ID: ${documentRecord.id}`);

    // Step 3.5: Now save chunks to database
    if (xaiResults.documentText && xaiResults.documentText.length > 50 && chunkingService) {
      try {
        console.log(`✂️  Saving chunks for document ${documentRecord.id}...`);
        const chunks = await chunkingService.processDocument(documentRecord.id, xaiResults.documentText, {
          original_name: originalname,
          document_type: documentType,
          file_hash: xaiResults.documentHash
        });
        console.log(`✅ Saved ${chunks.length} chunks to database`);
      } catch (err) {
        console.error('❌ Error saving chunks:', err.message);
      }
    }

    // Step 4: If passed, register on blockchain
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

    // Step 5: Update database with results
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
        blockchain: blockchainData,
        xaiAnalysis: xaiResults,
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

// Delete document
app.delete('/api/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get document info first
    const document = await dbHandler.getDocument(id);
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    // Delete chunks first (handled in deleteDocument)
    const deleted = await dbHandler.deleteDocument(id);
    
    // Delete physical file if it exists
    const filePath = document.filePath || document.file_path;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Deleted file: ${filePath}`);
      } catch (fileError) {
        console.warn(`⚠️  Could not delete file: ${fileError.message}`);
      }
    }
    
    console.log(`✅ Document ${id} deleted successfully`);
    res.json({ 
      success: true, 
      message: 'Document and associated data deleted successfully',
      data: deleted 
    });
  } catch (error) {
    console.error('Delete document error:', error);
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

// Start server
initializeServices().then(() => {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 INTEGRATED SERVER RUNNING`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`⛓️  Blockchain: Connected`);
    console.log(`🤖 XAI: Enabled`);
    console.log(`💾 Database: Ready`);
    console.log(`${'='.repeat(60)}\n`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing server');
  process.exit(0);
});
