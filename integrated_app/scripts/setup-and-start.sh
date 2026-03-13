#!/bin/bash

# Complete Setup and Startup Guide for Integrated Document Verification Platform

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  Integrated Document Verification Platform - Complete Setup             ║"
echo "║  Blockchain + XAI Module Integration                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTEGRATED_APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$INTEGRATED_APP_DIR/.." && pwd)"

echo -e "${BLUE}This script will help you start all required services:${NC}"
echo "  1. Hardhat Blockchain Node"
echo "  2. Smart Contract Deployment"
echo "  3. Integrated Server (Blockchain + XAI)"
echo ""
echo "Press Ctrl+C at any time to cancel"
echo ""
read -p "Press Enter to continue..."

# ============================================================================
# STEP 1: Start Blockchain Node
# ============================================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 1: Starting Hardhat Blockchain Node${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"

echo ""
echo "The blockchain node needs to run in a separate terminal."
echo "Please follow these steps:"
echo ""
echo -e "${GREEN}1. Open a NEW terminal window${NC}"
echo -e "${GREEN}2. Run these commands:${NC}"
echo ""
echo -e "   ${BLUE}cd $PROJECT_ROOT/block_chain_module${NC}"
echo -e "   ${BLUE}npm run node${NC}"
echo ""
echo "Keep that terminal running (don't close it)"
echo ""
read -p "Press Enter after you've started the blockchain node..."

# Verify blockchain node is running
echo ""
echo "Checking if blockchain node is running..."
if node -e "fetch('http://127.0.0.1:8545', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1})}).then(r => r.json()).then(d => process.exit(d.result ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
    echo -e "${GREEN}✅ Blockchain node is running!${NC}"
else
    echo -e "${RED}❌ Cannot connect to blockchain node${NC}"
    echo "Please make sure the blockchain node is running on http://127.0.0.1:8545"
    echo "Then run this script again."
    exit 1
fi

# ============================================================================
# STEP 2: Deploy Smart Contract (if needed)
# ============================================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 2: Checking Smart Contract Deployment${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"

if [ -f "$PROJECT_ROOT/block_chain_module/deployment-info.json" ]; then
    CONTRACT_ADDRESS=$(grep -o '"contractAddress":"[^"]*' "$PROJECT_ROOT/block_chain_module/deployment-info.json" | cut -d'"' -f4)
    echo -e "${GREEN}✅ Contract already deployed at: $CONTRACT_ADDRESS${NC}"
    
    echo ""
    read -p "Do you want to redeploy the contract? (y/N): " REDEPLOY
    if [[ $REDEPLOY =~ ^[Yy]$ ]]; then
        echo "Deploying contract..."
        cd "$PROJECT_ROOT/block_chain_module"
        npm run deploy
        echo ""
        CONTRACT_ADDRESS=$(grep -o '"contractAddress":"[^"]*' "$PROJECT_ROOT/block_chain_module/deployment-info.json" | cut -d'"' -f4)
        echo -e "${GREEN}✅ Contract deployed at: $CONTRACT_ADDRESS${NC}"
    fi
else
    echo "No deployment found. Deploying smart contract..."
    cd "$PROJECT_ROOT/block_chain_module"
    npm run deploy
    echo ""
    if [ -f "deployment-info.json" ]; then
        CONTRACT_ADDRESS=$(grep -o '"contractAddress":"[^"]*' deployment-info.json | cut -d'"' -f4)
        echo -e "${GREEN}✅ Contract deployed at: $CONTRACT_ADDRESS${NC}"
    else
        echo -e "${RED}❌ Deployment failed${NC}"
        exit 1
    fi
fi

# Update .env file with contract address
echo ""
echo "Updating integrated_app/.env with contract address..."
cd "$INTEGRATED_APP_DIR"
if [ -f ".env" ]; then
    sed -i "s/CONTRACT_ADDRESS=.*/CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
    echo -e "${GREEN}✅ .env file updated${NC}"
else
    echo -e "${YELLOW}⚠️  No .env file found. Creating one...${NC}"
    cat > .env << EOF
PORT=3000
NODE_ENV=development
CONTRACT_ADDRESS=$CONTRACT_ADDRESS
BLOCKCHAIN_NETWORK=localhost
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
DATABASE_URL=postgresql://postgres:password@localhost:5432/thesis_db
MAX_FILE_SIZE=52428800
UPLOAD_DIR=./uploads
PYTHON_PATH=python3
XAI_THRESHOLD_AI_DETECTION=70
XAI_THRESHOLD_PLAGIARISM=60
XAI_THRESHOLD_FORGERY=60
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
fi

# ============================================================================
# STEP 3: Install Dependencies
# ============================================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 3: Installing Dependencies${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"

cd "$INTEGRATED_APP_DIR"
if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Create uploads directory
mkdir -p uploads

# ============================================================================
# STEP 4: Start Integrated Server
# ============================================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 4: Starting Integrated Server${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                         🎉 READY TO START! 🎉                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}The integrated server will start now.${NC}"
echo -e "${BLUE}Once running, open your browser and navigate to:${NC}"
echo ""
echo -e "   ${GREEN}http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}Features available:${NC}"
echo "  ✅ Document upload and analysis"
echo "  ✅ AI-generated content detection"
echo "  ✅ Plagiarism checking"
echo "  ✅ Certificate forgery detection"
echo "  ✅ Blockchain registration for verified documents"
echo "  ✅ Document similarity search"
echo ""
echo "Press Ctrl+C to stop the server when done"
echo ""
read -p "Press Enter to start the server..."

echo ""
echo -e "${GREEN}Starting server...${NC}"
echo ""

cd "$INTEGRATED_APP_DIR"
npm start
