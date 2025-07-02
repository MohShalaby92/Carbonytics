#!/bin/bash
echo "🔄 Resetting development environment..."

# Confirmation
echo "⚠️  This will:"
echo "   • Stop all running containers"
echo "   • Clear the database"
echo "   • Reinstall dependencies"
echo "   • Reseed with fresh data"
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Reset cancelled"
    exit 1
fi

# Stop Docker containers
echo "🛑 Stopping Docker containers..."
docker-compose down -v

# Clean node modules
echo "🧹 Cleaning dependencies..."
rm -rf node_modules
rm -rf frontend/node_modules
rm -rf backend/node_modules
rm -rf shared/node_modules

# Reinstall dependencies
echo "📦 Reinstalling dependencies..."
npm install

# Start fresh containers
echo "🐳 Starting fresh containers..."
docker-compose up -d mongo redis

# Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB to be ready..."
sleep 10

# Reseed database
echo "🌱 Reseeding database..."
cd backend
npm run seed
cd ..

echo "✅ Development environment reset completed!"
echo ""
echo "🚀 To start development:"
echo "   npm run dev"
