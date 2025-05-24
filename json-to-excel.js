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
  
  function getOwnerKey(o, field) {
    // Create a unique key for the owner object based on the field path
    const parts = field.split('.');
    
    // For nested fields, we need to identify the parent object
    if (parts.length > 1) {
      let current = o;
      let ownerPath = [];
      
      // Navigate through the object structure to find the immediate parent
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          ownerPath.push(parts[i]);
          current = current[parts[i]];
        }
      }
      
      // Create a unique identifier for this parent object instance
      if (current && typeof current === 'object') {
        // For parent object fields, use only parent-level identifying properties
        // This ensures that parent fields like responders.agency are tracked separately
        // from child fields like responders.personnel.name
        
        const parentLevelProps = {};
        
        // Identify which fields are at the same level as the current field
        const currentLevel = parts.length;
        const parentLevelFields = fields.filter(f => {
          const fParts = f.split('.');
          return fParts.length === currentLevel && 
                 fParts.slice(0, -1).join('.') === parts.slice(0, -1).join('.');
        });
        
        // Use parent-level field values to create unique identifier
        for (const parentField of parentLevelFields) {
          const fieldParts = parentField.split('.');
          let val = o;
          for (const part of fieldParts) {
            val = val && val[part];
          }
          if (val !== undefined) {
            parentLevelProps[parentField] = val;
          }
        }
        
        return `${ownerPath.join('.')}_${JSON.stringify(parentLevelProps)}`;
      }
      
      // Fallback: use path-based key
      return ownerPath.join('.');
    }
    
    // For top-level fields, use the incident as owner
    return 'root';
  }
  
  function recurse(o, parent = {}, parentValue = null) {
    if (parentValue === null && o[parentKey]) {
      ownerSeen.clear(); // Reset for each parent group
      parentValue = o[parentKey];
    }
    
    // Find first array in fields
    for (const field of fields) {
      const parts = field.split('.');
      let ref = o, arrIdx = -1;
      for (let j = 0; j < parts.length; j++) {
        if (Array.isArray(ref)) { arrIdx = j; break; }
        ref = ref ? ref[parts[j]] : undefined;
      }
      if (Array.isArray(ref)) {
        return ref.flatMap(item => {
          let newObj = o, target = newObj;
          for (let k = 0; k < arrIdx - 1; k++) target = target[parts[k]];
          if (arrIdx > 0) target[parts[arrIdx - 1]] = item; else newObj = item;
          return recurse(newObj, parent, parentValue);
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
        row[field] = seenValues.has(value) ? '' : value;
        seenValues.add(value);
      } else {
        row[field] = value ?? '';
      }
    }
    return [row];
  }
  return recurse(obj);
}

// Merges as many non-overlapping child rows as possible within each parent
function mergeRowsByParent(rows, fields, parentKey) {
  const grouped = rows.reduce((acc, row) => {
    const key = row[parentKey] || '__NO_PARENT__';
    (acc[key] = acc[key] || []).push(row);
    return acc;
  }, {});
  
  return Object.values(grouped).flatMap(groupRows => {
    const used = Array(groupRows.length).fill(false);
    const merged = [];
    
    // Helper function to get parent object context for a field
    function getParentContext(row, field) {
      const parts = field.split('.');
      const context = {};
      
      // For nested fields, extract parent object identifiers
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('.');
        
        // Get all fields that belong to the same parent object
        const siblingFields = fields.filter(f => f.startsWith(parentPath + '.'));
        
        // Create a signature for this parent object based on its field values
        for (const siblingField of siblingFields) {
          const value = row[siblingField];
          if (value) {
            context[siblingField] = value;
          }
        }
      }
      
      return JSON.stringify(context);
    }
    
    // Helper function to check if two rows have conflicting parent contexts
    function hasConflictingParentContext(row1, row2, field) {
      const parts = field.split('.');
      if (parts.length <= 1) return false; // Top-level fields don't have parent conflicts
      
      const parentPath = parts.slice(0, -1).join('.');
      const siblingFields = fields.filter(f => f.startsWith(parentPath + '.'));
      
      // Check if both rows have values for sibling fields with different values
      for (const siblingField of siblingFields) {
        const value1 = row1[siblingField];
        const value2 = row2[siblingField];
        
        // If both have values but they're different, there's a conflict
        if (value1 && value2 && value1 !== value2) {
          return true;
        }
      }
      
      return false;
    }
    
    // Sort rows by the number of non-empty fields (prioritize fuller rows)
    groupRows.sort((a, b) => {
      const aCount = fields.filter(f => a[f]).length;
      const bCount = fields.filter(f => b[f]).length;
      return bCount - aCount;
    });
    
    for (let i = 0; i < groupRows.length; i++) {
      if (used[i]) continue;
      
      let row = { ...groupRows[i] };
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
  allRows.push(...mergedRows);
  
  console.log(`Merged rows for ${item.incidentId}:`);
  mergedRows.forEach((row, idx) => {
    const nonEmptyFields = FIELDS.filter(f => row[f]).map(f => `${f}:${row[f]}`);
    console.log(`  Merged Row ${idx + 1}: ${nonEmptyFields.join(', ')}`);
  });
  
  console.log(`${item.incidentId}: ${flattenedRows.length} rows before merge, ${mergedRows.length} rows after merge`);
}

console.log(`\nTotal: ${totalRowsBeforeMerge} rows before merge, ${allRows.length} rows after merge`);
console.log(`Merge efficiency: ${((totalRowsBeforeMerge - allRows.length) / totalRowsBeforeMerge * 100).toFixed(1)}% reduction`);

const rows = [FIELDS, ...allRows.map(row => FIELDS.map(f => row[f] ?? ''))];
const worksheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
XLSX.writeFile(workbook, 'output.xlsx');
console.log('Exported to output.xlsx');
