function normalizeDomain(raw) {
    const value = String(raw || '')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/^@+/, '')
        .replace(/[\s,;:)>\]}]+$/g, '')
        .replace(/^www\./, '');

    return value;
}

function isValidDomain(domain) {
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

function parseUniversityDomainText(rawText) {
    const lines = String(rawText || '').split(/\r?\n/);
    const entries = [];
    const invalidLines = [];
    const uniquePairs = new Set();

    lines.forEach((line, index) => {
        const lineNo = index + 1;
        const normalizedLine = String(line || '')
            .replace(/[\u00A0\u2007\u202F]/g, ' ')
            .trim();

        if (!normalizedLine || normalizedLine.startsWith('#')) return;

        const parts = normalizedLine.split(/\s+/);
        const rawDomain = parts[parts.length - 1] || '';
        const domain = normalizeDomain(rawDomain);

        if (!isValidDomain(domain)) {
            invalidLines.push({ line: lineNo, raw: line, reason: 'invalid-domain' });
            return;
        }

        const cutIndex = normalizedLine.lastIndexOf(rawDomain);
        const universityName = normalizedLine.slice(0, cutIndex).trim();

        if (!universityName) {
            invalidLines.push({ line: lineNo, raw: line, reason: 'missing-university-name' });
            return;
        }

        const pairKey = `${universityName}|${domain}`;
        if (uniquePairs.has(pairKey)) return;

        uniquePairs.add(pairKey);
        entries.push({ universityName, domain });
    });

    const uniqueDomains = new Set(entries.map((entry) => entry.domain));

    return {
        entries,
        invalidLines,
        stats: {
            totalLines: lines.length,
            validEntries: entries.length,
            uniqueDomains: uniqueDomains.size,
            invalidCount: invalidLines.length,
        },
    };
}

module.exports = {
    normalizeDomain,
    isValidDomain,
    parseUniversityDomainText,
};
