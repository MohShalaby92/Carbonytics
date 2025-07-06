#!/bin/bash

echo "🚀 Enhanced Production Deployment for Carbonytics..."

# Load environment variables
set -a
source .env.production 2>/dev/null || {
    echo "❌ .env.production not found! Creating template..."
    cat > .env.production << 'EOF'
# Production Environment Template
NODE_ENV=production
JWT_SECRET=CHANGE_THIS_TO_64_CHAR_SECRET
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=CHANGE_THIS_PASSWORD
REDIS_PASSWORD=CHANGE_THIS_REDIS_PASSWORD
GRAFANA_PASSWORD=CHANGE_THIS_GRAFANA_PASSWORD
EOF
    echo "📝 Please edit .env.production with your production values"
    exit 1
}
set +a

# Pre-deployment validation
echo "🔍 Validating production configuration..."

# Check required environment variables
REQUIRED_VARS=("JWT_SECRET" "MONGO_ROOT_PASSWORD" "REDIS_PASSWORD")
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" || "${!var}" == *"CHANGE_THIS"* ]]; then
        echo "❌ $var is not properly configured in .env.production"
        exit 1
    fi
done

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

# Create backup before deployment
echo "💾 Creating pre-deployment backup..."
if [ -f "./scripts/backup-data.sh" ]; then
    ./scripts/backup-data.sh
else
    ./scripts/backup-production.sh
fi

# Run tests
echo "🧪 Running production tests..."
npm run test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed! Deployment cancelled."
    exit 1
fi

# Build application
echo "🔨 Building application..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed! Deployment cancelled."
    exit 1
fi

# Deploy
echo "🐳 Deploying production containers..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
echo "⏳ Waiting for services to start..."
sleep 60

# Health checks
echo "🏥 Running comprehensive health checks..."
BACKEND_HEALTH=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:5000/health")
if [ "$BACKEND_HEALTH" != "200" ]; then
    echo "❌ Backend health check failed (HTTP $BACKEND_HEALTH)"
    echo "🔄 Rolling back deployment..."
    docker-compose -f docker-compose.prod.yml down
    exit 1
fi

# Database connectivity check
echo "🗄️ Checking database connectivity..."
DB_CHECK=$(docker exec carbonytics-mongo mongosh --eval "db.adminCommand('ping')" --quiet)
if [[ $DB_CHECK != *"ok"* ]]; then
    echo "❌ Database connectivity check failed"
    exit 1
fi

# Redis connectivity check
echo "💾 Checking Redis connectivity..."
REDIS_CHECK=$(docker exec carbonytics-redis redis-cli ping)
if [ "$REDIS_CHECK" != "PONG" ]; then
    echo "❌ Redis connectivity check failed"
    exit 1
fi

echo "✅ All health checks passed!"
echo "🎉 Production deployment successful!"
echo ""
echo "📊 Service URLs:"
echo "   🌐 Application: https://carbonytics.com"
echo "   📈 Grafana: http://localhost:3001"
echo "   🔍 Prometheus: http://localhost:9090"
echo "   🏥 Health Check: http://localhost:5000/health"