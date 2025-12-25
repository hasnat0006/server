import { createHash } from 'crypto';

const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]+/g;

export function sha256(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

export function normalize(text) {
  const stringValue = String(text ?? '');
  const withoutControl = stringValue.replace(CONTROL_CHAR_REGEX, '');
  const collapsedWhitespace = withoutControl.replace(/\s+/g, ' ');
  return collapsedWhitespace.trim().toLowerCase();
}

export function chunkText(text, options = {}) {
  const { sizeWords = 600, overlapWords = 120 } = options;
  const normalized = normalize(text);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ').filter(Boolean);
  const step = Math.max(sizeWords - overlapWords, 1);
  const chunks = [];

  for (let start = 0; start < words.length; start += step) {
    const chunkWords = words.slice(start, start + sizeWords);
    if (!chunkWords.length) {
      break;
    }
    chunks.push(chunkWords.join(' '));
    if (start + sizeWords >= words.length) {
      break;
    }
  }

  return chunks;
}
