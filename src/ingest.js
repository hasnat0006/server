import { createRequire } from 'node:module';
import pool from './Database/db.js';
import { chunkText, normalize, sha256 } from './util.js';

const require = createRequire(import.meta.url);
const domMatrixPolyfill = require('dommatrix');
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = domMatrixPolyfill.default ?? domMatrixPolyfill;
}

if (typeof globalThis.ImageData === 'undefined') {
  class NodeImageData {
    constructor(arg1, arg2, arg3) {
      if (typeof arg1 === 'number') {
        const width = arg1;
        const height = typeof arg2 === 'number' ? arg2 : 0;
        if (width <= 0 || height <= 0) {
          throw new TypeError('ImageData width/height must be positive numbers');
        }
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      } else {
        if (typeof arg2 !== 'number' || typeof arg3 !== 'number') {
          throw new TypeError('ImageData width/height must be provided');
        }
        this.width = arg2;
        this.height = arg3;
        const array = arg1 instanceof Uint8ClampedArray
          ? arg1
          : new Uint8ClampedArray(arg1);
        if (array.length !== this.width * this.height * 4) {
          throw new RangeError('ImageData buffer length mismatch');
        }
        this.data = array;
      }
    }
  }
  globalThis.ImageData = NodeImageData;
}

if (typeof globalThis.Path2D === 'undefined') {
  class NodePath2D {
    constructor(path) {
      this._path = path;
    }

    addPath() {}
    moveTo() {}
    closePath() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    rect() {}
  }
  globalThis.Path2D = NodePath2D;
}

const pdfParse = require('pdf-parse');

export async function extractTextFromPdf(buffer) {
  const { text } = await pdfParse(buffer);
  console.log(`Extracted text length: ${text.length} characters`);
  return text;
}

export async function ingestDocument({ buffer, filename }) {
  try {
    console.log(`Starting PDF extraction for: ${filename}`);
    const rawText = await extractTextFromPdf(buffer);
    console.log(`Extracted ${rawText.length} characters from PDF`);
    
    const normalizedText = normalize(rawText);
    console.log(`Normalized text length: ${normalizedText.length} characters`);
    
    const docHash = sha256(normalizedText);

    const existing = await pool.query(
      'SELECT id FROM documents WHERE doc_hash = $1',
      [docHash]
    );
    if (existing.rows.length > 0) {
      console.log(`Document already exists with id: ${existing.rows[0].id}`);
      return { status: 'duplicate', id: existing.rows[0].id };
    }

    const insertDoc = await pool.query(
      'INSERT INTO documents (filename, doc_hash, num_pages, metadata) VALUES ($1, $2, NULL, $3) RETURNING id',
      [filename, docHash, JSON.stringify({})]
    );
    const documentId = insertDoc.rows[0].id;
    console.log(`Created document with id: ${documentId}`);

    const chunks = chunkText(normalizedText);
    console.log(`Split into ${chunks.length} chunks`);
    let chunkCount = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunkTextValue = chunks[index];
      const chunkHash = sha256(chunkTextValue);

      const chunkExists = await pool.query(
        'SELECT id FROM chunks WHERE chunk_hash = $1',
        [chunkHash]
      );
      if (chunkExists.rows.length > 0) {
        console.log(`Chunk ${index} already exists, skipping`);
        continue;
      }

      const tokenCount = chunkTextValue.split(' ').filter(Boolean).length;
      try {
        await pool.query(
          'INSERT INTO chunks (document_id, chunk_index, chunk_text, chunk_hash, token_count) VALUES ($1, $2, $3, $4, $5)',
          [documentId, index, chunkTextValue, chunkHash, tokenCount]
        );
        chunkCount += 1;
      } catch (chunkError) {
        console.error(`Error inserting chunk ${index}:`, chunkError.message);
        throw chunkError;
      }
    }

    console.log(`Successfully inserted ${chunkCount} chunks`);
    return { status: 'imported', id: documentId, chunkCount };
  } catch (error) {
    console.error('Error in ingestDocument:', error);
    throw error;
  }
}
