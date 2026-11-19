// Unit tests for new_hub/tools/inspect-lib.js (pure codec library, Node side).
const lib = require('../new_hub/tools/inspect-lib.js');
const assert = require('node:assert/strict');

(async () => {
  // ---- url encode/decode ----
  assert.equal(lib.urlEncode('a b&c=d').value, 'a%20b%26c%3Dd');
  assert.equal(lib.urlDecode('a%20b%26c%3Dd').value, 'a b&c=d');
  assert.equal(lib.urlDecode('a+b', {}).value, 'a+b');
  assert.equal(lib.urlDecode('a+b', { plusAsSpace: true }).value, 'a b');
  assert.equal(lib.doubleUrlEncode('../').value, '..%252F');
  assert.equal(lib.doubleUrlEncode('..%2f').value, '..%25252f');
  assert.equal(lib.urlDecode(lib.urlEncode('한/글?').value).value, '한/글?');

  // ---- base64 ----
  assert.equal(lib.base64Encode('hello').value, 'aGVsbG8=');
  assert.equal(lib.base64Decode('aGVsbG8=').value, 'hello');
  assert.equal(lib.base64Decode(lib.base64Encode('한글 utf-8 🎉').value).value, '한글 utf-8 🎉');
  const safe = lib.base64Encode('>>??', { urlSafe: true }).value;
  assert.equal(safe, 'Pj4_Pw');
  assert.equal(lib.base64Decode(safe, { urlSafe: true }).value, '>>??');

  // ---- hex ----
  assert.equal(lib.hexEncode('A~').value, '417e');
  assert.equal(lib.hexDecode('417e').value, 'A~');
  assert.equal(lib.hexDecode(lib.hexEncode('한글').value).value, '한글');

  // ---- html entities ----
  assert.equal(lib.htmlEntityEncode('<a href="x">&\'</a>').value, '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(lib.htmlEntityDecode('&lt;script&gt;&#65;&#x42;').value, '<script>AB');
  assert.equal(lib.htmlEntityDecode('&unknown;&lt;').value, '&unknown;<');
  assert.equal(lib.htmlEntityDecode('&nbsp;').value, ' ');

  // ---- unicode escape ----
  assert.equal(lib.unicodeEscape('A한').value, '\\u0041\\ud55c');
  assert.equal(lib.unicodeUnescape('\\u0041\\ud55c').value, 'A한');
  assert.equal(lib.unicodeUnescape(lib.unicodeEscape('🎉').value).value, '🎉');

  // ---- error results (never throw) ----
  assert.equal(lib.urlDecode('%zz').ok, false);
  assert.equal(lib.urlEncode('\uD800').ok, false); // lone surrogate must not throw
  assert.equal(lib.doubleUrlEncode('\uD800').ok, false);
  assert.equal(lib.base64Decode('!!!').ok, false);
  assert.equal(lib.base64Decode('!!!', { urlSafe: true }).ok, false);
  assert.equal(lib.hexDecode('xyz').ok, false);
  assert.equal(lib.unicodeUnescape('\\u12zz').ok, false);
  assert.equal(lib.jwtDecode('a.b').ok, false);
  assert.equal(lib.jwtDecode('x.y.z').ok, false);
  assert.equal(lib.jwtEncodeUnsigned('{bad', '{}').ok, false);
  assert.equal(lib.parseUrl('http://').ok, false);

  // ---- JWT known answer (jwt.io example) ----
  const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const decoded = lib.jwtDecode(TOKEN);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.name, 'John Doe');
  assert.equal(decoded.signature, 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  assert.equal(decoded.readable.iat, '2018-01-18T01:30:22.000Z');
  const signed = await lib.jwtSignHS256(decoded.header, decoded.payload, 'your-256-bit-secret');
  assert.equal(signed.ok, true);
  assert.equal(signed.value, TOKEN, 'recomputed HS256 signature must match');

  // ---- unsigned JWT ----
  const unsigned = lib.jwtEncodeUnsigned({ typ: 'JWT' }, { sub: '1' });
  assert.equal(unsigned.ok, true);
  assert.ok(unsigned.value.endsWith('.'));
  assert.equal(lib.jwtDecode(unsigned.value).header.alg, 'none');
  assert.equal(lib.jwtDecode(unsigned.value).signature, '');

  // ---- parseUrl ----
  const tricky = lib.parseUrl('http://localhost:10002@evil.com/');
  assert.equal(tricky.ok, true);
  assert.equal(tricky.host, 'evil.com');
  assert.equal(tricky.username, 'localhost');
  assert.ok(tricky.warnings.some((w) => w.includes('userinfo')));
  assert.ok(tricky.warnings.some((w) => w.includes('@')));
  assert.ok(lib.parseUrl('http://2130706433/').warnings.some((w) => w.includes('정수형')));
  assert.ok(lib.parseUrl('http://0x7f.1/').warnings.some((w) => w.includes('16진')));
  assert.ok(lib.parseUrl('http://[::1]/').warnings.some((w) => w.includes('IPv6')));
  assert.ok(lib.parseUrl('http://0177.1/').warnings.some((w) => w.includes('8진')), 'partial octal octets');
  assert.ok(lib.parseUrl('http://[fc00::1]/').warnings.some((w) => w.includes('사설')), 'ULA fc00::/7');
  assert.ok(lib.parseUrl('http://[fd00::1]/').warnings.some((w) => w.includes('사설')), 'ULA fd00::/8');
  assert.ok(lib.parseUrl('http://[fe80::1]/').warnings.some((w) => w.includes('사설')), 'link-local fe80::/10');
  assert.ok(!lib.parseUrl('http://fe80.example.com/').warnings.some((w) => w.includes('사설')), 'domain names are not IPv6');
  assert.ok(lib.parseUrl('http://localhost:10002/a%2fb').warnings.some((w) => w.includes('%2f')));
  const plain = lib.parseUrl('https://example.com:8443/a//b?x=1&x=2#frag');
  assert.equal(plain.port, '8443');
  assert.deepEqual(plain.query, [['x', '1'], ['x', '2']]);
  assert.equal(plain.fragment, 'frag');
  assert.ok(plain.warnings.some((w) => w.includes('//')));
  assert.ok(plain.warnings.some((w) => w.includes('비표준 포트')));

  // ---- resolvePath ----
  const trav = lib.resolvePath('/var/www/files', '../../etc/passwd');
  assert.equal(trav.ok, true);
  assert.equal(trav.escapes, true);
  assert.equal(trav.path, '/var/etc/passwd');
  const stay = lib.resolvePath('/var/www/files', 'a/../b.txt');
  assert.equal(stay.escapes, false);
  assert.equal(stay.path, '/var/www/files/b.txt');
  const enc1 = lib.resolvePath('/var/www/files', '%252e%252e%252f', { decode: 'once' });
  assert.equal(enc1.escapes, false);
  assert.equal(enc1.path, '/var/www/files/%2e%2e%2f');
  const enc2 = lib.resolvePath('/var/www/files', '%252e%252e%252f', { decode: 'twice' });
  assert.equal(enc2.escapes, true);
  assert.equal(enc2.path, '/var/www');
  const enc0 = lib.resolvePath('/var/www/files', '%2e%2e%2f');
  assert.equal(enc0.escapes, false);
  // leaving the base then re-entering still counts as escaped
  const reentry = lib.resolvePath('/var/www/files', '../../var/www/files/inside.txt');
  assert.equal(reentry.escapes, true);
  const directReentry = lib.resolvePath('/var/www/files', '../files/inside.txt');
  assert.equal(directReentry.path, '/var/www/files/inside.txt');
  assert.equal(directReentry.escapes, true, 'leaving and immediately re-entering still escapes');
  assert.equal(lib.resolvePath('/base', '%zz', { decode: 'once' }).ok, false);

  console.log('PASS inspect-lib');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
