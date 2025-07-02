#!/bin/bash

# Carbonytics Production Deployment Script
echo "🚀 Deploying Carbonytics to production..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Run this script from the project root."
    exit 1
fi

# Check if production environment file exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found. Please create it first."
    exit 1
fi

# Build the application
echo "🔨 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
npm run test

if [ $? -ne 0 ]; then
    echo "❌ Tests failed!"
    exit 1
fi

# Build Docker images
echo "🐳 Building Docker images..."
docker-compose -f docker-compose.prod.yml build

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

# Deploy based on deployment target
DEPLOY_TARGET=${1:-"local"}

case $DEPLOY_TARGET in
    "local")
        echo "🏠 Deploying locally..."
        docker-compose -f docker-compose.prod.yml up -d
        ;;
    "railway")
        echo "🚂 Deploying to Railway..."
        # Add Railway deployment commands here
        echo "Please configure Railway deployment in this script"
        ;;
    "aws")
        echo "☁️ Deploying to AWS..."
        # Add AWS deployment commands here
        echo "Please configure AWS deployment in this script"
        ;;
    *)
        echo "❌ Unknown deployment target: $DEPLOY_TARGET"
        echo "Available targets: local, railway, aws"
        exit 1
        ;;
esac

echo "✅ Deployment complete!"
