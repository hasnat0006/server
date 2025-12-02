import { PDFParser } from 'pdf2json';
import pool from './Database/db.js';
import { chunkText, normalize, sha256 } from './util.js';

export async function extractTextFromPdf(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    const timeout = setTimeout(() => {
      reject(new Error('PDF parsing timed out after 60 seconds'));
    }, 60000);

    pdfParser.on('pdfParser_dataError', errData => {
      clearTimeout(timeout);
      console.error('PDF Parser Error:', errData.parserError);
      reject(errData.parserError);
    });

    pdfParser.on('pdfParser_dataReady', pdfData => {
      clearTimeout(timeout);
      console.log('PDF Parser Data Ready');
      try {
        console.log('PDF Data Keys:', Object.keys(pdfData));
        let text = '';

        // Extract text from all pages
        if (pdfData && pdfData.Pages) {
          pdfData.Pages.forEach(page => {
            if (page.Texts) {
              page.Texts.forEach(textItem => {
                if (textItem.R) {
                  textItem.R.forEach(r => {
                    if (r.T) {
                      text += decodeURIComponent(r.T) + ' ';
                    }
                  });
                }
              });
              text += '\n';
            }
          });
        }

        console.log(`Extracted text length: ${text.length} characters`);
        console.log('--- FULL EXTRACTED TEXT START ---');
        console.log(text);
        console.log('--- FULL EXTRACTED TEXT END ---');
        console.log(`Extracted text preview: ${text.slice(0, 200)}...`);
        resolve(text);
      } catch (e) {
        console.error('Error processing PDF data:', e);
        reject(e);
      }
    });

    console.log('Starting parseBuffer...');
    pdfParser.parseBuffer(buffer);
  });
}


export async function ingestDocument({ buffer, filename }) {
  try {
    console.log(`Starting PDF extraction for: ${filename}`);
    const rawText = await extractTextFromPdf(buffer);
    console.log(`Extracted ${rawText.length} characters from PDF`);

    const normalizedText = normalize(rawText);
    console.log(`Normalized text length: ${normalizedText.length} characters`);

    const docHash = sha256(normalizedText);
    console.log(`Computed document hash: ${docHash}`);

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
