/**
 * Universal Document Parser
 * Extracts text from various document formats
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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
   * Parse PDF using Python PyPDF2
   */
  static async parsePDF(filePath) {
    const pythonScript = `
import sys
import PyPDF2

try:
    with open('${filePath.replace(/'/g, "\\'")}', 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        text = ''
        for page in pdf_reader.pages:
            text += page.extract_text() + '\\n'
        print(text)
except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;
    
    try {
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse DOCX/DOC using Python python-docx
   */
  static async parseDOCX(filePath) {
    const pythonScript = `
import sys
try:
    from docx import Document
    
    doc = Document('${filePath.replace(/'/g, "\\'")}')
    text = '\\n'.join([paragraph.text for paragraph in doc.paragraphs])
    print(text)
except ImportError:
    print('Error: python-docx not installed', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;
    
    try {
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse RTF files
   */
  static async parseRTF(filePath) {
    // Try to use Python striprtf if available, otherwise basic extraction
    const pythonScript = `
import sys
import re

try:
    with open('${filePath.replace(/'/g, "\\'")}', 'r', encoding='utf-8', errors='ignore') as file:
        content = file.read()
        # Basic RTF tag removal
        text = re.sub(r'\\{[^}]*\\}', '', content)
        text = re.sub(r'\\\\[a-z]+[0-9]*[ ]?', '', text)
        text = re.sub(r'[{}]', '', text)
        text = '\\n'.join([line.strip() for line in text.split('\\n') if line.strip()])
        print(text)
except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;
    
    try {
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`RTF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse ODT (OpenDocument Text)
   */
  static async parseODT(filePath) {
    const pythonScript = `
import sys
import zipfile
import xml.etree.ElementTree as ET

try:
    with zipfile.ZipFile('${filePath.replace(/'/g, "\\'")}', 'r') as odt_file:
        content = odt_file.read('content.xml')
        root = ET.fromstring(content)
        
        # Extract text from all paragraphs
        text = []
        for element in root.iter():
            if element.text:
                text.append(element.text)
            if element.tail:
                text.append(element.tail)
        
        print(' '.join(text))
except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;
    
    try {
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`ODT parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse PPTX/PPT using Python python-pptx
   */
  static async parsePPTX(filePath) {
    const pythonScript = `
import sys
try:
    from pptx import Presentation
    
    prs = Presentation('${filePath.replace(/'/g, "\\'")}')
    text = []
    
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text"):
                text.append(shape.text)
    
    print('\\n'.join(text))
except ImportError:
    print('Error: python-pptx not installed', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;
    
    try {
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`PPTX parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse XLSX/XLS using Python openpyxl
   */
  static async parseXLSX(filePath) {
    const pythonScript = `
import sys
try:
    from openpyxl import load_workbook
    
    wb = load_workbook('${filePath.replace(/'/g, "\\'")}', data_only=True)
    text = []
    
    for sheet in wb.worksheets:
        for row in sheet.iter_rows(values_only=True):
            row_text = ' '.join([str(cell) for cell in row if cell is not None])
            if row_text.strip():
                text.append(row_text)
    
    print('\\n'.join(text))
except ImportError:
    print('Error: openpyxl not installed', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'Error: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;
    
    try {
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`);
      return stdout.trim();
    } catch (error) {
      throw new Error(`XLSX parsing failed: ${error.message}`);
    }
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
