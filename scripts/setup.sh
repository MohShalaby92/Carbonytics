#!/bin/bash

# Carbonytics Setup Script
echo "🚀 Setting up Carbonytics development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "⚠️ Docker is not installed. Some features may not work."
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your configuration."
fi

# Install dependencies
echo "📦 Installing dependencies..."

# Install root dependencies
npm install

# Install frontend dependencies
echo "🎨 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Install backend dependencies
echo "🔧 Installing backend dependencies..."
cd backend
npm install
cd ..

# Install shared dependencies
echo "🔗 Installing shared dependencies..."
cd shared
npm install
cd ..

echo "✅ Dependencies installed successfully!"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p backend/logs
mkdir -p backend/uploads
mkdir -p docs

# Generate JWT secret if not exists in .env
if ! grep -q "JWT_SECRET=your-super-secret" .env; then
    echo "🔐 JWT secret already configured"
else
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    sed -i.bak "s/JWT_SECRET=your-super-secret-jwt-key-change-in-production/JWT_SECRET=$JWT_SECRET/" .env && rm .env.bak
    echo "🔐 Generated new JWT secret"
fi

echo ""
echo "🎉 Setup complete! Here's how to get started:"
echo ""
echo "1. Edit .env file with your configuration"
echo "2. Start MongoDB and Redis (or use Docker)"
echo "3. Run 'npm run dev' to start both frontend and backend"
echo "4. Visit http://localhost:3000 to see the app"
echo ""
echo "Available commands:"
echo "  npm run dev          - Start development servers"
echo "  npm run docker:up    - Start with Docker"
echo "  npm run test         - Run tests"
echo "  npm run build        - Build for production"
echo ""
