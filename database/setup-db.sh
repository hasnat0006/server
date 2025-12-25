#!/bin/bash

# PostgreSQL Database Setup Script
# This script creates the database and initializes the schema

echo "🗄️  Setting up PostgreSQL database for Document Verification Platform"
echo "================================================================"

# Configuration
DB_NAME="document_verification"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo ""
echo "📋 Configuration:"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed or not in PATH"
    echo ""
    echo "To install PostgreSQL:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib"
    echo "  macOS: brew install postgresql"
    echo "  Fedora: sudo dnf install postgresql-server postgresql-contrib"
    exit 1
fi

echo "✅ PostgreSQL found"

# Check if PostgreSQL service is running
if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    echo ""
    echo "⚠️  PostgreSQL service is not running"
    echo "Starting PostgreSQL service..."
    
    if command -v systemctl &> /dev/null; then
        sudo systemctl start postgresql
    elif command -v service &> /dev/null; then
        sudo service postgresql start
    else
        echo "❌ Cannot start PostgreSQL automatically. Please start it manually."
        exit 1
    fi
fi

echo ""
read -p "Enter PostgreSQL password for user '$DB_USER' (press Enter if no password): " -s DB_PASSWORD
echo ""

# Set PGPASSWORD for automated commands
export PGPASSWORD=$DB_PASSWORD

# Drop existing database if it exists (optional)
echo ""
read -p "⚠️  Drop existing database '$DB_NAME' if it exists? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Dropping existing database..."
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null
fi

# Create database
echo ""
echo "📦 Creating database '$DB_NAME'..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Database created successfully"
else
    echo "⚠️  Database may already exist, continuing..."
fi

# Run schema script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCHEMA_FILE="$SCRIPT_DIR/schema.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Schema file not found: $SCHEMA_FILE"
    exit 1
fi

echo ""
echo "📜 Running schema script..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$SCHEMA_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database schema created successfully"
else
    echo ""
    echo "❌ Failed to create schema"
    exit 1
fi

# Create .env file if it doesn't exist
ENV_FILE="$SCRIPT_DIR/../.env"
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "📝 Creating .env file..."
    cat > "$ENV_FILE" <<EOF
# PostgreSQL Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Python Configuration
PYTHON_PATH=python3

# Application Configuration
PORT=3000
NODE_ENV=development
EOF
    echo "✅ .env file created at $ENV_FILE"
    echo "   ⚠️  Remember to update DB_PASSWORD in .env file if needed"
else
    echo ""
    echo "ℹ️  .env file already exists, skipping..."
fi

# Test connection
echo ""
echo "🔍 Testing database connection..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';" | grep -q "table_count"

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Show created tables
echo ""
echo "📊 Created tables:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\dt" | grep public || echo "No tables found"

echo ""
echo "================================================================"
echo "✅ Database setup complete!"
echo ""
echo "Next steps:"
echo "  1. Install Node.js dependencies: npm install pg dotenv"
echo "  2. Update .env file with your database credentials"
echo "  3. Restart your application server"
echo "================================================================"

# Unset password
unset PGPASSWORD
