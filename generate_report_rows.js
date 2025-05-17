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

module.exports = generateReportRows;
