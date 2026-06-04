const fs = require('fs');
const path = require('path');
const DocumentParser = require('../../utils/document-parser');

let tesseract = null;
try {
  tesseract = require('tesseract.js');
} catch (_) {
  tesseract = null;
}

const TESSERACT_LANGS = process.env.TESSERACT_LANGS || 'eng';

async function extractTextFromImage(filePath) {
  if (!tesseract) {
    throw new Error('tesseract.js is not installed. Run: npm install tesseract.js');
  }
  const result = await tesseract.recognize(filePath, TESSERACT_LANGS);
  return {
    text: (result?.data?.text || '').trim(),
    confidence: typeof result?.data?.confidence === 'number' ? result.data.confidence : null,
    engine: 'tesseract'
  };
}

async function extractTextFromPdf(filePath) {
  const text = await DocumentParser.parseDocument(filePath);
  return { text: (text || '').trim(), confidence: null, engine: 'pdf-parse' };
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return extractTextFromPdf(filePath);
  }
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return extractTextFromImage(filePath);
  }
  return { text: fs.readFileSync(filePath, 'utf8'), confidence: null, engine: 'raw' };
}

module.exports = { extractText, extractTextFromImage, extractTextFromPdf };
