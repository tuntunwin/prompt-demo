// nestedReport.js
// Generates report rows from deeply nested input data as described
// Each row contains all flattened fields, but only one item from each nested array is filled per row, others are empty

function getAllFieldPaths(obj, prefix = '', paths = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => getAllFieldPaths(item, prefix, paths));
    return paths;
  }
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      getAllFieldPaths(value, newKey, paths);
    } else if (typeof value === 'object' && value !== null) {
      getAllFieldPaths(value, newKey, paths);
    } else {
      paths.add(newKey);
    }
  }
  return paths;
}

function cartesian(arrays) {
  return arrays.reduce((a, b) => a.flatMap(d => b.map(e => d.concat([e]))), [[]]);
}

function getNestedArrays(obj, prefix = '') {
  let arrays = [];
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      arrays.push({ key: newKey, arr: value });
      value.forEach((item, idx) => {
        arrays = arrays.concat(getNestedArrays(item, newKey));
      });
    } else if (typeof value === 'object' && value !== null) {
      arrays = arrays.concat(getNestedArrays(value, newKey));
    }
  }
  return arrays;
}

function flattenForRow(obj, pathToItem = {}, prefix = '', skipArrays = false) {
  let result = {};
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      if (skipArrays) continue;
      // If array of strings, join as comma-separated string
      if (value.every(v => typeof v === 'string')) {
        result[newKey] = value.join(',');
        continue;
      }
      // Special case: details.lanesBlocked should be a single string value
      if (newKey === 'details.lanesBlocked') {
        result[newKey] = value.join(',');
        continue;
      }
      // Only fill the selected item, others empty
      const idx = pathToItem[newKey];
      if (idx !== undefined && value[idx]) {
        Object.assign(result, flattenForRow(value[idx], pathToItem, newKey, false));
      } else {
        // Fill with empty for all possible fields in this array
        const allFields = Array.from(getAllFieldPaths(value, newKey));
        allFields.forEach(f => result[f] = '');
      }
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenForRow(value, pathToItem, newKey, skipArrays));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function generateNestedReportRows(data) {
  // Get all possible field paths for header
  let allFields = new Set();
  data.forEach(item => {
    getAllFieldPaths(item, '', allFields);
  });
  allFields = Array.from(allFields);

  const rows = [];
  data.forEach(item => {
    // Find all nested arrays and their keys
    const arrays = getNestedArrays(item);
    if (arrays.length === 0) {
      // No nested arrays, just flatten
      rows.push(flattenForRow(item, {}, '', true));
    } else {
      // For each array, get the length
      const arrKeys = arrays.map(a => a.key);
      const arrLengths = arrays.map(a => a.arr.length);
      // Generate all combinations (cartesian product) of indices
      const indexCombos = cartesian(arrLengths.map(len => Array.from({length: len}, (_, i) => i)));
      indexCombos.forEach(combo => {
        const pathToItem = {};
        arrKeys.forEach((k, i) => pathToItem[k] = combo[i]);
        const row = flattenForRow(item, pathToItem, '', false);
        // For all array fields not in pathToItem, fill with empty
        allFields.forEach(f => { if (!(f in row)) row[f] = ''; });
        rows.push(row);
      });
    }
  });
  return { header: allFields, rows };
}

// Deduplicate all redundant field values globally in the rows
function deduplicateRowsGlobally(rows, header) {
  let seen = {};
  let result = [];
  for (const row of rows) {
    let newRow = {};
    for (const field of header) {
      const value = row[field];
      if (value === '' || value == null) {
        newRow[field] = '';
        continue;
      }
      if (!seen[field]) seen[field] = new Set();
      if (seen[field].has(value)) {
        newRow[field] = '';
      } else {
        newRow[field] = value;
        seen[field].add(value);
      }
    }
    result.push(newRow);
  }
  return result;
}

// Remove rows that are completely empty (all fields are empty)
function removeEmptyRows(rows, header) {
  return rows.filter(row => header.some(field => row[field] && row[field] !== ''));
}

// Merge deduplicated rows into as few rows as possible
function mergeDedupedRows(rows, header) {
  const merged = [];
  let current = {};
  for (const row of rows) {
    // If current is empty, start new
    if (!header.some(f => current[f] && current[f] !== '')) {
      current = { ...row };
      continue;
    }
    // Try to merge row into current if no field conflicts
    let canMerge = true;
    for (const field of header) {
      if ((current[field] && current[field] !== '') && (row[field] && row[field] !== '')) {
        canMerge = false;
        break;
      }
    }
    if (canMerge) {
      for (const field of header) {
        if (!current[field] || current[field] === '') {
          current[field] = row[field];
        }
      }
    } else {
      merged.push(current);
      current = { ...row };
    }
  }
  if (header.some(f => current[f] && current[f] !== '')) {
    merged.push(current);
  }
  return merged;
}

function generateNestedReportRowsDeduped(data) {
  const { header, rows } = generateNestedReportRows(data);
  const dedupedRows = deduplicateRowsGlobally(rows, header);
  return { header, rows: dedupedRows };
}

function generateNestedReportRowsDedupedMerged(data) {
  const { header, rows } = generateNestedReportRowsDeduped(data);
  const nonEmptyRows = removeEmptyRows(rows, header);
  const mergedRows = mergeDedupedRows(nonEmptyRows, header);
  return { header, rows: mergedRows };
}

// Example usage:
// const input = require('./input.json');
// const { header, rows } = generateNestedReportRows(input);
// console.log(header.join(','));
// rows.forEach(r => console.log(header.map(f => r[f]).join(',')));

export { generateNestedReportRows, generateNestedReportRowsDeduped, generateNestedReportRowsDedupedMerged };
