// Magic-byte signatures for the formats we accept. The client-supplied
// MIME type from multipart headers is forgeable, so callers should validate
// the actual file bytes via `sniffMime(buffer)` before trusting the upload.
const ALLOWED_IMAGES = [
  { mime: 'image/jpeg', ext: '.jpg', altExt: '.jpeg' },
  { mime: 'image/png', ext: '.png' },
  { mime: 'image/webp', ext: '.webp' },
  { mime: 'image/gif', ext: '.gif' },
];

const MIME_TO_EXT = Object.fromEntries(ALLOWED_IMAGES.map(({ mime, ext }) => [mime, ext]));

const EXT_TO_MIME = ALLOWED_IMAGES.reduce((acc, { mime, ext, altExt }) => {
  acc[ext] = mime;
  if (altExt) acc[altExt] = mime;
  return acc;
}, {});

// `null` entries in a signature mean "don't care" (e.g. the 4-byte length
// header in a RIFF container). Buffer.from(...) cannot represent that, so
// we hand-iterate.
const SIGNATURES = [
  { mime: 'image/png', sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', sig: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', sig: [0x47, 0x49, 0x46, 0x38] },
  {
    mime: 'image/webp',
    sig: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
];

const matches = (buf, sig) => {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (sig[i] !== null && buf[i] !== sig[i]) return false;
  }
  return true;
};

/// Inspect the first bytes of a file and return the canonical MIME, or null
/// if the bytes do not match any of our accepted image formats.
const sniffMime = (buf) => {
  if (!buf || !buf.length) return null;
  for (const { mime, sig } of SIGNATURES) {
    if (matches(buf, sig)) return mime;
  }
  return null;
};

module.exports = { MIME_TO_EXT, EXT_TO_MIME, sniffMime };
