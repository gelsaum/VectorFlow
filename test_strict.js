const { parse, isValid, format } = require('date-fns');

const inputs = ["03/02/26", "01/01/26", "25/12/26"];
const formats = ['d/M/yyyy', 'd/M/yy'];

console.log("--- Testing Fix Logic ---");
inputs.forEach(input => {
    console.log(`\nInput: ${input}`);
    for (const fmt of formats) {
        const d = parse(input, fmt, new Date());
        if (isValid(d)) {
            // FIX LOGIC:
            if (d.getFullYear() < 1900) {
                console.log(`  Fmt ${fmt}: Parsed as ${format(d, 'yyyy-MM-dd')} -> IGNORED (< 1900)`);
                continue;
            }
            console.log(`  Fmt ${fmt}: Parsed as ${format(d, 'yyyy-MM-dd')} -> ACCEPTED`);
            break; // Simulate finding the first valid one
        }
    }
});
