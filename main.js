const fs = require('fs');
const path = require('path');
const generateReportRows = require('./generate_report_rows');

// Configuration JSON
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

// Read input data
const inputPath = path.join(__dirname, 'input.json');
const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Generate report rows
const reportRows = generateReportRows(inputData, config);

// Output result as JSON (for demonstration)
const outputPath = path.join(__dirname, 'report.json');
fs.writeFileSync(outputPath, JSON.stringify(reportRows, null, 2), 'utf8');

console.log(`Report generated: ${outputPath}`);
