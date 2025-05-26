import fs from 'fs';

try {
    console.log('Reading files...');
    const desired = JSON.parse(fs.readFileSync('output-refactored-rows.json', 'utf8'));
    const actual = JSON.parse(fs.readFileSync('output-test.json', 'utf8'));

    console.log('DESIRED OUTPUT PATTERN:');
    desired.forEach((row, i) => {
        console.log(`Row ${i + 1}:`);
        console.log(`  Vehicle: "${row['details.vehiclesInvolved.type']}"`);
        console.log(`  Advisory: "${row['advisories.type']}"`);
        console.log(`  Responder: "${row['responders.agency']}"`);
        console.log(`  Personnel: "${row['responders.personnel.name']}"`);
        console.log('');
    });

    console.log('\n' + '='.repeat(50) + '\n');

    console.log('ACTUAL OUTPUT PATTERN:');
    actual.forEach((row, i) => {
        console.log(`Row ${i + 1}:`);
        console.log(`  Vehicle: "${row['details.vehiclesInvolved.type']}"`);
        console.log(`  Advisory: "${row['advisories.type']}"`);
        console.log(`  Responder: "${row['responders.agency']}"`);
        console.log(`  Personnel: "${row['responders.personnel.name']}"`);
        console.log('');
    });
} catch (error) {
    console.error('Error:', error.message);
}
