const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

class XAIAnalyzer {
  constructor() {
    this.pythonPath = 'python3';
    this.xaiModulePath = path.join(__dirname, '..', '..', 'xai_module');
  }

  async analyzeDocument(filePath, metadata = {}) {
    try {
      console.log(`🔍 Analyzing document: ${metadata.originalName || filePath}`);

      // Step 1: Calculate document hash
      const documentHash = await this.calculateHash(filePath);
      console.log(`🔐 Document hash: ${documentHash}`);

      // Step 2: Extract text content
      const documentText = await this.extractText(filePath);
      console.log(`📄 Extracted ${documentText.length} characters`);

      // Step 3: Run plagiarism check
      console.log('🔎 Running plagiarism detection...');
      const plagiarismResults = await this.checkPlagiarism(documentText, metadata);

      // Step 4: Check for AI-generated content
      console.log('🤖 Checking for AI-generated content...');
      const aiDetectionResults = await this.detectAIContent(documentText);

      // Step 5: If certificate, check for forgery
      let forgeryResults = null;
      if (metadata.documentType === 'certificate') {
        console.log('🎓 Checking certificate authenticity...');
        forgeryResults = await this.checkCertificateForgery(documentText, metadata);
      }

      // Step 6: Combine results and determine status
      const analysis = this.combineResults({
        documentHash,
        plagiarismResults,
        aiDetectionResults,
        forgeryResults,
        metadata
      });

      console.log(`✅ Analysis complete: ${analysis.status}`);
      console.log(`📊 Confidence score: ${analysis.confidenceScore}%`);

      return analysis;

    } catch (error) {
      console.error('❌ XAI Analysis error:', error);
      throw new Error(`XAI Analysis failed: ${error.message}`);
    }
  }

  async calculateHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve('0x' + hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    } else if (ext === '.pdf') {
      // For demo purposes, return placeholder text
      // In production, use pdf-parse or similar library
      return `Sample text extracted from PDF: ${path.basename(filePath)}`;
    } else {
      return `Document content from ${path.basename(filePath)}`;
    }
  }

  async checkPlagiarism(documentText, metadata) {
    try {
      // Call Python plagiarism checker
      const pythonScript = path.join(this.xaiModulePath, 'plagiarism_check.py');
      
      // For demo: simulate plagiarism check
      const similarityScore = Math.random() * 30; // 0-30% similarity for demo
      const threshold = 75;

      const isPlagiarized = similarityScore >= threshold;
      const matchingParts = [];

      if (isPlagiarized) {
        matchingParts.push({
          sourceDocument: 'existing_paper_123.pdf',
          matchedText: 'Sample matching text segment...',
          similarityScore: similarityScore,
          explanation: 'This section shows high similarity with an existing document in the database.'
        });
      }

      return {
        isPlagiarized,
        similarityScore: Math.round(similarityScore),
        threshold,
        matchingParts,
        explanation: isPlagiarized 
          ? `Document contains ${matchingParts.length} plagiarized section(s)` 
          : 'No significant plagiarism detected'
      };

    } catch (error) {
      throw new Error(`Plagiarism check failed: ${error.message}`);
    }
  }

  async detectAIContent(documentText) {
    try {
      // Simulate AI detection (in production, use real AI detector)
      const aiProbability = Math.random() * 40; // 0-40% for demo
      const threshold = 60;

      const isAIGenerated = aiProbability >= threshold;
      
      const indicators = [];
      if (isAIGenerated) {
        indicators.push({
          type: 'repetitive_patterns',
          confidence: 0.75,
          explanation: 'Detected repetitive sentence structures common in AI-generated text'
        });
        indicators.push({
          type: 'lack_of_personal_voice',
          confidence: 0.68,
          explanation: 'Text lacks personal writing style and voice'
        });
      }

      return {
        isAIGenerated,
        aiProbability: Math.round(aiProbability),
        threshold,
        indicators,
        explanation: isAIGenerated 
          ? 'Document appears to be AI-generated based on multiple indicators' 
          : 'Document appears to be human-written'
      };

    } catch (error) {
      throw new Error(`AI detection failed: ${error.message}`);
    }
  }

  async checkCertificateForgery(documentText, metadata) {
    try {
      // Simulate certificate forgery check
      const isForged = Math.random() < 0.1; // 10% chance for demo

      if (isForged) {
        return {
          isForged: true,
          explanation: 'Similar certificate found in database with different credentials',
          matchedCertificate: {
            certificateId: 'CERT-2024-5678',
            originalHolder: 'John Doe',
            issueDate: '2024-01-15',
            similarity: 95
          }
        };
      }

      return {
        isForged: false,
        explanation: 'No matching certificates found in database'
      };

    } catch (error) {
      throw new Error(`Certificate forgery check failed: ${error.message}`);
    }
  }

  combineResults({ documentHash, plagiarismResults, aiDetectionResults, forgeryResults, metadata }) {
    let status = 'verified';
    let rejectionReasons = [];
    let confidenceScore = 100;

    // Check plagiarism
    if (plagiarismResults.isPlagiarized) {
      status = 'rejected';
      rejectionReasons.push({
        type: 'plagiarism',
        severity: 'high',
        details: plagiarismResults
      });
      confidenceScore -= 40;
    } else {
      confidenceScore -= plagiarismResults.similarityScore * 0.3;
    }

    // Check AI generation
    if (aiDetectionResults.isAIGenerated) {
      status = 'rejected';
      rejectionReasons.push({
        type: 'ai_generated',
        severity: 'high',
        details: aiDetectionResults
      });
      confidenceScore -= 35;
    } else {
      confidenceScore -= aiDetectionResults.aiProbability * 0.2;
    }

    // Check certificate forgery
    if (forgeryResults && forgeryResults.isForged) {
      status = 'rejected';
      rejectionReasons.push({
        type: 'certificate_forgery',
        severity: 'critical',
        details: forgeryResults
      });
      confidenceScore = 0;
    }

    confidenceScore = Math.max(0, Math.round(confidenceScore));

    return {
      documentHash,
      status,
      confidenceScore,
      timestamp: new Date().toISOString(),
      plagiarismCheck: plagiarismResults,
      aiDetection: aiDetectionResults,
      certificateForgery: forgeryResults,
      rejectionReasons,
      explanation: this.generateExplanation(status, rejectionReasons, {
        plagiarismResults,
        aiDetectionResults,
        forgeryResults
      }),
      metadata
    };
  }

  generateExplanation(status, rejectionReasons, results) {
    if (status === 'verified') {
      return {
        summary: 'Document passed all verification checks',
        details: [
          `✅ Plagiarism check: ${results.plagiarismResults.similarityScore}% similarity (below ${results.plagiarismResults.threshold}% threshold)`,
          `✅ AI detection: ${results.aiDetectionResults.aiProbability}% AI probability (below ${results.aiDetectionResults.threshold}% threshold)`,
          results.forgeryResults ? `✅ Certificate authenticity: Verified` : null
        ].filter(Boolean),
        recommendation: 'Document is authentic and can be registered on blockchain'
      };
    } else {
      const details = rejectionReasons.map(reason => {
        switch (reason.type) {
          case 'plagiarism':
            return `❌ Plagiarism detected: ${reason.details.matchingParts.length} matching section(s) found. ${reason.details.explanation}`;
          case 'ai_generated':
            return `❌ AI-generated content detected: ${reason.details.indicators.length} indicator(s) found. ${reason.details.explanation}`;
          case 'certificate_forgery':
            return `❌ Certificate forgery detected: ${reason.details.explanation}`;
          default:
            return `❌ Issue detected: ${reason.type}`;
        }
      });

      return {
        summary: `Document rejected: ${rejectionReasons.length} issue(s) found`,
        details,
        recommendation: 'Document cannot be registered on blockchain due to authenticity concerns',
        matchingParts: results.plagiarismResults.isPlagiarized ? results.plagiarismResults.matchingParts : []
      };
    }
  }
}

// Create singleton instance
const xaiAnalyzer = new XAIAnalyzer();

module.exports = xaiAnalyzer;
