const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class PostgreSQLHandler {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    try {
      // Database connection configuration
      const config = {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'document_verification',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
      };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      console.log('✅ PostgreSQL connected successfully');
      client.release();

      return true;
    } catch (error) {
      console.error('❌ PostgreSQL connection error:', error.message);
      throw error;
    }
  }

  async createDocument(documentData) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO documents (
          original_name, file_name, file_path, file_size,
          document_type, uploader_name, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        documentData.originalName,
        documentData.fileName,
        documentData.filePath,
        documentData.fileSize,
        documentData.documentType,
        documentData.uploaderName || 'Anonymous',
        documentData.status || 'analyzing'
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async updateDocument(id, updates) {
    const client = await this.pool.connect();
    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.status) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }

      if (updates.documentHash) {
        updateFields.push(`document_hash = $${paramIndex++}`);
        values.push(updates.documentHash);
      }

      values.push(id);

      const query = `
        UPDATE documents
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async saveXAIAnalysis(documentId, xaiResults) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO xai_analysis (
          document_id, confidence_score,
          is_plagiarized, plagiarism_similarity, plagiarism_threshold, plagiarism_details,
          is_ai_generated, ai_probability, ai_threshold, ai_indicators,
          is_forged, forgery_evidence,
          rejection_reasons, explanation, raw_results
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `;

      const values = [
        documentId,
        xaiResults.confidenceScore,
        xaiResults.plagiarismCheck?.isPlagiarized || false,
        xaiResults.plagiarismCheck?.similarityScore || 0,
        xaiResults.plagiarismCheck?.threshold || 75,
        JSON.stringify(xaiResults.plagiarismCheck || {}),
        xaiResults.aiDetection?.isAIGenerated || false,
        xaiResults.aiDetection?.aiProbability || 0,
        xaiResults.aiDetection?.threshold || 60,
        JSON.stringify(xaiResults.aiDetection?.indicators || []),
        xaiResults.certificateForgery?.isForged || false,
        JSON.stringify(xaiResults.certificateForgery || {}),
        JSON.stringify(xaiResults.rejectionReasons || []),
        JSON.stringify(xaiResults.explanation || {}),
        JSON.stringify(xaiResults)
      ];

      const result = await client.query(query, values);

      // Save matching parts if any
      if (xaiResults.plagiarismCheck?.matchingParts) {
        await this.saveMatchingParts(result.rows[0].id, xaiResults.plagiarismCheck.matchingParts);
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async saveMatchingParts(xaiAnalysisId, matchingParts) {
    const client = await this.pool.connect();
    try {
      for (const part of matchingParts) {
        const query = `
          INSERT INTO matching_parts (
            xai_analysis_id, source_document, matched_text,
            similarity_score, length_words, explanation
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        const values = [
          xaiAnalysisId,
          part.sourceDocument || part.source_document,
          part.matchedText || part.matched_text,
          part.similarityScore || part.similarity_score,
          part.lengthWords || part.length_words || 0,
          part.explanation
        ];

        await client.query(query, values);
      }
    } finally {
      client.release();
    }
  }

  async saveBlockchainRecord(documentId, blockchainData) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO blockchain_records (
          document_id, document_hash, contract_address,
          transaction_hash, block_number, gas_used,
          network, chain_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        documentId,
        blockchainData.documentHash,
        blockchainData.contractAddress,
        blockchainData.transactionHash,
        blockchainData.blockNumber,
        blockchainData.gasUsed,
        'localhost',
        1337
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getDocument(id) {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          d.*,
          x.confidence_score,
          x.is_plagiarized,
          x.is_ai_generated,
          x.is_forged,
          x.explanation,
          b.transaction_hash,
          b.block_number,
          b.contract_address
        FROM documents d
        LEFT JOIN xai_analysis x ON d.id = x.document_id
        LEFT JOIN blockchain_records b ON d.id = b.document_id
        WHERE d.id = $1
      `;

      const result = await client.query(query, [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getDocuments({ status, limit = 50, offset = 0 }) {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM document_summary
      `;

      const values = [];
      let paramIndex = 1;

      if (status) {
        query += ` WHERE status = $${paramIndex++}`;
        values.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      values.push(limit, offset);

      const result = await client.query(query, values);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM documents';
      if (status) {
        countQuery += ' WHERE status = $1';
      }
      const countResult = await client.query(countQuery, status ? [status] : []);

      return {
        documents: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
    } finally {
      client.release();
    }
  }

  async getStats() {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM verification_stats';
      const result = await client.query(query);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getKnownDocuments() {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM known_documents ORDER BY added_at DESC';
      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getKnownCertificates() {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM known_certificates ORDER BY added_at DESC';
      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('PostgreSQL connection closed');
    }
  }
}

// Create singleton instance
const postgresHandler = new PostgreSQLHandler();

module.exports = postgresHandler;
