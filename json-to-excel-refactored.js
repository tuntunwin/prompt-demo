import * as XLSX from 'xlsx';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Configuration for the report generator
 */
const CONFIG = {
  fields: [
    'incidentId', 'type', 'time', 'status',
    'location.road', 'location.direction', 'location.landmark',
    'details.vehiclesInvolved.type',
    'details.vehiclesInvolved.plateNumber.serial',
    'details.vehiclesInvolved.plateNumber.region',
    'details.vehiclesInvolved.severity',
    'details.casualties', 'details.lanesBlocked',
    'advisories.type', 'advisories.message',
    'responders.agency', 'responders.arrivalTime',
    'responders.personnel.name', 'responders.personnel.role'
  ],
  parentKey: 'incidentId',
  inputFile: 'input.json',
  outputFile: 'output-refactored.xlsx', 
  worksheetName: 'Report'
};

/**
 * Utility functions for object manipulation
 */
class ObjectUtils {
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  static setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  static findArrayInPath(obj, fieldPath) {
    const parts = fieldPath.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length; i++) {
      if (Array.isArray(current)) {
        return { arrayRef: current, arrayIndex: i };
      }
      current = current?.[parts[i]];
    }
    
    return Array.isArray(current) ? { arrayRef: current, arrayIndex: parts.length } : null;
  }
}

/**
 * Handles deduplication logic for rows
 */
class DeduplicationManager {
  constructor() {
    this.seenValues = new Map();
  }

  reset() {
    this.seenValues.clear();
  }

  shouldShowValue(ownerKey, field, value) {
    const key = `${ownerKey}_${field}`;
    
    if (!this.seenValues.has(key)) {
      this.seenValues.set(key, new Set());
    }
    
    const seenSet = this.seenValues.get(key);
    const isNew = !seenSet.has(value);
    
    if (isNew) {
      seenSet.add(value);
    }
    
    return isNew;
  }

  createOwnerKey(obj, field, fields) {
    const parts = field.split('.');
    
    if (parts.length <= 1) return 'root';
    
    const parentPath = parts.slice(0, -1);
    const signature = this.createObjectSignature(obj, parentPath, fields);
    
    return `${parentPath.join('.')}_${JSON.stringify(signature)}`;
  }

  createObjectSignature(obj, path, fields) {
    const target = path.reduce((current, key) => current?.[key], obj);
    if (!target || typeof target !== 'object') return {};
    
    const signature = {};
    const pathPrefix = path.join('.');
    
    fields
      .filter(f => f.startsWith(pathPrefix + '.'))
      .forEach(field => {
        const fieldName = field.split('.').pop();
        const value = target[fieldName];
        if (value !== undefined && !Array.isArray(value)) {
          signature[field] = value;
        }
      });
    
    return signature;
  }
}

/**
 * Handles flattening of nested objects with arrays
 */
class ObjectFlattener {
  constructor(fields, parentKey) {
    this.fields = fields;
    this.parentKey = parentKey;
    this.deduplicationManager = new DeduplicationManager();
  }

  flatten(obj) {
    this.deduplicationManager.reset();
    return this.flattenRecursive(obj);
  }

  flattenRecursive(obj, parentData = {}) {
    // Find first array field and flatten it
    const arrayField = this.findFirstArrayField(obj);
    
    if (arrayField) {
      const { field, arrayRef, arrayIndex } = arrayField;
      return arrayRef.flatMap(item => {
        const newObj = this.replaceArrayWithItem(obj, field, arrayIndex, item);
        return this.flattenRecursive(newObj, parentData);
      });
    }
    
    // No arrays found, create final row
    return [this.createRow(obj, parentData)];
  }

  findFirstArrayField(obj) {
    for (const field of this.fields) {
      const arrayInfo = ObjectUtils.findArrayInPath(obj, field);
      if (arrayInfo) {
        return { field, ...arrayInfo };
      }
    }
    return null;
  }

  replaceArrayWithItem(obj, field, arrayIndex, item) {
    const newObj = { ...obj };
    const parts = field.split('.');
    
    if (arrayIndex === 0) {
      return item;
    }
    
    let target = newObj;
    for (let i = 0; i < arrayIndex - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }
    
    target[parts[arrayIndex - 1]] = item;
    return newObj;
  }

  createRow(obj, parentData) {
    const row = { ...parentData };
    
    this.fields.forEach(field => {
      let value = ObjectUtils.getNestedValue(obj, field);
      
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
      
      if (value) {
        const ownerKey = this.deduplicationManager.createOwnerKey(obj, field, this.fields);
        const shouldShow = this.deduplicationManager.shouldShowValue(ownerKey, field, value);
        row[field] = shouldShow ? value : '';
      } else {
        row[field] = value ?? '';
      }
    });
    
    return row;
  }
}

/**
 * Handles merging of rows based on parent relationships
 */
class RowMerger {
  constructor(fields, parentKey) {
    this.fields = fields;
    this.parentKey = parentKey;
  }

  merge(rows) {
    const groups = this.groupByParent(rows);
    return Object.values(groups).flatMap(group => this.mergeGroup(group));
  }

  groupByParent(rows) {
    return rows.reduce((groups, row) => {
      const key = row[this.parentKey] || '__NO_PARENT__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
      return groups;
    }, {});
  }

  mergeGroup(rows) {
    const used = new Array(rows.length).fill(false);
    const merged = [];
    
    for (let i = 0; i < rows.length; i++) {
      if (used[i]) continue;
      
      const mergedRow = { ...rows[i] };
      used[i] = true;
      
      // Try to merge with remaining rows
      for (let j = i + 1; j < rows.length; j++) {
        if (used[j]) continue;
        
        if (this.canMergeRows(mergedRow, rows[j])) {
          this.mergeRowData(mergedRow, rows[j]);
          used[j] = true;
        }
      }
      
      merged.push(mergedRow);
    }
    
    return merged;
  }

  canMergeRows(row1, row2) {
    for (const field of this.fields) {
      const val1 = row1[field];
      const val2 = row2[field];
      
      // Conflict if both have different values
      if (val1 && val2 && val1 !== val2) {
        return false;
      }
      
      // Check for parent context conflicts
      if (this.hasParentContextConflict(row1, row2, field)) {
        return false;
      }
    }
    
    return true;
  }

  hasParentContextConflict(row1, row2, field) {
    const parts = field.split('.');
    if (parts.length <= 1) return false;
    
    const parentPath = parts.slice(0, -1).join('.');
    const siblingFields = this.fields.filter(f => f.startsWith(parentPath + '.'));
    
    return siblingFields.some(siblingField => {
      const val1 = row1[siblingField];
      const val2 = row2[siblingField];
      return val1 && val2 && val1 !== val2;
    });
  }

  mergeRowData(targetRow, sourceRow) {
    this.fields.forEach(field => {
      if (!targetRow[field] && sourceRow[field]) {
        targetRow[field] = sourceRow[field];
      }
    });
  }
}

/**
 * Main report generator class
 */
class ReportGenerator {
  constructor(config = CONFIG) {
    this.config = config;
    this.flattener = new ObjectFlattener(config.fields, config.parentKey);
    this.merger = new RowMerger(config.fields, config.parentKey);
  }
  async generateReport() {
    const data = this.loadData();
    const processedRows = this.processData(data);
    const filteredRows = this.filterEmptyRows(processedRows);
    this.exportToExcel(filteredRows);
    this.saveRowsToJson(filteredRows);
    
    return {
      totalProcessed: data.length,
      outputRows: filteredRows.length,
      outputFile: this.config.outputFile
    };
  }

  saveRowsToJson(rows) {
    const jsonFileName = this.config.outputFile.replace('.xlsx', '-rows.json');
    fs.writeFileSync(jsonFileName, JSON.stringify(rows, null, 2));
    console.log(`Rows saved to ${jsonFileName}`);
  }

  loadData() {
    try {
      return JSON.parse(fs.readFileSync(this.config.inputFile, 'utf8'));
    } catch (error) {
      throw new Error(`Failed to load data from ${this.config.inputFile}: ${error.message}`);
    }
  }

  processData(data) {
    let totalRowsBeforeMerge = 0;
    const allRows = [];
    
    data.forEach(item => {
      console.log(`Processing ${this.config.parentKey}: ${item[this.config.parentKey]}`);
      
      const flattenedRows = this.flattener.flatten(item);
      totalRowsBeforeMerge += flattenedRows.length;
      
      const mergedRows = this.merger.merge(flattenedRows);
      allRows.push(...mergedRows);
      
      console.log(`  ${flattenedRows.length} → ${mergedRows.length} rows (${((flattenedRows.length - mergedRows.length) / flattenedRows.length * 100).toFixed(1)}% reduction)`);
    });
    
    console.log(`\nTotal: ${totalRowsBeforeMerge} → ${allRows.length} rows (${((totalRowsBeforeMerge - allRows.length) / totalRowsBeforeMerge * 100).toFixed(1)}% reduction)`);
    
    return allRows;
  }

  filterEmptyRows(rows) {
    return rows.filter(row => 
      this.config.fields.some(field => 
        row[field] && row[field].toString().trim() !== ''
      )
    );
  }

  exportToExcel(rows) {
    const excelRows = [
      this.config.fields,
      ...rows.map(row => this.config.fields.map(field => row[field] ?? ''))
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, this.config.worksheetName);
    XLSX.writeFile(workbook, this.config.outputFile);
    
    console.log(`Exported to ${this.config.outputFile}`);
  }
}

/**
 * Main function to execute the report generation
 */
async function main() {
  try {
    console.log('Starting report generation...\n');
    
    const generator = new ReportGenerator();
    const result = await generator.generateReport();
    
    console.log(`\n✅ Report generated successfully:`);
    console.log(`   📊 Processed ${result.totalProcessed} items`);
    console.log(`   📝 Generated ${result.outputRows} rows`);
    console.log(`   📁 Output: ${result.outputFile}`);
    
    return result;
  } catch (error) {
    console.error('❌ Error generating report:', error.message);
    process.exit(1);
  }
}

// Execute main function when script is run directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this module is the main module being executed
if (process.argv[1] === __filename) {
  main();
}

export { ReportGenerator, CONFIG, main };
