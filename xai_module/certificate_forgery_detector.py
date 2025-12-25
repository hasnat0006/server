"""
Certificate Forgery Detection Module
Detects forged certificates by comparing with database records
"""

import json
import sys
import re
from typing import Dict, List, Optional
from datetime import datetime
import hashlib


class CertificateForgeryDetector:
    """
    Detects certificate forgery by analyzing content and comparing with known certificates
    """
    
    def __init__(self):
        """Initialize the certificate forgery detector."""
        self.known_certificates = []
        
    def extract_certificate_info(self, text: str) -> Dict:
        """Extract key information from certificate text."""
        info = {
            'holder_name': None,
            'issue_date': None,
            'certificate_number': None,
            'issuing_authority': None,
            'qualification': None
        }
        
        # Extract name (common patterns)
        name_patterns = [
            r'(?:name|holder|awarded to|presented to)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)',
            r'(?:mr\.|ms\.|mrs\.|dr\.)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)',
            r'(?:this is to certify that)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)'
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                info['holder_name'] = match.group(1).strip()
                break
        
        # Extract date patterns
        date_patterns = [
            r'(?:date|issued on|awarded on)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
            r'(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})',
            r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})'
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                info['issue_date'] = match.group(1).strip()
                break
        
        # Extract certificate number
        cert_patterns = [
            r'(?:certificate|cert|serial|reg|registration) (?:no|number|#)[:\s]*([A-Z0-9-]+)',
            r'(?:number|no)[:\s]*([A-Z]{2,4}[-]?\d{4,8})'
        ]
        
        for pattern in cert_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                info['certificate_number'] = match.group(1).strip()
                break
        
        # Extract issuing authority
        auth_patterns = [
            r'(?:issued by|awarded by|from|by)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,5})',
            r'(University of [A-Z][a-z]+)',
            r'((?:[A-Z][a-z]+\s+){1,3}(?:University|Institute|College|Academy))'
        ]
        
        for pattern in auth_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                info['issuing_authority'] = match.group(1).strip()
                break
        
        # Extract qualification/degree
        qual_patterns = [
            r'(Bachelor of (?:Arts|Science|Engineering|Technology))',
            r'(Master of (?:Arts|Science|Engineering|Technology|Business Administration))',
            r'((?:B\.?S\.?|M\.?S\.?|B\.?Tech|M\.?Tech|MBA|Ph\.?D\.?))',
            r'(?:degree|diploma|certificate) (?:in|of)\s+([A-Za-z\s]+)'
        ]
        
        for pattern in qual_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                info['qualification'] = match.group(1).strip()
                break
        
        return info
    
    def calculate_similarity(self, info1: Dict, info2: Dict) -> float:
        """Calculate similarity between two certificate information dictionaries."""
        score = 0
        total_fields = 0
        
        fields_to_compare = ['holder_name', 'certificate_number', 'issuing_authority', 'qualification']
        
        for field in fields_to_compare:
            val1 = info1.get(field)
            val2 = info2.get(field)
            
            if val1 and val2:
                total_fields += 1
                # Exact match
                if val1.lower() == val2.lower():
                    score += 1
                # Partial match (for names and authorities)
                elif field in ['holder_name', 'issuing_authority']:
                    words1 = set(val1.lower().split())
                    words2 = set(val2.lower().split())
                    overlap = len(words1.intersection(words2))
                    total = len(words1.union(words2))
                    if total > 0:
                        score += overlap / total
        
        return score / total_fields if total_fields > 0 else 0.0
    
    def find_template_match(self, text: str, cert_info: Dict) -> Optional[Dict]:
        """Find if certificate matches known template but with different credentials."""
        text_lower = text.lower()
        text_clean = re.sub(r'\s+', ' ', text_lower).strip()
        
        for known_cert in self.known_certificates:
            known_text = known_cert.get('text', '').lower()
            known_text_clean = re.sub(r'\s+', ' ', known_text).strip()
            known_info = known_cert.get('extracted_info', {})
            
            # Check if template matches but credentials differ
            # Remove personal info and compare structure
            text_template = self.create_template(text_clean, cert_info)
            known_template = self.create_template(known_text_clean, known_info)
            
            template_similarity = self.calculate_template_similarity(text_template, known_template)
            
            if template_similarity > 0.85:  # High template similarity
                # Check if credentials are different
                credentials_different = (
                    cert_info.get('holder_name') != known_info.get('holder_name') or
                    cert_info.get('certificate_number') != known_info.get('certificate_number')
                )
                
                if credentials_different:
                    return {
                        'matched_certificate': known_cert.get('id'),
                        'template_similarity': round(template_similarity * 100, 2),
                        'original_holder': known_info.get('holder_name'),
                        'original_cert_number': known_info.get('certificate_number'),
                        'original_issue_date': known_info.get('issue_date')
                    }
        
        return None
    
    def create_template(self, text: str, info: Dict) -> str:
        """Create template by removing specific credentials."""
        template = text
        
        # Replace specific values with placeholders
        if info.get('holder_name'):
            template = template.replace(info['holder_name'].lower(), '[NAME]')
        if info.get('certificate_number'):
            template = template.replace(info['certificate_number'].lower(), '[CERT_NUM]')
        if info.get('issue_date'):
            template = template.replace(info['issue_date'].lower(), '[DATE]')
        
        return template
    
    def calculate_template_similarity(self, template1: str, template2: str) -> float:
        """Calculate similarity between two templates."""
        words1 = set(template1.split())
        words2 = set(template2.split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0.0
    
    def analyze_certificate(self, text: str, cert_id: str = None) -> Dict:
        """
        Perform comprehensive forgery detection analysis.
        
        Args:
            text: Certificate text content
            cert_id: Optional certificate identifier
            
        Returns:
            Dictionary containing analysis results
        """
        # Extract certificate information
        cert_info = self.extract_certificate_info(text)
        
        # Check for template match (forgery)
        template_match = self.find_template_match(text, cert_info)
        
        is_forged = template_match is not None
        
        # Check against exact duplicates
        duplicates = []
        for known_cert in self.known_certificates:
            known_info = known_cert.get('extracted_info', {})
            similarity = self.calculate_similarity(cert_info, known_info)
            
            if similarity > 0.90:  # Very high similarity
                duplicates.append({
                    'certificate_id': known_cert.get('id'),
                    'similarity': round(similarity * 100, 2),
                    'holder_name': known_info.get('holder_name')
                })
        
        result = {
            'certificate_id': cert_id,
            'is_forged': is_forged,
            'extracted_info': cert_info,
            'forgery_evidence': template_match,
            'duplicate_certificates': duplicates,
            'confidence': self.calculate_confidence(is_forged, template_match, duplicates),
            'explanation': self.generate_explanation(is_forged, template_match, duplicates, cert_info)
        }
        
        return result
    
    def calculate_confidence(self, is_forged: bool, template_match: Optional[Dict], duplicates: List[Dict]) -> int:
        """Calculate confidence score for forgery detection."""
        if not is_forged:
            return 100
        
        confidence = 0
        if template_match:
            confidence = int(template_match['template_similarity'])
        elif duplicates:
            confidence = int(max(d['similarity'] for d in duplicates))
        
        return confidence
    
    def generate_explanation(self, is_forged: bool, template_match: Optional[Dict], 
                           duplicates: List[Dict], cert_info: Dict) -> str:
        """Generate human-readable explanation."""
        if not is_forged:
            return "Certificate appears authentic. No matching templates or duplicates found in database."
        
        if template_match:
            explanation = (
                f"Certificate forgery detected! This certificate uses the same template as "
                f"certificate '{template_match['matched_certificate']}' but with different credentials. "
                f"Template similarity: {template_match['template_similarity']}%. "
                f"Original holder: {template_match['original_holder']}. "
                f"This suggests the certificate has been modified or forged."
            )
        elif duplicates:
            dup = duplicates[0]
            explanation = (
                f"Duplicate certificate detected! Found {len(duplicates)} certificate(s) with "
                f"very similar information ({dup['similarity']}% similarity). "
                f"Possible duplicate of certificate issued to {dup['holder_name']}."
            )
        else:
            explanation = "Certificate flagged for review due to suspicious patterns."
        
        return explanation
    
    def add_known_certificate(self, cert_id: str, text: str, extracted_info: Dict = None):
        """Add a certificate to the known certificates database."""
        if extracted_info is None:
            extracted_info = self.extract_certificate_info(text)
        
        self.known_certificates.append({
            'id': cert_id,
            'text': text,
            'extracted_info': extracted_info,
            'added_date': datetime.now().isoformat()
        })
    
    def load_known_certificates(self, certificates: List[Dict]):
        """Load multiple known certificates."""
        self.known_certificates.extend(certificates)


def main():
    """Command-line interface for certificate forgery detection."""
    if len(sys.argv) < 2:
        print("Usage: python certificate_forgery_detector.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        # Read certificate
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        # Initialize detector
        detector = CertificateForgeryDetector()
        
        # Add some sample known certificates (in production, load from database)
        detector.add_known_certificate(
            "CERT-2024-001",
            """Certificate of Achievement
            This is to certify that John Smith
            has successfully completed the course
            Issued by University of Technology
            Certificate Number: UOT-2024-12345
            Date: 15-06-2024"""
        )
        
        # Analyze certificate
        results = detector.analyze_certificate(text, file_path)
        
        # Output results as JSON
        print(json.dumps(results, indent=2))
        
    except FileNotFoundError:
        error = {'error': f'File not found: {file_path}'}
        print(json.dumps(error))
        sys.exit(1)
    except Exception as e:
        error = {'error': str(e)}
        print(json.dumps(error))
        sys.exit(1)


if __name__ == "__main__":
    main()
