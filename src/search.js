import pool from './Database/db.js';
import { extractTextFromPdf } from './ingest.js';
import { chunkText, normalize, sha256 } from './util.js';

export async function searchDocument({ buffer }) {
  const rawText = await extractTextFromPdf(buffer);
  const normalized = normalize(rawText);
  if (!normalized) {
    return { matchType: 'fuzzy_trigram', results: [] };
  }

  const docHash = sha256(normalized);
  const existing = await pool.query(
    'SELECT id FROM documents WHERE doc_hash = $1',
    [docHash]
  );
  if (existing.rows.length > 0) {
    return { matchType: 'document', docId: existing.rows[0].id, score: 1.0 };
  }

  const chunks = chunkText(normalized);
  if (!chunks.length) {
    return { matchType: 'fuzzy_trigram', results: [] };
  }

  const chunkHashes = chunks.map((chunk) => sha256(chunk));
  const exactMatchRows = await pool.query(
    'SELECT document_id, COUNT(*) AS matched_chunks FROM chunks WHERE chunk_hash = ANY($1::text[]) GROUP BY document_id',
    [chunkHashes]
  );

  if (exactMatchRows.rows.length > 0) {
    const docIds = exactMatchRows.rows.map((row) => row.document_id);
    const chunkCountsRows = await pool.query(
      'SELECT document_id, COUNT(*) AS chunk_count FROM chunks WHERE document_id = ANY($1::int[]) GROUP BY document_id',
      [docIds]
    );

    const chunkCountMap = new Map(chunkCountsRows.rows.map((row) => [row.document_id, Number(row.chunk_count)]));

    const results = exactMatchRows.rows
      .map((row) => {
        const matchedChunks = Number(row.matched_chunks);
        const docId = row.document_id;
        const chunkCount = chunkCountMap.get(docId) ?? 0;
        const score = chunkHashes.length ? matchedChunks / chunkHashes.length : 0;
        return { docId, matchedChunks, chunkCount, score };
      })
      .sort((a, b) => b.score - a.score);

    return { matchType: 'exact_chunks', results };
  }

  const fuzzyMap = new Map();
  for (const chunk of chunks) {
    const fuzzyRows = await pool.query(
      'SELECT document_id, similarity(chunk_text, $1) AS sim FROM chunks WHERE chunk_text % $1 ORDER BY sim DESC LIMIT 5',
      [chunk]
    );
    for (const row of fuzzyRows.rows) {
      const docId = row.document_id;
      const sim = Number(row.sim ?? 0);
      const entry = fuzzyMap.get(docId) ?? { matchedChunks: 0, similarity: 0 };
      entry.matchedChunks += 1;
      entry.similarity += sim;
      fuzzyMap.set(docId, entry);
    }
  }

  const fuzzyResults = Array.from(fuzzyMap.entries())
    .map(([docId, entry]) => ({
      docId,
      matchedChunks: entry.matchedChunks,
      score: entry.similarity / entry.matchedChunks
    }))
    .sort((a, b) => b.score - a.score);

  return { matchType: 'fuzzy_trigram', results: fuzzyResults };
}
