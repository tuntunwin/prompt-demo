import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
function walkAndFill(item, row, parentField, fieldStatusMap, itemIndex = -1) {
    let hasMoreItems = false;
    for (const key in item) {
        const value = item[key];
        const rowField = parentField ? `${parentField}.${key}` : key;
        const statusField = itemIndex == -1 ? rowField : `${rowField}. ${itemIndex}`;
        console.log(`Processing field: ${rowField}, statusField: ${statusField}, value: ${JSON.stringify(value)}`);
        if (!(statusField in fieldStatusMap) || fieldStatusMap[statusField] !== -1) {
            if (Array.isArray(value)) {
                console.log("array field");
                let itemIndex = fieldStatusMap[statusField] || 0;
                
                //console.log(`Array field before: ${rowField}, current index: ${itemIndex}`);
                if (itemIndex >= 0 && itemIndex < value.length) {
                    let nextIndex = itemIndex;
                    console.log(`Processing array field: ${rowField}, itemIndex: ${itemIndex}`);
                   let hasMoreItemsInCurrentIndex = walkAndFill(value[itemIndex],  row, rowField, fieldStatusMap, itemIndex);
                   if (!hasMoreItemsInCurrentIndex) {
                       // If no more items in this index, mark as done
                       nextIndex = (itemIndex + 1 < value.length) ? itemIndex + 1 : -1;
                       fieldStatusMap[statusField] = nextIndex;
                       
                   }
                   hasMoreItems ||= nextIndex != -1;
                   console.log(nextIndex != -1 ? `hasMOreItems: ${hasMoreItems} Moving to next index: ${nextIndex}` : `No more items in array for field: ${rowField}`);
                } 
                //console.log(`Array field after: ${rowField}, current index: ${fieldStatusMap[rowField]}`);
            }
            else if (typeof value === 'object') {
                console.log("object field");
                hasMoreItems ||= walkAndFill(value, row, rowField, fieldStatusMap);
            }
            
            else  {
                // Scalar value
                row[rowField] = value;
                fieldStatusMap[statusField] = -1;
            } 
            console.log(`Finished processing field: ${rowField}, hasMoreItems: ${hasMoreItems}`);
        }
    }
    console.log(`Finished processing field: ${parentField}, hasMoreItems: ${hasMoreItems}`);
    return hasMoreItems;
}

// Main flatten function
function flattenJsonArray(items) {
    if (!items.length) return [];
    const allFields = getAllFields(items[0]);
    const rows = [];
    for (const item of items) {
        const fieldStatusMap = {};
        let hasMoreItems = false;
        let iteration = 0;
        do {
            const row = {};
            allFields.forEach(f => row[f] = null);
            hasMoreItems = walkAndFill(item, row,  '', fieldStatusMap);
            rows.push({ ...row });
            console.log(`Iteration ${iteration}, fieldStatusMap:${JSON.stringify(fieldStatusMap)}\n Row:\n${JSON.stringify(row)}`);
            iteration++;
           
        }while(hasMoreItems);
    }
    return rows;
}

// Example usage
function main() {
    const inputPath = process.argv[2] || 'input.json';
    const outputPath = process.argv[3] || 'transformed.json';
    if (!inputPath) {
        console.error('Usage: node flatten-json.js <input.json> [output.json]');
        process.exit(1);
    }
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const rows = flattenJsonArray(input);
    fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`Flattened JSON written to ${outputPath}`);
}

// ES module entry point check
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    main();
}
