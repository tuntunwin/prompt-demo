// import fs from 'fs';

// const { flattenReport } = await import('./generate_report_rows.js');

// const data = JSON.parse(fs.readFileSync('./input.json', 'utf-8'));

// const configFields = [
//   "incidentId",
//   "type",
//   "location.road",
//   "location.direction",
//   "location.landmark",
//   "time",
//   "status",
//   "advisories.type",
//   "advisories.message",
//   "details.vehiclesInvolved.type",
//   "details.vehiclesInvolved.plateNumber",
//   "details.vehiclesInvolved.severity",
//   "details.casualties",
//   "details.lanesBlocked",
//   "responders.agency",
//   "responders.arrivalTime",
//   "responders.personnel.name",
//   "responders.personnel.role"
// ];
// const reportRows = flattenReport(data, configFields);
// //Save the report rows to a file
// fs.writeFileSync('./output.json', JSON.stringify(reportRows, null, 2));

// //console.log(reportRows);
import fs from 'fs';

const  {generateNestedReportRowsDedupedMerged}  = await import('./nestedReport.js');

const input = JSON.parse(fs.readFileSync('./input.json', 'utf-8'));
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));


const rows = generateNestedReportRowsDedupedMerged(input);
fs.writeFileSync('./output.json', JSON.stringify(rows, null, 2));
//console.log(JSON.stringify(rows, null, 2));