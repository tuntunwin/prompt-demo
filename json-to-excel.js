const XLSX = require('xlsx');
const fs = require('fs');

// Configuration for fields to include
const config = {
  fields: [
    "incidentId",
    "type",
    "location.road",
    "location.direction",
    "location.landmark",
    "time",
    "status",
    "details.vehiclesInvolved.type",
    "details.vehiclesInvolved.plateNumber",
    "details.vehiclesInvolved.severity",
    "details.casualties",
    "details.lanesBlocked",
    "advisories.type",
    "advisories.messages",
    "responders.agency",
    "responders.arrivalTime",
    "responders.personnel.name",
    "responders.personnel.role"
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

// Helper to recursively flatten nested arrays for all paths
function flattenData(item, config, parent = {}, prefix = '') {
  let rows = [];
  let hasArray = false;

  // Find the first array field in config.fields for this level
  for (const field of config.fields) {
    const parts = field.split('.');
    if (parts.length > 1 && parts[0] === prefix.replace(/\.$/, '')) {
      const next = parts[1];
      const value = item && item[next];
      if (Array.isArray(value)) {
        hasArray = true;
        for (const v of value) {
          const newParent = { ...parent, ...Object.fromEntries(Object.entries(item).filter(([k]) => k !== next)) };
          const nestedRows = flattenData(v, {
            fields: config.fields
              .filter(f => f.startsWith(prefix + next + '.'))
              .map(f => f.replace(prefix + next + '.', ''))
          }, newParent, '');
          // Add prefix to nested fields
          for (const row of nestedRows) {
            rows.push({ ...row, ...newParent });
          }
        }
        break;
      }
    }
  }

  if (!hasArray) {
    // Leaf node, collect all fields for this row
    const row = { ...parent };
    for (const field of config.fields) {
      const parts = field.split('.');
      let value = item;
      for (const part of parts) {
        value = value && value[part];
      }
      if (Array.isArray(value)) value = value.join(', ');
      row[prefix + parts[0]] = value !== undefined ? value : '';
    }
    rows.push(row);
  }
  return rows;
}

function expandAllRows(data, config) {
  let allRows = [];
  for (const item of data) {
    // For each top-level item, recursively flatten
    const rows = flattenData(item, config);
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
  console.log("mapped rows", rows);
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
