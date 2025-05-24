// Import required libraries for Excel manipulation and file system operations
import * as XLSX from 'xlsx';
import fs from 'fs';

// Configuration: Define the fields to include in the report using dot notation for nested fields
// This array controls which data points will be extracted from the JSON and appear as columns in Excel
const FIELDS = [
  'location.road', 'location.direction', 'location.landmark',
  'incidentId', 'type', 'time', 'status',
  'details.vehiclesInvolved.type',
  'details.vehiclesInvolved.plateNumber.serial',
  'details.vehiclesInvolved.plateNumber.region',
  'details.vehiclesInvolved.severity',
  'details.casualties', 'details.lanesBlocked',
  'advisories.type', 'advisories.message',
  'responders.agency', 'responders.arrivalTime',
  'responders.personnel.name', 'responders.personnel.role',
];

/**
 * Flattens a nested object with arrays into multiple rows and deduplicates values within each parent group
 * This is the core function that handles complex nested JSON structures with arrays
 * @param {Object} obj - The object to flatten
 * @param {Array} fields - Field names to extract (supports dot notation)
 * @param {string} parentKey - Key used to group related rows (e.g., 'incidentId')
 * @returns {Array} Array of flattened row objects
 */
function flattenAndDedup(obj, fields, parentKey) {
  // Track seen values for deduplication within each parent group
  let seen = {};
  
  /**
   * Recursive function to process nested objects and arrays
   * @param {Object} o - Current object being processed
   * @param {Object} parent - Parent object data to inherit
   * @param {*} parentValue - Value of the parent key for grouping
   * @returns {Array} Array of row objects
   */
  function recurse(o, parent = {}, parentValue = null) {
    // Initialize deduplication tracking when starting a new parent group
    if (parentValue === null && o[parentKey]) {
      seen = {};
      parentValue = o[parentKey];
    }
    
    // MAIN ALGORITHM: Find and expand the first array encountered in the field paths
    for (const field of fields) {
      const parts = field.split('.');
      let ref = o, arrIdx = -1;
      
      // Navigate through the object path to find arrays
      for (let j = 0; j < parts.length; j++) {
        if (Array.isArray(ref)) { 
          arrIdx = j; 
          break; 
        }
        ref = ref ? ref[parts[j]] : undefined;
      }
      
      // ARRAY EXPANSION: If an array is found, create multiple rows (one per array item)
      if (Array.isArray(ref)) {
        return ref.flatMap(item => {
          // Create a new object with the array item substituted
          let newObj = o, target = newObj;
          for (let k = 0; k < arrIdx - 1; k++) target = target[parts[k]];
          if (arrIdx > 0) target[parts[arrIdx - 1]] = item; else newObj = item;
          // Recursively process the new object
          return recurse(newObj, parent, parentValue);
        });
      }
    }    // ROW GENERATION: No more arrays found, create a single row with deduplication
    const row = { ...parent };
    for (const field of fields) {
      // Extract value using dot notation path traversal
      const parts = field.split('.');
      let value = o;
      for (const part of parts) value = value && value[part];
      
      // Handle array values by joining them into a comma-separated string
      if (Array.isArray(value)) value = value.join(', ');
      
      // DEDUPLICATION LOGIC: Track seen values per field within each parent group
      if (!seen[field]) seen[field] = new Set();
      // Set empty string if value was already seen, otherwise use the value
      row[field] = value && seen[field].has(value) ? '' : (value ?? '');
      // Add value to seen set if it's not empty
      if (value && !seen[field].has(value)) seen[field].add(value);
    }
    return [row];
  }
  // Start the recursive processing
  return recurse(obj);
}

/**
 * Merges compatible rows within each parent group to reduce redundancy
 * Combines rows that don't have overlapping data in the same fields
 * @param {Array} rows - Array of row objects to merge
 * @param {Array} fields - Field names to consider for merging
 * @param {string} parentKey - Key used to group rows for merging
 * @returns {Array} Array of merged row objects
 */
function mergeRowsByParent(rows, fields, parentKey) {
  // GROUP ROWS: Organize rows by their parent key value
  const grouped = rows.reduce((acc, row) => {
    const key = row[parentKey] || '__NO_PARENT__';
    (acc[key] = acc[key] || []).push(row);
    return acc;
  }, {});
  
  // MERGE LOGIC: Process each group independently
  return Object.values(grouped).flatMap(groupRows => {
    // Track which rows have been merged to avoid duplicates
    const used = Array(groupRows.length).fill(false), merged = [];
    
    // For each unused row, try to merge it with compatible rows
    for (let i = 0; i < groupRows.length; i++) {
      if (used[i]) continue;
      
      // Start with the current row as base
      let row = { ...groupRows[i] }; 
      used[i] = true;
      
      // COMPATIBILITY CHECK: Find rows that can be merged (no field conflicts)
      for (let j = i + 1; j < groupRows.length; j++) {
        if (used[j]) continue;
        
        // Check if rows are compatible (no overlapping non-empty fields)
        if (fields.every(f => !row[f] || !groupRows[j][f])) {
          // MERGE OPERATION: Copy non-empty fields from compatible row
          for (const f of fields) if (!row[f]) row[f] = groupRows[j][f];
          used[j] = true;
        }
      }
      merged.push(row);
    }
    return merged;
  });
}

// MAIN EXECUTION FLOW: Process input data and generate Excel output

// STEP 1: Read and parse input JSON data
const inputData = JSON.parse(fs.readFileSync('input.json', 'utf8'));

// STEP 2: Process each item in the input data through the complete pipeline
// - Flatten nested structures and handle arrays
// - Deduplicate values within parent groups  
// - Merge compatible rows to reduce redundancy
let allRows = inputData.flatMap(item => 
  mergeRowsByParent(
    flattenAndDedup(item, FIELDS, 'incidentId'), 
    FIELDS, 
    'incidentId'
  )
);

// STEP 3: Prepare data for Excel export
// Create 2D array with headers as first row, followed by data rows
const rows = [
  FIELDS, // Header row
  ...allRows.map(row => FIELDS.map(f => row[f] ?? '')) // Data rows mapped to field order
];

// STEP 4: Generate Excel file using XLSX library
const worksheet = XLSX.utils.aoa_to_sheet(rows); // Convert array of arrays to worksheet
const workbook = XLSX.utils.book_new(); // Create new workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Report'); // Add worksheet to workbook

// STEP 5: Write Excel file to disk and confirm completion
XLSX.writeFile(workbook, 'output.xlsx');
console.log('Exported to output.xlsx');
