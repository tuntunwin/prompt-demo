// Generates report rows from input data as described
// Each row contains all flattened fields, but only one child/subchild's fields are filled per row, others are empty

function flattenObject(obj, prefix = '', skipKeys = []) {
  let result = {};
  for (const key in obj) {
    if (skipKeys.includes(key)) continue;
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function getAllFieldPaths(obj, prefix = '', paths = new Set()) {
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      getAllFieldPaths(value, newKey, paths);
    } else {
      paths.add(newKey);
    }
  }
  return paths;
}

function getChildKeys(obj) {
  // Returns keys whose value is an object (not array, not null)
  return Object.keys(obj).filter(
    k => typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])
  );
}

function generateReportRows(data) {
  // Get all possible field paths for header
  let allFields = new Set();
  data.forEach(item => {
    getAllFieldPaths(item, '', allFields);
  });
  allFields = Array.from(allFields);

  const rows = [];
  data.forEach(item => {
    const childKeys = getChildKeys(item);
    if (childKeys.length === 0) {
      // No child objects, just flatten
      rows.push(flattenObject(item));
    } else {
      // For each child, create a row with only that child filled
      childKeys.forEach(childKey => {
        const parentFields = flattenObject(item, '', [childKey]);
        const childObj = item[childKey];
        if (typeof childObj === 'object' && childObj !== null) {
          // For each subchild (if any), recurse
          const subChildKeys = getChildKeys(childObj);
          if (subChildKeys.length === 0) {
            // No subchild, just flatten child
            const childFields = flattenObject(childObj, childKey);
            const row = {};
            allFields.forEach(f => {
              row[f] = parentFields[f] || childFields[f] || '';
            });
            rows.push(row);
          } else {
            // For each subchild, recurse
            subChildKeys.forEach(subKey => {
              const childFields = flattenObject(childObj, childKey, [subKey]);
              const subObj = childObj[subKey];
              const subFields = flattenObject(subObj, `${childKey}.${subKey}`);
              const row = {};
              allFields.forEach(f => {
                row[f] = parentFields[f] || childFields[f] || subFields[f] || '';
              });
              rows.push(row);
            });
          }
        }
      });
    }
  });
  return { header: allFields, rows };
}

// Example usage:
// const input = require('./input.json');
// const { header, rows } = generateReportRows(input);
// console.log(header.join(','));
// rows.forEach(r => console.log(header.map(f => r[f]).join(',')));

export { generateReportRows };
