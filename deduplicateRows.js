// deduplicateRows.js
// Removes redundant values in grouped rows by parent key (e.g., incidentId)
// For each group, if a field value is repeated, only the first occurrence keeps the value, others are set to ''

function deduplicateRows(rows, groupKey, header) {
  let result = [];
  let lastSeen = {};
  let currentGroup = null;
  let groupSeen = {};

  for (const row of rows) {
    if (row[groupKey] !== currentGroup) {
      currentGroup = row[groupKey];
      groupSeen = {};
    }
    let newRow = {};
    for (const field of header) {
      const value = row[field];
      if (value === '' || value == null) {
        newRow[field] = '';
        continue;
      }
      // If this value for this field has already appeared in this group, set to ''
      if (groupSeen[field] && groupSeen[field].has(value)) {
        newRow[field] = '';
      } else {
        newRow[field] = value;
        if (!groupSeen[field]) groupSeen[field] = new Set();
        groupSeen[field].add(value);
      }
    }
    result.push(newRow);
  }
  return result;
}

// Removes redundant values globally across all rows (not just per group)
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

module.exports = { deduplicateRows, deduplicateRowsGlobally };
