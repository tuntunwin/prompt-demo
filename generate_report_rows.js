// generate_report_rows.js
// Generates report rows from input data and config fields (dot notation)

/**
 * Flattens an object using dot notation for keys.
 * Handles arrays by expanding them into multiple rows.
 * @param {Object|Array} obj - The object or array to flatten.
 * @param {string[]} configFields - The list of fields to extract (dot notation).
 * @returns {Object[]} Array of flattened rows.
 */
function generateReportRows(obj, configFields) {
  // Helper to get value by dot path
  function getValue(o, path) {
    return path.split('.').reduce((v, k) => (v && v[k] !== undefined ? v[k] : ''), o);
  }

  // Helper to recursively expand all arrays in the object
  function expand(obj, prefix = '') {
    let arrays = [];
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        arrays.push(prefix ? prefix + '.' + key : key);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        const subArrays = expand(obj[key], prefix ? prefix + '.' + key : key);
        arrays = arrays.concat(subArrays);
      }
    }
    return arrays;
  }

  // Helper to get all combinations of array elements at all array paths
  function getCombos(obj, arrayPaths, idx = 0, context = {}, combos = []) {
    if (idx >= arrayPaths.length) {
      combos.push({ ...context });
      return combos;
    }
    const path = arrayPaths[idx];
    const arr = getValue(obj, path);
    if (Array.isArray(arr) && arr.length > 0) {
      for (const item of arr) {
        getCombos(obj, arrayPaths, idx + 1, { ...context, [path]: item }, combos);
      }
    } else {
      getCombos(obj, arrayPaths, idx + 1, context, combos);
    }
    return combos;
  }

  // Helper to build a row for a given combo
  function buildRow(obj, combo, configFields, arrayPaths) {
    const row = {};
    for (const field of configFields) {
      const parts = field.split('.');
      let curr = obj;
      let pathSoFar = '';
      for (let i = 0; i < parts.length; i++) {
        pathSoFar = pathSoFar ? pathSoFar + '.' + parts[i] : parts[i];
        if (combo[pathSoFar]) {
          curr = combo[pathSoFar];
        } else if (curr && curr[parts[i]] !== undefined) {
          curr = curr[parts[i]];
        } else {
          curr = '';
          break;
        }
      }
      row[field] = curr !== undefined ? curr : '';
    }
    return row;
  }

  // Main logic
  let allRows = [];
  const dataArr = Array.isArray(obj) ? obj : [obj];
  for (const item of dataArr) {
    const arrayPaths = expand(item);
    const combos = getCombos(item, arrayPaths);
    if (combos.length === 0) {
      allRows.push(buildRow(item, {}, configFields, arrayPaths));
    } else {
      for (const combo of combos) {
        allRows.push(buildRow(item, combo, configFields, arrayPaths));
      }
    }
  }
  return allRows;
}

// Example usage:
// const input = require('./input.json');
// const config = require('./config.json');
// const rows = generateReportRows(input, config);
// console.log(JSON.stringify(rows, null, 2));

export { generateReportRows };
