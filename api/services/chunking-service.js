const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ChunkingService {
  constructor(dbHandler) {
    this.dbHandler = dbHandler;
    this.chunkSize = 1000; // characters per chunk
    this.chunkOverlap = 200; // overlap between chunks
  }

  /**
   * Split text into overlapping chunks
   */
  splitIntoChunks(text) {
    const chunks = [];
    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + this.chunkSize, text.length);
      const chunkText = text.substring(startIndex, endIndex).trim();
      
      if (chunkText.length > 0) {
        chunks.push({
          index: chunkIndex,
          content: chunkText,
          start: startIndex,
          end: endIndex,
          length: chunkText.length
        });
        chunkIndex++;
      }

      // Move to next chunk with overlap
      startIndex += this.chunkSize - this.chunkOverlap;
    }

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
        // Create embedding
        const embedding = this.createSimpleEmbedding(chunk.content);
        
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
          embedding: embedding
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
      // Use database similarity search if available
      const matches = await this.dbHandler.searchSimilarChunks(queryText, documentId, 20);
      
      if (matches && matches.length > 0) {
        console.log(`🔍 Found ${matches.length} similar chunks from database`);
        return matches.map(match => ({
          query_chunk: { content: queryText.substring(0, 500) },
          matched_chunk: { content: match.chunk_text, chunk_hash: match.chunk_hash },
          similarity: match.similarity_score || 0.5,
          source_document: match.filename,
          document_id: match.document_id
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
