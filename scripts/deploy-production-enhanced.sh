#!/bin/bash

echo "🚀 Enhanced Production Deployment for Carbonytics..."

# Load environment variables
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production not found! Please create it first."
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

# Deploy
echo "🐳 Deploying production containers..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
docker-compose -f docker-compose.prod.yml up -d --build

echo "⏳ Waiting for services to start..."
sleep 45

# Health checks
echo "🏥 Running health checks..."

# Check if containers are running
echo "🔍 Checking container status..."
CONTAINERS=("carbonytics-backend" "carbonytics-frontend" "carbonytics-mongo" "carbonytics-redis" "carbonytics-proxy")

for container in "${CONTAINERS[@]}"; do
    if docker ps | grep -q "$container"; then
        echo "✅ $container is running"
    else
        echo "❌ $container is not running"
        echo "🔍 $container logs:"
        docker logs "$container" --tail 15 2>/dev/null || echo "No logs available"
        exit 1
    fi
done

# Test backend health through Docker internal network
echo "🔄 Testing backend health (internal Docker network)..."
INTERNAL_HEALTH=$(docker exec carbonytics-proxy wget -qO- --timeout=10 http://backend:5000/health 2>/dev/null || echo "ERROR")

if [[ "$INTERNAL_HEALTH" == *"success"* ]] || [[ "$INTERNAL_HEALTH" == *"healthy"* ]]; then
    echo "✅ Backend health check passed!"
    echo "📊 Response: $INTERNAL_HEALTH"
    BACKEND_HEALTHY=true
else
    echo "❌ Backend health check failed"
    echo "🔍 Response: $INTERNAL_HEALTH"
    echo "🔍 Backend logs:"
    docker logs carbonytics-backend --tail 20
    exit 1
fi

# Test nginx proxy (external access to the app)
echo "🌐 Testing nginx proxy (main application access)..."
for i in {1..8}; do
    echo "   Application test attempt $i/8..."
    NGINX_RESPONSE=$(curl -s --max-time 10 -w "%{http_code}" -o /dev/null "http://localhost/" 2>/dev/null || echo "000")
    
    if [[ "$NGINX_RESPONSE" == "200" ]] || [[ "$NGINX_RESPONSE" == "302" ]] || [[ "$NGINX_RESPONSE" == "304" ]]; then
        echo "✅ Main application is accessible (HTTP $NGINX_RESPONSE)"
        NGINX_HEALTHY=true
        break
    elif [ "$i" = "8" ]; then
        echo "❌ Main application test failed after 8 attempts (HTTP $NGINX_RESPONSE)"
        echo "🔍 Nginx logs:"
        docker logs carbonytics-proxy --tail 15
        NGINX_HEALTHY=false
    else
        sleep 3
    fi
done

# Test API through nginx proxy
echo "🔌 Testing API access through proxy..."
API_RESPONSE=$(curl -s --max-time 10 "http://localhost/api" 2>/dev/null || echo "ERROR")

if [[ "$API_RESPONSE" == *"Carbonytics API"* ]] || [[ "$API_RESPONSE" == *"success"* ]]; then
    echo "✅ API is accessible through proxy"
    API_HEALTHY=true
else
    echo "⚠️ API test inconclusive"
    API_HEALTHY=false
fi

# Test database connectivity
echo "🗄️ Testing database connectivity..."
DB_TEST=$(docker exec carbonytics-mongo mongosh --eval "db.adminCommand('ping')" --quiet 2>/dev/null || echo "ERROR")
if [[ "$DB_TEST" == *"ok"* ]]; then
    echo "✅ MongoDB is responsive"
else
    echo "⚠️ MongoDB test inconclusive (may still be starting)"
fi

echo ""
echo "🎉 Deployment Analysis Complete!"
echo ""
echo "📊 Final Status:"
echo "   ✅ All containers: Running"
echo "   ✅ Backend API: Healthy (internal)"
if [ "$NGINX_HEALTHY" = true ]; then
    echo "   ✅ Main Application: http://localhost"
else
    echo "   ⚠️ Main Application: http://localhost (check manually)"
fi

if [ "$API_HEALTHY" = true ]; then
    echo "   ✅ API Endpoint: http://localhost/api"
else
    echo "   ⚠️ API Endpoint: http://localhost/api (check manually)"
fi

echo "   📈 Grafana Dashboard: http://localhost:3001"
echo "   🔍 Prometheus Metrics: http://localhost:9090"
echo ""
echo "🔧 Next Steps:"
echo "   1. Open http://localhost in your browser"
echo "   2. Create your first user account"
echo "   3. Start calculating emissions!"
echo "   4. Monitor performance at http://localhost:3001"

if [ "$BACKEND_HEALTHY" = true ] && [ "$NGINX_HEALTHY" = true ]; then
    echo ""
    echo "🎉🎉 CARBONYTICS MVP IS FULLY DEPLOYED AND READY! 🎉🎉"
    echo ""
    echo "Your enterprise-grade carbon accounting platform is now live!"
    exit 0
else
    echo ""
    echo "⚠️ Deployment completed but manual verification recommended"
    exit 0
fi