#!/bin/bash

# Carbonytics Database Seeding Script
echo "🌱 Seeding Carbonytics database..."

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo "❌ Backend directory not found. Run this script from the project root."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please run setup.sh first."
    exit 1
fi

# Load environment variables
export $(cat .env | xargs)

echo "📊 Seeding emission categories and factors..."
cd backend
npm run seed

echo "✅ Database seeding complete!"
