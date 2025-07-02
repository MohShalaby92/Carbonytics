#!/bin/bash
echo "💾 Backing up Carbonytics database..."

# Configuration
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="carbonytics_backup_$DATE"
DB_NAME="${MONGODB_DB:-carbonytics}"
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"

# Create backup directory
mkdir -p $BACKUP_DIR

echo "📦 Creating backup: $BACKUP_NAME"
echo "🗄️  Database: $DB_NAME"

# Create MongoDB backup
mongodump --uri="$MONGODB_URI/$DB_NAME" --out="$BACKUP_DIR/$BACKUP_NAME"

if [ $? -eq 0 ]; then
    # Compress backup
    echo "🗜️  Compressing backup..."
    cd $BACKUP_DIR
    tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
    rm -rf "$BACKUP_NAME"
    
    echo "✅ Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
    
    # Show backup size
    SIZE=$(du -h "$BACKUP_NAME.tar.gz" | cut -f1)
    echo "📊 Backup size: $SIZE"
    
    # Clean old backups (keep last 5)
    echo "🧹 Cleaning old backups..."
    ls -t carbonytics_backup_*.tar.gz | tail -n +6 | xargs -r rm
    
else
    echo "❌ Backup failed!"
    exit 1
fi
