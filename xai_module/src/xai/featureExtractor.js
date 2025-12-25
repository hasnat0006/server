/**
 * XAI Feature Extractor
 * Extracts features for both Academic Documents and Verification Documents
 */

export class FeatureExtractor {
  /**
   * Extract features from academic documents (papers, journals, thesis)
   */
  static extractAcademicFeatures(text) {
    const features = {
      // Lexical Features
      lexical: {
        wordCount: this.countWords(text),
        uniqueWordRatio: this.calculateUniqueWordRatio(text),
        avgWordLength: this.calculateAvgWordLength(text),
        vocabularyRichness: this.calculateVocabularyRichness(text),
        technicalTermDensity: this.calculateTechnicalTermDensity(text)
      },
      
      // Syntactic Features
      syntactic: {
        sentenceCount: this.countSentences(text),
        avgSentenceLength: this.calculateAvgSentenceLength(text),
        complexSentenceRatio: this.calculateComplexSentenceRatio(text),
        punctuationDensity: this.calculatePunctuationDensity(text)
      },
      
      // Semantic Features
      semantic: {
        citationCount: this.countCitations(text),
        citationDensity: this.calculateCitationDensity(text),
        referencePatterns: this.extractReferencePatterns(text),
        topicKeywords: this.extractTopicKeywords(text)
      },
      
      // Stylometric Features
      stylometric: {
        formalityScore: this.calculateFormalityScore(text),
        readabilityScore: this.calculateReadabilityScore(text),
        passiveVoiceRatio: this.calculatePassiveVoiceRatio(text),
        firstPersonUsage: this.countFirstPersonUsage(text)
      },
      
      // Structure Features
      structure: {
        hasSections: this.detectSections(text),
        hasAbstract: this.detectAbstract(text),
        hasConclusion: this.detectConclusion(text),
        paragraphCount: this.countParagraphs(text)
      }
    };
    
    return features;
  }

  /**
   * Extract features from verification documents (certificates, IDs, passports)
   */
  static extractDocumentFeatures(text, metadata = {}) {
    const features = {
      // Text-based Features
      textual: {
        hasOfficialLanguage: this.detectOfficialLanguage(text),
        hasSerialNumber: this.detectSerialNumber(text),
        hasDateFormat: this.detectDateFormat(text),
        hasOfficialStamps: this.detectOfficialTerms(text),
        textDensity: this.calculateTextDensity(text)
      },
      
      // Pattern Recognition
      patterns: {
        hasIDPattern: this.detectIDPattern(text),
        hasNameFormat: this.detectNameFormat(text),
        hasAddressFormat: this.detectAddressFormat(text),
        hasInstitutionName: this.detectInstitutionName(text)
      },
      
      // Structural Features
      structural: {
        wordCount: this.countWords(text),
        lineCount: this.countLines(text),
        hasProperFormatting: this.checkProperFormatting(text),
        hasConsistentSpacing: this.checkConsistentSpacing(text)
      },
      
      // Metadata Features
      metadata: {
        fileSize: metadata.fileSize || 0,
        pageCount: metadata.pageCount || 1,
        hasWatermark: false, // Would need image processing
        documentType: this.detectDocumentType(text)
      }
    };
    
    return features;
  }

  // ==================== Helper Methods ====================

  static countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  static countSentences(text) {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  }

  static countParagraphs(text) {
    return text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  }

  static countLines(text) {
    return text.split(/\n/).length;
  }

  static calculateUniqueWordRatio(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words);
    return words.length > 0 ? uniqueWords.size / words.length : 0;
  }

  static calculateAvgWordLength(text) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return 0;
    const totalLength = words.reduce((sum, word) => sum + word.length, 0);
    return totalLength / words.length;
  }

  static calculateAvgSentenceLength(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return sentences.length > 0 ? words.length / sentences.length : 0;
  }

  static calculateVocabularyRichness(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const uniqueWords = new Set(words);
    // Type-Token Ratio (TTR)
    return words.length > 0 ? (uniqueWords.size / words.length) * 100 : 0;
  }

  static calculateTechnicalTermDensity(text) {
    const technicalPatterns = [
      /\b(algorithm|methodology|hypothesis|analysis|framework|implementation)\b/gi,
      /\b(research|study|investigation|experiment|evaluation)\b/gi,
      /\b(significant|correlation|statistical|empirical|theoretical)\b/gi
    ];
    
    let technicalCount = 0;
    technicalPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) technicalCount += matches.length;
    });
    
    const totalWords = this.countWords(text);
    return totalWords > 0 ? (technicalCount / totalWords) * 100 : 0;
  }

  static calculateComplexSentenceRatio(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const complexSentences = sentences.filter(s => {
      const words = s.split(/\s+/).length;
      const hasConjunctions = /\b(however|therefore|moreover|furthermore|although|because)\b/i.test(s);
      return words > 20 || hasConjunctions;
    });
    return sentences.length > 0 ? complexSentences.length / sentences.length : 0;
  }

  static calculatePunctuationDensity(text) {
    const punctuation = text.match(/[,;:()""''—–-]/g) || [];
    const words = this.countWords(text);
    return words > 0 ? (punctuation.length / words) * 100 : 0;
  }

  static countCitations(text) {
    const citationPatterns = [
      /\[[0-9]+\]/g,  // [1], [2]
      /\([A-Za-z]+,?\s+\d{4}\)/g,  // (Author, 2023)
      /et al\./gi  // et al.
    ];
    
    let citationCount = 0;
    citationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) citationCount += matches.length;
    });
    
    return citationCount;
  }

  static calculateCitationDensity(text) {
    const citations = this.countCitations(text);
    const words = this.countWords(text);
    return words > 0 ? (citations / words) * 1000 : 0; // Citations per 1000 words
  }

  static extractReferencePatterns(text) {
    const patterns = {
      hasNumberedReferences: /\[\d+\]/.test(text),
      hasAuthorYearCitations: /\([A-Za-z]+,?\s+\d{4}\)/.test(text),
      hasEtAl: /et al\./.test(text),
      hasReferencesSection: /\b(references|bibliography)\b/i.test(text)
    };
    return patterns;
  }

  static extractTopicKeywords(text) {
    // Simple keyword extraction (in real implementation, use TF-IDF or NLP)
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 5 && !/^(about|after|before|could|should|would|their|there|which|where)$/.test(w));
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    const sorted = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
    
    return sorted;
  }

  static calculateFormalityScore(text) {
    const formalMarkers = text.match(/\b(therefore|thus|consequently|furthermore|moreover|however)\b/gi) || [];
    const informalMarkers = text.match(/\b(gonna|wanna|kinda|yeah|okay|cool)\b/gi) || [];
    const totalWords = this.countWords(text);
    
    if (totalWords === 0) return 50;
    
    const formalScore = (formalMarkers.length / totalWords) * 1000;
    const informalScore = (informalMarkers.length / totalWords) * 1000;
    
    return Math.min(100, Math.max(0, 50 + (formalScore - informalScore) * 10));
  }

  static calculateReadabilityScore(text) {
    // Flesch Reading Ease approximation
    const sentences = this.countSentences(text);
    const words = this.countWords(text);
    const syllables = text.split(/[aeiou]/gi).length - 1; // Rough syllable count
    
    if (sentences === 0 || words === 0) return 0;
    
    const avgSentenceLength = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    const score = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
    return Math.min(100, Math.max(0, score));
  }

  static calculatePassiveVoiceRatio(text) {
    const passivePatterns = /\b(was|were|been|being)\s+\w+ed\b/gi;
    const passiveMatches = text.match(passivePatterns) || [];
    const sentences = this.countSentences(text);
    return sentences > 0 ? passiveMatches.length / sentences : 0;
  }

  static countFirstPersonUsage(text) {
    const firstPersonPronouns = text.match(/\b(I|we|my|our|me|us)\b/gi) || [];
    const words = this.countWords(text);
    return words > 0 ? (firstPersonPronouns.length / words) * 100 : 0;
  }

  static detectSections(text) {
    const sectionPatterns = [
      /\b(introduction|methodology|results|discussion|conclusion)\b/i,
      /^\s*\d+\.\s+[A-Z]/m,  // Numbered sections
      /^[A-Z][A-Z\s]+$/m  // ALL CAPS headers
    ];
    return sectionPatterns.some(pattern => pattern.test(text));
  }

  static detectAbstract(text) {
    return /\babstract\b/i.test(text);
  }

  static detectConclusion(text) {
    return /\b(conclusion|summary|final remarks)\b/i.test(text);
  }

  static detectOfficialLanguage(text) {
    const officialTerms = /\b(hereby|certify|authorized|official|issued|valid|bearer)\b/i;
    return officialTerms.test(text);
  }

  static detectSerialNumber(text) {
    const serialPatterns = [
      /\b[A-Z]{2,}\d{5,}\b/,  // AB123456
      /\b\d{8,}\b/,  // 12345678
      /\b[A-Z]\d{7,}\b/  // A1234567
    ];
    return serialPatterns.some(pattern => pattern.test(text));
  }

  static detectDateFormat(text) {
    const datePatterns = [
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,  // DD/MM/YYYY
      /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/,  // YYYY-MM-DD
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i
    ];
    return datePatterns.some(pattern => pattern.test(text));
  }

  static detectOfficialStamps(text) {
    const stampTerms = /\b(seal|stamp|signature|emblem|logo|watermark)\b/i;
    return stampTerms.test(text);
  }

  static calculateTextDensity(text) {
    const totalChars = text.length;
    const totalWords = this.countWords(text);
    return totalWords > 0 ? totalChars / totalWords : 0;
  }

  static detectIDPattern(text) {
    // Common ID patterns: passport, national ID, etc.
    const idPatterns = [
      /\b(passport|id|identification)\s*(no\.?|number)?:?\s*[A-Z0-9]+/i,
      /\bNID:?\s*\d+/i,
      /\b[A-Z]{1,2}\d{6,9}\b/
    ];
    return idPatterns.some(pattern => pattern.test(text));
  }

  static detectNameFormat(text) {
    // Detect formal name formats
    const namePatterns = [
      /\b(name|full name):?\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)+/i,
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/
    ];
    return namePatterns.some(pattern => pattern.test(text));
  }

  static detectAddressFormat(text) {
    const addressKeywords = /\b(address|residence|street|city|state|zip|postal)\b/i;
    return addressKeywords.test(text);
  }

  static detectInstitutionName(text) {
    const institutionPatterns = [
      /\b(university|college|institute|academy|school)\b/i,
      /\b(department|ministry|government|bureau|authority)\b/i,
      /\b(hospital|clinic|medical center)\b/i
    ];
    return institutionPatterns.some(pattern => pattern.test(text));
  }

  static checkProperFormatting(text) {
    // Check if document has consistent formatting
    const hasConsistentCapitalization = !/[a-z][A-Z]/.test(text); // No mid-word caps
    const hasProperSpacing = !/\s{3,}/.test(text); // No excessive spaces
    return hasConsistentCapitalization && hasProperSpacing;
  }

  static checkConsistentSpacing(text) {
    const irregularSpacing = text.match(/\s{2,}/g) || [];
    const lines = this.countLines(text);
    return lines > 0 ? irregularSpacing.length / lines < 0.3 : true;
  }

  static detectDocumentType(text) {
    const types = {
      certificate: /\b(certificate|certification|diploma)\b/i.test(text),
      passport: /\b(passport|travel document)\b/i.test(text),
      nationalID: /\b(national id|identity card|citizen)\b/i.test(text),
      transcript: /\b(transcript|academic record|grade)\b/i.test(text),
      license: /\b(license|permit|authorization)\b/i.test(text)
    };
    
    for (const [type, detected] of Object.entries(types)) {
      if (detected) return type;
    }
    return 'unknown';
  }

  static calculateTextDensity(text) {
    const chars = text.length;
    const words = this.countWords(text);
    return words > 0 ? chars / words : 0;
  }
}
