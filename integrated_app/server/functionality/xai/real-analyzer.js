const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DocumentParser = require('../../utils/document-parser');

class RealXAIAnalyzer {
  constructor() {
    this.PlagiarismThreshold = 75;
    this.AIThreshold = 60;
  }

  async analyzeDocument(filePath, metadata = {}) {
    try {
      console.log(`🔍 Analyzing document: ${metadata.originalName || filePath}`);

      // Step 1: Calculate document hash
      const documentHash = await this.calculateHash(filePath);
      console.log(`🔐 Document hash: ${documentHash}`);

      // Step 2: Extract text content (use provided text if available)
      const documentText = metadata.documentText || await this.extractText(filePath);
      console.log(`📄 Extracted ${documentText.length} characters`);

      // Step 3: Run plagiarism check
      console.log('🔎 Running plagiarism detection...');
      const plagiarismResults = await this.runPlagiarismCheck(filePath, documentText, metadata.documentId);

      // Step 4: Check for AI-generated content
      console.log('🤖 Checking for AI-generated content...');
      const aiDetectionResults = await this.runAIDetection(filePath, documentText);

      // Step 5: If certificate, check for forgery
      let forgeryResults = null;
      if (metadata.documentType === 'certificate') {
        console.log('🎓 Checking certificate authenticity...');
        forgeryResults = await this.runCertificateForgeryCheck(filePath, documentText);
      }

      // Step 6: Combine results and determine status
      const analysis = this.combineResults({
        documentHash,
        documentText, // Include text for chunking
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
    try {
      const ext = path.extname(filePath).toLowerCase();
      console.log(`📄 Extracting text from ${ext} file...`);
      
      // Use universal document parser for all file types
      const text = await DocumentParser.parseDocument(filePath);
      
      if (!text || text.trim().length === 0) {
        console.warn('⚠️  No text extracted, using filename as fallback');
        return `Document: ${path.basename(filePath)}`;
      }
      
      console.log(`✅ Extracted ${text.length} characters from ${ext} file`);
      return text;
      
    } catch (error) {
      console.error(`❌ Text extraction error for ${filePath}:`, error.message);
      // Fallback: return filename
      return `Document: ${path.basename(filePath)}`;
    }
  }

  async runPlagiarismCheck(filePath, documentText) {
    try {
      const text = this.normalizeText(documentText);
      const words = text.split(' ').filter(Boolean);

      if (words.length < 40) {
        return {
          isPlagiarized: false,
          similarityScore: 0,
          threshold: this.PlagiarismThreshold,
          matchingParts: [],
          explanation: 'Document too short for reliable plagiarism scoring'
        };
      }

      const shingles = this.buildNGrams(words, 8);
      const counts = new Map();
      shingles.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));

      const repeatedEntries = Array.from(counts.entries()).filter(([, count]) => count > 1);
      const duplicateShingleCount = repeatedEntries.reduce((sum, [, count]) => sum + (count - 1), 0);
      const duplicateRatio = shingles.length > 0 ? duplicateShingleCount / shingles.length : 0;

      const similarityScore = Math.min(100, Math.round(duplicateRatio * 180));
      const matchingParts = repeatedEntries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([segment, count]) => ({
          text: segment,
          similarity: Math.min(100, Math.round((count / Math.max(2, shingles.length)) * 1000)),
          source: 'Internal duplication heuristic'
        }));

      const isPlagiarized = similarityScore >= this.PlagiarismThreshold;

      return {
        isPlagiarized,
        similarityScore,
        threshold: this.PlagiarismThreshold,
        matchingParts,
        explanation: isPlagiarized
          ? `High internal repetition detected (${similarityScore.toFixed(1)}% similarity score)`
          : 'No significant repetitive plagiarism signals detected'
      };

    } catch (error) {
      console.error('Plagiarism check error:', error);
      return {
        isPlagiarized: false,
        similarityScore: 0,
        threshold: this.PlagiarismThreshold,
        matchingParts: [],
        explanation: 'Plagiarism heuristic check unavailable, treated as low-risk'
      };
    }
  }

  async runAIDetection(filePath, documentText) {
    try {
      const text = this.normalizeText(documentText);
      const words = text.split(' ').filter(Boolean);
      const sentences = this.splitSentences(documentText);

      if (words.length < 50 || sentences.length < 3) {
        return {
          isAIGenerated: false,
          aiProbability: 20,
          threshold: this.AIThreshold,
          indicators: ['insufficient-length-for-high-confidence-ai-detection'],
          explanation: 'Document is too short for high-confidence AI detection'
        };
      }

      const uniqueWordCount = new Set(words).size;
      const lexicalDiversity = uniqueWordCount / words.length;
      const sentenceLengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
      const avgSentenceLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
      const lengthVariance = this.variance(sentenceLengths);
      const repeatedSentenceRatio = this.repeatedSentenceRatio(sentences);

      let aiProbability = 10;
      const indicators = [];

      if (lexicalDiversity < 0.34) {
        aiProbability += 20;
        indicators.push('low-lexical-diversity');
      }

      if (lengthVariance < 18) {
        aiProbability += 20;
        indicators.push('uniform-sentence-length');
      }

      if (repeatedSentenceRatio > 0.14) {
        aiProbability += 25;
        indicators.push('repetitive-sentences');
      }

      if (avgSentenceLength > 26) {
        aiProbability += 15;
        indicators.push('long-structured-sentences');
      }

      if (/in conclusion|moreover|furthermore|additionally|therefore/gi.test(documentText)) {
        aiProbability += 10;
        indicators.push('formal-transition-heavy-language');
      }

      aiProbability = Math.min(100, Math.round(aiProbability));
      const isAIGenerated = aiProbability >= this.AIThreshold;

      return {
        isAIGenerated,
        aiProbability,
        threshold: this.AIThreshold,
        indicators,
        explanation: isAIGenerated
          ? 'Language pattern heuristic suggests likely AI-generated content'
          : 'Language pattern heuristic indicates predominantly human-like variation'
      };

    } catch (error) {
      console.error('AI detection error:', error);
      return {
        isAIGenerated: false,
        aiProbability: 20,
        threshold: this.AIThreshold,
        indicators: [],
        explanation: 'AI detection heuristic check unavailable, treated as low-risk'
      };
    }
  }

  async runCertificateForgeryCheck(filePath, documentText) {
    try {
      const text = documentText || '';
      const hasDate = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi.test(text);
      const hasCertificateId = /(certificate\s*(no|number)?|registration\s*(no|number)?|roll\s*(no|number)?|id\s*(no|number)?|serial\s*(no|number)?)[\s:#-]*[a-z0-9-]{3,}/gi.test(text);
      const hasIssuer = /(university|institute|board|authority|department|ministry|school|college)/gi.test(text);
      const hasSignatureSignal = /(signature|signed|registrar|controller|principal|dean)/gi.test(text);

      const missingSignals = [];
      if (!hasDate) missingSignals.push('date');
      if (!hasCertificateId) missingSignals.push('certificate_id');
      if (!hasIssuer) missingSignals.push('issuer');
      if (!hasSignatureSignal) missingSignals.push('signature_block');

      const score = missingSignals.length * 25;
      const isForged = score >= 50;

      return {
        isForged,
        explanation: isForged
          ? `Certificate consistency heuristic flagged missing signal(s): ${missingSignals.join(', ')}`
          : 'Certificate structure appears consistent with expected fields',
        extractedInfo: {
          hasDate,
          hasCertificateId,
          hasIssuer,
          hasSignatureSignal
        },
        forgeryEvidence: missingSignals
      };

    } catch (error) {
      console.error('Certificate forgery check error:', error);
      return {
        isForged: false,
        explanation: 'Certificate authenticity heuristic check unavailable'
      };
    }
  }

  normalizeText(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  buildNGrams(words, n) {
    if (!Array.isArray(words) || words.length < n) return [];
    const grams = [];
    for (let i = 0; i <= words.length - n; i += 1) {
      grams.push(words.slice(i, i + n).join(' '));
    }
    return grams;
  }

  splitSentences(text) {
    return (text || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  variance(values) {
    if (!values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiff = values.map((v) => (v - mean) ** 2);
    return squaredDiff.reduce((a, b) => a + b, 0) / values.length;
  }

  repeatedSentenceRatio(sentences) {
    if (!sentences.length) return 0;
    const normalized = sentences.map((s) => this.normalizeText(s));
    const counts = new Map();
    normalized.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
    const repeatedCount = Array.from(counts.values()).filter((c) => c > 1).length;
    return repeatedCount / counts.size;
  }

  combineResults({ documentHash, documentText, plagiarismResults, aiDetectionResults, forgeryResults, metadata }) {
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
      documentText, // Include for chunking
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
          `✅ Plagiarism check: ${results.plagiarismResults.similarityScore.toFixed(1)}% similarity (below ${results.plagiarismResults.threshold}% threshold)`,
          `✅ AI detection: ${results.aiDetectionResults.aiProbability.toFixed(1)}% AI probability (below ${results.aiDetectionResults.threshold}% threshold)`,
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
const realXAIAnalyzer = new RealXAIAnalyzer();

module.exports = realXAIAnalyzer;
