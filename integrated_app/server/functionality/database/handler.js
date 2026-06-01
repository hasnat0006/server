const PostgreSQLHandler = require('./postgres-handler');

class DatabaseHandler {
  constructor() {
    this.postgresHandler = null;
    this.usePostgres = false;
  }

  requirePostgres() {
    if (!this.usePostgres || !this.postgresHandler) {
      throw new Error('PostgreSQL is required. Set DATABASE_URL and restart the server.');
    }
  }

  normalizeDocument(row) {
    if (!row) return null;

    const metadata = row.metadata || {};
    return {
      id: row.id,
      originalName: row.filename || metadata.original_name,
      fileName: row.filename,
      filePath: metadata.file_path,
      fileSize: metadata.file_size,
      documentType: metadata.document_type,
      uploaderName: metadata.uploader_name,
      status: metadata.status || 'unknown',
      documentHash: row.doc_hash,
      uploadedAt: row.uploaded_at,
      createdAt: row.uploaded_at,
      updatedAt: row.uploaded_at,
      metadata,
      xaiResults: metadata.xai_results,
      blockchainData: metadata.blockchain_data,
    };
  }

  async initialize() {
    try {
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required in Postgres-only mode.');
      }

      this.postgresHandler = new PostgreSQLHandler();
      await this.postgresHandler.initialize();
      this.usePostgres = true;
      console.log('✅ Postgres-only mode enabled');

      return true;
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      throw error;
    }
  }

  async createDocument(documentData) {
    this.requirePostgres();
    const created = await this.postgresHandler.createDocument(documentData);
    return this.normalizeDocument(created);
  }

  async updateDocument(id, updates) {
    this.requirePostgres();
    const updated = await this.postgresHandler.updateDocument(id, updates);
    return this.normalizeDocument(updated);
  }

  async getDocument(id) {
    this.requirePostgres();
    const pgDoc = await this.postgresHandler.getDocument(id);
    return this.normalizeDocument(pgDoc);
  }

  async getDocumentByHash(hash) {
    if (!hash) return null;
    this.requirePostgres();
    const pgDoc = await this.postgresHandler.getDocumentByHash(hash);
    return this.normalizeDocument(pgDoc);
  }

  async getDocuments({ status, limit = 50, offset = 0 }) {
    this.requirePostgres();

    let documents = (await this.postgresHandler.getAllDocuments()).map((doc) => this.normalizeDocument(doc));

    if (status) {
      documents = documents.filter((doc) => doc.status === status);
    }

    const total = documents.length;
    const normalizedLimit = parseInt(limit);
    const normalizedOffset = parseInt(offset);
    documents = documents.slice(normalizedOffset, normalizedOffset + normalizedLimit);

    return {
      documents,
      total,
      limit: normalizedLimit,
      offset: normalizedOffset
    };
  }

  async deleteDocument(id) {
    this.requirePostgres();
    const deleted = await this.postgresHandler.deleteDocument(id);
    return this.normalizeDocument(deleted);
  }

  async getStats() {
    this.requirePostgres();
    const documents = (await this.postgresHandler.getAllDocuments()).map((doc) => this.normalizeDocument(doc));
    const total = documents.length;
    const verified = documents.filter((doc) => doc.status === 'verified').length;
    const rejected = documents.filter((doc) => doc.status === 'rejected').length;
    const analyzing = documents.filter((doc) => doc.status === 'analyzing').length;

    return {
      total,
      verified,
      rejected,
      analyzing
    };
  }

  async createSmallDocument(record) {
    this.requirePostgres();
    return await this.postgresHandler.createSmallDocument(record);
  }

  async findSmallDocumentByIssuedId(issuedDocumentId) {
    if (!issuedDocumentId) return null;
    this.requirePostgres();
    return await this.postgresHandler.findSmallDocumentByIssuedId(issuedDocumentId);
  }

  async findSmallDocumentByHash(fileHash) {
    if (!fileHash) return null;
    this.requirePostgres();
    return await this.postgresHandler.findSmallDocumentByHash(fileHash);
  }

  // Chunk operations - proxy to PostgreSQL
  async createChunk(chunkData) {
    this.requirePostgres();
    return await this.postgresHandler.createChunk(chunkData);
  }

  async getChunks(documentId) {
    this.requirePostgres();
    return await this.postgresHandler.getChunks(documentId);
  }

  async searchSimilarChunks(queryText, excludeDocumentId, limit, similarityThreshold) {
    this.requirePostgres();
    return await this.postgresHandler.searchSimilarChunks(
      queryText,
      excludeDocumentId,
      limit,
      similarityThreshold
    );
  }

  async searchSimilarChunksByEmbedding(embeddingVector, excludeDocumentId, limit, similarityThreshold) {
    this.requirePostgres();
    return await this.postgresHandler.searchSimilarChunksByEmbedding(
      embeddingVector,
      excludeDocumentId,
      limit,
      similarityThreshold
    );
  }

  async findChunksByHash(chunkHash, excludeDocumentId, limit) {
    this.requirePostgres();
    return await this.postgresHandler.findChunksByHash(chunkHash, excludeDocumentId, limit);
  }
}

// Create singleton instance
const dbHandler = new DatabaseHandler();

module.exports = dbHandler;
