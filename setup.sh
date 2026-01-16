#!/bin/bash

# ==============================================================================
# BAVINI CLOUD - Setup Script
# ==============================================================================
# This script sets up the project for development
# ==============================================================================

set -e

echo "=============================================="
echo "  BAVINI CLOUD - Setup"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "${BLUE}[1/5]${NC} Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ is required. Found: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}  Node.js $(node -v) ✓${NC}"

# Check pnpm
echo -e "${BLUE}[2/5]${NC} Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}  pnpm not found. Installing...${NC}"
    npm install -g pnpm@9.4.0
fi
echo -e "${GREEN}  pnpm $(pnpm -v) ✓${NC}"

# Install dependencies
echo -e "${BLUE}[3/5]${NC} Installing dependencies..."
pnpm install

# Check .env file
echo -e "${BLUE}[4/5]${NC} Checking environment..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}  .env not found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}  Please edit .env with your API keys.${NC}"
else
    echo -e "${GREEN}  .env file exists ✓${NC}"
fi

# Initialize git if needed
echo -e "${BLUE}[5/5]${NC} Checking git..."
if [ ! -d .git ]; then
    echo -e "${YELLOW}  Initializing git repository...${NC}"
    git init
    git add .
    git commit -m "Initial commit - BAVINI CLOUD"
fi
echo -e "${GREEN}  Git repository ready ✓${NC}"

echo ""
echo "=============================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "=============================================="
echo ""
echo "To start the development server:"
echo ""
echo -e "  ${BLUE}pnpm dev${NC}"
echo ""
echo "The app will be available at:"
echo -e "  ${GREEN}http://localhost:5173${NC}"
echo ""
echo "=============================================="
