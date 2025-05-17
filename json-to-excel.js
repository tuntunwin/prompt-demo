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
    "responders.arrivalTime",
    "responders.personnel.name",
    "responders.personnel.role",
    "details.vehiclesInvolved.type",
    "details.vehiclesInvolved.plateNumber",
    "details.vehiclesInvolved.severity",
    "details.casualties",
    "details.lanesBlocked",
    "advisories.type",
    "advisories.messages",
    "responders.agency"
    
  ]
};

// Helper to get value by dot notation, supports arrays
function getField(obj, path) {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (Array.isArray(value)) {
      // Flatten arrays by mapping each element
      value = value.map(v => v && v[part]);
      value = value.flat();
    } else {
      value = value && value[part];
    }
  }
  // Join arrays as comma-separated string for Excel
  if (Array.isArray(value)) return value.join(', ');
  return value !== undefined ? value : '';
}

// Recursively get all paths for dot notation fields
function getAllFieldPaths(obj, prefix = '') {
  let paths = [];
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      paths = paths.concat(getAllFieldPaths(item, prefix));
    });
  } else if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const newPrefix = prefix ? prefix + '.' + key : key;
      if (Array.isArray(obj[key])) {
        // For arrays, recurse into each element
        obj[key].forEach((item) => {
          paths = paths.concat(getAllFieldPaths(item, newPrefix));
        });
      } else if (obj[key] && typeof obj[key] === 'object') {
        paths = paths.concat(getAllFieldPaths(obj[key], newPrefix));
      } else {
        paths.push(newPrefix);
      }
    }
  }
  return paths;
}

// Cartesian product utility for nested arrays
function cartesianProduct(arrays) {
  return arrays.reduce((a, b) => a.flatMap(d => b.map(e => d.concat([e]))), [[]]);
}

// Recursively flatten the object to rows for all nested arrays, expanding all arrays at the current level
function flattenToRows(obj, config, parent = {}, prefix = '') {
  // Find all array fields at the current level (not nested)
  let arrayFields = [];
  for (const field of config.fields) {
    const parts = field.split('.');
    if (parts.length > 1 && parts[0] === prefix.replace(/\.$/, '')) {
      const next = parts[1];
      const value = obj && obj[next];
      if (Array.isArray(value)) {
        arrayFields.push({ key: next, value });
      }
    }
  }

  if (arrayFields.length > 0) {
    // Expand all arrays at this level using cartesian product
    const arrays = arrayFields.map(f => f.value.map(item => ({ key: f.key, item })));
    const combinations = cartesianProduct(arrays.length ? arrays : [[]]);
    let rows = [];
    for (const combo of combinations) {
      let newObj = { ...obj };
      // Replace each array with the selected item
      for (const { key, item } of combo) {
        newObj = { ...newObj, [key]: item };
      }
      // Prepare configs for nested and parent fields
      let nestedFields = [];
      arrayFields.forEach(f => {
        nestedFields = nestedFields.concat(
          config.fields
            .filter(field => field.startsWith((prefix ? prefix + '.' : '') + f.key + '.'))
            .map(field => field.replace((prefix ? prefix + '.' : '') + f.key + '.', ''))
        );
      });
      const nestedConfig = { fields: nestedFields };
      const parentFields = config.fields.filter(field =>
        !arrayFields.some(f => field.startsWith((prefix ? prefix + '.' : '') + f.key + '.'))
      );
      const parentConfig = { fields: parentFields };
      // Recursively flatten
      const nestedRows = flattenToRows(newObj, nestedConfig, { ...parent, ...flattenToRow(newObj, parentConfig, prefix) }, '');
      rows = rows.concat(nestedRows);
    }
    return rows;
  } else {
    // No arrays at this level, just map fields
    return [flattenToRow(obj, config, prefix, parent)];
  }
}

// Helper to flatten a single object to a row
function flattenToRow(obj, config, prefix = '', parent = {}) {
  const row = { ...parent };
  for (const field of config.fields) {
    const parts = field.split('.');
    let value = obj;
    for (const part of parts) {
      value = value && value[part];
    }
    if (Array.isArray(value)) value = value.join(', ');
    row[(prefix ? prefix + '.' : '') + field] = value !== undefined ? value : '';
  }
  return row;
}

// Recursively flatten an object so that each row represents a unique path through all nested arrays
function flattenObject(obj, fields, prefix = '', parent = {}) {
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
        rows = rows.concat(flattenObject(newObj, fields, prefix, parent));
      }
      return rows;
    }
  }
  // No arrays left, output a row
  const row = { ...parent };
  for (const field of fields) {
    const parts = field.split('.');
    let value = obj;
    for (const part of parts) {
      value = value && value[part];
    }
    if (Array.isArray(value)) value = value.join(', ');
    row[field] = value !== undefined ? value : '';
  }
  return [row];
}

// Expand all rows by recursively flattening each item in the data array
function expandAllRows(data, config) {
  let allRows = [];
  for (const item of data) {
    const rows = flattenObject(item, config.fields);
    allRows = allRows.concat(rows);
  }
  return allRows;
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
jsonToExcel(inputData, config, 'output.xlsx');

// Read the output.json file
const { header, rows } = JSON.parse(fs.readFileSync('./output.json', 'utf-8'));

// Convert rows to worksheet
const worksheet = XLSX.utils.json_to_sheet(rows, { header });

// Create a new workbook and append the worksheet
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

// Write the workbook to output.xlsx
XLSX.writeFile(workbook, './output.xlsx');

console.log('Exported to output.xlsx');
