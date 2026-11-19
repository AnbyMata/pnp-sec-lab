// Pure request-body helpers shared by the request workbench UI (browser) and
// unit tests (Node). Byte-level assembly only — no FormData, DOM, or fetch.
(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.PnpHttpBody = lib;
})(typeof self !== 'undefined' ? self : globalThis, () => {
  'use strict';

  const te = new TextEncoder();
  const enc = (s) => te.encode(String(s));

  const urlencode = (s) =>
    encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  const buildUrlencoded = (pairs) =>
    (pairs || []).map(([k, v]) => `${urlencode(k ?? '')}=${urlencode(v ?? '')}`).join('&');

  // Strict-ish hex parse: strips whitespace/non-hex noise; odd trailing nibble
  // is dropped. Returns Uint8Array.
  const hexToBytes = (hex) => {
    const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
    const even = clean.length - (clean.length % 2);
    const out = new Uint8Array(even / 2);
    for (let i = 0; i < even; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    return out;
  };

  const toBytes = (body) => (body instanceof Uint8Array ? body : enc(body ?? ''));

  // Assembles multipart/form-data bytes manually. Part fields are emitted
  // verbatim — filename, contentType and boundary are never normalized.
  // part: {name, filename?, contentType?, prefixHex?, body: string|Uint8Array}
  const buildMultipart = (parts, boundary) => {
    const chunks = [];
    for (const part of parts || []) {
      let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name ?? ''}"`;
      if (part.filename !== undefined && part.filename !== null && part.filename !== '') {
        head += `; filename="${part.filename}"`;
      }
      head += '\r\n';
      if (part.contentType) head += `Content-Type: ${part.contentType}\r\n`;
      head += '\r\n';
      chunks.push(enc(head));
      const prefix = hexToBytes(part.prefixHex);
      if (prefix.length) chunks.push(prefix);
      chunks.push(toBytes(part.body));
      chunks.push(enc('\r\n'));
    }
    chunks.push(enc(`--${boundary}--\r\n`));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  };

  const validateJson = (text) => {
    if (!String(text).trim()) return { ok: false, message: '본문이 비어 있습니다.' };
    try {
      JSON.parse(text);
      return { ok: true, message: '' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  return { enc, urlencode, buildUrlencoded, hexToBytes, toBytes, buildMultipart, validateJson };
});
