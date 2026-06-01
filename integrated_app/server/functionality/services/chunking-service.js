const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const embeddingService = require('./embedding-service');

class ChunkingService {
  constructor(dbHandler) {
    this.dbHandler = dbHandler;
    this.chunkSize = 900; // max paragraph size before splitting
    this.chunkOverlap = 120; // overlap for long paragraph splits
  }

  /**
   * Split text into overlapping chunks
   */
  splitIntoChunks(text) {
    const chunks = [];
    let chunkIndex = 0;

    const paragraphs = (text || '')
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    paragraphs.forEach((paragraph) => {
      if (paragraph.length <= this.chunkSize) {
        chunks.push({
          index: chunkIndex,
          content: paragraph,
          start: null,
          end: null,
          length: paragraph.length
        });
        chunkIndex++;
        return;
      }

      let startIndex = 0;
      while (startIndex < paragraph.length) {
        const endIndex = Math.min(startIndex + this.chunkSize, paragraph.length);
        const chunkText = paragraph.substring(startIndex, endIndex).trim();

        if (chunkText.length > 0) {
          chunks.push({
            index: chunkIndex,
            content: chunkText,
            start: null,
            end: null,
            length: chunkText.length
          });
          chunkIndex++;
        }

        startIndex += this.chunkSize - this.chunkOverlap;
      }
    });

    return chunks;
  }

  /**
   * Create simple embedding (word frequency based)
   * In production, you'd use a proper embedding model
   */
  createSimpleEmbedding(text) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordFreq = {};
    
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Create a simple vector (top 100 words by frequency)
    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    // Create embedding vector
    const embedding = new Array(100).fill(0);
    sortedWords.forEach(([word, freq], idx) => {
      embedding[idx] = freq / words.length; // normalize
    });

    return embedding;
  }

  /**
   * Calculate similarity between two text chunks
   */
  calculateSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().match(/\b\w+\b/g) || []);
    const words2 = new Set(text2.toLowerCase().match(/\b\w+\b/g) || []);
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  calculateCoverage(text1, text2) {
    const words1 = new Set(text1.toLowerCase().match(/\b\w+\b/g) || []);
    const words2 = new Set(text2.toLowerCase().match(/\b\w+\b/g) || []);

    if (words1.size === 0) return 0;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    return intersection.size / words1.size; // coverage of text1 by text2
  }

  /**
   * Process document and store chunks
   */
  async processDocument(documentId, documentText, metadata = {}) {
    try {
      console.log(`📄 Processing document ${documentId} for chunking...`);
      
      // Split into chunks
      const chunks = this.splitIntoChunks(documentText);
      console.log(`✂️  Split into ${chunks.length} chunks`);

      // Store each chunk
      const storedChunks = [];
      for (const chunk of chunks) {
        // Create embeddings
        const embedding = this.createSimpleEmbedding(chunk.content);
        let embeddingVector = null;
        try {
          embeddingVector = await embeddingService.embedText(chunk.content);
        } catch (error) {
          console.warn('⚠️  Embedding generation failed:', error.message);
        }
        
        // Calculate chunk hash
        const crypto = require('crypto');
        const chunkHash = crypto.createHash('sha256').update(chunk.content).digest('hex');

        // Store in database
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
   * Find similar chunks for plagiarism detection
   */
  async findSimilarChunks(queryText, documentId = null, threshold = 0.3) {
    try {
      let matches = [];
      let usedEmbeddingSearch = false;

      try {
        const queryEmbedding = await embeddingService.embedText(queryText);
        if (queryEmbedding && queryEmbedding.length) {
          matches = await this.dbHandler.searchSimilarChunksByEmbedding(queryEmbedding, documentId, 20, threshold);
          usedEmbeddingSearch = matches.length > 0;
        }
      } catch (error) {
        console.warn('⚠️  Embedding search unavailable:', error.message);
      }

      if (!matches.length) {
        // Fallback to database similarity search
        matches = await this.dbHandler.searchSimilarChunks(queryText, documentId, 20, threshold);
      }
      
      if (matches && matches.length > 0) {
        const normalized = matches.map(match => {
          const baseSimilarity = Number(match.similarity_score || 0);
          const lexicalSimilarity = this.calculateSimilarity(queryText, match.chunk_text || '');
          const coverageSimilarity = this.calculateCoverage(queryText, match.chunk_text || '');
          const useEmbeddingWeights = match.similarity_mode === 'embedding' || usedEmbeddingSearch;
          const combinedSimilarity = useEmbeddingWeights
            ? (baseSimilarity * 0.9) + (lexicalSimilarity * 0.1)
            : (baseSimilarity * 0.7) + (lexicalSimilarity * 0.3);

          return {
            ...match,
            trigramSimilarity: match.similarity_mode === 'trigram' ? baseSimilarity : null,
            embeddingSimilarity: match.similarity_mode === 'embedding' ? baseSimilarity : null,
            lexicalSimilarity,
            coverageSimilarity,
            combinedSimilarity,
          };
        });

        // Stage-2 verification: keep only candidates that also share enough lexical overlap.
        const filtered = normalized.filter((match) => {
          const isEmbedding = match.similarity_mode === 'embedding' || usedEmbeddingSearch;
          const lexicalFloor = isEmbedding ? 0.02 : 0.1;
          const enforceLexical = isEmbedding && (queryText.length < 250 || (match.chunk_text || '').length < 250);
          return match.combinedSimilarity >= threshold && (!enforceLexical || match.lexicalSimilarity >= lexicalFloor);
        });

        console.log(`🔍 Found ${filtered.length} similar chunks from database`);
        return filtered.map(match => ({
          query_text: queryText,
          matched_text: match.chunk_text,
          matched_chunk: {
            content: match.chunk_text,
            chunk_hash: match.chunk_hash,
            chunk_index: match.chunk_index || 0,
            chunk_text: match.chunk_text
          },
          similarity: match.combinedSimilarity,
          trigramSimilarity: match.trigramSimilarity,
          embeddingSimilarity: match.embeddingSimilarity,
          lexicalSimilarity: match.lexicalSimilarity,
          coverageSimilarity: match.coverageSimilarity,
          similarityMode: match.similarity_mode || (usedEmbeddingSearch ? 'embedding' : 'trigram'),
          source_document: match.filename,
          document_id: match.document_id,
          matched_document_id: match.document_id,
          matched_metadata: match.doc_metadata
        }));
      }

      // Fallback to manual comparison
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

    // Calculate average similarity
    Object.values(docMatches).forEach(doc => {
      doc.average_similarity = doc.total_similarity / doc.match_count;
    });

    // Convert to array and sort
    return Object.values(docMatches)
      .sort((a, b) => b.average_similarity - a.average_similarity);
  }
}

module.exports = ChunkingService;
