"""
AI Content Detection Module
Detects AI-generated text using pattern analysis and linguistic features
"""

import json
import sys
import re
from typing import Dict, List
from collections import Counter
import math


class AIContentDetector:
    """
    Detects AI-generated content using linguistic analysis and pattern detection
    """
    
    def __init__(self, threshold: float = 0.60):
        """Initialize AI content detector with threshold."""
        self.threshold = threshold
        
        # Common AI patterns (can be expanded with ML models)
        self.ai_indicators = {
            'repetitive_phrases': [],
            'uniform_sentence_structure': [],
            'lack_of_errors': [],
            'perfect_grammar': [],
            'generic_transitions': []
        }
    
    def extract_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Simple sentence splitter
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def calculate_perplexity_score(self, text: str) -> float:
        """
        Calculate a simplified perplexity-like score.
        Lower scores indicate more predictable (AI-like) text.
        """
        words = text.lower().split()
        if len(words) < 10:
            return 50.0  # Default for very short texts
        
        # Calculate word frequency distribution
        word_freq = Counter(words)
        total_words = len(words)
        
        # Calculate entropy (diversity measure)
        entropy = 0
        for count in word_freq.values():
            prob = count / total_words
            entropy -= prob * math.log2(prob) if prob > 0 else 0
        
        # Normalize to 0-100 scale (higher = more diverse/human-like)
        max_entropy = math.log2(len(word_freq))
        normalized_score = (entropy / max_entropy * 100) if max_entropy > 0 else 50
        
        return normalized_score
    
    def analyze_sentence_structure(self, sentences: List[str]) -> Dict:
        """Analyze sentence structure uniformity."""
        if not sentences:
            return {'uniformity': 0, 'avg_length': 0, 'variance': 0}
        
        lengths = [len(s.split()) for s in sentences]
        avg_length = sum(lengths) / len(lengths)
        variance = sum((l - avg_length) ** 2 for l in lengths) / len(lengths)
        
        # Low variance indicates uniform structure (AI-like)
        uniformity_score = 100 - min(variance * 2, 100)
        
        return {
            'uniformity': round(uniformity_score, 2),
            'avg_length': round(avg_length, 2),
            'variance': round(variance, 2),
            'sentence_count': len(sentences)
        }
    
    def detect_repetitive_patterns(self, text: str) -> Dict:
        """Detect repetitive sentence structures and phrases."""
        sentences = self.extract_sentences(text)
        
        # Check for sentence starters
        starters = [s.split()[0] if s.split() else '' for s in sentences]
        starter_freq = Counter(starters)
        most_common_starter = starter_freq.most_common(1)[0] if starter_freq else ('', 0)
        
        # Calculate repetition score
        if len(sentences) > 0:
            repetition_score = (most_common_starter[1] / len(sentences)) * 100
        else:
            repetition_score = 0
        
        return {
            'repetition_score': round(repetition_score, 2),
            'most_common_starter': most_common_starter[0],
            'starter_frequency': most_common_starter[1],
            'unique_starters': len(starter_freq)
        }
    
    def analyze_vocabulary_richness(self, text: str) -> Dict:
        """Analyze vocabulary diversity (Type-Token Ratio)."""
        words = text.lower().split()
        if not words:
            return {'ttr': 0, 'unique_words': 0, 'total_words': 0}
        
        unique_words = set(words)
        ttr = len(unique_words) / len(words)
        
        # Human writing typically has TTR between 0.4-0.6
        # AI often has more uniform TTR around 0.3-0.4
        return {
            'ttr': round(ttr, 3),
            'unique_words': len(unique_words),
            'total_words': len(words),
            'is_natural': 0.4 <= ttr <= 0.7
        }
    
    def detect_generic_transitions(self, text: str) -> Dict:
        """Detect overuse of generic transition phrases common in AI text."""
        generic_transitions = [
            'moreover', 'furthermore', 'in addition', 'additionally',
            'however', 'nevertheless', 'on the other hand',
            'consequently', 'therefore', 'thus', 'hence',
            'in conclusion', 'to summarize', 'in summary',
            'it is important to note', 'it should be noted'
        ]
        
        text_lower = text.lower()
        found_transitions = []
        
        for transition in generic_transitions:
            count = text_lower.count(transition)
            if count > 0:
                found_transitions.append({
                    'phrase': transition,
                    'count': count
                })
        
        words = text.split()
        transition_density = len(found_transitions) / len(words) * 100 if words else 0
        
        return {
            'transitions_found': len(found_transitions),
            'transition_details': found_transitions[:5],  # Top 5
            'density': round(transition_density, 2),
            'is_excessive': transition_density > 2.0
        }
    
    def analyze_text(self, text: str) -> Dict:
        """
        Perform comprehensive AI content detection analysis.
        
        Args:
            text: The text content to analyze
            
        Returns:
            Dictionary containing detailed analysis results
        """
        sentences = self.extract_sentences(text)
        
        # Perform multiple analyses
        perplexity = self.calculate_perplexity_score(text)
        structure = self.analyze_sentence_structure(sentences)
        patterns = self.detect_repetitive_patterns(text)
        vocabulary = self.analyze_vocabulary_richness(text)
        transitions = self.detect_generic_transitions(text)
        
        # Calculate AI probability based on multiple factors
        indicators = []
        ai_score = 0
        
        # Factor 1: Low perplexity (predictable text)
        if perplexity < 40:
            ai_score += 25
            indicators.append({
                'type': 'low_perplexity',
                'confidence': 0.8,
                'explanation': f'Text shows low diversity (perplexity: {perplexity:.1f}/100), indicating predictable AI patterns'
            })
        
        # Factor 2: Uniform sentence structure
        if structure['uniformity'] > 70:
            ai_score += 20
            indicators.append({
                'type': 'uniform_structure',
                'confidence': 0.7,
                'explanation': f'Sentences have very uniform structure (uniformity: {structure["uniformity"]:.1f}%), typical of AI generation'
            })
        
        # Factor 3: Repetitive patterns
        if patterns['repetition_score'] > 40:
            ai_score += 20
            indicators.append({
                'type': 'repetitive_patterns',
                'confidence': 0.75,
                'explanation': f'High repetition in sentence starters ({patterns["repetition_score"]:.1f}%), common in AI text'
            })
        
        # Factor 4: Unnatural vocabulary distribution
        if not vocabulary['is_natural']:
            ai_score += 15
            indicators.append({
                'type': 'unnatural_vocabulary',
                'confidence': 0.65,
                'explanation': f'Type-Token Ratio ({vocabulary["ttr"]}) outside natural human range (0.4-0.7)'
            })
        
        # Factor 5: Excessive generic transitions
        if transitions['is_excessive']:
            ai_score += 20
            indicators.append({
                'type': 'generic_transitions',
                'confidence': 0.7,
                'explanation': f'Excessive use of generic transition phrases (density: {transitions["density"]:.1f}%)'
            })
        
        # Normalize score to 0-100
        ai_probability = min(ai_score, 100)
        is_ai_generated = ai_probability >= (self.threshold * 100)
        
        return {
            'is_ai_generated': is_ai_generated,
            'ai_probability': round(ai_probability, 2),
            'threshold': int(self.threshold * 100),
            'indicators': indicators,
            'detailed_analysis': {
                'perplexity_score': round(perplexity, 2),
                'sentence_structure': structure,
                'repetitive_patterns': patterns,
                'vocabulary_analysis': vocabulary,
                'transition_analysis': transitions
            },
            'explanation': self.generate_explanation(is_ai_generated, ai_probability, indicators)
        }
    
    def generate_explanation(self, is_ai: bool, probability: float, indicators: List[Dict]) -> str:
        """Generate human-readable explanation of the analysis."""
        if is_ai:
            explanation = f"Text appears to be AI-generated ({probability:.1f}% probability). "
            if indicators:
                explanation += f"Detected {len(indicators)} AI indicators: "
                explanation += "; ".join([ind['explanation'] for ind in indicators[:3]])
        else:
            explanation = f"Text appears to be human-written ({100-probability:.1f}% confidence). "
            if probability > 40:
                explanation += "Some AI-like patterns detected, but not enough to classify as AI-generated."
            else:
                explanation += "Shows natural human writing patterns with good diversity and authenticity."
        
        return explanation


def main():
    """Command-line interface for AI content detection."""
    if len(sys.argv) < 2:
        print("Usage: python ai_content_detector.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        # Read document
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        # Initialize detector
        detector = AIContentDetector(threshold=0.60)
        
        # Analyze text
        results = detector.analyze_text(text)
        
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
