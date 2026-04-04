/**
 * Universal Document Parser
 * Extracts text from various document formats
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

let pdfParse = null;
try {
  // Loaded lazily-safe in case dependency installation is incomplete.
  pdfParse = require('pdf-parse');
} catch (_) {
  pdfParse = null;
}

class DocumentParser {
  /**
   * Parse document and extract text based on file type
   * @param {string} filePath - Path to the document file
   * @returns {Promise<string>} - Extracted text content
   */
  static async parseDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      switch (ext) {
        case '.txt':
        case '.md':
        case '.csv':
        case '.html':
        case '.htm':
        case '.tex':
          return await this.parseTextFile(filePath);
        
        case '.pdf':
          return await this.parsePDF(filePath);
        
        case '.docx':
        case '.doc':
          return await this.parseDOCX(filePath);
        
        case '.rtf':
          return await this.parseRTF(filePath);
        
        case '.odt':
          return await this.parseODT(filePath);
        
        case '.pptx':
        case '.ppt':
          return await this.parsePPTX(filePath);
        
        case '.xlsx':
        case '.xls':
          return await this.parseXLSX(filePath);
        
        default:
          // Try to read as text file
          return await this.parseTextFile(filePath);
      }
    } catch (error) {
      console.error(`Error parsing ${ext} file:`, error.message);
      throw new Error(`Failed to parse ${ext} file: ${error.message}`);
    }
  }

  /**
   * Parse plain text files
   */
  static async parseTextFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * Parse PDF using pdf-parse (pure Node.js)
   */
  static async parsePDF(filePath) {
    if (!pdfParse) {
      throw new Error('pdf-parse is not installed. Run: npm install pdf-parse');
    }

    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return (data?.text || '').trim();
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse DOCX using mammoth.
   * Legacy .doc is not supported by mammoth and should be converted to .docx.
   */
  static async parseDOCX(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.doc') {
      throw new Error('Legacy .doc is not supported. Please convert to .docx and retry.');
    }

    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return (result?.value || '').trim();
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse RTF files
   */
  static async parseRTF(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return this.stripRtf(content);
    } catch (error) {
      throw new Error(`RTF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse ODT by reading content.xml from the zip container.
   */
  static async parseODT(filePath) {
    try {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry('content.xml');
      if (!entry) {
        throw new Error('content.xml not found inside ODT archive');
      }

      const xml = entry.getData().toString('utf8');
      return this.stripXml(xml);
    } catch (error) {
      throw new Error(`ODT parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse PPTX by reading slide XML files from the zip container.
   * Legacy .ppt binary files are not supported in this Node-only parser.
   */
  static async parsePPTX(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ppt') {
      throw new Error('Legacy .ppt is not supported. Please convert to .pptx and retry.');
    }

    try {
      const zip = new AdmZip(filePath);
      const entries = zip
        .getEntries()
        .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

      const texts = entries.map((entry) => {
        const xml = entry.getData().toString('utf8');
        return this.stripXml(xml);
      });

      return texts.join('\n').trim();
    } catch (error) {
      throw new Error(`PPTX parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse XLSX/XLS using xlsx package
   */
  static async parseXLSX(filePath) {
    try {
      const workbook = XLSX.readFile(filePath, { cellDates: true });
      const allRows = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

        for (const row of rows) {
          const rowText = row
            .filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
            .map((cell) => String(cell).trim())
            .join(' ');

          if (rowText) {
            allRows.push(rowText);
          }
        }
      }

      return allRows.join('\n').trim();
    } catch (error) {
      throw new Error(`XLSX parsing failed: ${error.message}`);
    }
  }

  static stripXml(xmlContent) {
    return xmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static stripRtf(rtfContent) {
    return rtfContent
      .replace(/\\par[d]?/g, '\n')
      .replace(/\\'[0-9a-fA-F]{2}/g, '')
      .replace(/\\[a-z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  /**
   * Get file info including size and type
   */
  static getFileInfo(filePath) {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    return {
      size: stats.size,
      extension: ext,
      sizeKB: (stats.size / 1024).toFixed(2),
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
    };
  }
}

module.exports = DocumentParser;
