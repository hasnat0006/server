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

    // Detect and strip the references/bibliography section
    const refHeaderRe = /^(?:references|bibliography|works\s*cited|literature\s*cited)(?:\s+and\s+\w+)?\s*:?\s*$/im;
    const refMatch = input.match(refHeaderRe);
    if (refMatch) {
      const refStart = refMatch.index;
      console.log(`📚 Reference section header detected at position ${refStart} — excluding from chunking`);
      input = input.substring(0, refStart).trim();
    }

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

      const storedChunks = [];
      for (const chunk of chunks) {
        const embedding = this.createSimpleEmbedding(chunk.content);
        let embeddingVector = null;
        try {
          embeddingVector = await embeddingService.embedText(chunk.content);
        } catch (error) {
          console.warn('⚠️  Embedding generation failed:', error.message);
        }

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

        const storedChunk = await this.dbHandler.createChunk(chunkData);
        storedChunks.push(storedChunk);
      }

      console.log(`✅ Stored ${storedChunks.length} chunks in database`);
      return storedChunks;

    } catch (error) {
      console.error('❌ Error processing chunks:', error);
      throw error;
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
