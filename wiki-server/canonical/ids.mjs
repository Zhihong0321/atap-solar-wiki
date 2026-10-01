import crypto from 'node:crypto';

const PREFIXES = new Set(['CENT', 'ATTR', 'CLM', 'CLMV', 'ISS', 'DEC', 'CITE']);

/**
 * Produces a deterministic 96-bit identifier from an explicit namespace tuple.
 * Raw IDs are never shortened: the collision-prone four-character display IDs
 * in the AGY entity report are presentation only and are not migration input.
 */
export function stableCanonicalId(prefix, ...parts) {
  if (!PREFIXES.has(prefix)) throw new Error(`Unsupported canonical ID prefix: ${prefix}`);
  if (!parts.length || parts.some((part) => String(part).trim() === '')) {
    throw new Error('A stable canonical ID requires non-empty namespace parts.');
  }
  const payload = JSON.stringify(parts.map((part) => String(part).normalize('NFC')));
  const digest = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24).toUpperCase();
  return `${prefix}-${digest}`;
}
