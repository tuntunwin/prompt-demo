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
function walkAndFill(item, fieldStatusMap, row, parentField, isLastItem = null) {
    for (const key in item) {
        const value = item[key];
        const keyField = parentField ? `${parentField}.${key}` : key;
        console.log(`Processing field: ${keyField}, value: ${JSON.stringify(value)}, last item: ${isLastItem}`);
        if (!(keyField in fieldStatusMap) || fieldStatusMap[keyField] !== -1) {
            if (value === null || typeof value !== 'object') {
                // Scalar value
                row[keyField] = value;
                if (isLastItem === null || isLastItem) {
                    fieldStatusMap[keyField] = -1;
                }
            } else if (Array.isArray(value)) {
                let itemIndex = fieldStatusMap[keyField] || 0;
                console.log(`Array field before: ${keyField}, current index: ${itemIndex}`);
                if (itemIndex >= 0 && itemIndex < value.length) {
                    walkAndFill(value[itemIndex], fieldStatusMap, row, keyField, itemIndex == value.length - 1);
                    // Check if all subfields are -1
                    const subKeys = Object.keys(fieldStatusMap).filter(k => k.startsWith(keyField + '.'));
                    const allSubDone = subKeys.every(k => fieldStatusMap[k] === -1);
                    let nextIndex = (itemIndex + 1 < value.length) ? itemIndex + 1 : -1;
                    if (isLastItem === null || isLastItem) {
                        fieldStatusMap[keyField] = subKeys.length > 0 && allSubDone ? nextIndex : itemIndex;
                    }
                } else {
                    if (isLastItem === null || isLastItem) {
                        fieldStatusMap[keyField] = -1;
                    }
                }
                console.log(`Array field after: ${keyField}, current index: ${fieldStatusMap[keyField]}`);
            } else if (typeof value === 'object') {
                walkAndFill(value, fieldStatusMap, row, keyField, isLastItem);
            }
        }
    }
}

// Main flatten function
function flattenJsonArray(items) {
    if (!items.length) return [];
    const allFields = getAllFields(items[0]);
    const rows = [];
    for (const item of items) {
        const fieldStatusMap = {};
        let done = false;
        let iteration = 0;
        while (!done) {
            iteration++;
            const row = {};
            allFields.forEach(f => row[f] = null);
            walkAndFill(item, fieldStatusMap, row, '');
            rows.push({ ...row });
            console.log(`Iteration ${iteration}, fieldStatusMap:${JSON.stringify(fieldStatusMap, null, 2)}\n Row:\n${JSON.stringify(row)}`);
            // Done if all fields in fieldStatusMap are -1
            done = Object.values(fieldStatusMap).every(v => v === -1);
        }
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
