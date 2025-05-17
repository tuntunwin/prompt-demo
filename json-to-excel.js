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

// Main function to convert JSON to Excel
function jsonToExcel(data, config, outputFile) {
  const rows = [];
  // Header row
  rows.push(config.fields);

  // Data rows
  data.forEach(item => {
    const row = config.fields.map(field => getField(item, field));
    rows.push(row);
  });

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
