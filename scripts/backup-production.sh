#!/bin/bash

# Production Configuration
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
DB_NAME="carbonytics_prod"

echo "🗄️ Starting production database backup for $DB_NAME..."

# Create backup directory structure
mkdir -p $BACKUP_DIR/{mongo,redis,uploads}

# MongoDB backup
echo "📦 Backing up MongoDB..."
docker exec carbonytics-mongo mongodump \
  --db $DB_NAME \
  --out /backup/mongodb_$DATE

# Redis backup
echo "💾 Backing up Redis..."
docker exec carbonytics-redis redis-cli --rdb /data/redis_backup_$DATE.rdb
docker cp carbonytics-redis:/data/redis_backup_$DATE.rdb $BACKUP_DIR/redis/

# Application uploads backup
echo "📁 Backing up uploads..."
docker cp carbonytics-backend:/app/uploads $BACKUP_DIR/uploads/uploads_$DATE

# Compress all backups
cd $BACKUP_DIR
echo "🗜️ Compressing backups..."
tar -czf "carbonytics_full_backup_$DATE.tar.gz" \
  mongo/mongodb_$DATE \
  redis/redis_backup_$DATE.rdb \
  uploads/uploads_$DATE

# Cleanup temporary files
rm -rf mongo/mongodb_$DATE redis/redis_backup_$DATE.rdb uploads/uploads_$DATE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "carbonytics_full_backup_*.tar.gz" -mtime +30 -delete

echo "✅ Production backup completed: carbonytics_full_backup_$DATE.tar.gz"

# Upload to cloud storage
if [ "$BACKUP_UPLOAD_ENABLED" = "true" ]; then
    echo "☁️ Uploading backup to cloud storage..."
    # Add your cloud storage upload commands here
    # Examples: aws s3 cp, gsutil cp, etc.
fi