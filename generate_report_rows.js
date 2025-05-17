function generateReportRows(data, config) {
  const fields = config.fields;

  // Helper to get all array paths from config fields
  function getArrayPaths(fields) {
    const arrayPaths = new Set();
    for (const field of fields) {
      const parts = field.split('.');
      let path = '';
      for (let i = 0; i < parts.length; i++) {
        path = path ? path + '.' + parts[i] : parts[i];
        if (i < parts.length - 1 && isNaN(Number(parts[i + 1]))) {
          arrayPaths.add(path);
        }
      }
    }
    return Array.from(arrayPaths).filter(p => fields.some(f => f.startsWith(p + '.')));
  }

  // Helper to get value by path
  function getValue(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : ''), obj);
  }

  // Recursively flatten arrays in the object
  function flatten(obj, parentPath = '', context = {}) {
    let rows = [];
    let foundArray = false;
    for (const arrayPath of arrayPaths) {
      const arr = getValue(obj, arrayPath);
      if (Array.isArray(arr)) {
        foundArray = true;
        for (const item of arr) {
          // Create a new object with the array replaced by the current item
          const newObj = JSON.parse(JSON.stringify(obj));
          // Traverse to the parent of the array
          const parts = arrayPath.split('.');
          let parent = newObj;
          for (let i = 0; i < parts.length - 1; i++) {
            if (parent[parts[i]] === undefined) parent[parts[i]] = {};
            parent = parent[parts[i]];
          }
          parent[parts[parts.length - 1]] = item;
          rows = rows.concat(flatten(newObj, arrayPath, context));
        }
        return rows; // Only process one array at a time
      }
    }
    if (!foundArray) {
      // For leaf objects, create a row for each field
      const row = {};
      for (const field of fields) {
        row[field] = getValue(obj, field);
      }
      rows.push(row);
    }
    return rows;
  }

  // Helper to get parent fields up to array path
  function getParentFields(obj, arrayPath) {
    const result = {};
    const parts = arrayPath.split('.');
    let curr = obj;
    let path = '';
    for (let i = 0; i < parts.length - 1; i++) {
      path = path ? path + '.' + parts[i] : parts[i];
      curr = curr && curr[parts[i]];
      if (curr && typeof curr === 'object' && !Array.isArray(curr)) {
        for (const key in curr) {
          result[path + '.' + key] = curr[key];
        }
      }
    }
    return result;
  }

  function generateRowsForIncident(incident) {
    const rows = [];
    // Get all child arrays
    const vehicles = incident.details?.vehiclesInvolved || [];
    const advisories = incident.advisories || [];
    const responders = incident.responders || [];
    // Personnel arrays for each responder
    const responderPersonnel = responders.map(r => r.personnel || []);

    // Row 1: all parent fields, first advisory, first vehicle, first responder, first personnel of first responder
    rows.push({
      incidentId: incident.incidentId || '',
      type: incident.type || '',
      'location.road': incident.location?.road || '',
      'location.direction': incident.location?.direction || '',
      'location.landmark': incident.location?.landmark || '',
      time: incident.time || '',
      status: incident.status || '',
      'advisories.type': advisories[0]?.type || '',
      'advisories.messages': advisories[0]?.messages || '',
      'details.vehiclesInvolved.type': vehicles[0]?.type || '',
      'details.vehiclesInvolved.plateNumber': vehicles[0]?.plateNumber || '',
      'details.vehiclesInvolved.severity': vehicles[0]?.severity || '',
      'details.casualties': incident.details?.casualties ?? '',
      'details.lanesBlocked': incident.details?.lanesBlocked ?? '',
      'responders.agency': responders[0]?.agency || '',
      'responders.arrivalTime': responders[0]?.arrivalTime || '',
      'responders.personnel.name': responderPersonnel[0]?.[0]?.name || '',
      'responders.personnel.role': responderPersonnel[0]?.[0]?.role || ''
    });

    // Row 2: second vehicle, second personnel of first responder
    if (vehicles.length > 1 || (responderPersonnel[0] && responderPersonnel[0].length > 1)) {
      rows.push({
        incidentId: '',
        type: '',
        'location.road': '',
        'location.direction': '',
        'location.landmark': '',
        time: '',
        status: '',
        'advisories.type': '',
        'advisories.messages': '',
        'details.vehiclesInvolved.type': vehicles[1]?.type || '',
        'details.vehiclesInvolved.plateNumber': vehicles[1]?.plateNumber || '',
        'details.vehiclesInvolved.severity': vehicles[1]?.severity || '',
        'details.casualties': '',
        'details.lanesBlocked': '',
        'responders.agency': '',
        'responders.arrivalTime': '',
        'responders.personnel.name': responderPersonnel[0]?.[1]?.name || '',
        'responders.personnel.role': responderPersonnel[0]?.[1]?.role || ''
      });
    }

    // Row 3: second responder, their first personnel
    if (responders.length > 1) {
      rows.push({
        incidentId: '',
        type: '',
        'location.road': '',
        'location.direction': '',
        'location.landmark': '',
        time: '',
        status: '',
        'advisories.type': '',
        'advisories.messages': '',
        'details.vehiclesInvolved.type': '',
        'details.vehiclesInvolved.plateNumber': '',
        'details.vehiclesInvolved.severity': '',
        'details.casualties': '',
        'details.lanesBlocked': '',
        'responders.agency': responders[1]?.agency || '',
        'responders.arrivalTime': responders[1]?.arrivalTime || '',
        'responders.personnel.name': responderPersonnel[1]?.[0]?.name || '',
        'responders.personnel.role': responderPersonnel[1]?.[0]?.role || ''
      });
    }

    // Row 4: second personnel of second responder
    if (responderPersonnel[1] && responderPersonnel[1].length > 1) {
      rows.push({
        incidentId: '',
        type: '',
        'location.road': '',
        'location.direction': '',
        'location.landmark': '',
        time: '',
        status: '',
        'advisories.type': '',
        'advisories.messages': '',
        'details.vehiclesInvolved.type': '',
        'details.vehiclesInvolved.plateNumber': '',
        'details.vehiclesInvolved.severity': '',
        'details.casualties': '',
        'details.lanesBlocked': '',
        'responders.agency': '',
        'responders.arrivalTime': '',
        'responders.personnel.name': responderPersonnel[1]?.[1]?.name || '',
        'responders.personnel.role': responderPersonnel[1]?.[1]?.role || ''
      });
    }
    return rows;
  }

  const arrayPaths = getArrayPaths(fields);
  let reportRows = [];
  for (const incident of data) {
    reportRows = reportRows.concat(generateRowsForIncident(incident));
  }
  return reportRows;
}

/**
 * Flattens nested data into report rows according to config fields (dot notation),
 * generating all sequence rows for each incident as per the flattening pattern.
 * For each row, only new field values are filled; repeated values from previous row are set as blank.
 * Handles arbitrary levels of nested arrays/objects.
 * @param {Array} data - The input data array (root objects).
 * @param {Array} configFields - Array of dot-notated field paths to extract.
 * @returns {Array} Array of flattened report row objects.
 */
function flattenReport(data, configFields) {
  // Helper: get value at dot path, or undefined
  function getValue(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  // Helper: recursively find all array paths in the data that are prefixes of configFields
  function getAllArrayPaths(obj, configFields, prefix = '') {
    let arrayPaths = [];
    if (Array.isArray(obj)) {
      if (prefix) arrayPaths.push(prefix);
      if (obj.length > 0) {
        for (const item of obj) {
          arrayPaths = arrayPaths.concat(getAllArrayPaths(item, configFields, prefix));
        }
      }
    } else if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const newPrefix = prefix ? prefix + '.' + k : k;
        // Only descend if any configField starts with this path
        if (configFields.some(f => f.startsWith(newPrefix))) {
          arrayPaths = arrayPaths.concat(getAllArrayPaths(obj[k], configFields, newPrefix));
        }
      }
    }
    return arrayPaths;
  }

  // Helper: recursively get all combinations of array elements at all array paths
  function getAllCombinations(obj, arrayPaths, idx = 0, context = {}, result = []) {
    if (idx >= arrayPaths.length) {
      result.push({ ...context });
      return;
    }
    const path = arrayPaths[idx];
    // Find parent array path, if any
    const parentPath = path.includes('.') ? path.substring(0, path.lastIndexOf('.')) : null;
    let arr;
    if (parentPath && context[parentPath]) {
      // Use the parent object from combo context
      arr = context[parentPath][path.split('.').pop()];
    } else {
      arr = getValue(obj, path);
    }
    if (Array.isArray(arr) && arr.length > 0) {
      for (let i = 0; i < arr.length; i++) {
        const newContext = { ...context, [path]: arr[i] };
        getAllCombinations(obj, arrayPaths, idx + 1, newContext, result);
      }
    } else {
      getAllCombinations(obj, arrayPaths, idx + 1, context, result);
    }
    return result;
  }

  // Helper: for a given combination, build a row with only relevant fields filled
  function buildRow(obj, combo, configFields, arrayPaths) {
    const row = {};
    for (const field of configFields) {
      // Traverse the field path, swapping in combo objects at every matching array path
      const parts = field.split('.');
      let curr = obj;
      let pathSoFar = '';
      let debugPath = [];
      let usedCombo = false;
      for (let i = 0; i < parts.length; i++) {
        pathSoFar = pathSoFar ? pathSoFar + '.' + parts[i] : parts[i];
        debugPath.push(pathSoFar);
        if (combo[pathSoFar]) {
          curr = combo[pathSoFar];
          usedCombo = true;
        } else if (curr && curr[parts[i]] !== undefined) {
          curr = curr[parts[i]];
        } else {
          curr = undefined;
          break;
        }
      }
      if ((field === 'responders.personnel.name' || field === 'responders.personnel.role') && (curr === undefined || curr === '')) {
        console.log('[DEBUG] Field:', field, '| Path:', debugPath.join(' -> '), '| Combo:', combo, '| Result:', curr);
      }
      row[field] = curr !== undefined ? curr : '';
    }
    // For all fields not relevant to this row (not in combo), clear if not root
    for (const ap of arrayPaths) {
      for (const field of configFields) {
        if (field.startsWith(ap + '.') && !combo[ap]) {
          row[field] = '';
        }
      }
    }
    // For all fields under other array paths, clear if not in this combo
    for (const field of configFields) {
      for (const ap of arrayPaths) {
        if (field.startsWith(ap + '.') && combo[ap] === undefined) {
          row[field] = '';
        }
      }
    }
    return row;
  }

  // After allRows is built, merge rows so that only fields that are part of the same logical group (e.g. same responder, same vehicle, etc.) are merged, matching the pattern in report.json
  function mergeRowsPattern(rows, configFields) {
    // For this pattern, merge only when all fields except the current group (e.g. personnel, vehicle, responder) are empty
    const merged = [];
    let last = null;
    for (const row of rows) {
      // If this row is a continuation (all but one group are empty), merge into last
      if (last) {
        // Find which fields are non-empty in this row
        const nonEmptyFields = configFields.filter(f => row[f] !== '' && row[f] !== undefined);
        // If only one logical group is non-empty, merge
        // For this use case, merge if only personnel fields are non-empty
        const isPersonnelRow = nonEmptyFields.every(f => f.startsWith('responders.personnel.'));
        const isVehicleRow = nonEmptyFields.every(f => f.startsWith('details.vehiclesInvolved.'));
        const isResponderRow = nonEmptyFields.every(f => f.startsWith('responders.')) && !isPersonnelRow;
        const isAdvisoryRow = nonEmptyFields.every(f => f.startsWith('advisories.'));
        if (isPersonnelRow || isVehicleRow || isResponderRow || isAdvisoryRow) {
          for (const f of nonEmptyFields) {
            last[f] = row[f];
          }
          continue;
        }
      }
      // Otherwise, start a new row
      last = { ...row };
      merged.push(last);
    }
    return merged;
  }

  // Main: process each root object
  let allRows = [];
  for (const obj of data) {
    const arrayPaths = Array.from(new Set(getAllArrayPaths(obj, configFields)));
    const combos = getAllCombinations(obj, arrayPaths) || [{}];
    let prevRow = {};
    for (const combo of combos) {
      const row = buildRow(obj, combo, configFields, arrayPaths);
      // For each field, if value is same as previous row, set as blank
      const outputRow = {};
      for (const field of configFields) {
        if (prevRow[field] === undefined || row[field] !== prevRow[field]) {
          outputRow[field] = row[field] !== undefined ? row[field] : '';
        } else {
          outputRow[field] = '';
        }
      }
      allRows.push(outputRow);
      prevRow = { ...prevRow, ...row };
    }
  }
  // Merge rows using the report.json pattern
  return mergeRowsPattern(allRows, configFields);
}

// Example usage:
// const data = require('./input.json'); // or your data array
// const configFields = [
//   "incidentId",
//   "type",
//   "location.road",
//   "location.direction",
//   "location.landmark",
//   "time",
//   "status",
//   "advisories.type",
//   "advisories.messages",
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
// console.log(reportRows);

export { flattenReport };
