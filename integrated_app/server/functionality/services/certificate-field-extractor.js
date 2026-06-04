const crypto = require('crypto');

const MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const PATTERNS = {
  date: [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/,
    /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/,
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTHS}[.,]?\\s+\\d{2,4}\\b`, 'i'),
    new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{2,4}\\b`, 'i'),
    new RegExp(`\\b\\d{1,2}\\s+${MONTHS}\\s+\\d{2,4}\\b`, 'i')
  ],
  certificateSerial: [
    /\b(?:certificate|cert|reg(?:istration)?|roll|serial|ref|reference)\s*(?:no\.?|number|num|#|id)[\s:\-#]+([A-Z0-9][A-Z0-9\-\/]{2,30})\b/i,
    /\b(?:certificate|cert|reg(?:istration)?|roll|serial|ref|reference)\s*[:#]\s*([A-Z0-9][A-Z0-9\-\/]{2,30})\b/i,
    /\bno\.?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,30})\b/i
  ],
  recipientName: [
    /(?:awarded\s+to|presented\s+to|this\s+is\s+to\s+certify\s+that|hereby\s+certif(?:y|ies)\s+that|certif(?:y|ies)\s+that)\s+([A-Z][A-Za-z0-9\.'\-\s]{2,80}?)(?=\n|,|;|\s+(?:for\s+successfully|has\s+successfully|who\s+has|on\s+this|during))/i,
    /(?:^|\n)\s*(?:name|recipient|candidate|student|holder)\s*[:\-]\s*([A-Z][A-Za-z0-9\.'\-\s]{2,80}?)(?:\n|,|;|$)/im,
    /(?:^|\n)\s*(?:mr\.?|ms\.?|mrs\.?|dr\.?)\s+([A-Z][A-Za-z0-9\.'\-\s]{2,80}?)(?:\n|$)/im
  ],
  courseOrTitle: [
    /(?:has\s+(?:successfully\s+)?completed\s+(?:the\s+)?course\s+|for\s+(?:successfully\s+)?completing\s+(?:the\s+)?course\s+|in\s+the\s+course\s+|course\s*[:\-]\s+)([A-Z][A-Za-z0-9\.\-\&\s,'()]{2,120}?)(?=\n|\.|on\s+this|during|held\s+on)/i,
    /(?:for\s+the\s+degree\s+of\s+|degree\s+of\s+|awarded\s+the\s+degree\s+of\s+)([A-Z][A-Za-z0-9\.\-\&\s,'()]{2,120}?)(?=\n|\.|on\s+this|during|held\s+on)/i,
    /(?:in\s+recognition\s+of\s+(?:the\s+)?(?:successful\s+)?completion\s+of\s+(?:the\s+)?|for\s+completing\s+|program\s*[:\-]\s+)([A-Z][A-Za-z0-9\.\-\&\s,'()]{2,120}?)(?=\n|\.|on\s+this|during|held\s+on)/i,
    /(?:title\s*[:\-]\s+|awarded\s+for\s+)([A-Z][A-Za-z0-9\.\-\&\s,'()]{2,120}?)(?=\n|\.|$)/i
  ],
  issuerName: [
    /^([^\n]{0,80}?\b(?:University|Institute|College|School|Board|Academy|Foundation|Authority|Commission|Ministry|Department)\b[^\n]{0,40}?)$/im,
    /\b((?:University|Institute|College|School|Board|Academy|Foundation|Authority|Commission|Ministry|Department)\s+of\s+[A-Z][A-Za-z0-9\-\s]{2,40})\b/i,
    /(?:awarded\s+by|issued\s+by|signed\s+by|authorized\s+by|on\s+behalf\s+of)\s+([A-Z][A-Za-z0-9\.\-\s,&]{2,80}?)(?=\n|,|\.|;|$)/i
  ]
};

function extractFirst(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const value = (m[1] || m[0]).trim().replace(/\s+/g, ' ');
      if (value && value.length >= 3) {
        return { value, confidence: 0.8, source: 'regex' };
      }
    }
  }
  return { value: null, confidence: 0, source: 'missing' };
}

function normalizeForFingerprint(s) {
  if (!s) return '';
  return s
    .toString()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCanonicalFingerprint(payload) {
  const normalized = {};
  Object.keys(payload)
    .sort()
    .forEach((k) => {
      normalized[k] = normalizeForFingerprint(payload[k]);
    });
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function extractAllFields(rawText) {
  const text = (rawText || '').replace(/\r/g, '\n');
  return {
    issue_date: extractFirst(text, PATTERNS.date),
    certificate_serial: extractFirst(text, PATTERNS.certificateSerial),
    recipient_name: extractFirst(text, PATTERNS.recipientName),
    course_or_title: extractFirst(text, PATTERNS.courseOrTitle),
    issuer_name: extractFirst(text, PATTERNS.issuerName)
  };
}

function fieldsToCanonical(fields) {
  return {
    issue_date: fields.issue_date.value,
    certificate_serial: fields.certificate_serial.value,
    recipient_name: fields.recipient_name.value,
    course_or_title: fields.course_or_title.value,
    issuer_name: fields.issuer_name.value
  };
}

function canonicalFingerprintFromText(rawText) {
  const fields = extractAllFields(rawText);
  const canonical = fieldsToCanonical(fields);
  return { canonical, fingerprint: buildCanonicalFingerprint(canonical) };
}

function fieldMatchStatus(expected, found) {
  if (!expected && !found) return 'both_missing';
  if (!expected) return 'expected_missing';
  if (!found) return 'missing';
  const a = normalizeForFingerprint(expected);
  const b = normalizeForFingerprint(found);
  if (a === b) return 'exact';
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return 'whitespace_only';
  if (a.split(' ').filter((w) => w.length > 2).every((w) => b.includes(w))) return 'fuzzy_full';
  const aWords = new Set(a.split(' ').filter((w) => w.length > 2));
  const bWords = new Set(b.split(' ').filter((w) => w.length > 2));
  if (aWords.size > 0 && bWords.size > 0) {
    let inter = 0;
    aWords.forEach((w) => { if (bWords.has(w)) inter += 1; });
    const overlap = inter / Math.max(aWords.size, bWords.size);
    if (overlap >= 0.6) return 'fuzzy_partial';
  }
  return 'mismatch';
}

function compareFields(stored, extracted) {
  const fields = ['recipient_name', 'course_or_title', 'issue_date', 'certificate_serial', 'issuer_name'];
  const out = fields.map((f) => {
    const expected = stored?.[f] || null;
    const found = extracted?.[f] || null;
    const status = fieldMatchStatus(expected, found);
    return { field: f, expected, found, status };
  });
  const exact = out.filter((x) => x.status === 'exact' || x.status === 'whitespace_only').length;
  const fuzzy = out.filter((x) => x.status === 'fuzzy_full' || x.status === 'fuzzy_partial').length;
  const total = out.length;
  return {
    fieldComparison: out,
    matchedCount: exact,
    fuzzyCount: fuzzy,
    totalCount: total,
    matchScore: total > 0 ? Number((exact / total).toFixed(2)) : 0
  };
}

module.exports = {
  extractAllFields,
  fieldsToCanonical,
  buildCanonicalFingerprint,
  canonicalFingerprintFromText,
  fieldMatchStatus,
  compareFields,
  normalizeForFingerprint,
  PATTERNS
};
