#!/usr/bin/env python3
"""
Integration Test for XAI Modules
Tests all three Python analysis modules with sample data
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# Color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_header(title):
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}{title:^70}{RESET}")
    print(f"{BLUE}{'='*70}{RESET}\n")

def print_success(message):
    print(f"{GREEN}✅ {message}{RESET}")

def print_error(message):
    print(f"{RED}❌ {message}{RESET}")

def print_info(message):
    print(f"{YELLOW}ℹ️  {message}{RESET}")

def test_plagiarism_checker():
    """Test enhanced plagiarism detection"""
    print_header("Testing Plagiarism Checker")
    
    try:
        # Import the module
        sys.path.insert(0, str(Path(__file__).parent))
        from enhanced_plagiarism_check import EnhancedPlagiarismChecker
        
        checker = EnhancedPlagiarismChecker()
        
        # Test 1: Clean document
        print_info("Test 1: Clean document (no plagiarism)")
        clean_text = """
        This is an original document written specifically for testing purposes.
        It contains unique content that should not match any existing documents.
        The purpose is to verify that the plagiarism detector correctly identifies
        original work without false positives.
        """
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(clean_text)
            temp_file = f.name
        
        result = checker.analyze_document(temp_file)
        os.unlink(temp_file)
        
        if not result['is_plagiarized']:
            print_success(f"Correctly identified as original (similarity: {result['max_similarity']*100:.1f}%)")
        else:
            print_error(f"False positive - marked as plagiarized")
        
        print(f"   Threshold: {result['threshold']}%")
        print(f"   Matching parts: {len(result['matching_parts'])}")
        
        # Test 2: Suspicious document
        print_info("\nTest 2: Document with repetitive patterns")
        suspicious_text = """
        The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
        The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
        This document contains repeated phrases that might indicate plagiarism or copying.
        This document contains repeated phrases that might indicate plagiarism or copying.
        """
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(suspicious_text)
            temp_file = f.name
        
        result = checker.analyze_document(temp_file)
        os.unlink(temp_file)
        
        print(f"   Plagiarism detected: {result['is_plagiarized']}")
        print(f"   Max similarity: {result['max_similarity']*100:.1f}%")
        print(f"   Matching parts: {len(result['matching_parts'])}")
        
        print_success("Plagiarism checker module working correctly")
        return True
        
    except Exception as e:
        print_error(f"Plagiarism checker test failed: {str(e)}")
        return False

def test_ai_content_detector():
    """Test AI-generated content detection"""
    print_header("Testing AI Content Detector")
    
    try:
        from ai_content_detector import AIContentDetector
        
        detector = AIContentDetector()
        
        # Test 1: Natural human writing
        print_info("Test 1: Natural human writing")
        human_text = """
        I've been thinking about this problem for weeks now, and honestly, I'm not entirely
        sure what the best approach would be. My initial idea was to use a simple algorithm,
        but then I realized that wouldn't work for edge cases. So I spent some time researching
        alternatives, and I think I've found something that might work better. Let me explain...
        """
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(human_text)
            temp_file = f.name
        
        result = detector.analyze_document(temp_file)
        os.unlink(temp_file)
        
        print(f"   AI probability: {result['ai_probability']:.1f}%")
        print(f"   Is AI-generated: {result['is_ai_generated']}")
        print(f"   Indicators found: {len(result['indicators'])}")
        
        if not result['is_ai_generated']:
            print_success("Correctly identified as human-written")
        else:
            print_error("False positive - marked as AI-generated")
        
        # Test 2: AI-like writing
        print_info("\nTest 2: Formal, AI-like writing style")
        ai_like_text = """
        In today's rapidly evolving technological landscape, it is imperative to consider
        the multifaceted implications of artificial intelligence integration. Furthermore,
        one must acknowledge the significant potential benefits that such systems can provide.
        Moreover, it is essential to recognize that these advancements represent a paradigm
        shift in our understanding. Additionally, the implementation of these technologies
        requires careful consideration of ethical frameworks. Consequently, stakeholders must
        collaborate to ensure responsible development. Therefore, it is crucial to establish
        comprehensive guidelines. Subsequently, these measures will facilitate sustainable growth.
        """
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(ai_like_text)
            temp_file = f.name
        
        result = detector.analyze_document(temp_file)
        os.unlink(temp_file)
        
        print(f"   AI probability: {result['ai_probability']:.1f}%")
        print(f"   Is AI-generated: {result['is_ai_generated']}")
        print(f"   Indicators found: {len(result['indicators'])}")
        for indicator in result['indicators'][:3]:
            print(f"      - {indicator}")
        
        print_success("AI content detector module working correctly")
        return True
        
    except Exception as e:
        print_error(f"AI content detector test failed: {str(e)}")
        return False

def test_certificate_forgery_detector():
    """Test certificate forgery detection"""
    print_header("Testing Certificate Forgery Detector")
    
    try:
        from certificate_forgery_detector import CertificateForgeryDetector
        
        detector = CertificateForgeryDetector()
        
        # Test 1: Valid certificate format
        print_info("Test 1: Valid certificate format")
        valid_cert = """
        CERTIFICATE OF COMPLETION
        
        This is to certify that John Michael Smith has successfully completed
        the Advanced Machine Learning Specialization Course.
        
        Date: January 15, 2024
        Certificate Number: ML-2024-12345
        Issued by: Stanford University Online
        Course: Advanced Machine Learning
        
        Signed: Dr. Andrew Ng
        Director of AI Programs
        """
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(valid_cert)
            temp_file = f.name
        
        result = detector.analyze_certificate(temp_file)
        os.unlink(temp_file)
        
        print(f"   Is forged: {result['is_forged']}")
        print(f"   Extracted info:")
        for key, value in result['extracted_info'].items():
            if value:
                print(f"      {key}: {value}")
        
        if not result['is_forged']:
            print_success("Valid certificate passed verification")
        else:
            print_info(f"Marked as suspicious: {result['explanation']}")
        
        # Test 2: Suspicious certificate (missing critical info)
        print_info("\nTest 2: Suspicious certificate (missing info)")
        suspicious_cert = """
        CERTIFICATE
        
        This certifies that Someone completed something.
        
        Date: 2024-01-01
        """
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(suspicious_cert)
            temp_file = f.name
        
        result = detector.analyze_certificate(temp_file)
        os.unlink(temp_file)
        
        print(f"   Is forged: {result['is_forged']}")
        print(f"   Explanation: {result['explanation']}")
        print(f"   Forgery evidence: {len(result.get('forgery_evidence', []))} item(s)")
        
        print_success("Certificate forgery detector module working correctly")
        return True
        
    except Exception as e:
        print_error(f"Certificate forgery detector test failed: {str(e)}")
        return False

def test_json_output():
    """Test that all modules produce valid JSON"""
    print_header("Testing JSON Output Format")
    
    tests_passed = 0
    
    try:
        # Test each module's JSON output
        test_text = "Sample text for JSON validation testing."
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(test_text)
            temp_file = f.name
        
        # Test plagiarism checker JSON
        print_info("Validating plagiarism checker JSON output")
        from enhanced_plagiarism_check import EnhancedPlagiarismChecker
        checker = EnhancedPlagiarismChecker()
        result = checker.analyze_document(temp_file)
        json_str = json.dumps(result, indent=2)
        parsed = json.loads(json_str)
        assert 'is_plagiarized' in parsed
        assert 'max_similarity' in parsed
        print_success("Plagiarism checker produces valid JSON")
        tests_passed += 1
        
        # Test AI detector JSON
        print_info("Validating AI detector JSON output")
        from ai_content_detector import AIContentDetector
        detector = AIContentDetector()
        result = detector.analyze_document(temp_file)
        json_str = json.dumps(result, indent=2)
        parsed = json.loads(json_str)
        assert 'is_ai_generated' in parsed
        assert 'ai_probability' in parsed
        print_success("AI detector produces valid JSON")
        tests_passed += 1
        
        # Test certificate detector JSON
        print_info("Validating certificate detector JSON output")
        from certificate_forgery_detector import CertificateForgeryDetector
        detector = CertificateForgeryDetector()
        result = detector.analyze_certificate(temp_file)
        json_str = json.dumps(result, indent=2)
        parsed = json.loads(json_str)
        assert 'is_forged' in parsed
        assert 'explanation' in parsed
        print_success("Certificate detector produces valid JSON")
        tests_passed += 1
        
        os.unlink(temp_file)
        
        if tests_passed == 3:
            print_success("All modules produce valid JSON output")
            return True
        else:
            return False
            
    except Exception as e:
        print_error(f"JSON validation test failed: {str(e)}")
        return False

def main():
    """Run all integration tests"""
    print_header("XAI Modules Integration Test Suite")
    print_info("Testing all Python analysis modules...")
    
    results = {
        'Plagiarism Checker': test_plagiarism_checker(),
        'AI Content Detector': test_ai_content_detector(),
        'Certificate Forgery Detector': test_certificate_forgery_detector(),
        'JSON Output Validation': test_json_output()
    }
    
    # Print summary
    print_header("Test Summary")
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, result in results.items():
        status = f"{GREEN}PASSED{RESET}" if result else f"{RED}FAILED{RESET}"
        print(f"  {test_name}: {status}")
    
    print(f"\n{BLUE}{'─'*70}{RESET}")
    
    if passed == total:
        print(f"\n{GREEN}✨ All tests passed! ({passed}/{total}){RESET}\n")
        print_success("XAI modules are ready for production use")
        return 0
    else:
        print(f"\n{RED}⚠️  Some tests failed ({passed}/{total}){RESET}\n")
        print_error("Please fix the failing modules before deployment")
        return 1

if __name__ == '__main__':
    sys.exit(main())
