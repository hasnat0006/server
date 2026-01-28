#!/bin/bash

# Quick Demo Start Script

echo "========================================="
echo "🎬 Starting Document Verification Demo"
echo "========================================="
echo ""

# Check if deployment info exists
if [ ! -f "deployment-info.json" ]; then
    echo "❌ Error: Contract not deployed!"
    echo ""
    echo "Please run deployment first:"
    echo "  Terminal 1: npm run node"
    echo "  Terminal 2: npm run deploy"
    exit 1
fi

echo "✅ Contract deployment detected"
echo ""
echo "🚀 Starting API server..."
echo ""
echo "========================================="
echo "📡 Server will start at: http://localhost:3000"
echo "🌐 Open your browser and navigate to the URL above"
echo "========================================="
echo ""

npm start
