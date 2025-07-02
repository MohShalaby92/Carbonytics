#!/bin/bash
echo "🚀 Deploying Carbonytics to production..."

# Configuration
DEPLOY_ENV="${DEPLOY_ENV:-production}"
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"

echo "📋 Deployment Configuration:"
echo "   Environment: $DEPLOY_ENV"
echo "   Backup before deploy: $BACKUP_BEFORE_DEPLOY"
echo ""

# Pre-deployment checks
echo "🔍 Running pre-deployment checks..."

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found!"
    echo "   Please create it with production environment variables."
    exit 1
fi

# Check if tests pass
echo "🧪 Running tests..."
npm run test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed! Deployment cancelled."
    exit 1
fi

# Check if build works
echo "🔨 Testing build..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed! Deployment cancelled."
    exit 1
fi

# Backup current database if enabled
if [ "$BACKUP_BEFORE_DEPLOY" = "true" ]; then
    echo "💾 Creating pre-deployment backup..."
    ./scripts/backup-data.sh
fi

# Deploy based on strategy
case "$DEPLOY_STRATEGY" in
    "docker")
        echo "🐳 Deploying with Docker..."
        docker-compose -f docker-compose.prod.yml up -d --build
        ;;
    "pm2")
        echo "⚡ Deploying with PM2..."
        pm2 stop carbonytics || true
        pm2 start ecosystem.config.js --env production
        ;;
    "systemd")
        echo "🔧 Deploying with systemd..."
        sudo systemctl stop carbonytics
        sudo systemctl start carbonytics
        ;;
    *)
        echo "🏠 Local production deployment..."
        NODE_ENV=production npm start
        ;;
esac

# Health check
echo "🏥 Running health check..."
sleep 10

HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$HEALTH_URL")

if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ Deployment successful! Application is healthy."
else
    echo "❌ Deployment may have failed. Health check returned: $HEALTH_RESPONSE"
    exit 1
fi

echo ""
echo "🎉 Carbonytics deployed successfully!"
echo "🌐 Application URL: ${APP_URL:-http://localhost}"
