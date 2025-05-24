import * as XLSX from 'xlsx';
import fs from 'fs';

// Fields to include in the report (dot notation for nested fields)
const FIELDS = [
  'incidentId','type', 'time', 'status','location.road', 'location.direction', 'location.landmark',
   
  'details.vehiclesInvolved.type',
  'details.vehiclesInvolved.plateNumber.serial',
  'details.vehiclesInvolved.plateNumber.region',
  'details.vehiclesInvolved.severity',
  'details.casualties', 'details.lanesBlocked',
  'advisories.type', 'advisories.message',
  'responders.agency', 'responders.arrivalTime',
  'responders.personnel.name', 'responders.personnel.role',
];

// Flattens a parent object into deduplicated child rows (per parent group)
function flattenAndDedup(obj, fields, parentKey) {
  let ownerSeen = new Map(); // Map to track seen values per owner object
  
  // Generic function to create a unique key for the owner object based on the field path
  function getOwnerKey(o, field) {
    const parts = field.split('.');
    
    if (parts.length <= 1) {
      return 'root'; // Top-level fields belong to root
    }
    
    // For nested fields, create owner key based on parent object instance
    // We need to identify the "parent" object that owns this field
    
    // Find the array level in the field path
    let arrayLevel = -1;
    let current = o;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (Array.isArray(current)) {
        arrayLevel = i;
        break;
      }
      current = current && current[parts[i]];
    }
    
    // Create a unique signature for the parent object instance
    const parentPath = parts.slice(0, arrayLevel === -1 ? parts.length - 1 : arrayLevel + 1);
    const parentFields = fields.filter(f => {
      const fParts = f.split('.');
      return fParts.length > parentPath.length && 
             fParts.slice(0, parentPath.length).join('.') === parentPath.join('.');
    });
    
    // Create signature based on identifying fields of the parent object
    const signature = {};
    let objRef = o;
    
    // Navigate to the parent object
    for (let i = 0; i < parentPath.length; i++) {
      objRef = objRef && objRef[parentPath[i]];
    }
    
    // Add all non-array field values from this parent object to create unique signature
    for (const parentField of parentFields) {
      const fieldParts = parentField.split('.');
      if (fieldParts.length === parentPath.length + 1) { // Direct child field
        let val = objRef;
        const childFieldName = fieldParts[fieldParts.length - 1];
        val = val && val[childFieldName];
        if (val !== undefined && !Array.isArray(val)) {
          signature[parentField] = val;
        }
      }
    }
    
    // For deeply nested fields (like personnel.name), also include the immediate parent identity
    if (parts.length > 2) {
      const immediateParentPath = parts.slice(0, -1).join('.');
      let immediateParent = o;
      for (const part of parts.slice(0, -1)) {
        immediateParent = immediateParent && immediateParent[part];
      }
      
      // Add a unique identifier for the immediate parent object
      if (immediateParent && typeof immediateParent === 'object') {
        const immediateParentFields = fields.filter(f => f.startsWith(immediateParentPath + '.'));
        for (const ipField of immediateParentFields) {
          const ipFieldParts = ipField.split('.');
          const ipFieldName = ipFieldParts[ipFieldParts.length - 1];
          const ipValue = immediateParent[ipFieldName];
          if (ipValue !== undefined && !Array.isArray(ipValue)) {
            signature[ipField] = ipValue;
          }
        }
      }
    }
    
    return `${parentPath.join('.')}_${JSON.stringify(signature)}`;
  }

  function recurse(o, parent = {}, parentValue = null, depth = 0) {
    if (parentValue === null && o[parentKey]) {
      ownerSeen.clear(); // Reset for each parent group
      parentValue = o[parentKey];
    }

    // Find first array in fields and flatten it
    for (const field of fields) {
      const parts = field.split('.');
      let ref = o, arrIdx = -1;
      
      for (let j = 0; j < parts.length; j++) {
        if (Array.isArray(ref)) { 
          arrIdx = j; 
          break; 
        }
        ref = ref ? ref[parts[j]] : undefined;
      }
      
      if (Array.isArray(ref)) {
        return ref.flatMap(item => {
          let newObj = { ...o }; // Create a clean copy
          let target = newObj;
          
          // Navigate to the parent of the array and replace it with the item
          for (let k = 0; k < arrIdx - 1; k++) {
            if (!target[parts[k]]) target[parts[k]] = {};
            target = target[parts[k]];
          }
          
          if (arrIdx > 0) {
            target[parts[arrIdx - 1]] = item;
          } else {
            newObj = item;
          }
          
          return recurse(newObj, parent, parentValue, depth + 1);
        });
      }
    }

    // No arrays left, output a row with owner-based deduplication
    const row = { ...parent };
    for (const field of fields) {
      const parts = field.split('.');
      let value = o;
      for (const part of parts) value = value && value[part];
      if (Array.isArray(value)) value = value.join(', ');
      
      if (value) {
        const ownerKey = getOwnerKey(o, field);
        const fieldKey = `${ownerKey}_${field}`;
        
        if (!ownerSeen.has(fieldKey)) {
          ownerSeen.set(fieldKey, new Set());
        }
        
        const seenValues = ownerSeen.get(fieldKey);
        const shouldShow = !seenValues.has(value);
        
        row[field] = shouldShow ? value : '';
        if (shouldShow) seenValues.add(value);
      } else {
        row[field] = value ?? '';
      }
    }
    return [row];
  }
  
  return recurse(obj);
}

// Generic merging function that combines rows based on parent key
function mergeRowsByParent(rows, fields, parentKey) {
  const grouped = rows.reduce((acc, row) => {
    const key = row[parentKey] || '__NO_PARENT__';
    (acc[key] = acc[key] || []).push(row);
    return acc;
  }, {});
  
  return Object.values(grouped).flatMap(groupRows => {
    const used = Array(groupRows.length).fill(false);
    const merged = [];
    
    // Helper function to check if two rows have conflicting values for any parent object
    function hasConflictingParentContext(row1, row2, field) {
      const parts = field.split('.');
      if (parts.length <= 1) return false; // Top-level fields don't have parent conflicts
      
      // Get parent object path
      const parentPath = parts.slice(0, -1).join('.');
      const siblingFields = fields.filter(f => f.startsWith(parentPath + '.'));
      
      // Check if any sibling fields have conflicting values
      for (const siblingField of siblingFields) {
        const val1 = row1[siblingField];
        const val2 = row2[siblingField];
        
        // If both have values but they're different, there's a conflict
        if (val1 && val2 && val1 !== val2) {
          return true;
        }
      }
      
      return false;
    }
    
    for (let i = 0; i < groupRows.length; i++) {
      if (used[i]) continue;
      
      const row = { ...groupRows[i] };
      used[i] = true;
      
      // Try to merge with other rows
      for (let j = i + 1; j < groupRows.length; j++) {
        if (used[j]) continue;
        
        const candidateRow = groupRows[j];
        let canMerge = true;
        const potentialAdditions = [];
        
        // Check each field to see if we can safely merge
        for (const field of fields) {
          const candidateValue = candidateRow[field];
          if (!candidateValue) continue;
          
          // If current row already has this field
          if (row[field]) {
            // Only allow if values are identical (no conflict)
            if (row[field] !== candidateValue) {
              canMerge = false;
              break;
            }
          } else {
            // Check for parent context conflicts
            if (hasConflictingParentContext(row, candidateRow, field)) {
              canMerge = false;
              break;
            }
            
            potentialAdditions.push({ field, value: candidateValue });
          }
        }
        
        // Only merge if no conflicts and we have something to add
        if (canMerge && potentialAdditions.length > 0) {
          for (const addition of potentialAdditions) {
            row[addition.field] = addition.value;
          }
          used[j] = true;
        }
      }
      
      merged.push(row);
    }
    
    return merged;
  });
}

// Main: flatten, deduplicate, merge, and export to Excel
const inputData = JSON.parse(fs.readFileSync('input.json', 'utf8'));

// Process each incident and track stats
let totalRowsBeforeMerge = 0;
let allRows = [];

for (const item of inputData) {
  console.log(`\n=== Processing Incident ${item.incidentId} ===`);
  const flattenedRows = flattenAndDedup(item, FIELDS, 'incidentId');
  totalRowsBeforeMerge += flattenedRows.length;
  
  console.log(`Flattened rows for ${item.incidentId}:`);
  flattenedRows.forEach((row, idx) => {
    const nonEmptyFields = FIELDS.filter(f => row[f]).map(f => `${f}:${row[f]}`);
    console.log(`  Row ${idx + 1}: ${nonEmptyFields.join(', ')}`);
  });
  
  const mergedRows = mergeRowsByParent(flattenedRows, FIELDS, 'incidentId');
  
  // Filter out completely empty rows
  const filteredRows = mergedRows.filter(row => 
    FIELDS.some(field => row[field] && row[field].toString().trim() !== '')
  );
  
  allRows.push(...filteredRows);
  
  console.log(`Merged rows for ${item.incidentId}:`);
  filteredRows.forEach((row, idx) => {
    const nonEmptyFields = FIELDS.filter(f => row[f]).map(f => `${f}:${row[f]}`);
    console.log(`  Merged Row ${idx + 1}: ${nonEmptyFields.join(', ')}`);
  });
  
  console.log(`${item.incidentId}: ${flattenedRows.length} rows before merge, ${filteredRows.length} rows after merge`);
}

console.log(`\nTotal: ${totalRowsBeforeMerge} rows before merge, ${allRows.length} rows after merge`);
console.log(`Merge efficiency: ${((totalRowsBeforeMerge - allRows.length) / totalRowsBeforeMerge * 100).toFixed(1)}% reduction`);

const rows = [FIELDS, ...allRows.map(row => FIELDS.map(f => row[f] ?? ''))];
const worksheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
XLSX.writeFile(workbook, 'output-generalized.xlsx');
console.log('Exported to output-generalized.xlsx');
