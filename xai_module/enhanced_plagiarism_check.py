"""
Enhanced Plagiarism Detection Module
Uses advanced algorithms for document similarity detection and plagiarism checking
"""

import hashlib
import json
import sys
from typing import Dict, List, Tuple
from collections import Counter
import re


class EnhancedPlagiarismChecker:
    """
    Advanced plagiarism checker with multiple detection algorithms
    """
    
    def __init__(self, threshold: float = 0.75):
        """Initialize the plagiarism checker with a similarity threshold."""
        self.threshold = threshold
        self.known_documents = {}
        
    def preprocess_text(self, text: str) -> str:
        """Clean and normalize text for analysis."""
        # Convert to lowercase
        text = text.lower()
        # Remove special characters but keep spaces
        text = re.sub(r'[^\w\s]', ' ', text)
        # Remove extra whitespace
        text = ' '.join(text.split())
        return text
    
    def extract_ngrams(self, text: str, n: int = 3) -> List[str]:
        """Extract n-grams from text for similarity detection."""
        words = text.split()
        ngrams = []
        for i in range(len(words) - n + 1):
            ngram = ' '.join(words[i:i+n])
            ngrams.append(ngram)
        return ngrams
    
    def jaccard_similarity(self, set1: set, set2: set) -> float:
        """Calculate Jaccard similarity between two sets."""
        if not set1 or not set2:
            return 0.0
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        return intersection / union if union > 0 else 0.0
    
    def cosine_similarity(self, text1: str, text2: str) -> float:
        """Calculate cosine similarity between two texts."""
        words1 = text1.split()
        words2 = text2.split()
        
        # Create frequency vectors
        counter1 = Counter(words1)
        counter2 = Counter(words2)
        
        # Get all unique words
        all_words = set(counter1.keys()).union(set(counter2.keys()))
        
        # Calculate dot product and magnitudes
        dot_product = sum(counter1[word] * counter2[word] for word in all_words)
        magnitude1 = sum(count ** 2 for count in counter1.values()) ** 0.5
        magnitude2 = sum(count ** 2 for count in counter2.values()) ** 0.5
        
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0
        
        return dot_product / (magnitude1 * magnitude2)
    
    def find_matching_segments(self, text1: str, text2: str, min_length: int = 10) -> List[Dict]:
        """Find matching text segments between two documents."""
        words1 = text1.split()
        words2 = text2.split()
        matches = []
        
        # Simple sliding window approach
        for i in range(len(words1) - min_length + 1):
            segment1 = ' '.join(words1[i:i+min_length])
            for j in range(len(words2) - min_length + 1):
                segment2 = ' '.join(words2[j:j+min_length])
                if segment1 == segment2:
                    # Found a match, try to extend it
                    length = min_length
                    while (i + length < len(words1) and 
                           j + length < len(words2) and 
                           words1[i + length] == words2[j + length]):
                        length += 1
                    
                    matches.append({
                        'text': ' '.join(words1[i:i+length]),
                        'length': length,
                        'position1': i,
                        'position2': j
                    })
        
        return matches
    
    def analyze_document(self, document_text: str, document_id: str = None) -> Dict:
        """
        Perform comprehensive plagiarism analysis on a document.
        
        Args:
            document_text: The text content to analyze
            document_id: Optional identifier for the document
            
        Returns:
            Dictionary containing detailed analysis results
        """
        # Preprocess text
        processed_text = self.preprocess_text(document_text)
        
        # Extract features
        ngrams = self.extract_ngrams(processed_text)
        ngram_set = set(ngrams)
        
        results = {
            'document_id': document_id,
            'is_plagiarized': False,
            'max_similarity': 0.0,
            'average_similarity': 0.0,
            'threshold': self.threshold,
            'similar_documents': [],
            'matching_parts': [],
            'confidence_score': 100,
            'analysis_method': 'multi-algorithm'
        }
        
        # Check against all known documents
        similarities = []
        for known_id, known_text in self.known_documents.items():
            known_processed = self.preprocess_text(known_text)
            known_ngrams = set(self.extract_ngrams(known_processed))
            
            # Calculate multiple similarity metrics
            jaccard_sim = self.jaccard_similarity(ngram_set, known_ngrams)
            cosine_sim = self.cosine_similarity(processed_text, known_processed)
            
            # Combined similarity score
            combined_similarity = (jaccard_sim * 0.6 + cosine_sim * 0.4)
            similarities.append(combined_similarity)
            
            if combined_similarity > results['max_similarity']:
                results['max_similarity'] = combined_similarity
            
            if combined_similarity >= self.threshold:
                # Find matching segments
                matches = self.find_matching_segments(processed_text, known_processed)
                
                results['similar_documents'].append({
                    'document_id': known_id,
                    'similarity_score': round(combined_similarity * 100, 2),
                    'jaccard_similarity': round(jaccard_sim * 100, 2),
                    'cosine_similarity': round(cosine_sim * 100, 2),
                    'matching_segments': len(matches)
                })
                
                # Add top matching parts
                for match in matches[:3]:  # Top 3 matches
                    results['matching_parts'].append({
                        'source_document': known_id,
                        'matched_text': match['text'][:200] + '...' if len(match['text']) > 200 else match['text'],
                        'length_words': match['length'],
                        'similarity_score': round(combined_similarity * 100, 2),
                        'explanation': f'Exact match of {match["length"]} consecutive words found in {known_id}'
                    })
        
        # Calculate average similarity
        if similarities:
            results['average_similarity'] = sum(similarities) / len(similarities)
        
        # Determine if plagiarized
        results['is_plagiarized'] = results['max_similarity'] >= self.threshold
        
        # Calculate confidence score
        if results['is_plagiarized']:
            results['confidence_score'] = max(0, 100 - int(results['max_similarity'] * 100))
        else:
            results['confidence_score'] = 100 - int(results['max_similarity'] * 50)
        
        return results
    
    def add_known_document(self, document_id: str, document_text: str):
        """Add a document to the known documents database."""
        self.known_documents[document_id] = document_text
    
    def load_known_documents(self, documents: Dict[str, str]):
        """Load multiple known documents at once."""
        self.known_documents.update(documents)
    
    def generate_document_hash(self, document_text: str) -> str:
        """Generate SHA-256 hash for a document."""
        return hashlib.sha256(document_text.encode('utf-8')).hexdigest()


def main():
    """Command-line interface for plagiarism checking."""
    if len(sys.argv) < 2:
        print("Usage: python enhanced_plagiarism_check.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        # Read document
        with open(file_path, 'r', encoding='utf-8') as f:
            document_text = f.read()
        
        # Initialize checker
        checker = EnhancedPlagiarismChecker(threshold=0.70)
        
        # Load some sample known documents (in production, load from database)
        checker.add_known_document(
            "sample_paper_1",
            "This is a sample research paper about machine learning algorithms and their applications."
        )
        checker.add_known_document(
            "sample_paper_2",
            "Deep learning and neural networks have revolutionized artificial intelligence research."
        )
        
        # Analyze document
        results = checker.analyze_document(document_text, file_path)
        
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
