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
    let owner = o;
    let ownerPath = [];
    
    // Navigate to find the owner object (the object that contains this field)
    for (let i = 0; i < parts.length - 1; i++) {
      if (owner && typeof owner === 'object' && !Array.isArray(owner)) {
        ownerPath.push(parts[i]);
        owner = owner[parts[i]];
      }
    }
    
    // If we have an owner object, create a unique key for it
    if (owner && typeof owner === 'object') {
      // Use the object's unique properties to create a key
      const keyProps = JSON.stringify(owner);
      return `${ownerPath.join('.')}_${keyProps}`;
    }
    
    // Fallback to field path if no clear owner
    return field;
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
    const used = Array(groupRows.length).fill(false), merged = [];
    for (let i = 0; i < groupRows.length; i++) {
      if (used[i]) continue;
      let row = { ...groupRows[i] }; used[i] = true;
      for (let j = i + 1; j < groupRows.length; j++) {
        if (used[j]) continue;
        if (fields.every(f => !row[f] || !groupRows[j][f])) {
          for (const f of fields) if (!row[f]) row[f] = groupRows[j][f];
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
let allRows = inputData.flatMap(item => mergeRowsByParent(flattenAndDedup(item, FIELDS, 'incidentId'), FIELDS, 'incidentId'));
const rows = [FIELDS, ...allRows.map(row => FIELDS.map(f => row[f] ?? ''))];
const worksheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
XLSX.writeFile(workbook, 'output.xlsx');
console.log('Exported to output.xlsx');
