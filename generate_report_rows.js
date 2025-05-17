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

  const arrayPaths = getArrayPaths(fields);
  let reportRows = [];
  for (const item of data) {
    reportRows = reportRows.concat(flatten(item));
  }
  return reportRows;
}

module.exports = generateReportRows;
