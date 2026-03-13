#!/usr/bin/env python3
"""Compatibility wrapper for moved test file."""

from tests.simple_test import main

if __name__ == '__main__':
    raise SystemExit(main())
