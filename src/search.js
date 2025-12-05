import pool from './Database/db.js';
import { extractTextFromPdf } from './ingest.js';
import { chunkText, normalize, sha256 } from './util.js';
import { XAIAnalyzer } from './xai/xaiAnalyzer.js';

export async function searchDocument({ buffer, documentType = 'auto' }) {
  const rawText = await extractTextFromPdf(buffer);
  const normalized = normalize(rawText);
  if (!normalized) {
    return { matchType: 'fuzzy_trigram', results: [], xaiAnalysis: null };
  }

  // Auto-detect document type if not specified
  if (documentType === 'auto') {
    documentType = detectDocumentType(normalized);
  }

  const docHash = sha256(normalized);
  const existing = await pool.query(
    'SELECT id, filename FROM documents WHERE doc_hash = $1',
    [docHash]
  );
  if (existing.rows.length > 0) {
    return { 
      matchType: 'document', 
      docId: existing.rows[0].id, 
      filename: existing.rows[0].filename,
      score: 1.0,
      explanation: 'This document is an exact duplicate (100% match). The entire content matches byte-for-byte.'
    };
  }

  const chunks = chunkText(normalized);
  if (!chunks.length) {
    return { matchType: 'fuzzy_trigram', results: [] };
  }

  const chunkHashes = chunks.map((chunk, index) => ({ hash: sha256(chunk), text: chunk, index }));
  
  // Get exact chunk matches with details
  const exactMatchRows = await pool.query(
    `SELECT c.document_id, c.chunk_index, c.chunk_text, c.chunk_hash, d.filename 
     FROM chunks c 
     JOIN documents d ON c.document_id = d.id 
     WHERE c.chunk_hash = ANY($1::text[])`,
    [chunkHashes.map(ch => ch.hash)]
  );

  if (exactMatchRows.rows.length > 0) {
    // Group by document
    const docMatches = new Map();
    
    for (const row of exactMatchRows.rows) {
      const docId = row.document_id;
      if (!docMatches.has(docId)) {
        docMatches.set(docId, {
          docId,
          filename: row.filename,
          matches: []
        });
      }
      
      // Find which uploaded chunk matched
      const uploadedChunk = chunkHashes.find(ch => ch.hash === row.chunk_hash);
      
      docMatches.get(docId).matches.push({
        uploadedChunkIndex: uploadedChunk?.index ?? -1,
        uploadedChunkText: uploadedChunk?.text ?? '',
        matchedChunkIndex: row.chunk_index,
        matchedChunkText: row.chunk_text,
        matchType: 'exact',
        similarity: 1.0
      });
    }

    // Get total chunk counts for each document
    const docIds = Array.from(docMatches.keys());
    const chunkCountsRows = await pool.query(
      'SELECT document_id, COUNT(*) AS chunk_count FROM chunks WHERE document_id = ANY($1::int[]) GROUP BY document_id',
      [docIds]
    );
    const chunkCountMap = new Map(chunkCountsRows.rows.map((row) => [row.document_id, Number(row.chunk_count)]));

    const results = Array.from(docMatches.values())
      .map((doc) => {
        const chunkCount = chunkCountMap.get(doc.docId) ?? 0;
        const score = chunks.length ? doc.matches.length / chunks.length : 0;
        return { 
          docId: doc.docId,
          filename: doc.filename,
          matchedChunks: doc.matches.length,
          chunkCount,
          score,
          matches: doc.matches.slice(0, 10), // Return top 10 matches
          totalMatches: doc.matches.length
        };
      })
      .sort((a, b) => b.score - a.score);

    return { matchType: 'exact_chunks', results };
  }

  const fuzzyMap = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fuzzyRows = await pool.query(
      `SELECT c.document_id, c.chunk_index, c.chunk_text, d.filename, similarity(c.chunk_text, $1) AS sim 
       FROM chunks c 
       JOIN documents d ON c.document_id = d.id 
       WHERE c.chunk_text % $1 
       ORDER BY sim DESC 
       LIMIT 3`,
      [chunk]
    );
    
    for (const row of fuzzyRows.rows) {
      const docId = row.document_id;
      const sim = Number(row.sim ?? 0);
      
      if (!fuzzyMap.has(docId)) {
        fuzzyMap.set(docId, {
          docId,
          filename: row.filename,
          matches: [],
          totalSimilarity: 0
        });
      }
      
      const entry = fuzzyMap.get(docId);
      entry.matches.push({
        uploadedChunkIndex: i,
        uploadedChunkText: chunk.substring(0, 200) + '...',
        matchedChunkIndex: row.chunk_index,
        matchedChunkText: row.chunk_text.substring(0, 200) + '...',
        matchType: 'fuzzy',
        similarity: sim
      });
      entry.totalSimilarity += sim;
    }
  }

  const fuzzyResults = Array.from(fuzzyMap.values())
    .map((doc) => ({
      docId: doc.docId,
      filename: doc.filename,
      matchedChunks: doc.matches.length,
      score: doc.matches.length ? doc.totalSimilarity / doc.matches.length : 0,
      matches: doc.matches.slice(0, 10), // Return top 10 fuzzy matches
      totalMatches: doc.matches.length
    }))
    .sort((a, b) => b.score - a.score);

  const matchResults = { matchType: 'fuzzy_trigram', results: fuzzyResults };

  // Generate XAI analysis based on document type
  const xaiAnalysis = generateXAIAnalysis(normalized, matchResults, documentType);

  return { ...matchResults, xaiAnalysis, detectedDocumentType: documentType };
}

/**
 * Auto-detect document type based on content
 */
function detectDocumentType(text) {
  const wordCount = text.split(/\s+/).length;
  
  // Short documents (< 500 words) are likely verification documents
  if (wordCount < 500) {
    return 'verification';
  }
  
  // Check for academic indicators
  const academicIndicators = [
    /\b(abstract|introduction|methodology|results|discussion|conclusion)\b/i,
    /\b(research|study|analysis|hypothesis|experiment)\b/i,
    /\[[0-9]+\]/,  // Citations
    /\b(et al\.|ibid|op\. cit\.)\b/i
  ];
  
  const academicScore = academicIndicators.filter(pattern => pattern.test(text)).length;
  
  // Check for verification document indicators
  const verificationIndicators = [
    /\b(certificate|certification|diploma|degree)\b/i,
    /\b(passport|identification|national id)\b/i,
    /\b(hereby|certify|authorized|issued|valid)\b/i,
    /\b[A-Z]{2,}\d{5,}\b/,  // Serial numbers
    /\b(seal|stamp|signature|emblem)\b/i
  ];
  
  const verificationScore = verificationIndicators.filter(pattern => pattern.test(text)).length;
  
  // Decision based on scores
  if (verificationScore > academicScore) {
    return 'verification';
  } else if (academicScore > 0 || wordCount > 1000) {
    return 'academic';
  } else {
    return 'verification'; // Default for short documents
  }
}

/**
 * Generate XAI analysis with explanations
 */
function generateXAIAnalysis(text, matchResults, documentType) {
  try {
    if (documentType === 'academic') {
      return XAIAnalyzer.analyzeAcademicDocument(text, matchResults);
    } else {
      return XAIAnalyzer.analyzeVerificationDocument(text, matchResults);
    }
  } catch (error) {
    console.error('XAI Analysis Error:', error);
    return {
      error: 'XAI analysis failed',
      documentType,
      message: error.message
    };
  }
}
