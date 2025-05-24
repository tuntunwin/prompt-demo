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
      // Special handling for personnel fields - they should inherit responder context
      if (field.startsWith('responders.personnel.')) {
        // Find the parent responder's identifying fields
        const responderFields = ['responders.agency', 'responders.arrivalTime'];
        const responderContext = {};
        
        for (const responderField of responderFields) {
          const fieldParts = responderField.split('.');
          let val = o;
          for (const part of fieldParts) {
            val = val && val[part];
          }
          if (val !== undefined) {
            responderContext[responderField] = val;
          }
        }
        
        return `responders_${JSON.stringify(responderContext)}`;
      }
      
      // For parent-level fields (like responders.agency), create unique owner per parent instance
      if (parts.length === 2 && parts[0] === 'responders') {
        // For responder-level fields, use the actual responder values to create unique key
        const responderFields = ['responders.agency', 'responders.arrivalTime'];
        const responderContext = {};
        
        for (const responderField of responderFields) {
          const fieldParts = responderField.split('.');
          let val = o;
          for (const part of fieldParts) {
            val = val && val[part];
          }
          if (val !== undefined) {
            responderContext[responderField] = val;
          }
        }
        
        return `responders_${JSON.stringify(responderContext)}`;
      }
      
      // General case for other nested fields
      return `${parts.slice(0, -1).join('.')}_general`;
    }
    
    // For top-level fields, use the incident as owner
    return 'root';
  }

  function recurse(o, parent = {}, parentValue = null, depth = 0) {
    if (parentValue === null && o[parentKey]) {
      ownerSeen.clear(); // Reset for each parent group
      parentValue = o[parentKey];
    }

    // Special handling for responders array to ensure proper personnel association
    if (o.responders && Array.isArray(o.responders) && depth === 0) {
      let allRows = [];
      
      // Process each responder independently
      for (const responder of o.responders) {
        const responderObj = { ...o, responders: responder };
        
        // If responder has personnel, process each personnel
        if (responder.personnel && Array.isArray(responder.personnel)) {
          for (const person of responder.personnel) {
            const personnelObj = {
              ...responderObj,
              responders: {
                ...responder,
                personnel: person
              }
            };
            allRows.push(...recurse(personnelObj, parent, parentValue, depth + 1));
          }
        } else {
          // No personnel, just process responder
          allRows.push(...recurse(responderObj, parent, parentValue, depth + 1));
        }
      }
      
      return allRows;
    }

    // Find first non-responder array in fields
    for (const field of fields) {
      if (field.startsWith('responders.') && depth === 0) continue; // Skip responder fields at root level, handled above
      
      const parts = field.split('.');
      let ref = o, arrIdx = -1;
      for (let j = 0; j < parts.length; j++) {
        if (Array.isArray(ref)) { arrIdx = j; break; }
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
        
        // Special case: Personnel fields should always include their parent responder context
        if (field.startsWith('responders.personnel.')) {
          // Always show personnel fields
          row[field] = value;
          seenValues.add(value);
          
          // Also ensure parent responder fields are shown for personnel rows
          const responderFields = ['responders.agency', 'responders.arrivalTime'];
          for (const responderField of responderFields) {
            const fieldParts = responderField.split('.');
            let responderValue = o;
            for (const part of fieldParts) responderValue = responderValue && responderValue[part];
            if (responderValue && !row[responderField]) {
              row[responderField] = responderValue;
            }
          }
        } else {
          // Regular deduplication for all other fields
          row[field] = seenValues.has(value) ? '' : value;
          seenValues.add(value);
        }
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
    
    // Helper function to check if two rows have conflicting parent contexts
    function hasConflictingParentContext(row1, row2, field) {
      const parts = field.split('.');
      if (parts.length <= 1) return false; // Top-level fields don't have parent conflicts
      
      // For responder personnel fields, we need to check responder-level compatibility
      if (field.startsWith('responders.personnel.')) {
        // Check if either row has responder agency/arrival time that conflicts
        const agencies = [row1['responders.agency'], row2['responders.agency']].filter(x => x);
        const arrivalTimes = [row1['responders.arrivalTime'], row2['responders.arrivalTime']].filter(x => x);
        
        // If both have agency values but they're different, conflict
        if (agencies.length === 2 && agencies[0] !== agencies[1]) {
          return true;
        }
        
        // If both have arrival times but they're different, conflict
        if (arrivalTimes.length === 2 && arrivalTimes[0] !== arrivalTimes[1]) {
          return true;
        }
        
        // If one row has responder context and the other doesn't, we need to be careful
        // Don't merge personnel from different responder contexts
        const row1HasResponderContext = row1['responders.agency'] || row1['responders.arrivalTime'];
        const row2HasResponderContext = row2['responders.agency'] || row2['responders.arrivalTime'];
        
        if (row1HasResponderContext && row2HasResponderContext) {
          // Both have some responder context, check if they're compatible
          if (row1['responders.agency'] && row2['responders.agency'] && 
              row1['responders.agency'] !== row2['responders.agency']) {
            return true;
          }
          if (row1['responders.arrivalTime'] && row2['responders.arrivalTime'] && 
              row1['responders.arrivalTime'] !== row2['responders.arrivalTime']) {
            return true;
          }
        } else if (row1HasResponderContext || row2HasResponderContext) {
          // Only one has responder context - don't merge different responder personnel
          return true;
        }
      }
      
      // General parent context check for other fields
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
console.log('Starting script...');
const inputData = JSON.parse(fs.readFileSync('input.json', 'utf8'));
console.log(`Loaded ${inputData.length} incidents`);

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
XLSX.writeFile(workbook, 'output-fixed.xlsx');
console.log('Exported to output-fixed.xlsx');
