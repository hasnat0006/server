import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestDocument } from './ingest.js';
import { searchDocument } from './search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
});

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve the upload page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'upload.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  try {
    console.log(`Received file: ${req.file.originalname}, size: ${req.file.size} bytes`);
    const result = await ingestDocument({
      buffer: req.file.buffer,
      filename: req.file.originalname || 'uploaded'
    });
    console.log(`Ingestion result: ${JSON.stringify(result)}`);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'internal server error' });
  }
});

app.post('/check', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  try {
    const result = await searchDocument({ buffer: req.file.buffer, documentType: 'auto' });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Academic document check endpoint
app.post('/check/academic', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  try {
    console.log(`Academic check for: ${req.file.originalname}`);
    const result = await searchDocument({ buffer: req.file.buffer, documentType: 'academic' });
    res.json(result);
  } catch (error) {
    console.error('Academic check error:', error);
    res.status(500).json({ error: 'internal server error' });
  }
});

// University certificate upload endpoint (trusted source)
app.post('/certificate/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  try {
    const { universityName, studentName, certificateType, issueDate } = req.body;
    console.log(`University certificate upload: ${req.file.originalname}`);
    console.log(`University: ${universityName}, Student: ${studentName}`);
    
    const result = await ingestDocument({
      buffer: req.file.buffer,
      filename: req.file.originalname || 'certificate',
      metadata: {
        type: 'certificate',
        source: 'university',
        universityName,
        studentName,
        certificateType,
        issueDate,
        uploadedAt: new Date().toISOString()
      }
    });
    
    res.json({
      ...result,
      message: 'Certificate uploaded successfully as authentic source',
      metadata: { universityName, studentName, certificateType, issueDate }
    });
  } catch (error) {
    console.error('Certificate upload error:', error);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Company certificate verification endpoint
app.post('/certificate/verify', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  try {
    const { companyName, applicantName } = req.body;
    console.log(`Company verification request: ${req.file.originalname}`);
    console.log(`Company: ${companyName}, Applicant: ${applicantName}`);
    
    const result = await searchDocument({ 
      buffer: req.file.buffer, 
      documentType: 'verification'
    });
    
    res.json({
      ...result,
      verificationRequest: {
        companyName,
        applicantName,
        verifiedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Certificate verification error:', error);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Legacy verification endpoint (kept for backward compatibility)
app.post('/check/verification', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  try {
    console.log(`Verification check for: ${req.file.originalname}`);
    const result = await searchDocument({ buffer: req.file.buffer, documentType: 'verification' });
    res.json(result);
  } catch (error) {
    console.error('Verification check error:', error);
    res.status(500).json({ error: 'internal server error' });
  }
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`doc-checker listening on port ${port}`);
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});