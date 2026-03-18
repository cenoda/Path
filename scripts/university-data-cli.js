const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const CATALOG_PATH = path.join(DATA_DIR, 'university-catalog.json');
const PIPELINE_PATH = path.join(DATA_DIR, 'university-pipeline.json');
const REAL_PATH = path.join(DATA_DIR, 'universities.real.json');
const TRUST_POLICY_PATH = path.join(DATA_DIR, 'university-trust-policy.json');
const REJECTS_PATH = path.join(DATA_DIR, 'university-rejects.json');
const SOURCE_MAP_DIR = path.join(DATA_DIR, 'source-maps');
const SOURCE_MANIFEST_PATH = path.join(DATA_DIR, 'source-manifest.json');
const RAW_SNAPSHOT_DIR = path.join(DATA_DIR, 'raw-snapshots');

const DEFAULT_TRUST_POLICY = {
    minConfidence: 0.75,
    requireYear: true,
    requireSourceId: true,
    requireSourceUrl: true,
    requireAtLeastOneScore: true
};

function nowIso() {
    return new Date().toISOString();
}

function toNumber(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(RAW_SNAPSHOT_DIR)) fs.mkdirSync(RAW_SNAPSHOT_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            args._.push(token);
            continue;
        }
        const pair = token.slice(2);
        const eq = pair.indexOf('=');
        if (eq >= 0) {
            args[pair.slice(0, eq)] = pair.slice(eq + 1);
            continue;
        }
        const key = pair;
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
            args[key] = next;
            i += 1;
        } else {
            args[key] = true;
        }
    }
    return args;
}

function parseCsv(content) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i += 1) {
        const ch = content[i];
        const next = content[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            row.push(cell);
            cell = '';
            continue;
        }

        if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && next === '\n') i += 1;
            row.push(cell);
            cell = '';
            if (row.some(v => v.trim() !== '')) rows.push(row);
            row = [];
            continue;
        }

        cell += ch;
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        if (row.some(v => v.trim() !== '')) rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map(cols => {
        const obj = {};
        for (let i = 0; i < headers.length; i += 1) {
            obj[headers[i]] = (cols[i] || '').trim();
        }
        return obj;
    });
}

function resolveMapValue(raw, selector) {
    if (selector == null) return null;

    if (typeof selector === 'string') {
        const v = raw[selector];
        return v == null || v === '' ? null : String(v).trim();
    }

    if (Array.isArray(selector)) {
        for (const key of selector) {
            const v = resolveMapValue(raw, key);
            if (v != null) return v;
        }
        return null;
    }

    if (typeof selector === 'object') {
        if (selector.value != null) return String(selector.value).trim();
        if (selector.from != null) return resolveMapValue(raw, selector.from);
    }

    return null;
}

function loadMapSpec(mapPath) {
    if (!mapPath) return null;
    const resolved = path.resolve(mapPath);
    if (!fs.existsSync(resolved)) {
        console.error(`[invalid] map file not found: ${resolved}`);
        process.exit(1);
    }
    const spec = readJson(resolved, null);
    if (!spec || typeof spec !== 'object' || typeof spec.fields !== 'object') {
        console.error('[invalid] map file must be json object with fields property');
        process.exit(1);
    }
    return spec;
}

function applyRowMap(raw, mapSpec) {
    if (!mapSpec) return raw;
    const out = {};

    for (const [targetKey, selector] of Object.entries(mapSpec.fields || {})) {
        const value = resolveMapValue(raw, selector);
        if (value != null && value !== '') out[targetKey] = value;
    }

    const defaults = mapSpec.defaults || {};
    for (const [key, value] of Object.entries(defaults)) {
        if (out[key] == null || out[key] === '') out[key] = value;
    }

    return out;
}

function loadRowsFromContent(content, format) {
    const fmt = (format || 'csv').toLowerCase();
    if (fmt === 'csv') {
        return parseCsv(content);
    }

    if (fmt === 'json') {
        const payload = JSON.parse(content);
        if (!Array.isArray(payload)) {
            throw new Error('json payload must be an array of rows');
        }
        return payload;
    }

    throw new Error(`unsupported format: ${format}`);
}

function timestampCompact() {
    return nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function sanitizeFileName(name) {
    return String(name || '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'source';
}

function saveRawSnapshot(sourceId, format, content) {
    const safeId = sanitizeFileName(sourceId);
    const ext = (format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
    const filePath = path.join(RAW_SNAPSHOT_DIR, `${safeId}-${timestampCompact()}.${ext}`);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

function getMapPathForArgs(mapArg) {
    if (!mapArg) return null;
    if (path.isAbsolute(mapArg)) return mapArg;
    return path.resolve(mapArg);
}

function importRowsToPipeline(pipeline, rows, options) {
    const {
        defaultSourceId,
        defaultYear,
        mapSpec,
        fallbackSourceUrl,
        replace
    } = options;

    if (!defaultSourceId) {
        throw new Error('defaultSourceId is required');
    }

    if (replace) {
        pipeline.records = pipeline.records.filter(r => {
            if (r.sourceId !== defaultSourceId) return true;
            if (defaultYear == null) return false;
            return r.year !== defaultYear;
        });
    }

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < rows.length; i += 1) {
        const raw = applyRowMap(rows[i], mapSpec);
        try {
            const rec = buildRecord(raw, defaultSourceId, defaultYear);
            if (!rec.sourceUrl && fallbackSourceUrl) rec.sourceUrl = fallbackSourceUrl;
            pipeline.records.push(rec);
            imported += 1;
        } catch (err) {
            skipped += 1;
            console.error(`[skip] row ${i + 1}: ${err.message}`);
        }
    }

    return { imported, skipped };
}

function loadCatalog() {
    return readJson(CATALOG_PATH, { updatedAt: null, universities: [] });
}

function loadPipeline() {
    return readJson(PIPELINE_PATH, {
        version: 1,
        updatedAt: null,
        sources: [],
        records: []
    });
}

function loadTrustPolicy() {
    return readJson(TRUST_POLICY_PATH, { ...DEFAULT_TRUST_POLICY });
}

function savePipeline(pipeline) {
    pipeline.updatedAt = nowIso();
    writeJson(PIPELINE_PATH, pipeline);
}

function cmdBootstrap() {
    ensureDataDir();
    const { getAllUniversities } = require('../server/data/universities');
    const universities = getAllUniversities().map(u => ({
        name: u.name,
        aliases: u.aliases || [],
        region: u.region || '',
        type: u.type || ''
    }));

    writeJson(CATALOG_PATH, { updatedAt: nowIso(), universities });

    if (!fs.existsSync(PIPELINE_PATH)) {
        savePipeline({ version: 1, updatedAt: null, sources: [], records: [] });
    }

    if (!fs.existsSync(TRUST_POLICY_PATH)) {
        writeJson(TRUST_POLICY_PATH, { ...DEFAULT_TRUST_POLICY });
    }

    console.log(`[ok] catalog bootstrap complete: ${universities.length} universities`);
    console.log(`[ok] files: ${CATALOG_PATH}, ${PIPELINE_PATH}, ${TRUST_POLICY_PATH}`);
}

function cmdAddSource(args) {
    const id = (args.id || '').trim();
    const name = (args.name || '').trim();
    const url = (args.url || '').trim();
    const license = (args.license || '').trim();

    if (!id || !name) {
        console.error('[invalid] --id and --name are required');
        process.exit(1);
    }

    const pipeline = loadPipeline();
    const idx = pipeline.sources.findIndex(s => s.id === id);
    const source = {
        id,
        name,
        url,
        license,
        active: args.active === 'false' ? false : true,
        updatedAt: nowIso()
    };

    if (idx >= 0) {
        pipeline.sources[idx] = { ...pipeline.sources[idx], ...source };
        console.log(`[ok] source updated: ${id}`);
    } else {
        pipeline.sources.push({ ...source, createdAt: nowIso() });
        console.log(`[ok] source added: ${id}`);
    }

    savePipeline(pipeline);
}

function buildRecord(raw, defaultSourceId, defaultYear) {
    const year = toNumber(raw.year) || defaultYear || null;
    const confidence = Math.max(0, Math.min(1, toNumber(raw.confidence) ?? 0.7));

    const sourceId = (raw.sourceId || defaultSourceId || '').trim();
    if (!sourceId) {
        throw new Error('sourceId is missing (row.sourceId or --source required)');
    }

    const university = (raw.university || '').trim();
    const department = (raw.department || '').trim();
    const category = (raw.category || '').trim();
    const admissionsType = (raw.admissionsType || '정시').trim();

    if (!university || !department || !category) {
        throw new Error('university, department, category are required');
    }

    return {
        university,
        department,
        category,
        admissionsType,
        track: (raw.track || '').trim() || null,
        percentile: toNumber(raw.percentile),
        convertedCut: toNumber(raw.convertedCut),
        gpaCut: toNumber(raw.gpaCut),
        year,
        sourceId,
        sourceUrl: (raw.sourceUrl || '').trim() || null,
        confidence,
        note: (raw.note || '').trim() || null,
        importedAt: nowIso()
    };
}

function cmdImportCsv(args) {
    const file = args.file ? path.resolve(args.file) : null;
    if (!file || !fs.existsSync(file)) {
        console.error('[invalid] --file path is required and must exist');
        process.exit(1);
    }

    const pipeline = loadPipeline();
    const defaultSourceId = (args.source || '').trim();
    const defaultYear = toNumber(args.year);

    if (!defaultSourceId) {
        console.error('[invalid] --source is required');
        process.exit(1);
    }

    const content = fs.readFileSync(file, 'utf8');
    const rows = parseCsv(content);
    const mapSpec = loadMapSpec(args.map);
    if (!rows.length) {
        console.error('[invalid] csv has no rows');
        process.exit(1);
    }

    const replace = args.replace === true || args.replace === 'true';
    const result = importRowsToPipeline(pipeline, rows, {
        defaultSourceId,
        defaultYear,
        mapSpec,
        fallbackSourceUrl: null,
        replace
    });

    savePipeline(pipeline);
    console.log(`[ok] imported ${result.imported}/${rows.length} rows from ${file}`);
}

function cmdSeedFromBuiltin(args) {
    const sourceId = (args.source || 'builtin-seed').trim();
    const defaultYear = toNumber(args.year) || new Date().getFullYear();
    const replace = args.replace === true || args.replace === 'true';
    const confidence = Number.isFinite(Number(args.confidence))
        ? Math.max(0, Math.min(1, Number(args.confidence)))
        : 0.86;

    if (!sourceId) {
        console.error('[invalid] --source is required');
        process.exit(1);
    }

    const { getAllUniversities, getUniversityInfo } = require('../server/data/universities');
    const universities = getAllUniversities();
    const rows = [];

    for (const uniMeta of universities) {
        const uni = getUniversityInfo(uniMeta.name);
        if (!uni || !Array.isArray(uni.departments)) continue;

        for (const dept of uni.departments) {
            const admissions = dept && typeof dept.admissions === 'object' ? dept.admissions : {};
            const entries = Object.entries(admissions);
            if (!entries.length) continue;

            for (const [admissionsType, score] of entries) {
                const s = score && typeof score === 'object' ? score : {};
                const gpaCut = toNumber(s.내신) ?? toNumber(s.내신참고);

                rows.push({
                    university: uni.name,
                    department: dept.name,
                    category: dept.category || '기타',
                    admissionsType: admissionsType || '정시',
                    percentile: toNumber(s.백분위),
                    convertedCut: toNumber(s.환산컷),
                    gpaCut,
                    track: null,
                    note: 'seeded from built-in dataset',
                    sourceUrl: `local://server/data/universities.js/${encodeURIComponent(uni.name)}`,
                    confidence,
                    year: defaultYear,
                    sourceId,
                });
            }
        }
    }

    if (!rows.length) {
        console.error('[invalid] no rows generated from built-in dataset');
        process.exit(1);
    }

    const pipeline = loadPipeline();
    const result = importRowsToPipeline(pipeline, rows, {
        defaultSourceId: sourceId,
        defaultYear,
        mapSpec: null,
        fallbackSourceUrl: null,
        replace,
    });

    savePipeline(pipeline);
    console.log(`[ok] seeded ${result.imported}/${rows.length} rows from built-in dataset (source=${sourceId}, year=${defaultYear})`);
}

async function cmdImportUrl(args) {
    const sourceUrl = (args.url || '').trim();
    const format = ((args.format || 'csv').trim() || 'csv').toLowerCase();
    const defaultSourceId = (args.source || '').trim();
    const defaultYear = toNumber(args.year);

    if (!sourceUrl) {
        console.error('[invalid] --url is required');
        process.exit(1);
    }
    if (!defaultSourceId) {
        console.error('[invalid] --source is required');
        process.exit(1);
    }
    if (format !== 'csv' && format !== 'json') {
        console.error('[invalid] --format must be csv or json');
        process.exit(1);
    }

    const mapSpec = loadMapSpec(args.map);

    const res = await fetch(sourceUrl);
    if (!res.ok) {
        console.error(`[invalid] fetch failed: ${res.status} ${res.statusText}`);
        process.exit(1);
    }

    const bodyText = await res.text();
    const rows = loadRowsFromContent(bodyText, format);
    const snapshotPath = saveRawSnapshot(defaultSourceId, format, bodyText);

    const pipeline = loadPipeline();
    const replace = args.replace === true || args.replace === 'true';
    const result = importRowsToPipeline(pipeline, rows, {
        defaultSourceId,
        defaultYear,
        mapSpec,
        fallbackSourceUrl: sourceUrl,
        replace
    });

    savePipeline(pipeline);
    console.log(`[ok] imported ${result.imported}/${rows.length} rows from url: ${sourceUrl}`);
    console.log(`[ok] raw snapshot: ${snapshotPath}`);
}

async function cmdCollect(args) {
    const manifestPath = args.manifest
        ? path.resolve(args.manifest)
        : SOURCE_MANIFEST_PATH;

    if (!fs.existsSync(manifestPath)) {
        console.error(`[invalid] manifest not found: ${manifestPath}`);
        process.exit(1);
    }

    const manifest = readJson(manifestPath, null);
    if (!manifest || !Array.isArray(manifest.sources)) {
        console.error('[invalid] manifest must include sources[]');
        process.exit(1);
    }

    const onlySource = (args.source || '').trim() || null;
    const dryRun = args.dryRun === true || args.dryRun === 'true';

    const pipeline = loadPipeline();
    let totalImported = 0;
    let totalSkipped = 0;
    let totalSources = 0;

    for (const src of manifest.sources) {
        if (!src || typeof src !== 'object') continue;
        if (src.enabled === false) continue;
        if (onlySource && src.id !== onlySource) continue;

        const id = String(src.id || '').trim();
        const url = String(src.url || '').trim();
        const format = String(src.format || 'csv').toLowerCase();
        const mapPath = src.map ? getMapPathForArgs(src.map) : null;
        const mapSpec = loadMapSpec(mapPath);
        const year = toNumber(src.year);
        const replace = src.replace === true;

        if (!id || !url) {
            console.error('[skip] source config missing id/url');
            continue;
        }

        totalSources += 1;
        console.log(`[collect] ${id} <= ${url}`);

        if (dryRun) continue;

        const res = await fetch(url);
        if (!res.ok) {
            console.error(`[skip] ${id}: fetch failed ${res.status} ${res.statusText}`);
            continue;
        }

        const bodyText = await res.text();
        let rows;
        try {
            rows = loadRowsFromContent(bodyText, format);
        } catch (err) {
            console.error(`[skip] ${id}: ${err.message}`);
            continue;
        }

        const snapshotPath = saveRawSnapshot(id, format, bodyText);
        const result = importRowsToPipeline(pipeline, rows, {
            defaultSourceId: id,
            defaultYear: year,
            mapSpec,
            fallbackSourceUrl: url,
            replace
        });

        totalImported += result.imported;
        totalSkipped += result.skipped;
        console.log(`[ok] ${id}: imported=${result.imported}, skipped=${result.skipped}, snapshot=${snapshotPath}`);
    }

    if (!dryRun) {
        savePipeline(pipeline);
    }

    console.log(`[ok] collect complete: sources=${totalSources}, imported=${totalImported}, skipped=${totalSkipped}, dryRun=${dryRun}`);
}

function evaluateTrust(rec, policy) {
    const reasons = [];
    const minConfidence = Number.isFinite(Number(policy.minConfidence)) ? Number(policy.minConfidence) : 0;
    const confidence = Number(rec.confidence || 0);

    if (policy.requireYear && !Number.isFinite(Number(rec.year))) {
        reasons.push('missing year');
    }
    if (policy.requireSourceId && !(rec.sourceId && String(rec.sourceId).trim())) {
        reasons.push('missing sourceId');
    }
    if (policy.requireSourceUrl && !(rec.sourceUrl && String(rec.sourceUrl).trim())) {
        reasons.push('missing sourceUrl');
    }
    if (policy.requireAtLeastOneScore) {
        const hasScore = rec.percentile != null || rec.convertedCut != null || rec.gpaCut != null;
        if (!hasScore) reasons.push('missing score fields');
    }
    if (confidence < minConfidence) {
        reasons.push(`confidence below threshold (${confidence} < ${minConfidence})`);
    }

    return {
        trusted: reasons.length === 0,
        reasons
    };
}

function splitTrustedRecords(records, policy) {
    const trusted = [];
    const rejected = [];

    for (const rec of records) {
        const result = evaluateTrust(rec, policy);
        if (result.trusted) trusted.push(rec);
        else rejected.push({ record: rec, reasons: result.reasons });
    }

    return { trusted, rejected };
}

function pickBetterRecord(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((b.confidence || 0) !== (a.confidence || 0)) {
        return (b.confidence || 0) > (a.confidence || 0) ? b : a;
    }
    if ((b.year || 0) !== (a.year || 0)) {
        return (b.year || 0) > (a.year || 0) ? b : a;
    }
    return b;
}

function buildAdmission(rec) {
    const out = {};
    if (rec.percentile != null) out.백분위 = rec.percentile;
    if (rec.convertedCut != null) out.환산컷 = rec.convertedCut;
    if (rec.gpaCut != null) {
        if (rec.admissionsType === '학생부종합') out.내신참고 = rec.gpaCut;
        else out.내신 = rec.gpaCut;
    }
    if (rec.track) out.track = rec.track;
    if (rec.sourceId) out.sourceId = rec.sourceId;
    if (rec.sourceUrl) out.sourceUrl = rec.sourceUrl;
    if (rec.year != null) out.year = rec.year;
    if (rec.note) out.note = rec.note;
    out.confidence = rec.confidence;
    return out;
}

function computeBasePercentile(departments) {
    const vals = [];
    for (const d of departments) {
        const jeongsi = d.admissions && d.admissions['정시'];
        if (jeongsi && Number.isFinite(Number(jeongsi.백분위))) {
            vals.push(Number(jeongsi.백분위));
        }
    }
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(avg * 100) / 100;
}

function cmdExportReal(args) {
    const pipeline = loadPipeline();
    const catalog = loadCatalog();
    const policy = loadTrustPolicy();
    const outPath = args.out ? path.resolve(args.out) : REAL_PATH;
    const allowUntrusted = args.allowUntrusted === true || args.allowUntrusted === 'true';
    const { trusted, rejected } = splitTrustedRecords(pipeline.records, policy);

    const inputRecords = allowUntrusted ? pipeline.records : trusted;

    const uniMap = new Map();

    for (const rec of inputRecords) {
        const uniName = rec.university;
        const deptName = rec.department;
        const admissionsType = rec.admissionsType || '정시';
        const key = `${uniName}::${deptName}::${admissionsType}`;

        if (!uniMap.has(uniName)) {
            const catalogUni = (catalog.universities || []).find(u => u.name === uniName);
            uniMap.set(uniName, {
                name: uniName,
                aliases: catalogUni?.aliases || [],
                region: catalogUni?.region || '',
                type: catalogUni?.type || '',
                departmentsMap: new Map(),
                bestMap: new Map()
            });
        }

        const uni = uniMap.get(uniName);
        const deptKey = `${uniName}::${deptName}`;
        if (!uni.departmentsMap.has(deptKey)) {
            uni.departmentsMap.set(deptKey, {
                name: deptName,
                category: rec.category,
                admissions: {}
            });
        }

        const best = pickBetterRecord(uni.bestMap.get(key), rec);
        uni.bestMap.set(key, best);
    }

    const patches = [];

    for (const [, uni] of uniMap) {
        for (const [key, best] of uni.bestMap.entries()) {
            const parts = key.split('::');
            const deptKey = `${parts[0]}::${parts[1]}`;
            const dept = uni.departmentsMap.get(deptKey);
            dept.admissions[best.admissionsType] = buildAdmission(best);
        }

        const departments = Array.from(uni.departmentsMap.values());
        if (!departments.length) continue;

        const basePercentile = computeBasePercentile(departments);
        patches.push({
            name: uni.name,
            aliases: uni.aliases,
            region: uni.region,
            type: uni.type,
            basePercentile,
            departments
        });
    }

    const payload = {
        updatedAt: nowIso().slice(0, 10),
        source: 'pipeline export',
        notes: allowUntrusted
            ? 'Generated by scripts/university-data-cli.js (includes untrusted records)'
            : 'Generated by scripts/university-data-cli.js (trusted only)',
        patches
    };

    writeJson(outPath, payload);
    writeJson(REJECTS_PATH, {
        updatedAt: nowIso(),
        policy,
        totalRejected: rejected.length,
        rejects: rejected
    });

    console.log(`[ok] exported ${patches.length} universities to ${outPath}`);
    if (!allowUntrusted) {
        console.log(`[ok] trusted records: ${trusted.length}, rejected: ${rejected.length}`);
        console.log(`[ok] rejects report: ${REJECTS_PATH}`);
    }
}

function cmdQualityReport() {
    const pipeline = loadPipeline();
    const policy = loadTrustPolicy();
    const split = splitTrustedRecords(pipeline.records, policy);
    const report = {
        totalSources: pipeline.sources.length,
        totalRecords: pipeline.records.length,
        trustedRecords: split.trusted.length,
        rejectedRecords: split.rejected.length,
        trustPolicy: policy,
        missingPercentile: 0,
        missingSourceUrl: 0,
        missingYear: 0,
        bySource: {}
    };

    for (const r of pipeline.records) {
        if (r.percentile == null) report.missingPercentile += 1;
        if (!r.sourceUrl) report.missingSourceUrl += 1;
        if (r.year == null) report.missingYear += 1;

        if (!report.bySource[r.sourceId]) {
            report.bySource[r.sourceId] = { count: 0, avgConfidence: 0 };
        }
        report.bySource[r.sourceId].count += 1;
        report.bySource[r.sourceId].avgConfidence += Number(r.confidence || 0);
    }

    for (const key of Object.keys(report.bySource)) {
        const item = report.bySource[key];
        item.avgConfidence = item.count
            ? Math.round((item.avgConfidence / item.count) * 1000) / 1000
            : 0;
    }

    console.log(JSON.stringify(report, null, 2));
}

function cmdSetTrustPolicy(args) {
    const current = loadTrustPolicy();
    const next = {
        ...current,
        minConfidence: args.minConfidence != null ? Number(args.minConfidence) : current.minConfidence,
        requireYear: args.requireYear != null ? String(args.requireYear) !== 'false' : current.requireYear,
        requireSourceId: args.requireSourceId != null ? String(args.requireSourceId) !== 'false' : current.requireSourceId,
        requireSourceUrl: args.requireSourceUrl != null ? String(args.requireSourceUrl) !== 'false' : current.requireSourceUrl,
        requireAtLeastOneScore: args.requireAtLeastOneScore != null
            ? String(args.requireAtLeastOneScore) !== 'false'
            : current.requireAtLeastOneScore
    };

    if (!Number.isFinite(next.minConfidence) || next.minConfidence < 0 || next.minConfidence > 1) {
        console.error('[invalid] --minConfidence must be 0~1');
        process.exit(1);
    }

    writeJson(TRUST_POLICY_PATH, next);
    console.log(`[ok] trust policy updated: ${TRUST_POLICY_PATH}`);
}

function printHelp() {
    console.log([
        'University Data CLI',
        '',
        'Commands:',
        '  bootstrap',
        '    - create catalog from current university dataset',
        '',
        '  add-source --id <id> --name <name> [--url <url>] [--license <text>] [--active true|false]',
        '',
        '  import-csv --file <csv> --source <id> [--year 2026] [--replace true]',
        '    optional: --map <json map file>',
        '    CSV columns: university,department,category,admissionsType,percentile,convertedCut,gpaCut,track,note,sourceUrl,confidence,year,sourceId',
        '',
        '  seed-from-builtin [--source builtin-seed] [--year 2026] [--replace true] [--confidence 0.86]',
        '    URL 없이 내장 universities 데이터로 pipeline 레코드 초기 시드 생성',
        '',
        '  import-url --url <http(s)> --source <id> [--format csv|json] [--year 2026] [--replace true] [--map <json map file>]',
        '    map samples: server/data/source-maps/*.json',
        '',
        '  collect [--manifest server/data/source-manifest.json] [--source <id>] [--dryRun true|false]',
        '    batch fetch + snapshot + import from sources[]',
        '',
        '  set-trust-policy [--minConfidence 0.75] [--requireYear true|false] [--requireSourceId true|false] [--requireSourceUrl true|false] [--requireAtLeastOneScore true|false]',
        '',
        '  quality-report',
        '',
        '  export-real [--out server/data/universities.real.json] [--allowUntrusted true|false]',
        ''
    ].join('\n'));
}

async function main() {
    ensureDataDir();

    const args = parseArgs(process.argv.slice(2));
    const command = args._[0];

    if (!command || command === 'help' || command === '--help') {
        printHelp();
        return;
    }

    if (command === 'bootstrap') return cmdBootstrap();
    if (command === 'add-source') return cmdAddSource(args);
    if (command === 'import-csv') return cmdImportCsv(args);
    if (command === 'seed-from-builtin') return cmdSeedFromBuiltin(args);
    if (command === 'import-url') return cmdImportUrl(args);
    if (command === 'collect') return cmdCollect(args);
    if (command === 'set-trust-policy') return cmdSetTrustPolicy(args);
    if (command === 'quality-report') return cmdQualityReport();
    if (command === 'export-real') return cmdExportReal(args);

    console.error(`[invalid] unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

main().catch(err => {
    console.error(`[invalid] ${err.message}`);
    process.exit(1);
});
