#!/bin/bash
echo "📈 Importing emission data from Excel file..."

# Check if file argument is provided
if [ $# -eq 0 ]; then
    echo "❌ Please provide the Excel file path."
    echo "Usage: ./scripts/import-excel.sh <path-to-excel-file>"
    echo "Example: ./scripts/import-excel.sh ./data/emission-factors.xlsx"
    exit 1
fi

EXCEL_FILE="$1"

# Check if file exists
if [ ! -f "$EXCEL_FILE" ]; then
    echo "❌ File not found: $EXCEL_FILE"
    exit 1
fi

# Check file extension
if [[ "$EXCEL_FILE" != *.xlsx && "$EXCEL_FILE" != *.xls ]]; then
    echo "❌ File must be an Excel file (.xlsx or .xls)"
    exit 1
fi

echo "📂 Importing from: $EXCEL_FILE"

# Navigate to backend directory
cd backend

# Run import script
npm run import-excel "$EXCEL_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Excel import completed successfully!"
else
    echo "❌ Excel import failed. Check the logs above for errors."
    exit 1
fi
