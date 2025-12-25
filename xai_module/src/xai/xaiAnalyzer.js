/**
 * XAI Analyzer - Main analysis engine with SHAP-like explanations
 * Provides explainable classifications for both academic and verification documents
 */

import { FeatureExtractor } from './featureExtractor.js';

export class XAIAnalyzer {
  /**
   * Analyze academic document (papers, journals, thesis)
   * @param {string} text - Normalized document text
   * @param {object} matchResults - Results from similarity matching
   * @returns {object} XAI analysis with explanations
   */
  static analyzeAcademicDocument(text, matchResults) {
    // Extract features
    const features = FeatureExtractor.extractAcademicFeatures(text);
    
    // Calculate feature contributions (SHAP-like values)
    const contributions = this.calculateAcademicContributions(features, matchResults);
    
    // Generate classification
    const classification = this.classifyAcademicDocument(contributions, matchResults);
    
    // Generate explanations
    const explanation = this.generateAcademicExplanation(classification, contributions, features);
    
    return {
      documentType: 'academic',
      classification,
      features,
      contributions,
      explanation,
      confidence: classification.confidence,
      riskLevel: classification.riskLevel,
      recommendations: this.generateRecommendations(classification)
    };
  }

  /**
   * Analyze verification document (certificates, IDs, passports)
   * @param {string} text - Normalized document text
   * @param {object} matchResults - Results from similarity matching
   * @param {object} metadata - Document metadata
   * @returns {object} XAI analysis with explanations
   */
  static analyzeVerificationDocument(text, matchResults, metadata = {}) {
    // Extract features
    const features = FeatureExtractor.extractDocumentFeatures(text, metadata);
    
    // Calculate authenticity score
    const authenticity = this.calculateAuthenticityScore(features, matchResults);
    
    // Generate classification
    const classification = this.classifyVerificationDocument(authenticity, matchResults);
    
    // Generate explanations
    const explanation = this.generateVerificationExplanation(classification, authenticity, features);
    
    return {
      documentType: 'verification',
      classification,
      features,
      authenticity,
      explanation,
      confidence: classification.confidence,
      riskLevel: classification.riskLevel,
      alerts: this.generateAlerts(classification, features)
    };
  }

  // ==================== Academic Analysis Methods ====================

  static calculateAcademicContributions(features, matchResults) {
    const contributions = {
      textualSimilarity: 0,
      lexicalPatterns: 0,
      syntacticStructure: 0,
      semanticContent: 0,
      citationPatterns: 0,
      writingStyle: 0,
      documentStructure: 0
    };

    // Textual similarity (from match results)
    if (matchResults.matchType === 'document') {
      contributions.textualSimilarity = 100;
    } else if (matchResults.matchType === 'exact_chunks' && matchResults.results.length > 0) {
      const avgScore = matchResults.results.reduce((sum, r) => sum + r.score, 0) / matchResults.results.length;
      contributions.textualSimilarity = avgScore * 100;
    } else if (matchResults.matchType === 'fuzzy_trigram' && matchResults.results.length > 0) {
      const avgScore = matchResults.results.reduce((sum, r) => sum + r.score, 0) / matchResults.results.length;
      contributions.textualSimilarity = avgScore * 50; // Fuzzy is less certain
    }

    // Lexical patterns (vocabulary richness, word patterns)
    contributions.lexicalPatterns = this.scoreLexicalPatterns(features.lexical);

    // Syntactic structure (sentence complexity, grammar)
    contributions.syntacticStructure = this.scoreSyntacticStructure(features.syntactic);

    // Semantic content (citations, references, topics)
    contributions.semanticContent = this.scoreSemanticContent(features.semantic);

    // Citation patterns
    contributions.citationPatterns = this.scoreCitationPatterns(features.semantic);

    // Writing style (formality, readability)
    contributions.writingStyle = this.scoreWritingStyle(features.stylometric);

    // Document structure
    contributions.documentStructure = this.scoreDocumentStructure(features.structure);

    return contributions;
  }

  static scoreLexicalPatterns(lexical) {
    let score = 0;
    
    // Vocabulary richness (30-70% is typical for academic writing)
    if (lexical.vocabularyRichness > 30 && lexical.vocabularyRichness < 70) {
      score += 20;
    } else {
      score += 10;
    }

    // Technical term density (academic papers should have 5-15%)
    if (lexical.technicalTermDensity > 5 && lexical.technicalTermDensity < 15) {
      score += 15;
    } else if (lexical.technicalTermDensity > 2) {
      score += 10;
    }

    // Unique word ratio (higher is better)
    score += Math.min(15, lexical.uniqueWordRatio * 30);

    return Math.min(50, score);
  }

  static scoreSyntacticStructure(syntactic) {
    let score = 0;

    // Average sentence length (15-25 words is typical for academic)
    if (syntactic.avgSentenceLength > 15 && syntactic.avgSentenceLength < 25) {
      score += 15;
    } else if (syntactic.avgSentenceLength > 10) {
      score += 10;
    }

    // Complex sentence ratio
    score += Math.min(15, syntactic.complexSentenceRatio * 30);

    // Punctuation density
    if (syntactic.punctuationDensity > 2 && syntactic.punctuationDensity < 10) {
      score += 10;
    }

    return Math.min(40, score);
  }

  static scoreSemanticContent(semantic) {
    let score = 0;

    // Citation count (papers should have citations)
    if (semantic.citationCount > 5) {
      score += 20;
    } else if (semantic.citationCount > 0) {
      score += 10;
    }

    // Citation density
    if (semantic.citationDensity > 1) {
      score += 15;
    } else if (semantic.citationDensity > 0) {
      score += 8;
    }

    // Reference patterns
    const refPatterns = semantic.referencePatterns;
    if (refPatterns.hasReferencesSection) score += 10;
    if (refPatterns.hasNumberedReferences || refPatterns.hasAuthorYearCitations) score += 5;

    return Math.min(50, score);
  }

  static scoreCitationPatterns(semantic) {
    let score = 0;
    const patterns = semantic.referencePatterns;

    if (patterns.hasReferencesSection) score += 25;
    if (patterns.hasNumberedReferences) score += 20;
    if (patterns.hasAuthorYearCitations) score += 20;
    if (patterns.hasEtAl) score += 15;

    return Math.min(80, score);
  }

  static scoreWritingStyle(stylometric) {
    let score = 0;

    // Formality score (academic should be 70+)
    if (stylometric.formalityScore > 70) {
      score += 25;
    } else if (stylometric.formalityScore > 50) {
      score += 15;
    }

    // Readability (40-60 is typical for academic)
    if (stylometric.readabilityScore > 40 && stylometric.readabilityScore < 60) {
      score += 20;
    } else {
      score += 10;
    }

    // First person usage (should be minimal in academic)
    if (stylometric.firstPersonUsage < 2) {
      score += 15;
    }

    return Math.min(60, score);
  }

  static scoreDocumentStructure(structure) {
    let score = 0;

    if (structure.hasSections) score += 25;
    if (structure.hasAbstract) score += 20;
    if (structure.hasConclusion) score += 15;
    if (structure.paragraphCount > 5) score += 10;

    return Math.min(70, score);
  }

  static classifyAcademicDocument(contributions, matchResults) {
    const totalScore = Object.values(contributions).reduce((sum, val) => sum + val, 0);
    const maxPossible = 400; // Sum of all max scores
    const overallScore = (totalScore / maxPossible) * 100;

    let label, riskLevel, confidence, actionRequired;
    const similarityPercent = contributions.textualSimilarity;

    // Academic thresholds: 0-30% acceptable, 30-40% review needed, >40% plagiarism
    if (similarityPercent > 40) {
      label = 'Plagiarism Detected';
      riskLevel = 'critical';
      confidence = 95;
      actionRequired = 'REJECT';
    } else if (similarityPercent >= 30 && similarityPercent <= 40) {
      label = 'Review Required';
      riskLevel = 'medium';
      confidence = 85;
      actionRequired = 'REVIEW';
    } else if (similarityPercent > 0 && similarityPercent < 30) {
      label = 'Acceptable';
      riskLevel = 'low';
      confidence = 90;
      actionRequired = 'APPROVE';
    } else {
      label = 'Original';
      riskLevel = 'none';
      confidence = 95;
      actionRequired = 'APPROVE';
    }

    return {
      label,
      riskLevel,
      confidence,
      actionRequired,
      overallScore: contributions.textualSimilarity,
      qualityScore: overallScore,
      threshold: {
        current: similarityPercent,
        acceptable: '0-30%',
        reviewNeeded: '30-40%',
        reject: '>40%'
      }
    };
  }

  static generateAcademicExplanation(classification, contributions, features) {
    const reasons = [];
    const similarity = contributions.textualSimilarity;

    // Primary reason based on textual similarity with threshold explanations
    if (similarity > 40) {
      reasons.push({
        factor: 'Textual Similarity',
        contribution: similarity,
        severity: 'critical',
        description: `PLAGIARISM DETECTED: ${similarity.toFixed(1)}% similarity exceeds the acceptable threshold of 40%. Large portions of the document match existing sources. This document cannot be accepted.`,
        thresholdStatus: 'EXCEEDED'
      });
    } else if (similarity >= 30 && similarity <= 40) {
      reasons.push({
        factor: 'Textual Similarity',
        contribution: similarity,
        severity: 'medium',
        description: `REVIEW REQUIRED: ${similarity.toFixed(1)}% similarity falls within the 30-40% review range. While not outright plagiarism, this requires manual review to verify proper citations and paraphrasing.`,
        thresholdStatus: 'REVIEW_ZONE'
      });
    } else if (similarity > 0 && similarity < 30) {
      reasons.push({
        factor: 'Textual Similarity',
        contribution: similarity,
        severity: 'low',
        description: `ACCEPTABLE: ${similarity.toFixed(1)}% similarity is within the acceptable range (0-30%). This level of matching is normal for academic work with proper citations and common terminology.`,
        thresholdStatus: 'ACCEPTABLE'
      });
    } else {
      reasons.push({
        factor: 'Textual Similarity',
        contribution: 0,
        severity: 'none',
        description: 'ORIGINAL: No significant text matching detected. This appears to be original work.',
        thresholdStatus: 'ORIGINAL'
      });
    }

    // Additional contributing factors
    if (contributions.lexicalPatterns < 30) {
      reasons.push({
        factor: 'Lexical Patterns',
        contribution: contributions.lexicalPatterns,
        severity: 'low',
        description: 'Unusual vocabulary patterns. May indicate non-original writing style.'
      });
    }

    if (contributions.citationPatterns < 40 && features.semantic.citationCount > 0) {
      reasons.push({
        factor: 'Citation Patterns',
        contribution: contributions.citationPatterns,
        severity: 'medium',
        description: 'Inconsistent citation formatting or missing proper references.'
      });
    }

    if (contributions.writingStyle < 40) {
      reasons.push({
        factor: 'Writing Style',
        contribution: contributions.writingStyle,
        severity: 'low',
        description: 'Writing style shows irregularities that may suggest multiple authors or sources.'
      });
    }

    return {
      summary: this.generateSummary(classification, contributions),
      reasons,
      topFactors: this.getTopContributingFactors(contributions)
    };
  }

  // ==================== Verification Document Methods ====================

  static calculateAuthenticityScore(features, matchResults) {
    const scores = {
      officialLanguage: features.textual.hasOfficialLanguage ? 20 : 0,
      serialNumber: features.textual.hasSerialNumber ? 15 : 0,
      dateFormat: features.textual.hasDateFormat ? 10 : 0,
      officialTerms: features.textual.hasOfficialStamps ? 15 : 0,
      structuralIntegrity: features.structural.hasProperFormatting ? 15 : 0,
      consistentFormatting: features.structural.hasConsistentSpacing ? 10 : 0,
      documentType: features.metadata.documentType !== 'unknown' ? 15 : 0
    };

    // Check for tampering indicators
    const tamperingScore = this.detectTampering(features, matchResults);
    scores.tamperingDetection = 100 - tamperingScore; // Invert (lower tampering = higher score)

    return scores;
  }

  static detectTampering(features, matchResults) {
    let tamperingScore = 0;

    // Check for duplicate detection (same document uploaded multiple times with changes)
    if (matchResults.matchType === 'exact_chunks' && matchResults.results.length > 0) {
      const topMatch = matchResults.results[0];
      if (topMatch.score > 0.7 && topMatch.score < 0.98) {
        // Highly similar but not exact - potential tampering
        tamperingScore += 50;
      }
    }

    // Check for formatting inconsistencies
    if (!features.structural.hasProperFormatting) {
      tamperingScore += 20;
    }

    if (!features.structural.hasConsistentSpacing) {
      tamperingScore += 15;
    }

    // Check for missing standard elements
    if (!features.textual.hasSerialNumber) {
      tamperingScore += 15;
    }

    return Math.min(100, tamperingScore);
  }

  static detectForgeryIndicators(authenticity, features, forgeryDetails) {
    // Missing serial number - critical indicator
    if (authenticity.serialNumber === 0) {
      forgeryDetails.push({
        issue: 'Missing Serial Number',
        severity: 'critical',
        explanation: 'Authentic certificates always contain a unique serial number or identification code. This document lacks any identifiable serial number.',
        recommendation: 'Reject document. Request original certificate with valid serial number.'
      });
    }

    // Missing official language/stamps
    if (authenticity.officialLanguage === 0 && authenticity.officialTerms === 0) {
      forgeryDetails.push({
        issue: 'No Official Language Detected',
        severity: 'high',
        explanation: 'The document does not contain standard official terminology (e.g., "hereby certify", "authorized", "issued by") typically found in genuine certificates.',
        recommendation: 'Verify with issuing authority. Authentic documents use formal, official language.'
      });
    }

    // Structural integrity issues
    if (authenticity.structuralIntegrity < 10) {
      forgeryDetails.push({
        issue: 'Poor Document Formatting',
        severity: 'high',
        explanation: 'The document structure and formatting appear inconsistent with standard certificate layouts. This may indicate digital manipulation or creation from non-official templates.',
        recommendation: 'Compare with known authentic certificates. Check for alignment, spacing, and layout consistency.'
      });
    }

    // Missing date format
    if (authenticity.dateFormat === 0) {
      forgeryDetails.push({
        issue: 'Missing or Invalid Date',
        severity: 'medium',
        explanation: 'No valid date information found. Authentic certificates always include issuance dates in standard formats.',
        recommendation: 'Request clarification on issuance date. Verify date format matches issuing institution standards.'
      });
    }

    // Tampering detection
    if (authenticity.tamperingDetection < 50) {
      forgeryDetails.push({
        issue: 'Signs of Tampering Detected',
        severity: 'critical',
        explanation: 'Analysis indicates possible digital manipulation or alterations to the document. Text patterns, spacing, or formatting show inconsistencies suggesting post-issuance modifications.',
        recommendation: 'Immediate manual review required. Request original physical certificate for comparison.'
      });
    }
  }

  static classifyVerificationDocument(authenticity, matchResults) {
    const totalScore = Object.values(authenticity).reduce((sum, val) => sum + val, 0) / Object.keys(authenticity).length;

    let label, riskLevel, confidence, actionRequired, forgeryDetails = [];

    // Certificate verification requires 100% match or flags as forgery
    if (matchResults.matchType === 'document') {
      // Exact 100% match - this is a duplicate
      label = '100% Match - Duplicate Document';
      riskLevel = 'critical';
      confidence = 100;
      actionRequired = 'REJECT';
      forgeryDetails.push({
        issue: 'Exact Duplicate',
        severity: 'critical',
        explanation: 'This document already exists in the database with 100% match. It has been previously submitted.',
        recommendation: 'Verify the original submission and reject this duplicate.'
      });
    } else if (matchResults.matchType === 'exact_chunks' || matchResults.matchType === 'fuzzy_trigram') {
      // Partial match - potential forgery
      const matchScore = matchResults.results.length > 0 ? matchResults.results[0].score * 100 : 0;
      
      if (matchScore > 50) {
        label = 'Suspected Forgery - Modified Document';
        riskLevel = 'critical';
        confidence = 90;
        actionRequired = 'REJECT';
        
        forgeryDetails.push({
          issue: 'Partial Match Detected',
          severity: 'critical',
          explanation: `This certificate matches ${matchScore.toFixed(1)}% with an existing document, but is not identical. This indicates potential tampering or modification of an authentic certificate.`,
          recommendation: 'Manual verification required. Compare with original document to identify alterations.'
        });
      } else {
        // Check for other forgery indicators
        this.detectForgeryIndicators(authenticity, features, forgeryDetails);
        
        if (forgeryDetails.length > 0) {
          label = 'Suspected Forgery - Authenticity Issues';
          riskLevel = 'critical';
          confidence = 85;
          actionRequired = 'REJECT';
        } else if (totalScore > 80) {
          label = 'Likely Authentic';
          riskLevel = 'low';
          confidence = 75;
          actionRequired = 'REVIEW';
        } else {
          label = 'Questionable Authenticity';
          riskLevel = 'high';
          confidence = 70;
          actionRequired = 'REJECT';
        }
      }
    } else {
      // No match found - check for forgery indicators
      this.detectForgeryIndicators(authenticity, {}, forgeryDetails);
      
      if (forgeryDetails.length > 0) {
        label = 'Suspected Forgery';
        riskLevel = 'critical';
        confidence = 80;
        actionRequired = 'REJECT';
      } else if (totalScore > 80) {
        label = 'Appears Authentic';
        riskLevel = 'low';
        confidence = 75;
        actionRequired = 'REVIEW';
      } else {
        label = 'Insufficient Evidence of Authenticity';
        riskLevel = 'high';
        confidence = 65;
        actionRequired = 'REJECT';
      }
    }

    return {
      label,
      riskLevel,
      confidence,
      actionRequired,
      authenticityScore: totalScore,
      tamperingRisk: 100 - authenticity.tamperingDetection,
      forgeryDetails,
      matchPercentage: matchResults.results?.length > 0 ? matchResults.results[0].score * 100 : 0
    };
  }

  static generateVerificationExplanation(classification, authenticity, features) {
    const reasons = [];

    // Add forgery details if present
    if (classification.forgeryDetails && classification.forgeryDetails.length > 0) {
      classification.forgeryDetails.forEach(detail => {
        reasons.push({
          factor: detail.issue,
          contribution: 0,
          severity: detail.severity,
          description: detail.explanation,
          recommendation: detail.recommendation
        });
      });
    }

    // Analyze each authenticity factor
    Object.entries(authenticity).forEach(([factor, score]) => {
      if (score < 50) {
        let description = '';
        let severity = 'medium';

        switch (factor) {
          case 'officialLanguage':
            description = 'Missing official terminology typically found in genuine documents.';
            severity = 'high';
            break;
          case 'serialNumber':
            description = 'No valid serial number or identification code detected. Authentic certificates always have unique identifiers.';
            severity = 'critical';
            break;
          case 'dateFormat':
            description = 'Date format is missing or inconsistent with standard formats used by official institutions.';
            severity = 'medium';
            break;
          case 'structuralIntegrity':
            description = 'Document structure shows irregularities in formatting that deviate from official templates.';
            severity = 'high';
            break;
          case 'tamperingDetection':
            description = 'Signs of possible tampering or alteration detected. Document may have been digitally modified.';
            severity = 'critical';
            break;
        }

        if (description) {
          reasons.push({
            factor: factor.replace(/([A-Z])/g, ' $1').trim(),
            contribution: score,
            severity,
            description
          });
        }
      }
    });

    return {
      summary: this.generateVerificationSummary(classification, authenticity),
      reasons,
      documentType: features?.metadata?.documentType || 'unknown',
      requiresExactMatch: true,
      matchThreshold: '100%'
    };
  }

  // ==================== Helper Methods ====================

  static generateSummary(classification, contributions) {
    const topFactor = Object.entries(contributions)
      .sort((a, b) => b[1] - a[1])[0];

    return `The document is classified as "${classification.label}" with ${classification.confidence}% confidence. ` +
           `The primary concern is ${topFactor[0]} (${topFactor[1].toFixed(1)}% contribution). ` +
           `Overall quality score: ${classification.qualityScore.toFixed(1)}/100.`;
  }

  static generateVerificationSummary(classification, authenticity) {
    return `The document is classified as "${classification.label}" with ${classification.confidence}% confidence. ` +
           `Authenticity score: ${classification.authenticityScore.toFixed(1)}/100. ` +
           `Tampering risk: ${classification.tamperingRisk.toFixed(1)}%.`;
  }

  static getTopContributingFactors(contributions) {
    return Object.entries(contributions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([factor, score]) => ({
        factor: factor.replace(/([A-Z])/g, ' $1').trim(),
        score: score.toFixed(1),
        percentage: ((score / 100) * 100).toFixed(1)
      }));
  }

  static generateRecommendations(classification) {
    const recommendations = [];

    if (classification.riskLevel === 'critical' || classification.riskLevel === 'high') {
      recommendations.push('Conduct manual review of all flagged sections');
      recommendations.push('Compare with original sources directly');
      recommendations.push('Request author clarification on similarities');
    }

    if (classification.riskLevel === 'medium') {
      recommendations.push('Review flagged sections for proper attribution');
      recommendations.push('Verify citation formats');
      recommendations.push('Check paraphrasing quality');
    }

    if (classification.qualityScore < 50) {
      recommendations.push('Improve document structure and formatting');
      recommendations.push('Add proper citations and references');
      recommendations.push('Enhance writing quality and consistency');
    }

    return recommendations;
  }

  static generateAlerts(classification, features) {
    const alerts = [];

    if (classification.riskLevel === 'critical') {
      alerts.push({
        level: 'critical',
        message: 'CRITICAL: Suspected document forgery or tampering detected'
      });
    }

    if (!features.textual.hasSerialNumber) {
      alerts.push({
        level: 'high',
        message: 'WARNING: No valid serial number found'
      });
    }

    if (!features.textual.hasDateFormat) {
      alerts.push({
        level: 'medium',
        message: 'NOTICE: Date information missing or improperly formatted'
      });
    }

    if (features.metadata.documentType === 'unknown') {
      alerts.push({
        level: 'medium',
        message: 'NOTICE: Unable to determine document type'
      });
    }

    return alerts;
  }
}
