const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class PostgreSQLHandler {
  constructor() {
    this.pool = null;
  }

  formatVector(vector) {
    if (!Array.isArray(vector) || vector.length === 0) {
      return null;
    }

    const sanitized = vector.map((value) => (Number.isFinite(value) ? value : 0));
    return `[${sanitized.join(',')}]`;
  }

  async initialize() {
    try {
      // Use DATABASE_URL if available (Neon DB format), otherwise use individual params
      const config = process.env.DATABASE_URL 
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          }
        : {
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'document_verification',
            password: process.env.DB_PASSWORD || 'postgres',
            port: process.env.DB_PORT || 5432,
          };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      console.log('✅ PostgreSQL (Neon DB) connected successfully');
      
      // Create tables if they don't exist
      await this.createTables(client);
      
      client.release();

      return true;
    } catch (error) {
      console.error('❌ PostgreSQL connection error:', error.message);
      throw error;
    }
  }

  async createTables(client) {
    // Keep existing schema untouched, only ensure new small-document table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS small_documents (
        id BIGSERIAL PRIMARY KEY,
        issued_document_id VARCHAR(100) UNIQUE NOT NULL,
        doc_type VARCHAR(50) NOT NULL,
        issuer_name VARCHAR(255),
        original_name VARCHAR(255),
        file_hash VARCHAR(66) NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        metadata_fingerprint VARCHAR(64),
        analysis JSONB,
        blockchain JSONB,
        issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_small_documents_file_hash ON small_documents(file_hash)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_small_documents_issued_id ON small_documents(issued_document_id)');

    console.log('✅ Neon schema ready (including small_documents table)');
  }

  async createSmallDocument(record) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO small_documents (
          issued_document_id,
          doc_type,
          issuer_name,
          original_name,
          file_hash,
          metadata,
          metadata_fingerprint,
          analysis,
          blockchain,
          issued_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `;

      const values = [
        record.issuedDocumentId,
        record.docType,
        record.issuerName || null,
        record.originalName || null,
        record.fileHash,
        JSON.stringify(record.metadata || {}),
        record.metadataFingerprint || null,
        JSON.stringify(record.analysis || {}),
        JSON.stringify(record.blockchain || {}),
        record.issuedAt || new Date().toISOString()
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async findSmallDocumentByIssuedId(issuedDocumentId) {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM small_documents WHERE issued_document_id = $1 LIMIT 1';
      const result = await client.query(query, [issuedDocumentId]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async findSmallDocumentByHash(fileHash) {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM small_documents WHERE file_hash = $1 ORDER BY created_at DESC LIMIT 1';
      const result = await client.query(query, [fileHash]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createDocument(documentData) {
    const client = await this.pool.connect();
    try {
      // Map to Neon DB schema: id, filename, uploaded_at, doc_hash, num_pages, metadata, chunks
      const query = `
        INSERT INTO documents (
          filename, doc_hash, num_pages, metadata
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const metadata = {
        original_name: documentData.originalName,
        file_path: documentData.filePath,
        file_size: documentData.fileSize,
        document_type: documentData.documentType,
        uploader_name: documentData.uploaderName || 'Anonymous',
        status: documentData.status || 'analyzing'
      };

      const values = [
        documentData.originalName || documentData.fileName, // Use original name as primary filename
        documentData.documentHash || '',
        0, // num_pages - will be updated later
        JSON.stringify(metadata)
      ];

      const result = await client.query(query, values);
      console.log(`✅ Document created in Neon DB with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating document in Neon DB:', error.message);
      
      // Check if it's a duplicate document
      if (error.code === '23505' && error.constraint === 'documents_doc_hash_key') {
        console.log('📋 Document already exists, fetching existing record...');
        const existingDoc = await client.query(
          'SELECT * FROM documents WHERE doc_hash = $1',
          [documentData.documentHash || '']
        );
        if (existingDoc.rows.length > 0) {
          console.log(`✅ Found existing document with ID: ${existingDoc.rows[0].id}`);
          return existingDoc.rows[0];
        }
      }
      
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDocument(id, updates) {
    const client = await this.pool.connect();
    try {
      // Get current metadata
      const getCurrentQuery = 'SELECT metadata FROM documents WHERE id = $1';
      console.log(`🔍 Looking for document with ID: ${id} (type: ${typeof id})`);
      const currentResult = await client.query(getCurrentQuery, [parseInt(id)]);
      
      if (currentResult.rows.length === 0) {
        console.error(`❌ Document not found in Neon DB for ID: ${id}`);
        throw new Error('Document not found');
      }
      
      console.log(`✅ Found document in Neon DB: ${id}`);

      const currentMetadata = currentResult.rows[0].metadata || {};

      // Update metadata with new values
      if (updates.status) {
        currentMetadata.status = updates.status;
      }

      // Prepare update fields
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.documentHash) {
        updateFields.push(`doc_hash = $${paramIndex++}`);
        values.push(updates.documentHash);
      }

      if (updates.xaiResults) {
        currentMetadata.xai_results = updates.xaiResults;
      }

      if (updates.blockchainData) {
        currentMetadata.blockchain_data = updates.blockchainData;
      }

      // Always update metadata
      updateFields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(currentMetadata));

      values.push(id);

      const query = `
        UPDATE documents
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getDocument(id) {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM documents WHERE id = $1';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getDocumentByHash(hash) {
    if (!hash) return null;
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM documents WHERE doc_hash = $1';
      const result = await client.query(query, [hash]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getAllDocuments() {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM documents ORDER BY uploaded_at DESC';
      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async deleteDocument(id) {
    const client = await this.pool.connect();
    try {
      // Delete chunks first (foreign key constraint)
      await client.query('DELETE FROM chunks WHERE document_id = $1', [id]);
      
      const query = 'DELETE FROM documents WHERE id = $1 RETURNING *';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // Chunk management methods
  async createChunk(chunkData) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO chunks (
          document_id, chunk_index, chunk_text, chunk_hash, token_count, embedding, embedding_vector
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      // Convert embedding array to PostgreSQL vector format if available
      let embeddingValue = null;
      if (chunkData.embedding && Array.isArray(chunkData.embedding)) {
        // Store as JSON array since we're using simple embeddings (100 dimensions)
        embeddingValue = JSON.stringify(chunkData.embedding);
      }

      const embeddingVectorValue = this.formatVector(chunkData.embeddingVector);

      const values = [
        chunkData.document_id,
        chunkData.chunk_index,
        chunkData.chunk_text || chunkData.content,
        chunkData.chunk_hash,
        chunkData.token_count || (chunkData.chunk_text || chunkData.content).split(' ').filter(Boolean).length,
        embeddingValue,
        embeddingVectorValue
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getChunks(documentId) {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM chunks 
        WHERE document_id = $1 
        ORDER BY chunk_index ASC
      `;
      const result = await client.query(query, [documentId]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async searchSimilarChunks(queryText, excludeDocumentId = null, limit = 10, similarityThreshold = 0.45) {
    const client = await this.pool.connect();
    try {
      const safeThreshold = Math.max(0.0, Math.min(1.0, Number(similarityThreshold) || 0.45));

      // Text similarity search using pg_trgm
      let query = `
        SELECT 
          c.*,
          d.filename,
          d.metadata as doc_metadata,
          similarity(c.chunk_text, $1) as similarity_score,
          'trigram' as similarity_mode
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE char_length($1) >= 80
          AND char_length(c.chunk_text) >= 80
          AND similarity(c.chunk_text, $1) > $2
      `;
      
      const values = [queryText, safeThreshold];
      
      if (excludeDocumentId) {
        query += ` AND c.document_id != $3`;
        values.push(excludeDocumentId);
        query += ` ORDER BY similarity_score DESC LIMIT $4`;
        values.push(limit);
      } else {
        query += ` ORDER BY similarity_score DESC LIMIT $3`;
        values.push(limit);
      }
      
      const result = await client.query(query, values);
      return result.rows;
    } catch (error) {
      console.warn('⚠️  Similarity search failed:', error.message);
      // Fallback: Simple text search
      let fallbackQuery = `
        SELECT c.*, d.filename, d.metadata as doc_metadata
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
      `;
      const fallbackValues = [];
      
      if (excludeDocumentId) {
        fallbackQuery += ` WHERE c.document_id != $1`;
        fallbackValues.push(excludeDocumentId);
        fallbackQuery += ` ORDER BY c.id DESC LIMIT $2`;
        fallbackValues.push(limit);
      } else {
        fallbackQuery += ` ORDER BY c.id DESC LIMIT $1`;
        fallbackValues.push(limit);
      }
      
      const result = await client.query(fallbackQuery, fallbackValues);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async searchSimilarChunksByEmbedding(embeddingVector, excludeDocumentId = null, limit = 10, similarityThreshold = 0.25) {
    const client = await this.pool.connect();
    try {
      const vectorValue = this.formatVector(embeddingVector);
      if (!vectorValue) {
        return [];
      }

      const safeThreshold = Math.max(0.0, Math.min(1.0, Number(similarityThreshold) || 0.25));

      let query = `
        SELECT
          c.*,
          d.filename,
          d.metadata as doc_metadata,
          (1 - (c.embedding_vector <=> $1::vector)) as similarity_score,
          'embedding' as similarity_mode
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.embedding_vector IS NOT NULL
          AND (1 - (c.embedding_vector <=> $1::vector)) >= $2
      `;

      const values = [vectorValue, safeThreshold];

      if (excludeDocumentId) {
        query += ` AND c.document_id != $3`;
        values.push(excludeDocumentId);
        query += ` ORDER BY c.embedding_vector <=> $1::vector LIMIT $4`;
        values.push(limit);
      } else {
        query += ` ORDER BY c.embedding_vector <=> $1::vector LIMIT $3`;
        values.push(limit);
      }

      const result = await client.query(query, values);
      return result.rows;
    } catch (error) {
      console.warn('⚠️  Embedding similarity search failed:', error.message);
      return [];
    } finally {
      client.release();
    }
  }

  async findChunksByHash(chunkHash, excludeDocumentId = null, limit = 20) {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT
          c.*,
          d.filename,
          d.metadata as doc_metadata
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE c.chunk_hash = $1
      `;

      const values = [chunkHash];

      if (excludeDocumentId) {
        query += ` AND c.document_id != $2 ORDER BY c.document_id DESC, c.chunk_index ASC LIMIT $3`;
        values.push(excludeDocumentId, limit);
      } else {
        query += ` ORDER BY c.document_id DESC, c.chunk_index ASC LIMIT $2`;
        values.push(limit);
      }

      const result = await client.query(query, values);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async deleteChunks(documentId) {
    const client = await this.pool.connect();
    try {
      const query = 'DELETE FROM chunks WHERE document_id = $1';
      await client.query(query, [documentId]);
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = PostgreSQLHandler;
