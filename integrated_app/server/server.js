require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import blockchain module components
const blockchainConnector = require('../../block_chain_module/api/blockchain/connector');
const xaiAnalyzer = require('./functionality/xai/real-analyzer');
const dbHandler = require('./functionality/database/handler');
const ChunkingService = require('./functionality/services/chunking-service');
const DocumentParser = require('./utils/document-parser');
const { requireOrgAuth } = require('./middleware/org-auth');
const { requireAdmin } = require('./middleware/admin-auth');
const ocrService = require('./functionality/services/ocr-service');
const fieldExtractor = require('./functionality/services/certificate-field-extractor');

const app = express();
const BASE_PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || '5000', 10);

// Initialize chunking service
let chunkingService = null;

// Middleware
app.use(cors());
app.use(express.json());

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
    const allowedTypes = /pdf|docx|txt|rtf|odt|pptx|xls|xlsx|csv|html|htm|md|tex/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Allow various MIME types
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
      cb(new Error('Unsupported file format. Please upload PDF, DOCX, TXT, RTF, ODT, PPTX, XLS/XLSX, CSV, HTML, MD, or TEX files.'));
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

const certUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const certDir = path.join(__dirname, 'uploads', 'certificates');
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
      }
      cb(null, certDir);
    },
    filename: function (req, file, cb) {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(safe).toLowerCase();
      const base = path.basename(safe, ext).slice(0, 40) || 'cert';
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|png|jpg|jpeg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (extname || allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported certificate format. Use PDF/PNG/JPG/WEBP files.'));
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

/**
 * Directional word-overlap: what fraction of `queryWords`' unique words
 * appear in `targetText`. Returns 0-1 score.
 */
/**
 * Directional phrase-overlap: split both texts by punctuation boundaries
 * (., !, ?, ;, :, ,) into segments. Each segment between punctuation is treated
 * as a single unit. Returns the fraction of uploaded segments found in the
 * database text.
 *
 * Segments are normalized: trimmed, lowercased, stripped of list markers
 * like (1), 1., etc., and whitespace-collapsed before comparison.
 */
function calculatePhraseOverlap(queryText, targetText, debug = false) {
  if (!queryText || !targetText) return 0;

  const segmentRe = /[.!?;:,]+\s*/;
  const normalize = (s) =>
    s.trim()
      .toLowerCase()
      .replace(/^\(?\d+\)?\.?\s*/, '')
      .replace(/\s+/g, ' ');

  const querySegments = queryText.split(segmentRe)
    .map(normalize)
    .filter(s => s.length >= 10);

  const targetSegments = new Set(
    targetText.split(segmentRe)
      .map(normalize)
      .filter(s => s.length >= 10)
  );

  if (querySegments.length < 1) return 0;

  let matched = 0;
  const matchResults = [];
  for (const segment of querySegments) {
    const found = targetSegments.has(segment);
    if (found) matched++;
    matchResults.push({ segment, found });
  }

  if (debug) {
    console.log(`  ┌─ PhraseOverlap Debug ────────────────────────────`);
    console.log(`  │ Upload segments (${querySegments.length}):`);
    querySegments.forEach((s, i) => {
      const mark = matchResults[i].found ? '✅' : '❌';
      const preview = s.length > 70 ? s.substring(0, 67) + '...' : s;
      console.log(`  │   ${mark} [${i}] "${preview}"`);
    });
    console.log(`  │ DB segments (${targetSegments.size}):`);
    console.log(`  │   (set of unique normalized segments)`);
    console.log(`  │ Matched: ${matched}/${querySegments.length} = ${(matched / querySegments.length * 100).toFixed(1)}%`);
    console.log(`  └──────────────────────────────────────────────────`);
  }

  return matched / querySegments.length;
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

// Root route - API status for backend-only service
app.get('/', (req, res) => {
  res.json({
    service: 'integrated_app_api',
    status: 'running',
    message: 'UI moved to Next.js frontend app',
    recommendedFrontend: 'http://localhost:3001'
  });
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

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  return `ck_live_${random}`;
}

function slugifyOrgId(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'ORG';
}

app.post('/api/organizations/register', requireAdmin, async (req, res) => {
  try {
    const { name, orgId: providedOrgId, contactEmail } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Organization name is required.' });
    }

    const baseOrgId = (providedOrgId && providedOrgId.trim()) || slugifyOrgId(name);
    let orgId = baseOrgId;
    let suffix = 1;
    while (await dbHandler.findOrganizationByOrgId(orgId)) {
      suffix += 1;
      orgId = `${baseOrgId}-${suffix}`;
      if (suffix > 999) {
        return res.status(500).json({ success: false, error: 'Could not allocate a unique org_id.' });
      }
    }

    const apiKey = generateApiKey();
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const apiKeyPrefix = apiKey.slice(0, 12);

    const created = await dbHandler.createOrganization({
      orgId,
      name: name.trim(),
      apiKeyHash,
      apiKeyPrefix,
      contactEmail: contactEmail || null,
      isActive: true
    });

    console.log(`🏢 Organization registered: ${created.org_id} (${created.name})`);

    res.status(201).json({
      success: true,
      data: {
        orgId: created.org_id,
        name: created.name,
        contactEmail: created.contact_email,
        apiKey,
        apiKeyPrefix: created.api_key_prefix,
        message: 'Save this API key now. It will not be shown again.'
      }
    });
  } catch (error) {
    console.error('Organization registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/organizations/me', requireOrgAuth, async (req, res) => {
  res.json({
    success: true,
    data: {
      orgId: req.org.orgId,
      name: req.org.name,
      contactEmail: req.org.contactEmail,
      isActive: req.org.isActive,
      createdAt: req.org.createdAt
    }
  });
});

function generateCertificateId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CERT-${ts}-${rand}`;
}

function parseCanonicalPayload(body) {
  const data = body || {};
  let fields = {};
  if (typeof data.fields === 'string') {
    try { fields = JSON.parse(data.fields); } catch (_) { fields = {}; }
  } else if (data.fields && typeof data.fields === 'object') {
    fields = data.fields;
  }
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    recipient_name: (fields.recipient_name || '').toString().trim(),
    course_or_title: (fields.course_or_title || '').toString().trim(),
    issue_date: (fields.issue_date || '').toString().trim() || todayIso,
    certificate_serial: (fields.certificate_serial || '').toString().trim(),
    additional_fields: fields.additional_fields && typeof fields.additional_fields === 'object' ? fields.additional_fields : {}
  };
}

function validateCanonicalPayload(payload) {
  const errors = [];
  if (!payload.recipient_name) errors.push('recipient_name is required');
  if (payload.issue_date && Number.isNaN(Date.parse(payload.issue_date))) {
    errors.push('issue_date is not a valid date');
  }
  return errors;
}

function buildCanonicalForHash(payload) {
  return {
    recipient_name: payload.recipient_name,
    course_or_title: payload.course_or_title,
    issue_date: payload.issue_date,
    certificate_serial: payload.certificate_serial,
    issuer_name: payload.issuer_name
  };
}

app.post('/api/certificates/issue', requireOrgAuth, certUpload.single('document'), async (req, res) => {
  const uploadedPath = req.file?.path || null;
  const storedFilePath = uploadedPath;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No certificate file uploaded.' });
    }

    const payload = parseCanonicalPayload(req.body);
    const errors = validateCanonicalPayload(payload);
    if (errors.length) {
      return res.status(400).json({ success: false, error: 'Invalid payload.', details: errors });
    }
    payload.issuer_name = req.org.name;

    const fileHash = await calculateFileHash(uploadedPath);
    const canonicalForHash = buildCanonicalForHash(payload);
    const canonicalFingerprint = fieldExtractor.buildCanonicalFingerprint(canonicalForHash);

    const existingBySerial = payload.certificate_serial
      ? await dbHandler.findCertificateBySerial(req.org.orgId, payload.certificate_serial)
      : null;
    if (existingBySerial) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate certificate serial for this organization.',
        existing: {
          certificateId: existingBySerial.certificate_id,
          fileHash: existingBySerial.file_hash,
          status: existingBySerial.status
        }
      });
    }

    const existingByHash = await dbHandler.findCertificateByFileHash(fileHash);
    if (existingByHash) {
      return res.status(409).json({
        success: false,
        error: 'This exact file has already been registered as a certificate.',
        existing: {
          certificateId: existingByHash.certificate_id,
          issuerName: existingByHash.issuer_name,
          fileHash: existingByHash.file_hash
        }
      });
    }

    let ocr = { text: '', confidence: null, engine: null };
    try {
      ocr = await ocrService.extractText(uploadedPath);
    } catch (e) {
      console.warn('OCR failed during issuance:', e.message);
    }

    const certificateId = generateCertificateId();
    const newExt = path.extname(uploadedPath).toLowerCase();
    const permanentDir = path.join(__dirname, 'uploads', 'certificates');
    if (!fs.existsSync(permanentDir)) fs.mkdirSync(permanentDir, { recursive: true });
    const permanentPath = path.join(permanentDir, `${certificateId}${newExt}`);
    try {
      fs.renameSync(uploadedPath, permanentPath);
    } catch (e) {
      fs.copyFileSync(uploadedPath, permanentPath);
      fs.unlinkSync(uploadedPath);
    }

    let blockchain = null;
    try {
      const txResult = await blockchainConnector.registerDocument({
        documentName: `CERT-${certificateId}`,
        documentHash: fileHash,
        xaiAnalysis: JSON.stringify({
          flow: 'certificate_issuance',
          orgId: req.org.orgId,
          certificateId,
          canonicalFingerprint,
          recipientNameHash: crypto.createHash('sha256').update(payload.recipient_name).digest('hex'),
          issueDate: payload.issue_date,
          certificateSerial: payload.certificate_serial
        }),
        confidenceScore: 95
      });
      blockchain = {
        transactionHash: txResult.transactionHash,
        blockNumber: txResult.blockNumber,
        contractAddress: txResult.contractAddress,
        network: 'hardhat-local',
        anchoredAt: new Date().toISOString()
      };
    } catch (e) {
      console.warn('Blockchain anchoring failed during issuance:', e.message);
    }

    const issuedAt = new Date().toISOString();
    const documentBuffer = fs.readFileSync(permanentPath);
    const documentMime = req.file.mimetype || 'application/octet-stream';
    const documentFilename = `${certificateId}${newExt}`;
    const created = await dbHandler.createCertificate({
      certificateId,
      orgId: req.org.orgId,
      issuerName: payload.issuer_name,
      recipientName: payload.recipient_name,
      courseOrTitle: payload.course_or_title,
      issueDate: payload.issue_date,
      certificateSerial: payload.certificate_serial,
      additionalFields: payload.additional_fields,
      canonicalFingerprint,
      fileHash,
      filePath: permanentPath,
      documentData: documentBuffer,
      documentMime,
      documentFilename,
      ocrText: ocr.text,
      ocrEngine: ocr.engine,
      ocrConfidence: ocr.confidence,
      blockchain,
      status: 'active',
      issuedAt
    });

    const verifyBase = `${req.protocol}://${req.get('host')}`;
    const qrPayload = {
      certificateId,
      issuerName: payload.issuer_name,
      recipientName: payload.recipient_name,
      fileHash,
      verifyUrl: `${verifyBase}/api/certificates/${certificateId}`
    };

    console.log(`🎓 Certificate issued: ${certificateId} by ${req.org.orgId}`);

    res.status(201).json({
      success: true,
      data: {
        certificateId,
        orgId: req.org.orgId,
        issuerName: payload.issuer_name,
        recipientName: payload.recipient_name,
        courseOrTitle: payload.course_or_title,
        issueDate: payload.issue_date,
        certificateSerial: payload.certificate_serial,
        fileHash,
        canonicalFingerprint,
        blockchain,
        documentUrl: `${req.protocol}://${req.get('host')}/api/certificates/${certificateId}/document`,
        ocr: {
          engine: ocr.engine,
          confidence: ocr.confidence,
          textLength: ocr.text.length
        },
        qrPayload,
        qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(JSON.stringify(qrPayload))}`,
        verifyUrl: qrPayload.verifyUrl,
        issuedAt
      }
    });
  } catch (error) {
    console.error('Certificate issuance error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath) && uploadedPath !== storedFilePath) {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
    }
  }
});

app.post('/api/certificates/:certId/revoke', requireOrgAuth, async (req, res) => {
  try {
    const { certId } = req.params;
    const reason = (req.body?.reason || '').toString().trim() || null;

    const existing = await dbHandler.findCertificateById(certId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }
    if (existing.org_id !== req.org.orgId) {
      return res.status(403).json({ success: false, error: 'You can only revoke certificates from your own organization.' });
    }
    if (existing.status === 'revoked') {
      return res.status(400).json({ success: false, error: 'Certificate is already revoked.' });
    }

    const revoked = await dbHandler.revokeCertificate(certId, { reason });
    res.json({
      success: true,
      data: {
        certificateId: revoked.certificate_id,
        status: revoked.status,
        revokedAt: revoked.revoked_at,
        revocationReason: revoked.revocation_reason
      }
    });
  } catch (error) {
    console.error('Certificate revoke error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/certificates', requireOrgAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
    const status = req.query.status ? String(req.query.status) : null;

    const base = `${req.protocol}://${req.get('host')}`;
    const rows = await dbHandler.listCertificatesByOrg(req.org.orgId, { limit, offset, status });
    const certs = rows.map((c) => ({
      certificateId: c.certificate_id,
      orgId: c.org_id,
      issuerName: c.issuer_name,
      recipientName: c.recipient_name,
      courseOrTitle: c.course_or_title,
      issueDate: c.issue_date,
      certificateSerial: c.certificate_serial,
      fileHash: c.file_hash,
      canonicalFingerprint: c.canonical_fingerprint,
      status: c.status,
      blockchain: c.blockchain,
      issuedAt: c.issued_at,
      revokedAt: c.revoked_at,
      revocationReason: c.revocation_reason,
      documentUrl: `${base}/api/certificates/${c.certificate_id}/document`,
      hasDocument: Boolean(c.document_data)
    }));

    res.json({ success: true, data: { certificates: certs, limit, offset } });
  } catch (error) {
    console.error('Certificate list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function publicCertProjection(c, req, { includeOcr = false } = {}) {
  const base = req ? `${req.protocol}://${req.get('host')}` : '';
  const out = {
    certificateId: c.certificate_id,
    orgId: c.org_id,
    issuerName: c.issuer_name,
    recipientName: c.recipient_name,
    courseOrTitle: c.course_or_title,
    issueDate: c.issue_date,
    certificateSerial: c.certificate_serial,
    fileHash: c.file_hash,
    canonicalFingerprint: c.canonical_fingerprint,
    status: c.status,
    issuedAt: c.issued_at,
    revokedAt: c.revoked_at,
    revocationReason: c.revocation_reason,
    blockchain: c.blockchain,
    documentUrl: base ? `${base}/api/certificates/${c.certificate_id}/document` : `/api/certificates/${c.certificate_id}/document`,
    hasDocument: Boolean(c.document_data)
  };
  if (includeOcr) {
    out.ocrText = c.ocr_text || null;
    out.ocrEngine = c.ocr_engine || null;
  }
  return out;
}

app.get('/api/certificates/by-hash/:hash', async (req, res) => {
  try {
    const cert = await dbHandler.findCertificateByFileHash(req.params.hash);
    if (!cert) {
      return res.status(404).json({ success: false, error: 'No certificate found with that file hash.' });
    }
    res.json({ success: true, data: publicCertProjection(cert, req) });
  } catch (error) {
    console.error('Certificate by-hash error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/certificates/:certId', async (req, res) => {
  try {
    const cert = await dbHandler.findCertificateById(req.params.certId);
    if (!cert) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }
    res.json({ success: true, data: publicCertProjection(cert, req) });
  } catch (error) {
    console.error('Certificate get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/certificates/:certId/document', async (req, res) => {
  try {
    const cert = await dbHandler.findCertificateById(req.params.certId);
    if (!cert) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }
    if (!cert.document_data) {
      return res.status(404).json({ success: false, error: 'No document stored for this certificate.' });
    }
    const mime = cert.document_mime || 'application/octet-stream';
    const filename = cert.document_filename || `${cert.certificate_id}.bin`;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', cert.document_data.length);
    res.send(cert.document_data);
  } catch (error) {
    console.error('Document fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function inferDateFormatVariants(dateStr) {
  if (!dateStr) return [];
  const variants = new Set([dateStr]);
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    variants.add(`${yyyy}-${mm}-${dd}`);
    variants.add(`${dd}/${mm}/${yyyy}`);
    variants.add(`${mm}/${dd}/${yyyy}`);
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthShort = monthNames[d.getUTCMonth()].slice(0, 3);
    variants.add(`${dd} ${monthNames[d.getUTCMonth()]} ${yyyy}`);
    variants.add(`${d.getUTCDate()}${ordinalSuffix(d.getUTCDate())} day of ${monthNames[d.getUTCMonth()]}, ${yyyy}`);
    variants.add(`${monthShort} ${d.getUTCDate()}, ${yyyy}`);
  }
  return Array.from(variants);
}

function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function isDateMatch(storedDate, extractedDate) {
  if (!storedDate || !extractedDate) return false;
  if (storedDate === extractedDate) return true;
  const variants = new Set(inferDateFormatVariants(storedDate));
  for (const v of variants) {
    if (fieldExtractor.normalizeForFingerprint(v) === fieldExtractor.normalizeForFingerprint(extractedDate)) return true;
  }
  return false;
}

function findTextLocation(text, target) {
  if (!text || !target) return null;
  const norm = fieldExtractor.normalizeForFingerprint(target);
  if (!norm) return null;
  const lowerText = text.toLowerCase();
  const lines = text.split(/\r?\n/);
  const normLines = lines.map((l) => fieldExtractor.normalizeForFingerprint(l));

  const dateVariants = inferDateFormatVariants(target).map((v) => fieldExtractor.normalizeForFingerprint(v));
  const candidates = [norm, ...dateVariants.filter((v) => v && v !== norm)];

  for (const cand of candidates) {
    for (let i = 0; i < normLines.length; i++) {
      if (normLines[i] === cand) {
        return { lineNumber: i + 1, snippet: lines[i].trim() };
      }
    }
  }
  for (const cand of candidates) {
    for (let i = 0; i < normLines.length; i++) {
      if (normLines[i].includes(cand)) {
        return { lineNumber: i + 1, snippet: lines[i].trim() };
      }
    }
  }

  const words = norm.split(' ').filter((w) => w.length >= 5);
  if (words.length === 0) return null;
  const sorted = [...words].sort((a, b) => b.length - a.length);
  for (let i = 0; i < normLines.length; i++) {
    if (sorted.some((w) => normLines[i].includes(w))) {
      return { lineNumber: i + 1, snippet: lines[i].trim() };
    }
  }
  return null;
}

function buildXaiAnalysis({ verdict, matchedBy, fieldComparison, mismatchedFields, exactFields, fuzzyFields, forgeryCheck, chainStatus, matchedRecord, fileHash }) {
  const reasons = [];
  const evidence = [];
  const recommendations = [];

  if (verdict === 'authentic') {
    reasons.push({
      type: 'positive',
      message: `Verified against the canonical record stored in the database (matched by ${matchedBy.replace(/_/g, ' ')}).`
    });
    if (matchedBy === 'file_hash') {
      reasons.push({
        type: 'positive',
        message: 'The uploaded file is byte-for-byte identical to the original registered certificate.'
      });
    } else {
      const matchedFields = exactFields.map((f) => f.field);
      reasons.push({
        type: 'positive',
        message: `Canonical fields match exactly: ${matchedFields.join(', ')}.`
      });
    }
    if (chainStatus === 'on_chain') {
      reasons.push({
        type: 'positive',
        message: 'File hash is anchored on the blockchain (immutable proof of registration).'
      });
    } else if (chainStatus === 'not_on_current_chain') {
      recommendations.push('The blockchain reference is from a previous chain session. Consider re-anchoring on the current chain.');
    }
  } else if (verdict === 'tampered') {
    if (mismatchedFields.length > 0) {
      const fieldLocations = mismatchedFields.map((row) => {
        const loc = findTextLocation(matchedRecord.ocr_text, row.expected);
        return {
          field: row.field,
          expected: row.expected,
          found: row.found,
          location: loc,
          severity: 'high'
        };
      });
      reasons.push({
        type: 'critical',
        message: `${mismatchedFields.length} field${mismatchedFields.length === 1 ? '' : 's'} differ${mismatchedFields.length === 1 ? 's' : ''} from the registered record.`
      });
      evidence.push({
        type: 'field_differences',
        items: fieldLocations
      });
      const hasName = mismatchedFields.some((f) => f.field === 'recipient_name');
      const hasDate = mismatchedFields.some((f) => f.field === 'issue_date');
      const hasIssuer = mismatchedFields.some((f) => f.field === 'issuer_name');
      const hasSerial = mismatchedFields.some((f) => f.field === 'certificate_serial');
      if (hasName) {
        recommendations.push('The recipient name on the document does not match the registered record. This is the most common sign of certificate forgery.');
      }
      if (hasDate) {
        recommendations.push('The issue date does not match. Forged certificates often alter dates to backdate or extend validity.');
      }
      if (hasIssuer) {
        recommendations.push('The issuing institution name does not match. Verify the document actually came from the claimed organization.');
      }
      if (hasSerial) {
        recommendations.push('The certificate serial number has been changed. Each certificate should have a unique serial as registered.');
      }
    } else {
      reasons.push({
        type: 'critical',
        message: 'The document could not be conclusively matched to the registered record.'
      });
      evidence.push({
        type: 'low_overlap',
        message: 'Too few fields matched the stored record. This may indicate a significantly altered document.'
      });
    }
  } else if (verdict === 'revoked') {
    reasons.push({
      type: 'critical',
      message: 'This certificate has been revoked by the issuing organization.'
    });
    if (matchedRecord.revocation_reason) {
      reasons.push({
        type: 'info',
        message: `Revocation reason: ${matchedRecord.revocation_reason}`
      });
    }
    evidence.push({
      type: 'revocation',
      revokedAt: matchedRecord.revoked_at
    });
  } else if (verdict === 'suspicious') {
    reasons.push({
      type: 'warning',
      message: 'Some fields matched but not enough to confirm authenticity. Manual review recommended.'
    });
    evidence.push({
      type: 'partial_match',
      exactCount: exactFields.length,
      fuzzyCount: fuzzyFields.length
    });
  } else if (verdict === 'unknown') {
    reasons.push({
      type: 'warning',
      message: 'No matching certificate found in the database.'
    });
    recommendations.push('This certificate may not have been registered with any organization, or the identifying data could not be extracted.');
  } else if (verdict === 'not_a_certificate') {
    reasons.push({
      type: 'critical',
      message: 'The uploaded file does not appear to be a certificate.'
    });
    if (forgeryCheck?.missingSignals) {
      evidence.push({
        type: 'missing_signals',
        items: forgeryCheck.missingSignals
      });
    }
  }

  let confidence;
  if (verdict === 'authentic') confidence = 95;
  else if (verdict === 'revoked') confidence = 99;
  else if (verdict === 'tampered') confidence = 90;
  else if (verdict === 'not_a_certificate') confidence = 85;
  else if (verdict === 'suspicious') confidence = 60;
  else confidence = 30;

  return {
    summary: `Verdict: ${verdict} (${confidence}% confidence)`,
    reasons,
    evidence,
    recommendations,
    confidence,
    modelVersion: 'xai-cert-verify-v1',
    generatedAt: new Date().toISOString()
  };
}

app.post('/api/certificates/verify', certUpload.single('document'), async (req, res) => {
  const uploadedPath = req.file?.path || null;
  const originalPath = uploadedPath;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No certificate file uploaded.' });
    }

    const hintCertId = (req.body?.certificateId || '').toString().trim() || null;
    const hintSerial = (req.body?.certificateSerial || '').toString().trim() || null;

    const fileHash = await calculateFileHash(uploadedPath);

    let ocr = { text: '', confidence: null, engine: null };
    try {
      ocr = await ocrService.extractText(uploadedPath);
    } catch (e) {
      console.warn('OCR failed during verification:', e.message);
    }

    const extracted = fieldExtractor.extractAllFields(ocr.text);
    const extractedCanonical = fieldExtractor.fieldsToCanonical(extracted);
    const extractedFingerprint = fieldExtractor.buildCanonicalFingerprint(extractedCanonical);

    let forgeryCheck = null;
    try {
      forgeryCheck = await xaiAnalyzer.runCertificateForgeryCheck(uploadedPath, ocr.text);
    } catch (e) {
      console.warn('Forgery check failed during verification:', e.message);
    }

    let matchedRecord = null;
    let matchedBy = null;
    if (hintCertId) {
      matchedRecord = await dbHandler.findCertificateById(hintCertId);
      if (matchedRecord) matchedBy = 'certificateId';
    }
    if (!matchedRecord) {
      matchedRecord = await dbHandler.findCertificateByFileHash(fileHash);
      if (matchedRecord) matchedBy = 'file_hash';
    }
    if (!matchedRecord && extractedCanonical.certificate_serial) {
      const bySerial = await dbHandler.findCertificateBySerialAny(extractedCanonical.certificate_serial).catch(() => null);
      if (bySerial) {
        matchedRecord = bySerial;
        matchedBy = 'extracted_serial';
      }
    }
    if (!matchedRecord && hintSerial) {
      const bySerial = await dbHandler.findCertificateBySerialAny(hintSerial).catch(() => null);
      if (bySerial) {
        matchedRecord = bySerial;
        matchedBy = 'hint_serial';
      }
    }
    if (!matchedRecord) {
      matchedRecord = await dbHandler.findCertificateByFingerprint(extractedFingerprint);
      if (matchedRecord) matchedBy = 'canonical_fingerprint';
    }

    if (!matchedRecord) {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
      const looksLikeCert = forgeryCheck && !forgeryCheck.isForged;
      const missingSignals = forgeryCheck?.missingSignals || [];
      return res.json({
        success: true,
        data: {
          verdict: looksLikeCert ? 'unknown' : 'not_a_certificate',
          matchedBy: null,
          uploaded: {
            fileHash,
            ocrEngine: ocr.engine,
            ocrConfidence: ocr.confidence,
            extractedFields: extractedCanonical,
            extractedFingerprint
          },
          stored: null,
          fieldComparison: [],
          checks: {
            blockchainAuthentic: false,
            hashMatched: false,
            fingerprintMatched: false,
            serialMatched: false,
            forgeryRiskLevel: forgeryCheck ? (forgeryCheck.isForged ? 'high' : 'low') : 'unknown',
            forgeryRiskScore: forgeryCheck ? (forgeryCheck.isForged ? 80 : 10) : null,
            missingSignals
          },
          mismatches: [],
          message: looksLikeCert
            ? 'No matching certificate found. This file is not registered, or its data does not match any issued certificate.'
            : `This file does not appear to be a certificate. Missing signals: ${missingSignals.join(', ') || 'multiple'}.`
        }
      });
    }

    const stored = {
      recipient_name: matchedRecord.recipient_name,
      course_or_title: matchedRecord.course_or_title,
      issue_date: matchedRecord.issue_date
        ? (matchedRecord.issue_date instanceof Date
            ? `${matchedRecord.issue_date.getFullYear()}-${String(matchedRecord.issue_date.getMonth() + 1).padStart(2, '0')}-${String(matchedRecord.issue_date.getDate()).padStart(2, '0')}`
            : String(matchedRecord.issue_date).slice(0, 10))
        : null,
      certificate_serial: matchedRecord.certificate_serial,
      issuer_name: matchedRecord.issuer_name
    };
    const diff = fieldExtractor.compareFields(stored, extractedCanonical);
    const fieldComparison = diff.fieldComparison.map((row) => {
      if (row.field === 'issue_date') {
        if (isDateMatch(stored.issue_date, row.found)) {
          return { ...row, status: 'date_format_match' };
        }
      }
      return row;
    });

    const mismatchedFields = fieldComparison.filter((r) =>
      !['exact', 'whitespace_only', 'date_format_match'].includes(r.status) &&
      !['fuzzy_full', 'fuzzy_partial'].includes(r.status)
    );
    const fuzzyFields = fieldComparison.filter((r) => ['fuzzy_full', 'fuzzy_partial'].includes(r.status));
    const exactFields = fieldComparison.filter((r) => ['exact', 'whitespace_only', 'date_format_match'].includes(r.status));

    let blockchainVerification = null;
    let chainStatus = 'unchecked';
    try {
      blockchainVerification = await blockchainConnector.verifyDocument(fileHash);
      if (blockchainVerification?.exists && blockchainVerification?.isVerified) chainStatus = 'on_chain';
      else if (blockchainVerification?.exists) chainStatus = 'on_chain_unverified';
      else chainStatus = 'not_on_current_chain';
    } catch (e) {
      console.warn('Blockchain verification failed during verify:', e.message);
      chainStatus = 'unreachable';
    }
    const blockchainAuthentic = chainStatus === 'on_chain';

    if (
      matchedRecord.status !== 'revoked' &&
      matchedRecord.file_hash &&
      matchedRecord.file_hash === fileHash &&
      chainStatus !== 'on_chain'
    ) {
      try {
        const reanchored = await blockchainConnector.registerDocument({
          documentHash: fileHash,
          documentName: `${matchedRecord.certificate_id}.bin`,
          xaiAnalysis: JSON.stringify({
            flow: 'certificate_re_anchoring',
            certificateId: matchedRecord.certificate_id,
            reason: 'previous_chain_lost'
          }),
          confidenceScore: 95
        });
        await dbHandler.updateCertificateBlockchain(matchedRecord.certificate_id, {
          transactionHash: reanchored.transactionHash,
          blockNumber: reanchored.blockNumber,
          contractAddress: reanchored.contractAddress,
          network: 'hardhat-local',
          anchoredAt: new Date().toISOString()
        });
        matchedRecord.blockchain = {
          transactionHash: reanchored.transactionHash,
          blockNumber: reanchored.blockNumber,
          contractAddress: reanchored.contractAddress,
          network: 'hardhat-local',
          anchoredAt: new Date().toISOString()
        };
        chainStatus = 'on_chain';
        console.log(`♻️  Re-anchored ${matchedRecord.certificate_id} on current chain (tx: ${reanchored.transactionHash})`);
      } catch (e) {
        console.warn(`Re-anchoring failed for ${matchedRecord.certificate_id}: ${e.message}`);
      }
    }

    let verdict;
    if (matchedRecord.status === 'revoked') verdict = 'revoked';
    else if (matchedBy === 'file_hash') verdict = 'authentic';
    else if (mismatchedFields.length >= 1) verdict = 'tampered';
    else if (matchedBy === 'certificateId' && exactFields.length >= 3) verdict = 'authentic';
    else if ((matchedBy === 'canonical_fingerprint' || matchedBy === 'extracted_serial' || matchedBy === 'hint_serial') && exactFields.length >= 3) verdict = 'authentic';
    else if (exactFields.length + fuzzyFields.length < 2) verdict = 'tampered';
    else verdict = 'suspicious';

    const xaiAnalysis = buildXaiAnalysis({
      verdict,
      matchedBy,
      fieldComparison,
      mismatchedFields,
      exactFields,
      fuzzyFields,
      forgeryCheck,
      chainStatus,
      matchedRecord,
      fileHash
    });

    try { fs.unlinkSync(uploadedPath); } catch (_) {}

    res.json({
      success: true,
      data: {
        verdict,
        matchedBy,
        xaiAnalysis,
        uploaded: {
          fileHash,
          ocrEngine: ocr.engine,
          ocrConfidence: ocr.confidence,
          extractedFields: extractedCanonical,
          extractedFingerprint,
          ocrText: ocr.text
        },
        stored: publicCertProjection(matchedRecord, req, { includeOcr: true }),
        fieldComparison,
        checks: {
          blockchainAuthentic,
          chainStatus,
          hashMatched: matchedBy === 'file_hash',
          fingerprintMatched: matchedBy === 'canonical_fingerprint',
          serialMatched: matchedBy === 'extracted_serial' || matchedBy === 'hint_serial',
          forgeryRiskLevel: forgeryCheck ? (forgeryCheck.isForged ? 'high' : 'low') : 'unknown',
          forgeryRiskScore: forgeryCheck ? (forgeryCheck.isForged ? 80 : 10) : null
        },
        summary: {
          exactCount: exactFields.length,
          fuzzyCount: fuzzyFields.length,
          mismatchCount: mismatchedFields.length,
          totalCount: fieldComparison.length,
          matchScore: Number((exactFields.length / fieldComparison.length).toFixed(2))
        },
        mismatches: mismatchedFields.map((m) => m.field),
        fuzzyFields: fuzzyFields.map((f) => f.field),
        forgery: forgeryCheck,
        message:
          verdict === 'authentic'
            ? 'Certificate is authentic. All extracted fields match the on-chain record.'
            : verdict === 'tampered'
            ? `Certificate is TAMPERED. Mismatched fields: ${mismatchedFields.map((m) => m.field).join(', ') || 'none'}.`
            : verdict === 'revoked'
            ? 'This certificate has been REVOKED by the issuing organization.'
            : 'Certificate is SUSPICIOUS. Some fields did not match exactly; manual review recommended.'
      }
    });
  } catch (error) {
    console.error('Certificate verify error:', error);
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
    }
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath) && uploadedPath !== originalPath) {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
    }
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
    const { documentType, uploaderName, title } = req.body;

    console.log(`\n📄 New document upload: ${originalname}`);
    console.log(`📦 File size: ${(size / 1024).toFixed(2)} KB`);

    // Step 1: Quick analysis for duplicate detection (before database save)
    console.log('🔍 Performing initial analysis...');
    const xaiResults = await xaiAnalyzer.analyzeDocument(filePath, {
      documentId: null, // No ID yet
      documentType: documentType || 'research_paper',
      originalName: originalname
    });

    // Step 1.5: Check blockchain first (source of truth for document existence)
    // IMPORTANT: If blockchain verification fails (throws), we reject the upload
    // instead of silently proceeding. This ensures documents already on-chain are
    // always caught, even if the node has a transient issue on this specific call.
    let chainVerification = null;
    console.log(`⛓️  Checking blockchain for document hash: ${xaiResults.documentHash}`);
    try {
      chainVerification = await blockchainConnector.verifyDocument(xaiResults.documentHash);
      console.log(`⛓️  Blockchain verifyDocument response:`, JSON.stringify(chainVerification, null, 2));
    } catch (chainCheckError) {
      console.error('❌❌❌ Blockchain verification threw an error:', chainCheckError.message);
      console.error('Full error details:', chainCheckError.stack || chainCheckError);
      fs.unlinkSync(filePath);
      return res.status(503).json({
        success: false,
        error: 'Blockchain verification unavailable',
        message: 'Could not verify document uniqueness on blockchain. The blockchain node may be down or the contract was redeployed. Upload rejected to prevent duplicate entries.',
        details: chainCheckError.message
      });
    }

    if (chainVerification?.exists) {
      console.log(`❌ BLOCKCHAIN REJECTION: document found on-chain (hash: ${xaiResults.documentHash})`);
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: 'Duplicate file detected',
        message: 'This exact document hash is already anchored on blockchain. Upload rejected.',
        exactMatch: {
          type: 'blockchain_hash',
          uploadedDocument: {
            name: originalname,
            hash: xaiResults.documentHash
          },
          existingDocument: {
            id: 'on-chain',
            name: chainVerification.documentName || originalname,
            hash: xaiResults.documentHash,
            uploadedAt: chainVerification.timestamp
              ? new Date(chainVerification.timestamp * 1000).toISOString()
              : new Date().toISOString()
          }
        },
        duplicateDocument: {
          id: 'on-chain',
          name: chainVerification.documentName || originalname,
          uploadedAt: chainVerification.timestamp
            ? new Date(chainVerification.timestamp * 1000).toISOString()
            : new Date().toISOString()
        }
      });
    }
    console.log('✅ Blockchain check passed — document not found on chain');

    // Step 1.6: If blockchain says not found, then check database
    console.log(`🔍 Checking database for document hash: ${xaiResults.documentHash}`);
    const existingDocByHash = await dbHandler.getDocumentByHash(xaiResults.documentHash);
    if (existingDocByHash) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: 'Duplicate file detected',
        message: 'This exact document already exists in the database. Upload rejected.',
        exactMatch: {
          type: 'document_hash',
          uploadedDocument: {
            name: originalname,
            hash: xaiResults.documentHash
          },
          existingDocument: {
            id: existingDocByHash.id,
            name: existingDocByHash.originalName || existingDocByHash.metadata?.original_name,
            hash: existingDocByHash.documentHash,
            uploadedAt: existingDocByHash.uploadedAt || existingDocByHash.uploaded_at
          }
        },
        duplicateDocument: {
          id: existingDocByHash.id,
          name: existingDocByHash.originalName || existingDocByHash.metadata?.original_name,
          uploadedAt: existingDocByHash.uploadedAt || existingDocByHash.uploaded_at
        }
      });
    }

    // Step 2: VECTOR-EMBEDDING-BASED SIMILARITY DETECTION
    console.log('✂️  Starting vector-embedding similarity detection...');
    let maxSimilarity = 0;
    let allMatches = [];
    let similarDocuments = [];
    let totalSections = 0;
    let originalChunkCount = 0;
    let matchedSectionCount = 0;
    let similaritySum = 0;
    const CANDIDATE_THRESHOLD = 0.4;
    const HYBRID_THRESHOLD = 0.45;
    const EMBEDDING_FAST_PATH_THRESHOLD = 0.7;
    let sectionBestSimilarities = [];

    try {
      const documentText = xaiResults.documentText || '';
      console.log(`📝 Extracted text length: ${documentText.length} characters`);

      if (documentText && documentText.length > 50 && chunkingService) {
        const allChunks = chunkingService.splitIntoChunks(documentText);
        originalChunkCount = allChunks.length;
        const currentChunks = allChunks.filter((chunk) => chunk.content && chunk.content.length >= 80);
        totalSections = currentChunks.length;
        console.log(`✂️  Split document into ${originalChunkCount} chunks (${totalSections} analyzed after length filter)`);

        console.log(`🔍 Finding candidates via embedding (threshold ${CANDIDATE_THRESHOLD}) + scoring via hybrid (embedding + word-overlap)`);
        const matchedSections = new Set();

        for (const chunk of currentChunks) {
          let matches = await chunkingService.findSimilarChunks(chunk.content, null, CANDIDATE_THRESHOLD);

          console.log(`\n  ┌─ Chunk #${chunk.index + 1} ──────────────────────────────`);
          console.log(`  │ Uploaded: "${chunk.content.substring(0, 80)}${chunk.content.length > 80 ? '...' : ''}"`);
          console.log(`  │ Found ${matches.length} embedding candidate(s)`);

          let bestHybridScore = 0;
          let bestMatchData = null;

          for (const match of matches) {
            const dbText = match.matched_chunk?.content || match.matched_text || '';
            const embeddingScore = match.embeddingSimilarity || 0;

            console.log(`  │`);
            console.log(`  │ DB match #${match.matched_chunk?.chunk_index || 0}: "${dbText.substring(0, 80)}${dbText.length > 80 ? '...' : ''}"`);
            console.log(`  │   embeddingSimilarity = ${embeddingScore.toFixed(4)}`);

            let wordOverlap = 0;
            if (embeddingScore < EMBEDDING_FAST_PATH_THRESHOLD) {
              console.log(`  │   phraseOverlap       = SKIPPED (fast path: embedding < ${EMBEDDING_FAST_PATH_THRESHOLD})`);
            } else {
              wordOverlap = calculatePhraseOverlap(chunk.content, dbText, true);
              console.log(`  │   phraseOverlap       = ${wordOverlap.toFixed(4)}`);
            }

            const hybridScore = 0.5 * embeddingScore + 0.5 * wordOverlap;
            console.log(`  │   hybridScore         = 0.5 × ${embeddingScore.toFixed(4)} + 0.5 × ${wordOverlap.toFixed(4)} = ${hybridScore.toFixed(4)}`);

            if (hybridScore >= bestHybridScore) {
              bestHybridScore = hybridScore;
              bestMatchData = {
                yourSection: chunk.index + 1,
                yourText: chunk.content,
                matchedSection: match.matched_chunk?.chunk_index || 0,
                matchedText: dbText,
                matchedDocument: match.source_document,
                matchedDocumentId: match.document_id,
                matchedTitle: match.matched_title || match.matched_metadata?.title || '',
                matchedAuthors: match.matched_authors || match.matched_metadata?.uploader_name || '',
                similarity: hybridScore,
                embeddingSimilarity: embeddingScore,
                coverageSimilarity: wordOverlap,
                similarityMode: embeddingScore < EMBEDDING_FAST_PATH_THRESHOLD
                  ? 'embedding-only-fast-path'
                  : 'hybrid-embedding-word-overlap',
                explanation: hybridScore > 0.8
                  ? 'Strong match via both semantic and lexical similarity.'
                  : hybridScore > 0.6
                  ? 'Good match combining semantic and word overlap.'
                  : hybridScore > 0.45
                  ? 'Moderate match from combined scoring.'
                  : 'Weak match within threshold.'
              };
            }
          }

          // Push only the SINGLE best match per uploaded chunk
          if (bestMatchData && bestHybridScore >= HYBRID_THRESHOLD) {
            allMatches.push(bestMatchData);
          }

          console.log(`  │`);
          console.log(`  │ 🏆 Best hybrid score for this chunk: ${bestHybridScore.toFixed(4)} (${(bestHybridScore * 100).toFixed(1)}%)`);
          console.log(`  └────────────────────────────────────────────────`);

          similaritySum += bestHybridScore;
          if (bestHybridScore >= HYBRID_THRESHOLD) {
            matchedSections.add(chunk.index);
          }

          sectionBestSimilarities.push({
            section: chunk.index + 1,
            bestSimilarityRaw: Number(bestHybridScore.toFixed(4)),
            bestSimilarityPct: Number((bestHybridScore * 100).toFixed(2)),
          });
        }

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 FINAL SIMILARITY CALCULATION:`);
        console.log(`   Total sections (chunks): ${totalSections}`);
        console.log(`   Similarity sum (bestHybridScore per chunk): ${similaritySum.toFixed(4)}`);
        console.log(`   Average hybrid similarity: ${similaritySum.toFixed(4)} / ${totalSections} = ${(similaritySum / totalSections).toFixed(4)}`);
        console.log(`   Percentage: ${(similaritySum / totalSections * 100).toFixed(1)}%`);
        console.log(`   Sections above threshold (${HYBRID_THRESHOLD}): ${matchedSections.size} / ${totalSections}`);
        console.log(`${'═'.repeat(60)}\n`);

        matchedSectionCount = matchedSections.size;
        console.log(`📊 Found ${allMatches.length} embedding-similar section matches`);

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

        if (Object.keys(docGroups).length > 0) {
          similarDocuments = Object.values(docGroups).map(doc => ({
            ...doc,
            average_similarity: doc.section_count > 0
              ? doc.total_similarity / doc.section_count
              : 0,
            original_name: doc.document_name
          })).sort((a, b) => b.average_similarity - a.average_similarity);

          maxSimilarity = similarDocuments[0]?.average_similarity || 0;
          allMatches = allMatches.sort((a, b) => b.similarity - a.similarity);

          console.log(`✅ Matching complete: ${(maxSimilarity * 100).toFixed(1)}% max embedding similarity`);
          console.log(`📄 Found ${allMatches.length} similar sections across ${similarDocuments.length} documents`);
        } else {
          console.log('✅ No similar documents found in database - appears original');
        }
      } else {
        console.log('⚠️  Database comparison skipped (PostgreSQL not configured or text too short)');
      }
    } catch (chunkError) {
      console.log('⚠️  Database comparison unavailable:', chunkError.message);
    }

    // Step 2.5: CHECK MATCH THRESHOLD (based on average embedding similarity)
    const SIMILARITY_THRESHOLD = 40;
    const similarityPercentage = maxSimilarity * 100;
    const matchedPortionPercentage = totalSections > 0
      ? Number(((similaritySum / totalSections) * 100).toFixed(2))
      : 0;

    const coverageThresholds = [20, 25, 30, 40, 50, 60, 70, 80, 90];
    const thresholdCoverage = {};
    coverageThresholds.forEach((thresholdPct) => {
      const thresholdRaw = thresholdPct / 100;
      const coveredSections = sectionBestSimilarities.filter(
        (sectionScore) => (sectionScore.bestSimilarityRaw || 0) >= thresholdRaw
      ).length;
      const coveredSimilarity = sectionBestSimilarities.reduce(
        (sum, sectionScore) => sum + Math.max(sectionScore.bestSimilarityRaw || 0, thresholdRaw),
        0
      );
      thresholdCoverage[String(thresholdPct)] = {
        coveredSections,
        matchedPortionPercentage: totalSections > 0
          ? Number(((coveredSimilarity / totalSections) * 100).toFixed(2))
          : 0
      };
    });

    if (matchedPortionPercentage > SIMILARITY_THRESHOLD) {
      fs.unlinkSync(filePath);

      console.log(`❌ UPLOAD REJECTED: ${matchedPortionPercentage.toFixed(1)}% average hybrid similarity (threshold ${SIMILARITY_THRESHOLD}%)`);

      const topMatches = allMatches.slice(0, 10);

      const perSectionMatches = {};
      for (const m of allMatches) {
        const sec = m.yourSection || m.yourSection === 0 ? m.yourSection : null;
        if (sec === null) continue;
        if (!perSectionMatches[sec]) perSectionMatches[sec] = [];
        perSectionMatches[sec].push({
          yourText: m.yourText,
          matchedText: m.matchedText,
          matchedDocument: m.matchedDocument,
          matchedDocumentId: m.matchedDocumentId,
          matchedTitle: m.matchedTitle || '',
          matchedAuthors: m.matchedAuthors || '',
          similarity: m.similarity,
          embeddingSimilarity: m.embeddingSimilarity
        });
      }

      const originalSections = totalSections - matchedSectionCount;
      const originalPercentage = totalSections > 0
        ? Number(((originalSections / totalSections) * 100).toFixed(2))
        : 0;
      const matchedPercentage = Number(matchedPortionPercentage.toFixed(2));

      let rejectionAuthorshipLevel = 'Low';
      if (originalPercentage >= 80) rejectionAuthorshipLevel = 'High';
      else if (originalPercentage >= 60) rejectionAuthorshipLevel = 'Moderate';

      const rejectionContributors = similarDocuments.map(doc => {
        const contribPct = totalSections > 0
          ? Number(((doc.section_count / totalSections) * 100).toFixed(2))
          : 0;
        return {
          documentId: doc.document_id,
          documentName: doc.document_name || doc.original_name || 'Unknown',
          authors: (doc.matches && doc.matches[0] && doc.matches[0].matchedAuthors) || '',
          similarSections: doc.section_count,
          averageSimilarity: (doc.average_similarity * 100).toFixed(1) + '%',
          contributionPercentage: contribPct
        };
      });

      return res.status(400).json({
        success: false,
        error: 'Upload rejected - High similarity detected',
        message: `Upload failed: ${matchedPortionPercentage.toFixed(1)}% hybrid similarity (embedding + word overlap) with existing stored documents. Threshold is ${SIMILARITY_THRESHOLD}%.`,
        similarity: {
          totalSections,
          originalChunkCount,
          matchedSections: matchedSectionCount,
          matchedPortionPercentage: Number(matchedPortionPercentage.toFixed(2)),
          sectionBestSimilarities,
          thresholdCoverage,
          perSectionMatches,
          topMatches,
          matchedDocuments: similarDocuments.map(doc => ({
            documentId: doc.document_id,
            documentName: doc.document_name || doc.original_name || 'Unknown',
            similarity: (doc.average_similarity * 100).toFixed(1) + '%',
            matchingChunks: doc.section_count
          }))
        },
        authorship: {
          totalSections,
          originalSections,
          matchedSections: matchedSectionCount,
          originalPercentage,
          matchedPercentage,
          authorshipLevel: rejectionAuthorshipLevel,
          contributors: rejectionContributors
        }
      });
    }

    xaiResults.plagiarismCheck = {
      isPlagiarized: matchedPortionPercentage > SIMILARITY_THRESHOLD,
      similarityScore: matchedPortionPercentage,
      matchedPortionPercentage,
      averageSimilarityPercentage: similarityPercentage,
      threshold: SIMILARITY_THRESHOLD,
      matchedDocuments: similarDocuments,
      similarSections: allMatches.length,
      explanation: matchedPortionPercentage > SIMILARITY_THRESHOLD
        ? `Document rejected: ${matchedPortionPercentage.toFixed(1)}% average hybrid similarity (threshold ${SIMILARITY_THRESHOLD}%)`
        : allMatches.length > 0
        ? `Found ${allMatches.length} similar sections. Average hybrid similarity: ${matchedPortionPercentage.toFixed(1)}%`
        : 'No similar content found - appears original',
      comparisonMethod: 'hybrid-embedding-word-overlap'
    };

    xaiResults.embeddingMatchResults = {
      totalMatches: allMatches.length,
      documents: similarDocuments.map(doc => ({
        documentId: doc.document_id,
        documentName: doc.document_name || doc.original_name,
        averageSimilarity: (doc.average_similarity * 100).toFixed(1) + '%',
        similarSections: doc.section_count,
        matches: doc.matches
      })),
      topMatches: allMatches.slice(0, 10),
      totalSections,
      matchedSections: matchedSectionCount,
      matchedPortionPercentage: matchedPortionPercentage.toFixed(1),
      sectionBestSimilarities,
      thresholdCoverage
    };

    const acceptedPerSectionMatches = {};
    for (const m of allMatches) {
      const sec = m.yourSection;
      if (sec === null || sec === undefined) continue;
      if (!acceptedPerSectionMatches[sec]) acceptedPerSectionMatches[sec] = [];
      acceptedPerSectionMatches[sec].push({
        yourText: m.yourText,
        matchedText: m.matchedText,
        matchedDocument: m.matchedDocument,
        matchedDocumentId: m.matchedDocumentId,
        matchedTitle: m.matchedTitle || '',
        matchedAuthors: m.matchedAuthors || '',
        similarity: m.similarity,
        embeddingSimilarity: m.embeddingSimilarity,
        coverageSimilarity: m.coverageSimilarity
      });
    }
    xaiResults.embeddingMatchResults.perSectionMatches = acceptedPerSectionMatches;

    const originalSections = totalSections - matchedSectionCount;
    const originalPercentage = totalSections > 0
      ? Number(((originalSections / totalSections) * 100).toFixed(2))
      : 100;
    const matchedPercentage = Number((100 - originalPercentage).toFixed(2));

    let authorshipLevel = 'High';
    if (originalPercentage < 60) authorshipLevel = 'Low';
    else if (originalPercentage < 80) authorshipLevel = 'Moderate';

    const contributors = similarDocuments.map(doc => {
      const contributionPct = totalSections > 0
        ? Number(((doc.section_count / totalSections) * 100).toFixed(2))
        : 0;
      return {
        documentId: doc.document_id,
        documentName: doc.document_name || doc.original_name || 'Unknown',
        authors: (doc.matches && doc.matches[0] && doc.matches[0].matchedAuthors) || '',
        similarSections: doc.section_count,
        averageSimilarity: (doc.average_similarity * 100).toFixed(1) + '%',
        contributionPercentage: contributionPct
      };
    });

    const authorship = {
      totalSections,
      originalSections,
      matchedSections: matchedSectionCount,
      originalPercentage,
      matchedPercentage,
      authorshipLevel,
      contributors
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
      title: title || '',
      status: xaiResults.status,
      documentHash: xaiResults.documentHash
    });

    console.log(`✅ Document saved to database with ID: ${documentRecord.id}`);

    // Step 3.5: Now save chunks to database
    if (
      xaiResults.documentText &&
      xaiResults.documentText.length > 50 &&
      chunkingService &&
      dbHandler.usePostgres
    ) {
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
    } else if (xaiResults.documentText && xaiResults.documentText.length > 50 && !dbHandler.usePostgres) {
      console.log('ℹ️  Skipping chunk save: PostgreSQL not configured');
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
    console.log(`📤 Final response values: originalChunkCount=${originalChunkCount}, totalSections=${totalSections}, matchedSections=${matchedSectionCount}`);
    res.json({
      success: true,
      data: {
        documentId: documentRecord.id,
        originalName: originalname,
        blockchain: blockchainData,
        xaiAnalysis: xaiResults,
        similarity: {
          totalSections,
          originalChunkCount,
          matchedSections: matchedSectionCount,
          matchedPortionPercentage: matchedPortionPercentage.toFixed(1),
          sectionBestSimilarities,
          perSectionMatches: acceptedPerSectionMatches,
          matchedDocuments: similarDocuments.map(doc => ({
            documentId: doc.document_id,
            documentName: doc.document_name || doc.original_name || 'Unknown',
            similarity: (doc.average_similarity * 100).toFixed(1) + '%',
            matchingChunks: doc.section_count
          })),
          topMatches: allMatches.slice(0, 10)
        },
        authorship,
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

function startServer(port, retriesLeft = 5) {
  const server = app.listen(port, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 INTEGRATED SERVER RUNNING`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📡 Server: http://localhost:${port}`);
    console.log(`⛓️  Blockchain: Connected`);
    console.log(`🤖 XAI: Enabled`);
    console.log(`💾 Database: Ready`);
    console.log(`${'='.repeat(60)}\n`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && retriesLeft > 0) {
      const nextPort = port + 1;
      console.warn(`⚠️  Port ${port} is in use, trying ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }

    console.error('❌ Server startup error:', error.message);
    process.exit(1);
  });
}

// Start server
initializeServices().then(() => {
  startServer(BASE_PORT);
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
