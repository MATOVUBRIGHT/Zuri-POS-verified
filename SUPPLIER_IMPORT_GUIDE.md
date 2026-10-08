# Supplier Import Guide

## Overview
The new Supplier Import feature allows you to upload and import supplier data from CSV or Excel files with advanced column mapping, custom fields, and duplicate handling capabilities.

## Features

### 📋 4-Step Import Process
1. **Upload File** - Upload CSV (preferred) or Excel files
2. **Preview Data** - Review all columns and rows, select which to import
3. **Map Columns** - Map file columns to supplier fields or create custom fields
4. **Confirm Import** - Review settings and handle duplicates before importing

### 📊 Column Preview & Selection
- Preview all columns and data rows before importing
- Select specific rows to import (skip unwanted data)
- Sample data display for each column to verify content

### 🎯 Smart Column Mapping
- Automatic mapping suggestions based on column headers
- Map to standard supplier fields: Name, Company, Phone, Email, Address, Notes, etc.
- Create custom fields for data that doesn't fit standard fields

### 🔄 Duplicate Handling
- Automatic detection of existing suppliers by name matching
- Choose how to handle duplicates:
  - **Update existing** - Merge new data with existing supplier
  - **Skip duplicates** - Only import new suppliers
  - **Create new** - Create duplicate entries with modified names

### 📁 File Format Support
- **CSV files** (recommended) - Universal compatibility
- **Excel files** (.xlsx, .xls) - Loaded via CDN when needed

## How to Use

### Step 1: Prepare Your File
1. Click "Download Template" to get a sample CSV file
2. Use the template structure or create your own with these columns:
   - Name (required)
   - Company, Phone, Email, Address (optional)
   - Notes, Total Supplied, Outstanding Balance (optional)
   - Any custom columns you need

### Step 2: Upload File
1. Click "Import Suppliers" button
2. Select your CSV or Excel file
3. Wait for file processing and preview

### Step 3: Review Preview
1. Review all detected columns and data rows
2. Use checkboxes to select/deselect rows to import
3. Click "Map Columns" when satisfied

### Step 4: Map Columns
1. Map each file column to a supplier field:
   - Choose from standard fields (Name, Phone, etc.)
   - Mark as "Custom Field" for non-standard data
   - Leave unmapped to skip the column
2. Create additional custom fields if needed
3. Click "Review Import" when mapping is complete

### Step 5: Handle Duplicates
1. Review any detected duplicates
2. Choose duplicate handling strategy:
   - **Update existing** - Recommended for data updates
   - **Skip duplicates** - For adding only new suppliers
   - **Create new** - Creates entries with modified names
3. Click "Import Suppliers" to proceed

## Custom Fields

Custom fields are stored as JSON data and can contain:
- Text data (names, descriptions, codes)
- Numbers (quantities, scores, ratings)
- Any structured data specific to your business

Custom fields are preserved during updates and can be viewed in the supplier details.

## File Format Examples

### CSV Format
```csv
Name,Company,Phone,Email,Address,Notes,Total Supplied,Outstanding Balance,Custom Field 1
Jane Supplier,ABC Ltd,+256700000000,jane@abc.com,"Kampala, Uganda","Reliable supplier",50000,15000,"Custom data"
John Wholesale,XYZ Company,+256701111111,john@xyz.com,"Entebbe, Uganda","Fast delivery",75000,0,"More custom data"
```

### Excel Format
- Use same column structure as CSV
- Save as .xlsx or .xls format
- First row should contain column headers
- Data starts from row 2

## Tips for Success

1. **Use the template** - Download and modify the provided template
2. **Clean your data** - Remove empty rows and fix formatting before upload
3. **Test with small files** - Try importing 5-10 records first
4. **Backup existing data** - Export current suppliers before major imports
5. **Use CSV format** - More reliable than Excel for large datasets
6. **Handle duplicates carefully** - Review the duplicate detection before importing

## Troubleshooting

### File Won't Upload
- Check file format (.csv, .xlsx, .xls only)
- Ensure file has header row and at least one data row
- Try converting Excel to CSV format

### Column Mapping Issues  
- Ensure "Name" field is mapped (required)
- Check sample data matches expected field types
- Use custom fields for non-standard data

### Duplicate Detection Problems
- Duplicates are matched by exact name comparison
- Clean up supplier names for consistent matching
- Use "Create new" option if name matching is unreliable

### Import Errors
- Check browser console for detailed error messages
- Verify you have permission to create suppliers
- Ensure store ID is properly set

## Technical Notes

- Custom fields are stored in suppliers.custom_fields JSONB column
- Import operations are logged in audit trail
- Large files (>1000 rows) may take time to process
- Progress is shown during import operations

For additional support, check the application logs or contact your system administrator.