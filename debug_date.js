const { parse, isValid, format } = require('date-fns');

const inputs = ["3/2/26", "03/02/26", "3/2/2026"];
const formats = [
    'd/M/yyyy',
    'd/M/yy',
];

console.log("Current Date:", new Date().toString());

inputs.forEach(input => {
    console.log(`\nTesting input: ${input}`);
    for (const fmt of formats) {
        const result = parse(input, fmt, new Date());
        console.log(`Format: ${fmt}`);
        console.log(`  Valid: ${isValid(result)}`);
        if (isValid(result)) {
            console.log(`  Parsed: ${format(result, 'yyyy-MM-dd')}`);
            console.log(`  Year: ${result.getFullYear()}`);
        }
    }
});
