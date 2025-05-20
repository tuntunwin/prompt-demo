**User:**
generate a js code to gerate a report rows from input data json and config json file. config json. Example input json and config jsoin is given.
The report row contains all the flattened fields of parent and all child and subchild fields of all level.
Each report row contain fields of one item of each child objects.
The report rows from child objects must be merged so that final merged rows contains as much as information of child objects WITHOUT overriding values.
INPUT JSON DATA:
[
  {
    "incidentId": "INC001",
    "type": "Accident",
    "location": {
      "road": "PIE",
      "direction": "towards Tuas",
      "landmark": "before Eunos Exit"
    },
    "time": "2025-05-17T07:35:00+08:00",
    "status": "Ongoing",
    "details": {
      "vehiclesInvolved": [
        { "type": "Car", "plateNumber": "SBC1234X", "severity": "Moderate" },
        { "type": "Motorcycle", "plateNumber": "FBA5678Z", "severity": "High" }
      ],
      "casualties": 1,
      "lanesBlocked": ["Lane 1", "Lane 2"]
    },
    "advisories": [
      {
        "type": "Diversion",
        "message": "Use Exit 10A to Eunos Link"
      },
      {
        "type": "Congestion Alert",
        "message": "Expect delays of up to 25 minutes"
      }
    ],
    "responders": [
      {
        "agency": "Traffic Police",
        "arrivalTime": "2025-05-17T07:45:00+08:00",
        "personnel": [
          { "name": "Sgt. Tan Wei", "role": "Team Leader" },
          { "name": "Cpl. Lim Hui", "role": "Traffic Control" }
        ]
      },
      {
        "agency": "SCDF",
        "arrivalTime": "2025-05-17T07:50:00+08:00",
        "personnel": [
          { "name": "Lt. Ravi Kumar", "role": "Rescue Operations" },
          { "name": "Spec. Ong Jia", "role": "Paramedic" }
        ]
      }
    ]
  }
]
CONFIG JSON DATA:
[
  "incidentId",
  "type",
  "location.road",
  "location.direction",
  "location.landmark",
  "time",
  "status",
  "advisories.type",
  "advisories.message",
  "details.vehiclesInvolved.type",
  "details.vehiclesInvolved.plateNumber",
  "details.vehiclesInvolved.severity",
  "details.casualties",
  "details.lanesBlocked",
  "responders.agency",
  "responders.arrivalTime",
  "responders.personnel.name",
  "responders.personnel.role"
];
OUTPUT JSON DATA:
[
  {
    "incidentId": "INC001",
    "type": "Accident",
    "location.road": "PIE",
    "location.direction": "towards Tuas",
    "location.landmark": "before Eunos Exit",
    "time": "2025-05-17T07:35:00+08:00",
    "status": "Ongoing",
    "advisories.type": "Diversion",
    "advisories.messages": [
      "Use Exit 10A to Eunos Link",
      "Avoid Lane 1 and Lane 2 near the exit"
    ],
    "details.vehiclesInvolved.type": "Car",
    "details.vehiclesInvolved.plateNumber": "SBC1234X",
    "details.vehiclesInvolved.severity": "Moderate",
    "details.casualties": 1,
    "details.lanesBlocked": [
      "Lane 1",
      "Lane 2"
    ],
    "responders.agency": "Traffic Police",
    "responders.arrivalTime": "2025-05-17T07:45:00+08:00",
    "responders.personnel.name": "Sgt. Tan Wei",
    "responders.personnel.role": "Team Leader"
  },
  {
    "incidentId": "",
    "type": "",
    "location.road": "",
    "location.direction": "",
    "location.landmark": "",
    "time": "",
    "status": "",
    "advisories.type": "",
    "advisories.messages": "",
    "details.vehiclesInvolved.type": "Motorcycle",
    "details.vehiclesInvolved.plateNumber": "FBA5678Z",
    "details.vehiclesInvolved.severity": "High",
    "details.casualties": "",
    "details.lanesBlocked": "",
    "responders.agency": "",
    "responders.arrivalTime": "",
    "responders.personnel.name": "Cpl. Lim Hui",
    "responders.personnel.role": "Traffic Control"
  },
  {
    "incidentId": "",
    "type": "",
    "location.road": "",
    "location.direction": "",
    "location.landmark": "",
    "time": "",
    "status": "",
    "advisories.type": "",
    "advisories.messages": "",
    "details.vehiclesInvolved.type": "",
    "details.vehiclesInvolved.plateNumber": "",
    "details.vehiclesInvolved.severity": "",
    "details.casualties": "",
    "details.lanesBlocked": "",
    "responders.agency": "SCDF",
    "responders.arrivalTime": "2025-05-17T07:50:00+08:00",
    "responders.personnel.name": "Lt. Ravi Kumar",
    "responders.personnel.role": "Rescue Operations"
  },
  {
    "incidentId": "",
    "type": "",
    "location.road": "",
    "location.direction": "",
    "location.landmark": "",
    "time": "",
    "status": "",
    "advisories.type": "",
    "advisories.messages": "",
    "details.vehiclesInvolved.type": "",
    "details.vehiclesInvolved.plateNumber": "",
    "details.vehiclesInvolved.severity": "",
    "details.casualties": "",
    "details.lanesBlocked": "",
    "responders.agency": "",
    "responders.arrivalTime": "",
    "responders.personnel.name": "Spec. Ong Jia",
    "responders.personnel.role": "Paramedic"
  }
]

**Assistant:**
To generate report rows as described, you need a function that:

- Flattens nested objects/arrays according to the config fields (dot notation).
- For array fields (like vehiclesInvolved, advisories, responders, personnel), generates a row for each combination, merging parent and child data without overwriting.
- Fills missing fields with empty strings or arrays as appropriate.

Here is a JavaScript function that does this. You can save it as `generate_report_rows.js` and use it in your project.

I will create this file for you.

**Assistant:**
The file `generate_report_rows.js` is now updated with a robust function that generates report rows from input data and config fields (dot notation). It flattens all nested objects and arrays, producing a row for each combination of child objects, as described in your requirements.

You can use it like this:

```js
const generateReportRows = require('./generate_report_rows');
const input = require('./input.json'); // your input data
const config = require('./config.json'); // your config fields (array of dot paths)
const rows = generateReportRows(input, config);
console.log(JSON.stringify(rows, null, 2));
```

Let me know if you want a script to run this end-to-end or need further customization!

**User:**
write the whole chat history in md formmark and save to new file
