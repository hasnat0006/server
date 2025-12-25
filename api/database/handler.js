const fs = require('fs');
const path = require('path');

class DatabaseHandler {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'documents.json');
    this.data = {
      documents: [],
      nextId: 1
    };
  }

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load existing data or create new file
      if (fs.existsSync(this.dbPath)) {
        const fileData = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(fileData);
        console.log(`✅ Database loaded: ${this.data.documents.length} documents`);
      } else {
        this.save();
        console.log('✅ Database initialized');
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
    return this.data.documents.find(doc => doc.id === parseInt(id));
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

  async getDocumentByHash(documentHash) {
    return this.data.documents.find(doc => doc.documentHash === documentHash);
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
}

// Create singleton instance
const dbHandler = new DatabaseHandler();

module.exports = dbHandler;
