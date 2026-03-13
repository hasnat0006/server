#!/usr/bin/env python3
"""Compatibility wrapper for moved integration test file."""

from tests.test_integration import main

if __name__ == '__main__':
    raise SystemExit(main())
