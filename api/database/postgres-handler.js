const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class PostgreSQLHandler {
  constructor() {
    this.pool = null;
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
    // Tables already exist in Neon DB - skip creation
    console.log('✅ Using existing Neon DB schema');
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
        documentData.fileName,
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
          document_id, chunk_index, chunk_text, chunk_hash, token_count, embedding
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        chunkData.document_id,
        chunkData.chunk_index,
        chunkData.chunk_text || chunkData.content,
        chunkData.chunk_hash,
        chunkData.token_count || (chunkData.chunk_text || chunkData.content).split(' ').filter(Boolean).length,
        null // Skip embedding for now - requires OpenAI API for proper 768/1536 dimensions
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

  async searchSimilarChunks(queryText, excludeDocumentId = null, limit = 10) {
    const client = await this.pool.connect();
    try {
      // Text similarity search using pg_trgm
      let query = `
        SELECT 
          c.*,
          d.filename,
          d.metadata as doc_metadata,
          similarity(c.chunk_text, $1) as similarity_score
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE similarity(c.chunk_text, $1) > 0.3
      `;
      
      const values = [queryText];
      
      if (excludeDocumentId) {
        query += ` AND c.document_id != $2`;
        values.push(excludeDocumentId);
        query += ` ORDER BY similarity_score DESC LIMIT $3`;
        values.push(limit);
      } else {
        query += ` ORDER BY similarity_score DESC LIMIT $2`;
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

module.exports = PostgreSQLHandler;
