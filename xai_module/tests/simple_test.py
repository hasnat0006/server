#!/usr/bin/env python3
"""
Simple XAI Modules Test
Quick test to verify all modules produce valid JSON output
"""

import json
import sys
import tempfile
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def test_module(module_name, script_name, test_content):
    """Test a single XAI module"""
    print(f"\n🔍 Testing {module_name}...")
    
    # Create temporary test file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(test_content)
        temp_file = f.name
    
    try:
        # Run the Python script
        import subprocess
        result = subprocess.run(
            [sys.executable, str(BASE_DIR / script_name), temp_file],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=str(BASE_DIR)
        )
        
        # Clean up
        os.unlink(temp_file)
        
        if result.returncode != 0:
            print(f"   ❌ Script exited with error: {result.stderr[:200]}")
            return False
        
        # Parse JSON output
        try:
            data = json.loads(result.stdout)
            print(f"   ✅ Valid JSON output received")
            print(f"   📊 Keys: {', '.join(data.keys())}")
            return True
        except json.JSONDecodeError as e:
            print(f"   ❌ Invalid JSON output: {str(e)}")
            print(f"   Output: {result.stdout[:200]}")
            return False
            
    except Exception as e:
        print(f"   ❌ Test failed: {str(e)}")
        if os.path.exists(temp_file):
            os.unlink(temp_file)
        return False

def main():
    print("="*70)
    print(" "*20 + "XAI Modules Test")
    print("="*70)
    
    results = {}
    
    # Test 1: Plagiarism Checker
    results['Plagiarism Checker'] = test_module(
        'Plagiarism Checker',
        'enhanced_plagiarism_check.py',
        'This is a test document for plagiarism detection. It contains sample text.'
    )
    
    # Test 2: AI Content Detector
    results['AI Content Detector'] = test_module(
        'AI Content Detector',
        'ai_content_detector.py',
        'In contemporary society, the utilization of advanced technologies demonstrates significant implications.'
    )
    
    # Test 3: Certificate Forgery Detector
    results['Certificate Forgery Detector'] = test_module(
        'Certificate Forgery Detector',
        'certificate_forgery_detector.py',
        '''CERTIFICATE OF ACHIEVEMENT
        
This certifies that John Smith completed the course.
Date: 2024-01-15
Certificate Number: CERT-2024-001'''
    )
    
    # Summary
    print("\n" + "="*70)
    print(" "*25 + "Summary")
    print("="*70)
    
    passed = sum(results.values())
    total = len(results)
    
    for module, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {module}: {status}")
    
    print("\n" + "-"*70)
    if passed == total:
        print(f"  ✨ All tests passed! ({passed}/{total})")
        print(f"  ✅ XAI modules are ready for use")
        return 0
    else:
        print(f"  ⚠️  {total-passed} test(s) failed ({passed}/{total})")
        return 1

if __name__ == '__main__':
    sys.exit(main())
