import * as XLSX from 'xlsx';
import fs from 'fs';

// Configuration for fields to include
const config = {
  fields: [
    "location.road",
    "location.direction",
    "location.landmark",
    "incidentId",
    "type",
    "time",
    "status",
    "details.vehiclesInvolved.type",
    "details.vehiclesInvolved.plateNumber.serial",
    "details.vehiclesInvolved.plateNumber.region",
    "details.vehiclesInvolved.severity",
    "details.casualties",
    "details.lanesBlocked",
    "advisories.type",
    "advisories.message",
    "responders.agency",
    "responders.arrivalTime",
    "responders.personnel.name",
    "responders.personnel.role",
  ]
};

// Inline deduplication during flattening, per parent group
function flattenObjectDedup(obj, fields, parentKey, seen = {}, prefix = '', parent = {}, parentValue = null) {
  // If starting a new parent group, reset seen
  if (parentValue === null && obj[parentKey]) {
    seen = {};
    parentValue = obj[parentKey];
  }
  // Find the first array in the fields
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const parts = field.split('.');
    let ref = obj;
    let arrIdx = -1;
    // Walk down the object to find the first array in the path
    for (let j = 0; j < parts.length; j++) {
      if (Array.isArray(ref)) {
        arrIdx = j;
        break;
      }
      ref = ref ? ref[parts[j]] : undefined;
    }
    if (Array.isArray(ref)) {
      // Expand this array
      let rows = [];
      for (const item of ref) {
        // Rebuild the object with this array element in place
        let newObj = obj;
        let target = newObj;
        for (let k = 0; k < arrIdx - 1; k++) {
          target = target[parts[k]];
        }
        if (arrIdx > 0) {
          target[parts[arrIdx - 1]] = item;
        } else {
          newObj = item;
        }
        // Recursively flatten with the same fields
        rows = rows.concat(flattenObjectDedup(newObj, fields, parentKey, seen, prefix, parent, parentValue));
      }
      return rows;
    }
  }
  // No arrays left, output a row with inline deduplication
  const row = { ...parent };
  for (const field of fields) {
    const parts = field.split('.');
    let value = obj;
    for (const part of parts) {
      value = value && value[part];
    }
    if (Array.isArray(value)) value = value.join(', ');
    // Inline deduplication per parent group
    if (!seen[field]) seen[field] = new Set();
    if (value && seen[field].has(value)) {
      row[field] = '';
    } else {
      row[field] = value !== undefined ? value : '';
      if (value) seen[field].add(value);
    }
  }
  return [row];
}

// Merge as many unrelated child fields as possible into the same row, but only within the same parent record
function mergeRowsForParent(flatRows, header, parentKey) {
  // Group rows by parentKey
  const grouped = {};
  for (const row of flatRows) {
    const key = row[parentKey] || '__NO_PARENT__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }
  const mergedRows = [];
  for (const groupRows of Object.values(grouped)) {
    // Greedy merge: try to merge as many rows as possible if their non-empty fields do not overlap
    const used = new Array(groupRows.length).fill(false);
    for (let i = 0; i < groupRows.length; i++) {
      if (used[i]) continue;
      let merged = { ...groupRows[i] };
      used[i] = true;
      for (let j = i + 1; j < groupRows.length; j++) {
        if (used[j]) continue;
        let canMerge = true;
        for (const field of header) {
          if ((merged[field] && merged[field] !== '') && (groupRows[j][field] && groupRows[j][field] !== '')) {
            canMerge = false;
            break;
          }
        }
        if (canMerge) {
          for (const field of header) {
            if (!merged[field] || merged[field] === '') {
              merged[field] = groupRows[j][field];
            }
          }
          used[j] = true;
        }
      }
      mergedRows.push(merged);
    }
  }
  return mergedRows;
}

// Main function to convert JSON to Excel
function jsonToExcel(data, config, outputFile) {
  // Expand all rows
  const expandedRows = expandAllRows(data, config);
  // Prepare header
  const header = config.fields;
  // Prepare data rows
  const rows = [header];
  console.log("expandedRows", expandedRows);
  for (const rowObj of expandedRows) {
    const row = header.map(field => rowObj[field] !== undefined ? rowObj[field] : '');
    rows.push(row);
  }
  //console.log("mapped rows", rows);
  // Create worksheet and workbook
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  // Write to file
  XLSX.writeFile(workbook, outputFile);
}

// Example usage
const inputData = JSON.parse(fs.readFileSync('input.json', 'utf8'));
const header = config.fields;
let allRows = [];
for (const item of inputData) {
  // Flatten and deduplicate for this parent only
  let parentRows = flattenObjectDedup(item, header, 'incidentId');
  // Merge only within this parent
  parentRows = mergeRowsForParent(parentRows, header, 'incidentId');
  allRows = allRows.concat(parentRows);
}
const rows = [header];
for (const rowObj of allRows) {
  const row = header.map(field => rowObj[field] !== undefined ? rowObj[field] : '');
  rows.push(row);
}
const worksheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
XLSX.writeFile(workbook, 'output.xlsx');
console.log('Exported to output.xlsx');
