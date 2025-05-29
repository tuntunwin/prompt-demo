import * as XLSX from 'xlsx';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Load configuration fields from config.json
 */
function loadConfigFields() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const configPath = join(__dirname, 'test_config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error loading config.json:', error.message);
    throw new Error('Failed to load configuration fields from config.json');
  }
}

/**
 * Configuration for the report generator
 */
const CONFIG = {
  fields: loadConfigFields(),
  parentKey: 'employeeId',
  inputFile: 'test_input.json',
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
 * Handles preprocessing to add unique IDs to child objects
 */
class ObjectPreprocessor {
  constructor() {
    this.uniqueIdCounter = 0;
  }

  reset() {
    this.uniqueIdCounter = 0;
  }

  /**
   * Add unique IDs to all child objects before flattening
   */
  addUniqueIds(obj) {
    this.reset();
    return this.addUniqueIdsRecursive(JSON.parse(JSON.stringify(obj))); // Deep clone
  }

  addUniqueIdsRecursive(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      // For arrays, add unique ID to each item
      return obj.map(item => {
        if (typeof item === 'object' && item !== null) {
          item.__objectId = ++this.uniqueIdCounter;
          return this.addUniqueIdsRecursive(item);
        }
        return item;
      });
    }

    // For objects, process all properties
    Object.keys(obj).forEach(key => {
      if (Array.isArray(obj[key])) {
        obj[key] = this.addUniqueIdsRecursive(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        obj[key] = this.addUniqueIdsRecursive(obj[key]);
      }
    });

    return obj;
  }
}

/**
 * Handles deduplication logic for rows using object IDs
 */
class DeduplicationManager {
  constructor(parentKey) {
    this.seenValues = new Map();
    this.parentKey = parentKey;
  }

  reset() {
    this.seenValues.clear();
  }

  /**
   * Determines if a field belongs to the root object based on nesting level
   */
  isRootObjectField(field) {
    const parts = field.split('.');
    
    // Single level fields are root fields
    if (parts.length === 1) {
      return true;
    }
    
    // Two level fields might be root fields (like personalInfo.*)
    // We assume fields with 2 or fewer parts that don't come from arrays are root fields
    if (parts.length === 2) {
      return true;
    }
    
    // Everything else is from nested arrays/objects
    return false;
  }

  shouldShowValue(field, value, objectId, parentIdValue) {
    // For root object fields, deduplicate per parent instance
    if (this.isRootObjectField(field)) {
      const key = `parent_${parentIdValue}_${field}`;
      if (!this.seenValues.has(key)) {
        this.seenValues.set(key, new Set());
      }
      const seenSet = this.seenValues.get(key);
      const isNew = !seenSet.has(value);
      if (isNew) seenSet.add(value);
      return isNew;
    }

    // For child object fields, deduplicate per object ID
    if (objectId) {
      const key = `object_${objectId}_${field}`;
      if (!this.seenValues.has(key)) {
        this.seenValues.set(key, new Set());
      }
      const seenSet = this.seenValues.get(key);
      const isNew = !seenSet.has(value);
      if (isNew) seenSet.add(value);
      return isNew;
    }

    // Fallback: show the value
    return true;
  }
}

/**
 * Handles flattening of nested objects with arrays
 */
class ObjectFlattener {
  constructor(fields, parentKey) {
    this.fields = fields;
    this.parentKey = parentKey;
    this.deduplicationManager = new DeduplicationManager(parentKey);
    this.preprocessor = new ObjectPreprocessor();
  }

  flatten(obj) {
    this.deduplicationManager.reset();
    
    // First, add unique IDs to all child objects
    const preprocessedObj = this.preprocessor.addUniqueIds(obj);
    
    // Then flatten the object
    const result = this.flattenRecursive(preprocessedObj);
    console.log(`Raw rows generated: ${result.length}`);
    return result;
  }

  flattenRecursive(obj, parentData = {}) {
    // Find first array field and flatten it
    const arrayField = this.findFirstArrayField(obj);
    
    if (arrayField) {
      const { field, arrayRef, arrayIndex } = arrayField;
      return arrayRef.flatMap((item, itemIndex) => {
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
    const parentIdValue = obj[this.parentKey] || 'unknown';
    
    this.fields.forEach(field => {
      let value = ObjectUtils.getNestedValue(obj, field);
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
      
      if (value !== undefined && value !== null) {
        // Get the object ID from the object that contains this field
        const objectId = this.getObjectIdForField(obj, field);
        
        // Apply deduplication
        const shouldShow = this.deduplicationManager.shouldShowValue(field, value, objectId, parentIdValue);
        row[field] = shouldShow ? value : '';
      } else {
        row[field] = '';
      }
    });
    
    return row;
  }

  /**
   * Get the object ID for the object that contains the given field
   */
  getObjectIdForField(obj, field) {
    const parts = field.split('.');
    let current = obj;
    
    // Navigate to the object that contains this field
    for (let i = 0; i < parts.length - 1; i++) {
      if (current && typeof current === 'object') {
        current = current[parts[i]];
      } else {
        break;
      }
    }
    
    // Return the object ID if it exists
    return current && typeof current === 'object' ? current.__objectId : null;
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
  }  processData(data) {
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
