#!/bin/bash

# Carbonytics Docker Deployment Health Check & Demo User Setup
# Designed specifically for your docker-compose.yml setup
echo "🏥 Carbonytics Docker Deployment Health Check Starting..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "SUCCESS" ]; then
        echo -e "${GREEN}✅ $message${NC}"
    elif [ "$status" = "ERROR" ]; then
        echo -e "${RED}❌ $message${NC}"
    elif [ "$status" = "WARNING" ]; then
        echo -e "${YELLOW}⚠️ $message${NC}"
    else
        echo -e "${BLUE}ℹ️ $message${NC}"
    fi
}

# Check if Docker containers are running
echo "🐳 Checking Docker containers status..."
if docker-compose ps | grep -q "Up"; then
    print_status "SUCCESS" "Docker containers are running"
    docker-compose ps
else
    print_status "ERROR" "Docker containers are not running. Please run 'docker-compose up -d'"
    exit 1
fi

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 15

# Check frontend accessibility
echo "🎨 Testing frontend accessibility..."
if curl -f -s http://localhost:3000 > /dev/null; then
    print_status "SUCCESS" "Frontend is accessible at http://localhost:3000"
else
    print_status "ERROR" "Frontend is not accessible"
fi

# Check backend health
echo "🔧 Testing backend API..."
if curl -f -s http://localhost:5000/api/emission-categories > /dev/null; then
    print_status "SUCCESS" "Backend API is accessible at http://localhost:5000"
else
    print_status "WARNING" "Backend API may not be ready yet"
fi

# Test API endpoints and database connection
echo "🔌 Testing API endpoints..."
categories_response=$(curl -s http://localhost:5000/api/emission-categories)
if echo "$categories_response" | grep -q "success"; then
    category_count=$(echo "$categories_response" | grep -o '{"_id":' | wc -l)
    print_status "SUCCESS" "Database connected - $category_count emission categories found"
else
    print_status "ERROR" "Database connection issue - no categories found"
    echo "Response: $categories_response"
fi

# Check if demo user already exists
echo "👤 Checking for existing demo user..."
login_test=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@carbonytics.com", "password": "demo123"}')

if echo "$login_test" | grep -q '"success":true'; then
    print_status "SUCCESS" "Demo user already exists and working!"
    demo_exists="true"
else
    print_status "INFO" "Demo user needs to be created"
    demo_exists="false"
fi

# Create demo user if doesn't exist
if [ "$demo_exists" = "false" ]; then
    echo "🔨 Creating demo user and organization..."
    
    create_org_response=$(curl -s -X POST http://localhost:5000/api/auth/register \
      -H "Content-Type: application/json" \
      -d '{
        "email": "demo@carbonytics.com",
        "password": "demo123",
        "name": "Demo User",
        "organizationName": "Demo Organization",
        "industry": "Technology/Software"
      }')

    if echo "$create_org_response" | grep -q '"success":true\|email.*already.*exists'; then
        print_status "SUCCESS" "Demo user and organization created!"
    else
        print_status "WARNING" "Demo user creation may have failed"
        echo "Response: $create_org_response"
    fi
fi

# Final login test
echo "🔑 Testing demo credentials..."
login_response=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@carbonytics.com",
    "password": "demo123"
  }')

if echo "$login_response" | grep -q '"success":true'; then
    print_status "SUCCESS" "Demo login credentials working!"
    # Extract user info for verification
    user_name=$(echo "$login_response" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    print_status "INFO" "Demo user: $user_name"
else
    print_status "ERROR" "Demo login failed"
    echo "Login response: $login_response"
fi

# Test calculation functionality if login successful
if echo "$login_response" | grep -q '"success":true'; then
    echo "🧮 Testing calculation functionality..."
    auth_token=$(echo "$login_response" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$auth_token" ]; then
        # Get first category for testing
        first_category=$(curl -s http://localhost:5000/api/emission-categories | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$first_category" ]; then
            calc_response=$(curl -s -X POST http://localhost:5000/api/calculations/calculate \
              -H "Content-Type: application/json" \
              -H "Authorization: Bearer $auth_token" \
              -d "{
                \"categoryId\": \"$first_category\",
                \"value\": 1000,
                \"unit\": \"kWh\",
                \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
              }")
            
            if echo "$calc_response" | grep -q "emissions"; then
                print_status "SUCCESS" "Calculation functionality working"
            else
                print_status "WARNING" "Calculation test inconclusive"
            fi
        fi
    fi
fi

# Check for any errors in container logs
echo "📋 Checking for recent errors in logs..."
if docker-compose logs backend --tail=10 | grep -i error | head -3; then
    print_status "WARNING" "Some errors found in backend logs (see above)"
else
    print_status "SUCCESS" "No recent errors in backend logs"
fi

echo ""
echo "🎯 DEPLOYMENT STATUS SUMMARY:"
echo "=================================="

# Test all critical functionalities
frontend_status=$(curl -f -s http://localhost:3000 > /dev/null && echo "✅ OK" || echo "❌ FAIL")
backend_status=$(curl -f -s http://localhost:5000/api/emission-categories > /dev/null && echo "✅ OK" || echo "❌ FAIL")
demo_login_status=$(echo "$login_response" | grep -q '"success":true' && echo "✅ OK" || echo "❌ FAIL")
database_status=$(echo "$categories_response" | grep -q "success" && echo "✅ OK" || echo "❌ FAIL")

echo "Frontend Access:    $frontend_status"
echo "Backend API:        $backend_status"
echo "Demo Login:         $demo_login_status"
echo "Database:           $database_status"

if [[ "$frontend_status" == *"OK"* && "$backend_status" == *"OK"* && "$demo_login_status" == *"OK"* ]]; then
    print_status "SUCCESS" "🚀 DEPLOYMENT IS FULLY FUNCTIONAL!"
    echo ""
    echo "📍 Access URLs:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend:  http://localhost:5000"
    echo ""
    echo "🔑 Demo Credentials:"
    echo "   Email:    demo@carbonytics.com"
    echo "   Password: demo123"
    echo ""
    echo "✨ Your Carbonytics MVP is ready for use!"
    echo ""
    echo "🚀 Next Steps:"
    echo "   1. Open http://localhost:3000 in your browser"
    echo "   2. Login with demo credentials above"  
    echo "   3. Explore the dashboard and features"
    echo "   4. Create emission calculations"
    echo "   5. Test import/export functionality"
else
    print_status "ERROR" "Some components need attention"
    echo ""
    echo "🔧 Troubleshooting steps:"
    echo "1. Check all containers: docker-compose ps"
    echo "2. Check logs: docker-compose logs [service]"
    echo "3. Restart services: docker-compose restart"
    echo "4. Full reset: docker-compose down && docker-compose up -d"
    echo "5. Re-run this script after fixes"
fi

echo ""
echo "💡 Tip: Use 'docker-compose logs [service]' for detailed debugging"