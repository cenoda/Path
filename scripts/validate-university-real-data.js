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

const MIN_CONFIDENCE = 0.5;

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

            const admissions = d.admissions || {};
            for (const [trackName, trackData] of Object.entries(admissions)) {
                if (!trackData || typeof trackData !== 'object') {
                    fail(`row ${i + 1} dept ${j + 1} track ${trackName}: admissions value must be object`);
                }

                const hasScore =
                    trackData.백분위 != null ||
                    trackData.환산컷 != null ||
                    trackData.내신 != null ||
                    trackData.내신참고 != null;

                if (!hasScore) {
                    fail(`row ${i + 1} dept ${j + 1} track ${trackName}: at least one score field is required`);
                }

                if (typeof trackData.sourceId !== 'string' || !trackData.sourceId.trim()) {
                    fail(`row ${i + 1} dept ${j + 1} track ${trackName}: sourceId is required`);
                }

                if (typeof trackData.sourceUrl !== 'string' || !trackData.sourceUrl.trim()) {
                    fail(`row ${i + 1} dept ${j + 1} track ${trackName}: sourceUrl is required`);
                }

                if (!Number.isFinite(Number(trackData.year))) {
                    fail(`row ${i + 1} dept ${j + 1} track ${trackName}: year is required`);
                }

                const confidence = Number(trackData.confidence);
                if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE || confidence > 1) {
                    fail(`row ${i + 1} dept ${j + 1} track ${trackName}: confidence must be ${MIN_CONFIDENCE}~1`);
                }
            }
        }
    }
}

console.log(`[ok] ${rows.length} universities validated: ${filePath}`);
