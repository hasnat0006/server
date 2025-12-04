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
    const result = await searchDocument({ buffer: req.file.buffer });
    res.json(result);
  } catch (error) {
    console.error(error);
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