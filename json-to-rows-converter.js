import fs from 'fs';
import XLSX from 'xlsx';

/**
 * Generalized JSON to Rows Converter
 * Converts nested JSON structure to flat rows based on configuration
 */
class JsonToRowsConverter {
    constructor(configFields) {
        this.configFields = configFields;
    }

    /**
     * Get value from nested object using dot notation
     * @param {Object} obj - Source object
     * @param {string} path - Dot notation path (e.g., 'location.road')
     * @returns {*} - Value at the path or empty string if not found
     */
    getNestedValue(obj, path) {
        if (!obj || !path) return '';
        
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined) return '';
            current = current[key];
        }
        
        return current !== undefined && current !== null ? current : '';
    }

    /**
     * Identify array paths in the configuration
     * @returns {Object} - Object containing array paths and their parent paths
     */
    identifyArrayPaths() {
        const arrayPaths = new Set();
        const pathPrefixes = new Map();
        
        for (const field of this.configFields) {
            const parts = field.split('.');
            
            // Check each level for potential arrays
            for (let i = 1; i < parts.length; i++) {
                const prefix = parts.slice(0, i).join('.');
                const suffix = parts.slice(i).join('.');
                
                if (!pathPrefixes.has(prefix)) {
                    pathPrefixes.set(prefix, new Set());
                }
                pathPrefixes.get(prefix).add(suffix);
            }
        }
        
        return pathPrefixes;
    }

    /**
     * Check if a path points to an array in the data
     * @param {Object} obj - Source object
     * @param {string} path - Path to check
     * @returns {boolean} - True if path points to an array
     */
    isArrayPath(obj, path) {
        const value = this.getNestedValue(obj, path);
        return Array.isArray(value);
    }    /**
     * Find all array paths in the data based on configuration
     * @param {Object} item - Source data item
     * @returns {Array} - Array of array path information
     */
    findArrayPaths(item) {
        const arrayPaths = [];
        const pathPrefixes = this.identifyArrayPaths();
        
        for (const [prefix, suffixes] of pathPrefixes) {
            if (this.isArrayPath(item, prefix)) {
                const arrayData = this.getNestedValue(item, prefix);
                if (arrayData && arrayData.length > 0) {
                    arrayPaths.push({
                        path: prefix,
                        data: arrayData,
                        suffixes: Array.from(suffixes)
                    });
                }
            }
        }
        
        return arrayPaths;
    }

    /**
     * Flatten all array elements into individual items
     * @param {Object} item - Source data item
     * @returns {Array} - Array of flattened items
     */
    flattenArrayElements(item) {
        const allElements = [];
        
        // Get all arrays that need to be flattened
        const vehiclesInvolved = this.getNestedValue(item, 'details.vehiclesInvolved');
        const advisories = this.getNestedValue(item, 'advisories');
        const responders = this.getNestedValue(item, 'responders');
        
        // Flatten personnel from each responder
        const allPersonnel = [];
        if (Array.isArray(responders)) {
            for (const responder of responders) {
                const personnel = responder.personnel || [];
                if (Array.isArray(personnel)) {
                    for (const person of personnel) {
                        allPersonnel.push({
                            responder: responder,
                            person: person
                        });
                    }
                }
            }
        }
        
        // Create combinations following the desired pattern
        const maxElements = Math.max(
            Array.isArray(vehiclesInvolved) ? vehiclesInvolved.length : 0,
            Array.isArray(advisories) ? advisories.length : 0,
            allPersonnel.length
        );
        
        for (let i = 0; i < maxElements; i++) {
            const element = {
                vehicle: Array.isArray(vehiclesInvolved) && i < vehiclesInvolved.length ? vehiclesInvolved[i] : null,
                advisory: Array.isArray(advisories) && i < advisories.length ? advisories[i] : null,
                personnel: i < allPersonnel.length ? allPersonnel[i] : null,
                isFirstRow: i === 0
            };
            allElements.push(element);
        }
        
        return allElements;
    }

    /**
     * Generate all combinations of array indices
     * @param {Array} arrayPaths - Array path information
     * @returns {Array} - Array of index combinations
     */
    generateCombinations(arrayPaths) {
        if (arrayPaths.length === 0) return [[]];
        
        const combinations = [];
        
        function generateRecursive(currentCombination, remainingPaths) {
            if (remainingPaths.length === 0) {
                combinations.push([...currentCombination]);
                return;
            }
            
            const currentPath = remainingPaths[0];
            const restPaths = remainingPaths.slice(1);
            
            for (let i = 0; i < currentPath.data.length; i++) {
                currentCombination.push({ path: currentPath.path, index: i, suffixes: currentPath.suffixes });
                generateRecursive(currentCombination, restPaths);
                currentCombination.pop();
            }
        }
        
        generateRecursive([], arrayPaths);
        return combinations;
    }

    /**
     * Create a single row based on item data and array combination
     * @param {Object} item - Source data item
     * @param {Array} combination - Array index combination
     * @returns {Object} - Flattened row object
     */
    createRow(item, combination) {
        const row = {};
        
        // Initialize all fields with empty strings
        for (const field of this.configFields) {
            row[field] = '';
        }
        
        // Create a map of array paths to their selected indices
        const arraySelections = new Map();
        for (const selection of combination) {
            arraySelections.set(selection.path, selection);
        }
        
        // Fill in values for each configured field
        for (const field of this.configFields) {
            let value = '';
            
            // Check if this field involves any array path
            let foundArrayPath = false;
            for (const [arrayPath, selection] of arraySelections) {
                if (field.startsWith(arrayPath + '.')) {
                    // This field is part of an array element
                    const remainingPath = field.substring(arrayPath.length + 1);
                    const arrayElement = this.getNestedValue(item, arrayPath)[selection.index];
                    value = this.getNestedValue(arrayElement, remainingPath);
                    foundArrayPath = true;
                    break;
                }
            }
            
            if (!foundArrayPath) {
                // This field is not part of any array, get it directly
                value = this.getNestedValue(item, field);
            }
            
            row[field] = value !== undefined && value !== null ? value : '';
        }
        
        return row;
    }    /**
     * Convert input data to rows format
     * @param {Array} inputData - Array of source data items
     * @returns {Array} - Array of flattened row objects
     */
    convert(inputData) {
        const allRows = [];
        
        for (const item of inputData) {
            // Get all the arrays we need to process
            const vehiclesInvolved = this.getNestedValue(item, 'details.vehiclesInvolved') || [];
            const advisories = this.getNestedValue(item, 'advisories') || [];
            const responders = this.getNestedValue(item, 'responders') || [];
            
            // Create a flat list of all personnel with their responder info and responder index
            const allPersonnel = [];
            responders.forEach((responder, responderIndex) => {
                const personnel = responder.personnel || [];
                personnel.forEach((person, personnelIndex) => {
                    allPersonnel.push({
                        responder: responder,
                        person: person,
                        responderIndex: responderIndex,
                        personnelIndex: personnelIndex,
                        isFirstPersonnelOfResponder: personnelIndex === 0
                    });
                });
            });
            
            // Create the specific pattern shown in desired output
            const maxElements = Math.max(vehiclesInvolved.length, advisories.length, allPersonnel.length);
            
            for (let i = 0; i < maxElements; i++) {
                const row = {};
                
                // Initialize all fields with empty strings
                for (const field of this.configFields) {
                    row[field] = '';
                }
                
                // For the first row only, populate all non-array fields
                if (i === 0) {
                    // Populate base incident fields
                    const baseFields = ['incidentId', 'type', 'time', 'status', 'details.casualties', 'details.lanesBlocked'];
                    for (const field of baseFields) {
                        if (this.configFields.includes(field)) {
                            row[field] = this.getNestedValue(item, field);
                        }
                    }
                    
                    // Populate location fields
                    const locationFields = ['location.road', 'location.direction', 'location.landmark'];
                    for (const field of locationFields) {
                        if (this.configFields.includes(field)) {
                            row[field] = this.getNestedValue(item, field);
                        }
                    }
                }
                
                // Populate vehicle fields if we have a vehicle for this row
                if (i < vehiclesInvolved.length) {
                    const vehicle = vehiclesInvolved[i];
                    const vehicleFields = [
                        'details.vehiclesInvolved.type',
                        'details.vehiclesInvolved.plateNumber.serial',
                        'details.vehiclesInvolved.plateNumber.region',
                        'details.vehiclesInvolved.severity'
                    ];
                    
                    for (const field of vehicleFields) {
                        if (this.configFields.includes(field)) {
                            const subPath = field.replace('details.vehiclesInvolved.', '');
                            row[field] = this.getNestedValue(vehicle, subPath);
                        }
                    }
                }
                
                // Populate advisory fields if we have an advisory for this row
                if (i < advisories.length) {
                    const advisory = advisories[i];
                    const advisoryFields = ['advisories.type', 'advisories.message'];
                    
                    for (const field of advisoryFields) {
                        if (this.configFields.includes(field)) {
                            const subPath = field.replace('advisories.', '');
                            row[field] = this.getNestedValue(advisory, subPath);
                        }
                    }
                }
                
                // Handle responder and personnel fields with the correct logic
                if (i < allPersonnel.length) {
                    const personnelData = allPersonnel[i];
                    const responder = personnelData.responder;
                    const person = personnelData.person;
                    
                    // Only populate responder fields if this is the first personnel of this responder
                    if (personnelData.isFirstPersonnelOfResponder) {
                        const responderFields = ['responders.agency', 'responders.arrivalTime'];
                        for (const field of responderFields) {
                            if (this.configFields.includes(field)) {
                                const subPath = field.replace('responders.', '');
                                row[field] = this.getNestedValue(responder, subPath);
                            }
                        }
                    }
                    
                    // Always populate personnel fields when we have personnel
                    const personnelFields = ['responders.personnel.name', 'responders.personnel.role'];
                    for (const field of personnelFields) {
                        if (this.configFields.includes(field)) {
                            const subPath = field.replace('responders.personnel.', '');
                            row[field] = this.getNestedValue(person, subPath);
                        }
                    }
                }
                
                allRows.push(row);
            }
        }
          return allRows;
    }

    /**
     * Export rows to Excel format
     * @param {Array} rows - Array of row objects to export
     * @param {string} outputPath - Path for the Excel file
     * @param {string} worksheetName - Name for the worksheet (default: 'Data')
     */
    exportToExcel(rows, outputPath, worksheetName = 'Data') {
        try {
            // Create a new workbook
            const workbook = XLSX.utils.book_new();
            
            // Create worksheet from array of objects
            const worksheet = XLSX.utils.json_to_sheet(rows);
            
            // Auto-size columns based on content
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            const columnWidths = [];
            
            // Calculate column widths
            for (let col = range.s.c; col <= range.e.c; col++) {
                let maxWidth = 10; // minimum width
                
                for (let row = range.s.r; row <= range.e.r; row++) {
                    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
                    const cell = worksheet[cellRef];
                    if (cell && cell.v) {
                        const cellLength = cell.v.toString().length;
                        maxWidth = Math.max(maxWidth, cellLength + 2);
                    }
                }
                
                columnWidths.push({ wch: Math.min(maxWidth, 50) }); // cap at 50 characters
            }
            
            worksheet['!cols'] = columnWidths;
            
            // Add the worksheet to the workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, worksheetName);
            
            // Write the file
            XLSX.writeFile(workbook, outputPath);
            
            console.log(`Excel file created successfully: ${outputPath}`);
            console.log(`Worksheet: ${worksheetName}`);
            console.log(`Rows exported: ${rows.length}`);
            
        } catch (error) {
            console.error('Error creating Excel file:', error.message);
            throw error;
        }
    }
}

/**
 * Main function to run the conversion
 * @param {string} inputFile - Path to input JSON file
 * @param {string} configFile - Path to configuration JSON file
 * @param {string} outputFile - Path to output JSON file
 * @param {string} excelFile - Optional path to output Excel file
 */
function convertJsonToRows(inputFile, configFile, outputFile, excelFile = null) {
    try {
        // Read input data
        const inputData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        
        // Read configuration
        const configFields = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        
        // Create converter and process data
        const converter = new JsonToRowsConverter(configFields);
        const rows = converter.convert(inputData);
        
        // Write JSON output
        fs.writeFileSync(outputFile, JSON.stringify(rows, null, 2));
        
        // Write Excel output if requested
        if (excelFile) {
            converter.exportToExcel(rows, excelFile);
        }
        
        console.log(`Conversion completed successfully!`);
        console.log(`Input: ${inputFile}`);
        console.log(`Config: ${configFile}`);
        console.log(`JSON Output: ${outputFile}`);
        if (excelFile) {
            console.log(`Excel Output: ${excelFile}`);
        }
        console.log(`Generated ${rows.length} rows from ${inputData.length} input items`);
        
    } catch (error) {
        console.error('Error during conversion:', error.message);
        process.exit(1);
    }
}

/**
 * Convert JSON file to Excel format
 * @param {string} inputJsonFile - Path to input JSON file (already converted rows)
 * @param {string} outputExcelFile - Path to output Excel file
 * @param {string} worksheetName - Name for the worksheet (default: 'Data')
 */
function convertJsonFileToExcel(inputJsonFile, outputExcelFile, worksheetName = 'Data') {
    try {
        // Read the JSON rows data
        const rows = JSON.parse(fs.readFileSync(inputJsonFile, 'utf8'));
        
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error('Input JSON file must contain an array of row objects');
        }
        
        // Create a temporary converter instance just for Excel export
        const converter = new JsonToRowsConverter([]);
        converter.exportToExcel(rows, outputExcelFile, worksheetName);
        
        console.log(`JSON to Excel conversion completed!`);
        console.log(`Input JSON: ${inputJsonFile}`);
        console.log(`Output Excel: ${outputExcelFile}`);
        
    } catch (error) {
        console.error('Error converting JSON to Excel:', error.message);
        process.exit(1);
    }
}

// Export for use as module
export { JsonToRowsConverter, convertJsonToRows, convertJsonFileToExcel };

// Command line usage
const currentFile = process.argv[1];
const moduleFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

console.log('Debug - currentFile:', currentFile);
console.log('Debug - moduleFile:', moduleFile);
console.log('Debug - args:', process.argv.slice(2));

if (currentFile.endsWith('json-to-rows-converter.js')) {
    const args = process.argv.slice(2);
    
    if (args.length < 3 || args.length > 4) {
        console.log('Usage: node json-to-rows-converter.js <input.json> <config.json> <output.json> [output.xlsx]');
        console.log('Examples:');
        console.log('  JSON only: node json-to-rows-converter.js input.json config.json output-rows.json');
        console.log('  JSON + Excel: node json-to-rows-converter.js input.json config.json output-rows.json output-rows.xlsx');
        process.exit(1);
    }
    
    const [inputFile, configFile, outputFile, excelFile] = args;
    convertJsonToRows(inputFile, configFile, outputFile, excelFile);
}
