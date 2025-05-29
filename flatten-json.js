import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

// Recursively get all dot notation fields from an object
function getAllFields(obj, parent = '') {
    let fields = [];
    for (const key in obj) {
        const value = obj[key];
        const field = parent ? `${parent}.${key}` : key;
        if (Array.isArray(value) && value.length > 0) {
            // Use first element to get structure
            fields = fields.concat(getAllFields(value[0], field));
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            fields = fields.concat(getAllFields(value, field));
        } else {
            fields.push(field);
        }
    }
    return fields;
}

// Walk and fill as per pseudo code
function walkAndFill(item, row, fieldStatusMap, parentField = null, parentStatusField=null, currentItemIndex = null) {
    let hasMoreItems = false;
    
    for (const key in item) {
        const value = item[key];
        const rowField = parentField ? `${parentField}.${key}` : key;
        const statusFieldPrefix = parentStatusField ? `${parentStatusField}.` : '';
        const statusField = currentItemIndex ? `${statusFieldPrefix}${key}` : `${statusFieldPrefix}${currentItemIndex}.${key}`;
        
        if (!(statusField in fieldStatusMap) || fieldStatusMap[statusField] !== -1) {
            if (Array.isArray(value)) {
                const arrayIndex = fieldStatusMap[statusField] || 0;
                
                if (arrayIndex < value.length) {
                    const hasMoreItemsInArray = walkAndFill(value[arrayIndex], row, fieldStatusMap, rowField, statusField, arrayIndex);
                    
                    if (!hasMoreItemsInArray) {
                        fieldStatusMap[statusField] = (arrayIndex + 1 < value.length) ? arrayIndex + 1 : -1;
                    }
                    
                    hasMoreItems = hasMoreItems || fieldStatusMap[statusField] !== -1;
                } 
            } else if (value && typeof value === 'object') {
                hasMoreItems = walkAndFill(value, row, fieldStatusMap, rowField, statusField) || hasMoreItems;
            } else {
                // Scalar value
                row[rowField] = value;
                fieldStatusMap[statusField] = -1;
            } 
        }
    }
    return hasMoreItems;
}

// Main flatten function
function flattenJsonArray(items) {
    if (!items.length) return [];
    
    const allFields = getAllFields(items[0]);
    const rows = [];
    
    for (const item of items) {
        const fieldStatusMap = {};
        let hasMoreItems = true;
        
        while (hasMoreItems) {
            const row = {};
            allFields.forEach(field => row[field] = null);
            hasMoreItems = walkAndFill(item, row, fieldStatusMap);
            rows.push(row);
        }
    }
    return rows;
}

// Helper function to convert rows to XLSX
function writeToXLSX(rows, outputPath) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Flattened Data');
    XLSX.writeFile(workbook, outputPath);
}

// Example usage
function main() {
    const inputPath = process.argv[2] || 'test_input.json';
    const outputPath = process.argv[3] || 'test_transformed.xlsx';
    if (!inputPath) {
        console.error('Usage: node flatten-json.js <input.json> [output.xlsx]');
        process.exit(1);
    }
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const rows = flattenJsonArray(input);
    
    // Write to XLSX instead of JSON
    writeToXLSX(rows, outputPath);
    console.log(`Flattened data written to ${outputPath}`);
}

// ES module entry point check
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    main();
}
