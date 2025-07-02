#!/bin/bash
echo "🧪 Testing Carbonytics API endpoints..."

# Default API URL
API_URL="${API_URL:-http://localhost:5000/api}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_status=$3
    local description=$4
    
    echo -n "Testing: $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" -o /tmp/response.json "$API_URL$endpoint")
    fi
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL (Expected: $expected_status, Got: $response)${NC}"
        return 1
    fi
}

echo "🌐 Testing API at: $API_URL"
echo ""

# Test basic health endpoint
test_endpoint "GET" "/../../health" "200" "Health check"

# Test emission categories
test_endpoint "GET" "/emission-categories" "200" "Get all emission categories"
test_endpoint "GET" "/emission-categories/scope/1" "200" "Get Scope 1 categories"
test_endpoint "GET" "/emission-categories/scope/2" "200" "Get Scope 2 categories"
test_endpoint "GET" "/emission-categories/scope/3" "200" "Get Scope 3 categories"

# Test emission factors
test_endpoint "GET" "/emission-factors" "200" "Get emission factors"
test_endpoint "GET" "/emission-factors/sources" "200" "Get factor sources"
test_endpoint "GET" "/emission-factors/search?q=electricity" "200" "Search factors"

# Test invalid endpoints
test_endpoint "GET" "/emission-categories/scope/4" "400" "Invalid scope (should fail)"

echo ""
echo "🏁 API testing completed!"
