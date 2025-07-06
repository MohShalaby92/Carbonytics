#!/bin/bash
echo "👤 Creating demo users for Carbonytics..."

if docker-compose ps | grep -q "Up"; then
    echo "📡 Creating demo users via Docker..."
    docker-compose exec backend npm run create-demo-user
else
    echo "❌ Docker containers are not running. Please start with: docker-compose up -d"
fi
