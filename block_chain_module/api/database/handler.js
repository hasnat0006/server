const fs = require('fs');
const path = require('path');
const PostgreSQLHandler = require('./postgres-handler');

class DatabaseHandler {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'documents.json');
    this.data = {
      documents: [],
      smallDocuments: [],
      nextId: 1
    };
    this.postgresHandler = null;
    this.usePostgres = false;
  }

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load existing JSON data (with error handling)
      if (fs.existsSync(this.dbPath)) {
        try {
          const fileData = fs.readFileSync(this.dbPath, 'utf8');
          if (fileData.trim().length === 0) {
            console.warn('⚠️  JSON file is empty, initializing fresh');
            this.data = { documents: [], smallDocuments: [], nextId: 1 };
            this.save();
          } else {
            this.data = JSON.parse(fileData);
            if (!Array.isArray(this.data.documents)) this.data.documents = [];
            if (!Array.isArray(this.data.smallDocuments)) this.data.smallDocuments = [];
            if (typeof this.data.nextId !== 'number') {
              this.data.nextId = this.data.documents.length + 1;
            }
            console.log(`✅ JSON Database loaded: ${this.data.documents.length} documents`);
          }
        } catch (jsonError) {
          console.error('❌ JSON parse error:', jsonError.message);
          console.warn('⚠️  Recreating JSON database from scratch');
          this.data = { documents: [], smallDocuments: [], nextId: 1 };
          this.save();
        }
      } else {
        this.save();
        console.log('✅ JSON Database initialized');
      }

      // Try to initialize PostgreSQL if DATABASE_URL is set (ALWAYS attempt this)
      if (process.env.DATABASE_URL) {
        try {
          this.postgresHandler = new PostgreSQLHandler();
          await this.postgresHandler.initialize();
          this.usePostgres = true;
          console.log('✅ Using PostgreSQL (Neon DB) as primary database');
        } catch (error) {
          console.warn('⚠️  PostgreSQL not available, using JSON only:', error.message);
          this.usePostgres = false;
        }
      } else {
        console.log('ℹ️  DATABASE_URL not set, using JSON database only');
      }

      return true;
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      throw error;
    }
  }

  save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  async createDocument(documentData) {
    // Create in PostgreSQL first if available
    if (this.usePostgres && this.postgresHandler) {
      try {
        const pgDocument = await this.postgresHandler.createDocument(documentData);
        console.log(`📊 Document saved to PostgreSQL with ID: ${pgDocument.id}`);
        
        // Sync with JSON - check if already exists
        const existingIndex = this.data.documents.findIndex(doc => doc.id === pgDocument.id);
        const document = {
          id: pgDocument.id,
          ...documentData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
          this.data.documents[existingIndex] = document;
        } else {
          this.data.documents.push(document);
        }
        this.data.nextId = Math.max(this.data.nextId, pgDocument.id + 1);
        this.save();
        
        return pgDocument;
      } catch (error) {
        console.warn('⚠️  PostgreSQL insert failed, using JSON:', error.message);
      }
    }

    // Fallback to JSON only
    const document = {
      id: this.data.nextId++,
      ...documentData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.documents.push(document);
    this.save();

    return document;
  }

  async updateDocument(id, updates) {
    // Update PostgreSQL first if available
    if (this.usePostgres && this.postgresHandler) {
      try {
        const pgDocument = await this.postgresHandler.updateDocument(id, updates);
        console.log(`📊 Document updated in PostgreSQL: ${id}`);
        
        // Also update JSON
        const index = this.data.documents.findIndex(doc => doc.id === parseInt(id));
        if (index !== -1) {
          this.data.documents[index] = {
            ...this.data.documents[index],
            ...updates,
            updatedAt: new Date().toISOString()
          };
          this.save();
        }
        
        return pgDocument;
      } catch (error) {
        console.warn('⚠️  PostgreSQL update failed, using JSON:', error.message);
      }
    }

    // Fallback to JSON only
    const index = this.data.documents.findIndex(doc => doc.id === parseInt(id));
    
    if (index === -1) {
      throw new Error('Document not found');
    }

    this.data.documents[index] = {
      ...this.data.documents[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.save();

    return this.data.documents[index];
  }

  async getDocument(id) {
    // Check PostgreSQL first if available
    if (this.usePostgres && this.postgresHandler) {
      try {
        const pgDoc = await this.postgresHandler.getDocument(id);
        if (pgDoc) return pgDoc;
      } catch (error) {
        console.warn('⚠️  PostgreSQL query failed, using JSON:', error.message);
      }
    }
    
    // Fallback to JSON
    return this.data.documents.find(doc => doc.id === parseInt(id));
  }

  async getDocumentByHash(hash) {
    if (!hash) return null;
    
    // Check PostgreSQL first if available
    if (this.usePostgres && this.postgresHandler) {
      try {
        return await this.postgresHandler.getDocumentByHash(hash);
      } catch (error) {
        console.warn('⚠️  PostgreSQL query failed, using JSON:', error.message);
      }
    }
    
    // Fallback to JSON
    return this.data.documents.find(doc => doc.documentHash === hash) || null;
  }

  async getDocuments({ status, limit = 50, offset = 0 }) {
    let documents = [...this.data.documents];

    if (status) {
      documents = documents.filter(doc => doc.status === status);
    }

    // Sort by creation date (newest first)
    documents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const total = documents.length;
    documents = documents.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return {
      documents,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
  }

  async deleteDocument(id) {
    let deleted = null;
    
    // Delete from PostgreSQL if available
    if (this.usePostgres && this.postgresHandler) {
      try {
        deleted = await this.postgresHandler.deleteDocument(id);
        console.log(`✅ Deleted document ${id} from PostgreSQL`);
      } catch (error) {
        console.warn('⚠️  PostgreSQL delete failed:', error.message);
      }
    }
    
    // ALWAYS remove from JSON (whether PostgreSQL succeeded or not)
    const jsonIndex = this.data.documents.findIndex(doc => doc.id === parseInt(id));
    if (jsonIndex >= 0) {
      if (!deleted) {
        deleted = this.data.documents[jsonIndex];
      }
      this.data.documents.splice(jsonIndex, 1);
      this.save();
      console.log(`✅ Deleted document ${id} from JSON database`);
    }
    
    return deleted;
  }

  async getStats() {
    const total = this.data.documents.length;
    const verified = this.data.documents.filter(doc => doc.status === 'verified').length;
    const rejected = this.data.documents.filter(doc => doc.status === 'rejected').length;
    const analyzing = this.data.documents.filter(doc => doc.status === 'analyzing').length;

    return {
      total,
      verified,
      rejected,
      analyzing
    };
  }

  async createSmallDocument(record) {
    if (this.usePostgres && this.postgresHandler) {
      try {
        const pgRecord = await this.postgresHandler.createSmallDocument(record);

        const existingIndex = this.data.smallDocuments.findIndex(
          item => item.issuedDocumentId === record.issuedDocumentId
        );

        const jsonRecord = {
          ...record,
          id: pgRecord.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
          this.data.smallDocuments[existingIndex] = jsonRecord;
        } else {
          this.data.smallDocuments.push(jsonRecord);
        }
        this.save();

        return pgRecord;
      } catch (error) {
        console.warn('⚠️  PostgreSQL small-document insert failed, using JSON:', error.message);
      }
    }

    const jsonRecord = {
      ...record,
      id: `json-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.smallDocuments.push(jsonRecord);
    this.save();

    return jsonRecord;
  }

  async findSmallDocumentByIssuedId(issuedDocumentId) {
    if (!issuedDocumentId) return null;

    if (this.usePostgres && this.postgresHandler) {
      try {
        const pgRecord = await this.postgresHandler.findSmallDocumentByIssuedId(issuedDocumentId);
        if (pgRecord) return pgRecord;
      } catch (error) {
        console.warn('⚠️  PostgreSQL small-document query failed, using JSON:', error.message);
      }
    }

    return this.data.smallDocuments.find(item => item.issuedDocumentId === issuedDocumentId) || null;
  }

  async findSmallDocumentByHash(fileHash) {
    if (!fileHash) return null;

    if (this.usePostgres && this.postgresHandler) {
      try {
        const pgRecord = await this.postgresHandler.findSmallDocumentByHash(fileHash);
        if (pgRecord) return pgRecord;
      } catch (error) {
        console.warn('⚠️  PostgreSQL small-document hash query failed, using JSON:', error.message);
      }
    }

    const matches = this.data.smallDocuments.filter(item => item.fileHash === fileHash);
    if (matches.length === 0) return null;
    return matches[matches.length - 1];
  }

  // Chunk operations - proxy to PostgreSQL
  async createChunk(chunkData) {
    if (this.usePostgres && this.postgresHandler) {
      return await this.postgresHandler.createChunk(chunkData);
    }
    throw new Error('PostgreSQL not available for chunk operations');
  }

  async getChunks(documentId) {
    if (this.usePostgres && this.postgresHandler) {
      return await this.postgresHandler.getChunks(documentId);
    }
    return [];
  }

  async searchSimilarChunks(queryText, excludeDocumentId, limit) {
    if (this.usePostgres && this.postgresHandler) {
      return await this.postgresHandler.searchSimilarChunks(queryText, excludeDocumentId, limit);
    }
    return [];
  }
}

// Create singleton instance
const dbHandler = new DatabaseHandler();

module.exports = dbHandler;
