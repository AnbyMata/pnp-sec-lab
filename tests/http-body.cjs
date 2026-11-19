// Unit tests for new_hub/tools/http-body.js (pure functions, Node side).
const lib = require('../new_hub/tools/http-body.js');
const assert = require('node:assert/strict');

// urlencoded -----------------------------------------------------------
assert.equal(lib.buildUrlencoded([['a b', 'x&y'], ['n', '1']]), 'a%20b=x%26y&n=1');
assert.equal(lib.urlencode("a'b"), 'a%27b');
assert.equal(lib.urlencode('키'), '%ED%82%A4');
assert.equal(lib.buildUrlencoded([['', 'v'], ['k', '']]), '=v&k=');

// hexToBytes -------------------------------------------------------------
assert.deepEqual([...lib.hexToBytes('474946383961')], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
assert.deepEqual([...lib.hexToBytes('ff00')], [0xff, 0x00]);
assert.equal(lib.hexToBytes('abc').length, 1); // odd nibble dropped
assert.equal(lib.hexToBytes('zz').length, 0);

// buildMultipart ---------------------------------------------------------
const boundary = 'pnp-boundary-Test.123';
const parts = [
  {
    name: 'upload', filename: '../a.php', contentType: 'image/png',
    prefixHex: '474946383961', body: '<?php echo 1;?>'
  },
  { name: 'note', body: 'plain text' },
  { name: 'bin', filename: 'x.bin', body: new Uint8Array([0, 1, 2, 255]) }
];
const bytes = lib.buildMultipart(parts, boundary);
assert.ok(bytes instanceof Uint8Array);
const raw = Buffer.from(bytes);
const text = raw.toString('latin1');

// boundary verbatim, separators + terminator
assert.ok(text.startsWith(`--${boundary}\r\n`));
assert.ok(text.endsWith(`--${boundary}--\r\n`));
assert.equal(text.split(`--${boundary}`).length - 1, parts.length + 1);

// part headers verbatim: traversal filename + spoofed Content-Type
assert.ok(text.includes(`Content-Disposition: form-data; name="upload"; filename="../a.php"\r\n`));
assert.ok(text.includes('Content-Type: image/png\r\n'));
assert.ok(text.includes('Content-Disposition: form-data; name="note"\r\n\r\nplain text\r\n'));
assert.ok(!text.includes('name="note"; filename'));

// prefix bytes precede the part body byte-for-byte (GIF89a + php source)
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const payload = Buffer.concat([gif, Buffer.from('<?php echo 1;?>', 'latin1'), Buffer.from('\r\n', 'latin1')]);
assert.notEqual(raw.indexOf(payload), -1, 'prefix bytes + body must appear contiguously');
const binSeg = Buffer.from([0, 1, 2, 255]);
assert.notEqual(raw.indexOf(binSeg), -1, 'binary part body must be byte-identical');

// round-trip check: split raw on the boundary and re-verify one part end-to-end
const segments = text.split(`--${boundary}`);
const uploadSeg = segments.find((s) => s.includes('name="upload"'));
const [head] = uploadSeg.split('\r\n\r\n');
assert.ok(head.includes('filename="../a.php"'));
assert.ok(head.includes('Content-Type: image/png'));

// validateJson -----------------------------------------------------------
assert.equal(lib.validateJson('{"a":1}').ok, true);
assert.equal(lib.validateJson('[1,2]').ok, true);
const bad = lib.validateJson('{"a":');
assert.equal(bad.ok, false);
assert.ok(bad.message.length > 0);
assert.equal(lib.validateJson('   ').ok, false);

console.log('PASS http-body');
