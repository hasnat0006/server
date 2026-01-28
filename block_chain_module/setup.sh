#!/bin/bash

# Complete Demo Setup Script for Blockchain + XAI Document Verification Platform

echo "========================================="
echo "🚀 Document Verification Platform Setup"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Install dependencies
echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo ""

# Step 2: Clean previous builds
echo -e "${YELLOW}Step 2: Cleaning previous builds...${NC}"
npm run clean
echo -e "${GREEN}✅ Clean complete${NC}"
echo ""

# Step 3: Compile contracts
echo -e "${YELLOW}Step 3: Compiling smart contracts...${NC}"
npm run compile
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Contracts compiled${NC}"
else
    echo -e "${RED}❌ Failed to compile contracts${NC}"
    exit 1
fi
echo ""

# Step 4: Run tests
echo -e "${YELLOW}Step 4: Running contract tests...${NC}"
npm test
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi
echo ""

echo "========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "========================================="
echo ""
echo "📝 Next steps to run the demo:"
echo ""
echo "1. Start blockchain (Terminal 1):"
echo "   npm run node"
echo ""
echo "2. Deploy contract (Terminal 2):"
echo "   npm run deploy"
echo ""
echo "3. Start API server (Terminal 3):"
echo "   npm start"
echo ""
echo "4. Open browser:"
echo "   http://localhost:3000"
echo ""
echo "========================================="
