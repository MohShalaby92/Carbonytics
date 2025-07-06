#!/bin/bash
# Quick deployment verification script for Carbonytics
echo "🚀 Carbonytics Deployment Verification"
echo "======================================"

# Check Docker containers
echo "🐳 Checking Docker containers..."
docker-compose ps

# Check frontend
echo "🎨 Testing frontend..."
if curl -f -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend is not accessible"
fi

# Check backend
echo "🔧 Testing backend..."
if curl -f -s http://localhost:5000/api/emission-categories > /dev/null; then
    echo "✅ Backend API is accessible"
else
    echo "❌ Backend API is not accessible"
fi

# Test demo login
echo "🔑 Testing demo login..."
login_response=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@carbonytics.com", "password": "demo123"}')

if echo "$login_response" | grep -q '"success":true'; then
    echo "✅ Demo login working!"
else
    echo "❌ Demo login failed - creating demo user..."
    docker-compose exec backend npm run create-demo-user
fi

echo ""
echo "📍 URLs:"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:5000"
echo ""
echo "🔑 Demo Credentials:"
echo "Email: demo@carbonytics.com"
echo "Password: demo123"
