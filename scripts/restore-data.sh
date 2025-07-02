#!/bin/bash
echo "📥 Restoring Carbonytics database from backup..."

# Check if backup file is provided
if [ $# -eq 0 ]; then
    echo "❌ Please provide the backup file path."
    echo "Usage: ./scripts/restore-data.sh <backup-file>"
    echo ""
    echo "Available backups:"
    ls -la ./backups/carbonytics_backup_*.tar.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${MONGODB_DB:-carbonytics}"
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Extract backup
echo "📂 Extracting backup..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Find the backup directory
BACKUP_DIR=$(find "$TEMP_DIR" -name "carbonytics_backup_*" -type d | head -1)

if [ -z "$BACKUP_DIR" ]; then
    echo "❌ Invalid backup file format"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Confirm restoration
echo "⚠️  This will replace all data in database: $DB_NAME"
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restoration cancelled"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Drop existing database
echo "🗑️  Dropping existing database..."
mongo "$MONGODB_URI/$DB_NAME" --eval "db.dropDatabase()"

# Restore from backup
echo "📥 Restoring database..."
mongorestore --uri="$MONGODB_URI" "$BACKUP_DIR"

if [ $? -eq 0 ]; then
    echo "✅ Database restoration completed successfully!"
    
    # Show restored collections
    echo "📊 Restored collections:"
    mongo "$MONGODB_URI/$DB_NAME" --quiet --eval "db.getCollectionNames().forEach(function(name) { print('  • ' + name + ': ' + db[name].count() + ' documents'); })"
else
    echo "❌ Database restoration failed!"
fi

# Cleanup
rm -rf "$TEMP_DIR"
