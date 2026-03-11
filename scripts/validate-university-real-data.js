const fs = require('fs');
const path = require('path');

const filePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'server', 'data', 'universities.real.json');

function fail(message) {
    console.error(`[invalid] ${message}`);
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    fail(`file not found: ${filePath}`);
}

let payload;
try {
    payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
    fail(`json parse error: ${err.message}`);
}

if (!payload || typeof payload !== 'object') {
    fail('root must be an object');
}

const hasUniversities = Array.isArray(payload.universities);
const hasPatches = Array.isArray(payload.patches);

if (!hasUniversities && !hasPatches) {
    fail('root must include universities[] or patches[]');
}

if (hasUniversities && hasPatches) {
    fail('use either universities[] or patches[], not both');
}

const rows = hasUniversities ? payload.universities : payload.patches;
if (rows.length === 0) {
    fail('universities/patches must not be empty');
}

const nameSet = new Set();
for (let i = 0; i < rows.length; i += 1) {
    const u = rows[i];
    if (!u || typeof u !== 'object') fail(`row ${i + 1}: must be object`);
    if (typeof u.name !== 'string' || !u.name.trim()) fail(`row ${i + 1}: name is required`);

    if (nameSet.has(u.name)) fail(`duplicate university name: ${u.name}`);
    nameSet.add(u.name);

    if (u.basePercentile != null && !Number.isFinite(Number(u.basePercentile))) {
        fail(`row ${i + 1}: basePercentile must be number`);
    }

    if (u.departments != null) {
        if (!Array.isArray(u.departments)) fail(`row ${i + 1}: departments must be array`);
        for (let j = 0; j < u.departments.length; j += 1) {
            const d = u.departments[j];
            if (!d || typeof d !== 'object') fail(`row ${i + 1} dept ${j + 1}: must be object`);
            if (typeof d.name !== 'string' || !d.name.trim()) fail(`row ${i + 1} dept ${j + 1}: name is required`);
            if (typeof d.category !== 'string' || !d.category.trim()) fail(`row ${i + 1} dept ${j + 1}: category is required`);
        }
    }
}

console.log(`[ok] ${rows.length} universities validated: ${filePath}`);
