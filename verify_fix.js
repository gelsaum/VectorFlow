const { parse, isValid, format } = require('date-fns');

function parseWithFix(dateInput) {
    const formats = [
        'd/M/yyyy',
        'd/M/yy',
        'd-M-yyyy',
        'd-M-yy',
        'd.M.yyyy',
        'd.M.yy'
    ];

    for (const fmt of formats) {
        const attempt = parse(dateInput, fmt, new Date());
        // Verify the fix logic
        if (isValid(attempt) && attempt.getFullYear() > 1900) {
            return attempt;
        }
    }
    return null;
}

const inputs = ["3/2/26", "03/02/26", "25/12/2025"];

inputs.forEach(input => {
    const res = parseWithFix(input);
    if (res) {
        console.log(`Input: ${input} -> Parsed: ${format(res, 'yyyy-MM-dd')} (Year: ${res.getFullYear()})`);
    } else {
        console.log(`Input: ${input} -> Failed (as expected if invalid, but these should pass)`);
    }
});
