#!/bin/bash

echo "🚀 Starting Integrated Document Verification Platform"
echo "======================================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if in integrated_app directory
if [ ! -f "server.js" ]; then
    echo -e "${RED}Error: Please run this script from the integrated_app directory${NC}"
    exit 1
fi

# Step 1: Check if blockchain node is running
echo -e "\n${YELLOW}Step 1: Checking blockchain node...${NC}"
if curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Blockchain node is running${NC}"
else
    echo -e "${RED}❌ Blockchain node is not running${NC}"
    echo "Please start it from block_chain_module:"
    echo "  cd ../block_chain_module && npm run node"
    exit 1
fi

# Step 2: Check if contract is deployed
echo -e "\n${YELLOW}Step 2: Checking contract deployment...${NC}"
if [ -f "../block_chain_module/deployment-info.json" ]; then
    CONTRACT_ADDRESS=$(grep -o '"contract":"[^"]*' ../block_chain_module/deployment-info.json | cut -d'"' -f4)
    echo -e "${GREEN}✅ Contract deployed at: $CONTRACT_ADDRESS${NC}"
else
    echo -e "${YELLOW}⚠️  No deployment info found. Please deploy contract:${NC}"
    echo "  cd ../block_chain_module && npm run deploy"
    read -p "Press enter to continue anyway..."
fi

# Step 3: Check Node modules
echo -e "\n${YELLOW}Step 3: Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi
echo -e "${GREEN}✅ Dependencies ready${NC}"

# Step 4: Create uploads directory
echo -e "\n${YELLOW}Step 4: Setting up directories...${NC}"
mkdir -p uploads
echo -e "${GREEN}✅ Upload directory created${NC}"

# Step 5: Check .env file
echo -e "\n${YELLOW}Step 5: Checking environment configuration...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from example...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ .env file created. Please update with your configuration.${NC}"
    fi
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

# Step 6: Start the server
echo -e "\n${GREEN}======================================================"
echo "🎉 All checks passed! Starting server..."
echo -e "======================================================${NC}\n"

npm start
