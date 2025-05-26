import fs from 'fs';

try {
    console.log('Starting comparison...');
    const desired = JSON.parse(fs.readFileSync('output-refactored-rows.json', 'utf8'));
    console.log('Loaded desired output');
    const actual = JSON.parse(fs.readFileSync('output-test.json', 'utf8'));
    console.log('Loaded actual output');

    console.log(`Desired has ${desired.length} rows, Actual has ${actual.length} rows\n`);

    let allMatch = true;
    const maxRows = Math.max(desired.length, actual.length);

    for (let i = 0; i < maxRows; i++) {
        const desiredRow = desired[i];
        const actualRow = actual[i];
        
        if (!desiredRow) {
            console.log(`❌ Row ${i + 1}: Missing in desired output`);
            allMatch = false;
            continue;
        }
        
        if (!actualRow) {
            console.log(`❌ Row ${i + 1}: Missing in actual output`);
            allMatch = false;
            continue;
        }

        let rowMatches = true;
        const allFields = new Set([...Object.keys(desiredRow), ...Object.keys(actualRow)]);
        
        for (const field of allFields) {
            const desiredVal = desiredRow[field];
            const actualVal = actualRow[field];
            
            if (desiredVal !== actualVal) {
                if (rowMatches) {
                    console.log(`❌ Row ${i + 1} differences:`);
                }
                console.log(`  ${field}: expected "${desiredVal}", got "${actualVal}"`);
                rowMatches = false;
                allMatch = false;
            }
        }
        
        if (rowMatches) {
            console.log(`✅ Row ${i + 1}: Perfect match`);
        }
    }

    if (allMatch) {
        console.log('\n🎉 SUCCESS: All rows match perfectly!');
    } else {
        console.log('\n❌ FAILURE: Some differences found');
    }
    
} catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
}
