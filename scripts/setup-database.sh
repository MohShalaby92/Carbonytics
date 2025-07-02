#!/bin/bash
echo "🗄️  Setting up Carbonytics database..."

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Please start MongoDB first."
    echo "   Docker: docker run -d -p 27017:27017 mongo:7.0"
    echo "   Local: sudo systemctl start mongod"
    exit 1
fi

# Navigate to backend directory
cd backend

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
fi

# Run database seeding
echo "🌱 Seeding emission categories and factors..."
npm run seed

if [ $? -eq 0 ]; then
    echo "✅ Database setup completed successfully!"
    echo ""
    echo "📊 Database now contains:"
    echo "   • Emission categories for Scopes 1, 2, and 3"
    echo "   • Egyptian-specific emission factors"
    echo "   • Global emission factors as fallbacks"
    echo ""
    echo "🚀 You can now start the development server with: npm run dev"
else
    echo "❌ Database seeding failed. Check the logs above for errors."
    exit 1
fi
