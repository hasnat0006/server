const crypto = require('crypto');
const embeddingService = require('./embedding-service');

class ChunkingService {
  constructor(dbHandler) {
    this.dbHandler = dbHandler;
  }

  setOptions(options = {}) {
    this.options = Object.assign({
      embeddingThreshold: 0.25,
      maxResults: 20,
      minQueryTokens: 5
    }, options || {});
  }

  isDOI(text) {
    if (!text) return false;
    const t = text.trim();
    if (/^\s*doi\s*[:]?/i.test(t)) return true;
    if (/\b10\.\d{2,}(?:\/\S*)?\b/i.test(t)) return true;
    return false;
  }

  tokenCount(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Split text into sentence-level chunks, excluding the references section.
   */
  splitIntoChunks(text) {
    const chunks = [];
    let chunkIndex = 0;
    let input = (text || '').trim();
    if (!input) return chunks;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 SENTENCE-LEVEL CHUNKING STARTED`);
    console.log(`${'='.repeat(60)}`);

    // Detect and strip the references/bibliography section using multi-strategy detection
    input = this.stripReferencesSection(input);

    // Match sentences: anything up to and including . ! or ?
    const sentenceRe = /[^.!?]*[.!?]/g;
    let match;
    let lastIndex = 0;

    while ((match = sentenceRe.exec(input)) !== null) {
      lastIndex = match.index + match[0].length;
      const sentence = match[0].trim();
      if (!sentence) continue;

      const chunk = {
        index: chunkIndex,
        content: sentence,
        start: null,
        end: null,
        length: sentence.length
      };
      chunks.push(chunk);

      const preview = sentence.length > 90 ? sentence.substring(0, 87) + '...' : sentence;
      console.log(`  📝 Chunk #${chunkIndex} (${sentence.length} chars): "${preview}"`);
      chunkIndex++;
    }

    // Remaining text after last sentence-ending punctuation
    const remaining = input.substring(lastIndex).trim();
    if (remaining) {
      const chunk = {
        index: chunkIndex,
        content: remaining,
        start: null,
        end: null,
        length: remaining.length
      };
      chunks.push(chunk);

      const preview = remaining.length > 90 ? remaining.substring(0, 87) + '...' : remaining;
      console.log(`  📝 Chunk #${chunkIndex} (${remaining.length} chars): "${preview}"`);
      chunkIndex++;
    }

    console.log(`📊 Total sentence-chunks created: ${chunks.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return chunks;
  }

  /**
   * Detect and strip the references/bibliography section from text.
   * Uses multiple strategies:
   *   1. Strong header line detection (numbered prefixes, all caps, colons, dashes, variations)
   *   2. Citation-density fallback when no explicit header is found
   * Returns the text with everything from the references section (inclusive) removed.
   */
  stripReferencesSection(text) {
    if (!text) return text;

    const normalized = text.replace(/\r\n?/g, '\n');
    let lines = normalized.split('\n');

    const preprocessed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        preprocessed.push(line);
        continue;
      }

      const isFragment = /^[A-Za-z]{1,3}$/.test(line);
      if (isFragment && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next && /^[A-Za-z]/.test(next)) {
          preprocessed.push(line + next);
          i++;
          continue;
        }
      }

      preprocessed.push(line);
    }
    lines = preprocessed;

    const refKeywords = [
      'References',
      'Bibliography',
      'Works Cited',
      'Work Cited',
      'Literature Cited',
      'Citations',
      'Citation',
      'Reference List',
      'References and Notes',
      'Reference and Notes',
      'Cited Works',
      'Bibliographical References',
      'Sources',
      'Reference and Bibliography',
      'References and Bibliography',
      'Suggested Reading',
      'Further Reading'
    ];

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keywordAlternation = refKeywords
      .map(k => escapeRegex(k).replace(/\s+/g, '\\s+'))
      .join('|');

    const headerRe = new RegExp(
      '^\\s*(?:#{1,6}\\s+|\\d{1,3}(?:\\.\\d+)*\\.?|[IVXLCDM]+\\.?|[A-Z]\\.?|\\(\\d+\\)|\\([a-z]\\))?\\s*' +
      '(?:' + keywordAlternation + ')' +
      '\\s*[:.\\-—]?\\s*$',
      'i'
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (headerRe.test(line)) {
        const beforeHeader = lines.slice(0, i).join('\n').trim();
        console.log(`📚 Reference header detected at line ${i + 1}: "${line}" — excluding from chunking`);
        return beforeHeader;
      }
    }

    const totalLines = lines.length;
    if (totalLines < 8) return text;

    const startSearch = Math.floor(totalLines * 0.5);
    const citationMarkerRe = /^\s*(?:\[\d+\]|\(\d+\)|\d+\.)\s/;
    const inlineCitationRe = /(?:https?:\/\/|doi:|10\.\d{4,9}\/|\bvol\.?\s*\d+|\bpp?\.?\s*\d+|\bno\.?\s*\d+)/i;
    const yearRe = /\b(?:19|20)\d{2}\b/;

    let consecutiveCitations = 0;
    let firstCitationLine = -1;
    const minConsecutive = 3;

    for (let i = startSearch; i < totalLines; i++) {
      const line = lines[i].trim();
      if (!line) {
        consecutiveCitations = 0;
        firstCitationLine = -1;
        continue;
      }

      const hasCitationMarker = citationMarkerRe.test(line);
      const hasInlineCitation = inlineCitationRe.test(line) && yearRe.test(line);

      if (hasCitationMarker || hasInlineCitation) {
        if (firstCitationLine === -1) firstCitationLine = i;
        consecutiveCitations++;
        if (consecutiveCitations >= minConsecutive) {
          const beforeRefs = lines.slice(0, firstCitationLine).join('\n').trim();
          console.log(`📚 Reference section detected by citation pattern starting at line ${firstCitationLine + 1} — excluding from chunking`);
          return beforeRefs;
        }
      } else {
        consecutiveCitations = 0;
        firstCitationLine = -1;
      }
    }

    return text;
  }

  /**
   * Create simple embedding (word frequency based)
   */
  createSimpleEmbedding(text) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordFreq = {};

    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    const embedding = new Array(100).fill(0);
    sortedWords.forEach(([word, freq], idx) => {
      embedding[idx] = freq / words.length;
    });

    return embedding;
  }

  /**
   * Process document and store chunks
   */
  async processDocument(documentId, documentText, metadata = {}) {
    try {
      console.log(`📄 Processing document ${documentId} for chunking...`);

      const chunks = this.splitIntoChunks(documentText);
      console.log(`✂️  Split into ${chunks.length} chunks`);

      // Batch generate all embedding vectors
      const chunkTexts = chunks.map(c => c.content);
      const embeddingVectors = await embeddingService.embedTexts(chunkTexts);

      const storedChunks = [];
      const savePromises = chunks.map(async (chunk, index) => {
        const embedding = this.createSimpleEmbedding(chunk.content);
        const embeddingVector = embeddingVectors[index];
        const chunkHash = crypto.createHash('sha256').update(chunk.content).digest('hex');

        const chunkData = {
          document_id: documentId,
          chunk_index: chunk.index,
          chunk_text: chunk.content,
          chunk_hash: chunkHash,
          token_count: chunk.content.split(' ').filter(Boolean).length,
          embedding: embedding,
          embeddingVector: Array.isArray(embeddingVector) ? embeddingVector : null
        };

        return this.dbHandler.createChunk(chunkData);
      });

      const results = await Promise.all(savePromises);
      storedChunks.push(...results.filter(Boolean));

      console.log(`✅ Stored ${storedChunks.length} chunks in database`);
      return storedChunks;

    } catch (error) {
      console.error('❌ Error processing chunks:', error);
      throw error;
    }
  }

  /**
   * Find top-K similar chunks by embedding score.
   * Returns at most `topK` results sorted by embedding similarity descending.
   * Use this to get a short-list before running expensive phrase-overlap.
   */
  async findTopKSimilarChunks(queryText, topK = 5, threshold = null) {
    try {
      const matches = await this.findSimilarChunks(queryText, null, threshold);
      if (!matches || matches.length === 0) return [];
      // Sort by embedding similarity descending and take top-K
      return matches
        .slice()
        .sort((a, b) => (b.embeddingSimilarity || 0) - (a.embeddingSimilarity || 0))
        .slice(0, topK);
    } catch (error) {
      console.error('❌ Error in findTopKSimilarChunks:', error);
      return [];
    }
  }

  /**
   * Find top-K similar chunks using a precomputed embedding.
   */
  async findTopKSimilarChunksWithEmbedding(queryText, queryEmbedding, topK = 5, threshold = null) {
    try {
      const minTokens = (this.options && this.options.minQueryTokens) || 5;
      if (this.isDOI(queryText) || this.tokenCount(queryText) < minTokens) {
        return [];
      }

      if (!this.options) this.setOptions();
      if (!queryEmbedding || !queryEmbedding.length) {
        return [];
      }

      const embThreshold = threshold !== null ? threshold : this.options.embeddingThreshold;
      let matches = await this.dbHandler.searchSimilarChunksByEmbedding(queryEmbedding, null, this.options.maxResults, embThreshold);

      if (matches && matches.length > 0) {
        const filtered = matches
          .map(match => {
            const sim = Number(match.similarity_score || 0);
            return { ...match, embeddingSimilarity: sim };
          })
          .filter(m => m.embeddingSimilarity >= embThreshold);

        console.log(`🔍 Found ${filtered.length} embedding-similar chunks from database`);
        
        const mapped = filtered.map(match => ({
          query_text: queryText,
          matched_text: match.chunk_text,
          matched_chunk: {
            content: match.chunk_text,
            chunk_hash: match.chunk_hash,
            chunk_index: match.chunk_index || 0,
            chunk_text: match.chunk_text
          },
          similarity: match.embeddingSimilarity,
          embeddingSimilarity: match.embeddingSimilarity,
          similarityMode: 'embedding',
          source_document: match.filename || match.matchedDocument,
          document_id: match.document_id,
          matched_document_id: match.document_id,
          matched_metadata: match.doc_metadata,
          matched_title: match.title || '',
          matched_authors: match.authors || ''
        }));

        return mapped
          .sort((a, b) => (b.embeddingSimilarity || 0) - (a.embeddingSimilarity || 0))
          .slice(0, topK);
      }

      return [];
    } catch (error) {
      console.error('❌ Error in findTopKSimilarChunksWithEmbedding:', error);
      return [];
    }
  }

  /**
   * Find similar chunks using ONLY vector embeddings.
   */
  async findSimilarChunks(queryText, documentId = null, threshold = null) {
    try {
      const minTokens = (this.options && this.options.minQueryTokens) || 5;
      if (this.isDOI(queryText) || this.tokenCount(queryText) < minTokens) {
        console.log(`⏭️ Skipping matching for DOI/short query: "${(queryText||'').toString().substring(0,60)}"`);
        return [];
      }

      if (!this.options) this.setOptions();

      const queryEmbedding = await embeddingService.embedText(queryText);
      if (!queryEmbedding || !queryEmbedding.length) {
        return [];
      }

      const embThreshold = threshold !== null ? threshold : this.options.embeddingThreshold;
      let matches = await this.dbHandler.searchSimilarChunksByEmbedding(queryEmbedding, documentId, this.options.maxResults, embThreshold);

      if (matches && matches.length > 0) {
        const filtered = matches
          .map(match => {
            const sim = Number(match.similarity_score || 0);
            return { ...match, embeddingSimilarity: sim };
          })
          .filter(m => m.embeddingSimilarity >= embThreshold);

        console.log(`🔍 Found ${filtered.length} embedding-similar chunks from database`);
        return filtered.map(match => ({
          query_text: queryText,
          matched_text: match.chunk_text,
          matched_chunk: {
            content: match.chunk_text,
            chunk_hash: match.chunk_hash,
            chunk_index: match.chunk_index || 0,
            chunk_text: match.chunk_text
          },
          similarity: match.embeddingSimilarity,
          embeddingSimilarity: match.embeddingSimilarity,
          similarityMode: 'embedding',
          source_document: match.filename || match.matchedDocument,
          document_id: match.document_id,
          matched_document_id: match.document_id,
          matched_metadata: match.doc_metadata,
          matched_title: match.title || '',
          matched_authors: match.authors || ''
        }));
      }

      return [];

    } catch (error) {
      console.error('❌ Error finding similar chunks:', error);
      return [];
    }
  }

  /**
   * Get all chunks except from specified document
   */
  async getAllChunksExcept(excludeDocumentId) {
    try {
      const client = await this.dbHandler.pool.connect();
      try {
        let query = `
          SELECT c.*, d.filename, d.metadata as doc_metadata
          FROM chunks c
          JOIN documents d ON c.document_id = d.id
        `;

        const values = [];
        if (excludeDocumentId) {
          query += ' WHERE c.document_id != $1';
          values.push(excludeDocumentId);
        }

        query += ' ORDER BY c.document_id, c.chunk_index';

        const result = await client.query(query, values);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error getting chunks:', error);
      return [];
    }
  }

  /**
   * Aggregate matches by document
   */
  aggregateMatchesByDocument(matches) {
    const docMatches = {};

    matches.forEach(match => {
      const docId = match.document_id;
      if (!docMatches[docId]) {
        docMatches[docId] = {
          document_id: docId,
          source_document: match.source_document,
          matches: [],
          total_similarity: 0,
          match_count: 0
        };
      }

      docMatches[docId].matches.push(match);
      docMatches[docId].total_similarity += match.similarity;
      docMatches[docId].match_count++;
    });

    Object.values(docMatches).forEach(doc => {
      doc.average_similarity = doc.total_similarity / doc.match_count;
    });

    return Object.values(docMatches)
      .sort((a, b) => b.average_similarity - a.average_similarity);
  }
}

module.exports = ChunkingService;
