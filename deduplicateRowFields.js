// deduplicateRowFields.js
// Utility to deduplicate field values in a list of row objects (set repeated field values to empty after first occurrence)
export function deduplicateRowFields(rows, header) {
  const seen = {};
  return rows.map(row => {
    const newRow = {};
    for (const field of header) {
      const value = row[field];
      if (!seen[field]) seen[field] = new Set();
      if (value && seen[field].has(value)) {
        newRow[field] = '';
      } else {
        newRow[field] = value;
        if (value) seen[field].add(value);
      }
    }
    return newRow;
  });
}

// Deduplicate field values only within each parent group (e.g., incidentId)
export function deduplicateRowFieldsByParent(rows, header, parentKey) {
  let result = [];
  let seen = {};
  let currentParent = null;
  let groupSeen = {};
  for (const row of rows) {
    if (row[parentKey] && row[parentKey] !== currentParent) {
      currentParent = row[parentKey];
      groupSeen = {};
    }
    const newRow = {};
    for (const field of header) {
      const value = row[field];
      if (!groupSeen[field]) groupSeen[field] = new Set();
      if (value && groupSeen[field].has(value)) {
        newRow[field] = '';
      } else {
        newRow[field] = value;
        if (value) groupSeen[field].add(value);
      }
    }
    result.push(newRow);
  }
  return result;
}
