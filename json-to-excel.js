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
  
  function getOwnerKey(o, field) {    // Create a unique key for the owner object based on the field path
    const parts = field.split('.');
    
    // For nested fields, we need to identify the parent object
    if (parts.length > 1) {
      // Special handling for personnel fields - they should inherit responder context AND personnel identity
      if (field.startsWith('responders.personnel.')) {
        // Find the parent responder's identifying fields AND the personnel's identity
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
        
        // Also include personnel name to make each personnel unique
        const personnelName = o.responders && o.responders.personnel && o.responders.personnel.name;
        if (personnelName) {
          responderContext['personnel.name'] = personnelName;
        }
        
        return `responders_personnel_${JSON.stringify(responderContext)}`;
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
  function recurse(o, parent = {}, parentValue = null, depth = 0, processedResponders = false) {
    if (parentValue === null && o[parentKey]) {
      ownerSeen.clear(); // Reset for each parent group
      parentValue = o[parentKey];
    }

    // Special handling for responders array to ensure proper personnel association
    // Only process responders once per incident, not for each array context
    if (o.responders && Array.isArray(o.responders) && depth === 0 && !processedResponders) {
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
            allRows.push(...recurse(personnelObj, parent, parentValue, depth + 1, true));
          }
        } else {
          // No personnel, just process responder
          allRows.push(...recurse(responderObj, parent, parentValue, depth + 1, true));
        }
      }
      
      // Also process other arrays in the same context
      const objWithoutResponders = { ...o };
      delete objWithoutResponders.responders;
      allRows.push(...recurse(objWithoutResponders, parent, parentValue, depth, true));
      
      return allRows;
    }

    // Find first non-responder array in fields
    for (const field of fields) {
      if (field.startsWith('responders.') && (depth === 0 || processedResponders)) continue; // Skip responder fields when already processed
      
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
          
          return recurse(newObj, parent, parentValue, depth + 1, processedResponders);
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
        
        // Special handling for responder fields - show only once per responder
        if (field === 'responders.agency' || field === 'responders.arrivalTime') {
          const shouldShow = !seenValues.has(value);
          row[field] = shouldShow ? value : '';
          if (shouldShow) seenValues.add(value);
        }
        // For personnel fields, always show (they're unique per personnel due to owner key)
        else if (field.startsWith('responders.personnel.')) {
          const shouldShow = !seenValues.has(value);
          row[field] = shouldShow ? value : '';
          if (shouldShow) {
            seenValues.add(value);
            // When showing personnel, ensure responder context is available in this row
            const responderFields = ['responders.agency', 'responders.arrivalTime'];
            for (const responderField of responderFields) {
              const fieldParts = responderField.split('.');
              let responderValue = o;
              for (const part of fieldParts) responderValue = responderValue && responderValue[part];
              if (responderValue && !row[responderField]) {
                row[responderField] = responderValue;
              }
            }
          }
        }
        // For all other fields, apply normal deduplication
        else {
          const shouldShow = !seenValues.has(value);
          row[field] = shouldShow ? value : '';
          if (shouldShow) seenValues.add(value);
        }
      } else {
        row[field] = value ?? '';
      }
    }
    return [row];
  }
  
  return recurse(obj);
}

// Consolidates personnel from the same responder into single rows
function consolidateResponderPersonnel(rows, fields) {
  const responderGroups = new Map();
  const consolidatedRows = [];
  const usedRows = new Set();
  
  // Group rows by responder signature
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const responderSig = `${row['responders.agency'] || ''}_${row['responders.arrivalTime'] || ''}`;
    
    if (responderSig && responderSig !== '_' && row['responders.personnel.name']) {
      if (!responderGroups.has(responderSig)) {
        responderGroups.set(responderSig, []);
      }
      responderGroups.get(responderSig).push({ index: i, row });
    }
  }
  
  // Process each responder group
  for (const [responderSig, rowGroup] of responderGroups.entries()) {
    if (rowGroup.length <= 1) continue; // Only consolidate if multiple personnel
    
    // Create consolidated row with all personnel from this responder
    const baseRow = { ...rowGroup[0].row };
    const personnelNames = [];
    const personnelRoles = [];
    
    for (const { row } of rowGroup) {
      if (row['responders.personnel.name']) {
        personnelNames.push(row['responders.personnel.name']);
      }
      if (row['responders.personnel.role']) {
        personnelRoles.push(row['responders.personnel.role']);
      }
      usedRows.add(rowGroup.find(g => g.row === row)?.index);
    }
      // Combine personnel data
    if (personnelNames.length > 0) {
      baseRow['responders.personnel.name'] = personnelNames.join(', ');
    }
    if (personnelRoles.length > 0) {
      // Remove duplicate roles
      const uniqueRoles = [...new Set(personnelRoles)];
      baseRow['responders.personnel.role'] = uniqueRoles.join(', ');
    }
    
    consolidatedRows.push(baseRow);
    
    // Mark all rows in this group as used
    for (const { index } of rowGroup) {
      usedRows.add(index);
    }
  }
  
  // Add all non-consolidated rows
  for (let i = 0; i < rows.length; i++) {
    if (!usedRows.has(i)) {
      consolidatedRows.push(rows[i]);
    }
  }
  
  return consolidatedRows;
}
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
    }    // Sort rows to prioritize merging personnel from same responder
    groupRows.sort((a, b) => {
      // First priority: rows with more non-empty fields
      const aCount = fields.filter(f => a[f]).length;
      const bCount = fields.filter(f => b[f]).length;
      if (aCount !== bCount) return bCount - aCount;
      
      // Second priority: group personnel from same responder together
      const aResponder = `${a['responders.agency'] || ''}_${a['responders.arrivalTime'] || ''}`;
      const bResponder = `${b['responders.agency'] || ''}_${b['responders.arrivalTime'] || ''}`;
      return aResponder.localeCompare(bResponder);
    });// Helper function to check if a row is primarily personnel-focused
    function isPersonnelRow(row) {
      const personnelFields = fields.filter(f => f.startsWith('responders.personnel.'));
      const nonPersonnelFields = fields.filter(f => !f.startsWith('responders.personnel.') && !f.startsWith('responders.agency') && !f.startsWith('responders.arrivalTime'));
      
      const personnelCount = personnelFields.filter(f => row[f]).length;
      const nonPersonnelCount = nonPersonnelFields.filter(f => row[f]).length;
      
      // A row is personnel-focused if it has personnel data but little other data
      return personnelCount > 0 && nonPersonnelCount <= 3; // Allow some basic incident fields
    }
      // Helper function to check if two rows can be merged based on responder context
    function canMergeResponderRows(row1, row2) {
      // Check if they have compatible responder context
      const responderFields = ['responders.agency', 'responders.arrivalTime'];
      
      // If both rows have responder context, it must match
      for (const field of responderFields) {
        const val1 = row1[field];
        const val2 = row2[field];
        
        if (val1 && val2 && val1 !== val2) {
          return false; // Conflicting responder context
        }
      }
      
      // If both rows have personnel, they must be different people
      if (row1['responders.personnel.name'] && row2['responders.personnel.name']) {
        if (row1['responders.personnel.name'] === row2['responders.personnel.name']) {
          return false; // Same person, don't merge (would create duplicate)
        }
      }
      
      // Special case: if one row has personnel and the other doesn't, but they share responder context,
      // we can merge them into a single row showing the responder info once
      return true;
    }
    
    // Helper function to get responder context signature
    function getResponderSignature(row) {
      return `${row['responders.agency'] || ''}_${row['responders.arrivalTime'] || ''}`;
    }
    
    // Helper function to check if two personnel rows are duplicates
    function arePersonnelDuplicates(row1, row2) {
      if (!isPersonnelRow(row1) || !isPersonnelRow(row2)) return false;
      
      // Check if they have the same personnel and responder context
      const personnelFields = ['responders.personnel.name', 'responders.personnel.role'];
      const responderFields = ['responders.agency', 'responders.arrivalTime'];
      
      for (const field of [...personnelFields, ...responderFields]) {
        if (row1[field] !== row2[field]) return false;
      }
      
      return true;
    }    for (let i = 0; i < groupRows.length; i++) {
      if (used[i]) continue;
      
      let row = { ...groupRows[i] };
      used[i] = true;
      
      // Check if this is a personnel row that might be a duplicate
      if (isPersonnelRow(row)) {
        // Look for exact duplicates and mark them as used
        for (let k = i + 1; k < groupRows.length; k++) {
          if (used[k]) continue;
          if (arePersonnelDuplicates(row, groupRows[k])) {
            used[k] = true; // Mark duplicate as used
          }
        }
      }
      
      // Get the responder signature for this row
      const currentResponderSig = getResponderSignature(row);
      
      // Try to merge with other rows, prioritizing same responder context
      const candidates = [];
      for (let j = i + 1; j < groupRows.length; j++) {
        if (used[j]) continue;
        
        const candidateRow = groupRows[j];
        const candidateResponderSig = getResponderSignature(candidateRow);
        
        // Priority 1: Same responder context (higher priority)
        const sameResponder = currentResponderSig && candidateResponderSig && 
                              currentResponderSig === candidateResponderSig;
        
        candidates.push({
          index: j,
          row: candidateRow,
          priority: sameResponder ? 1 : 2
        });
      }
      
      // Sort candidates by priority (same responder first)
      candidates.sort((a, b) => a.priority - b.priority);
      
      // Try to merge with candidates in priority order
      for (const candidate of candidates) {
        if (used[candidate.index]) continue;
        
        const candidateRow = candidate.row;
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
            // Special check for responder-related merging
            if (field.startsWith('responders.') && !canMergeResponderRows(row, candidateRow)) {
              canMerge = false;
              break;
            }
            
            // Check for parent context conflicts
            if (hasConflictingParentContext(row, candidateRow, field)) {
              canMerge = false;
              break;
            }
              // Special handling: if both rows have personnel from same responder,
            // create a consolidated personnel field
            if (field.startsWith('responders.personnel.') && 
                getResponderSignature(row) === getResponderSignature(candidateRow) &&
                getResponderSignature(row) && 
                row['responders.personnel.name'] && candidateRow['responders.personnel.name'] &&
                row['responders.personnel.name'] !== candidateRow['responders.personnel.name']) {
              
              // Merge personnel from same responder into a combined field
              if (field === 'responders.personnel.name') {
                potentialAdditions.push({ 
                  field, 
                  value: `${row[field]}, ${candidateValue}` 
                });
              } else if (field === 'responders.personnel.role') {
                potentialAdditions.push({ 
                  field, 
                  value: `${row[field]}, ${candidateValue}` 
                });
              }
              continue;
            }
            
            potentialAdditions.push({ field, value: candidateValue });
          }
        }
        
        // Only merge if no conflicts and we have something to add
        if (canMerge && potentialAdditions.length > 0) {
          for (const addition of potentialAdditions) {
            row[addition.field] = addition.value;
          }
          used[candidate.index] = true;
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
  // First consolidate personnel from same responder
  const consolidatedRows = consolidateResponderPersonnel(flattenedRows, FIELDS);
  
  const mergedRows = mergeRowsByParent(consolidatedRows, FIELDS, 'incidentId');
  
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
XLSX.writeFile(workbook, 'output.xlsx');
console.log('Exported to output.xlsx');
