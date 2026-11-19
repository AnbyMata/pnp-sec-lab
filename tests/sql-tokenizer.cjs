// Unit tests for new_hub/tools/sql-tokenizer.js (MariaDB 11.4 string/comment rules).
// Run: node tests/sql-tokenizer.cjs
const assert = require('node:assert/strict');
const PnpSql = require('../new_hub/tools/sql-tokenizer.js');

const TEMPLATE = "SELECT * FROM member_modern WHERE user_id='{u}' AND password='{p}'";

let count = 0;
let failures = 0;

function run(name, fn) {
  count += 1;
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(e.message.split('\n').map((l) => `     ${l}`).join('\n'));
  }
}

// T1 fixture table. comment: 'none' = no comment tokens, 'any' = at least one,
// 'block' = comment tokens exist and all are /* */ (no line comments).
const fixtures = [
  { u: 'test',          p: 'test1234', comment: 'none',  unterminated: false },
  { u: "admin'-- ",     p: 'x',        comment: 'any',   unterminated: false },
  { u: "admin'#",       p: 'x',        comment: 'any',   unterminated: false },
  { u: "admin'-- /**/", p: 'x',        comment: 'any',   unterminated: false },
  { u: "admin'/**/-- ", p: 'x',        comment: 'any',   unterminated: false },
  { u: "admin'--",      p: 'x',        comment: 'none',  unterminated: true },
  { u: "admin'--/**/",  p: 'x',        comment: 'block', unterminated: true },
  { u: "admin'--/**/x", p: 'x',        comment: 'block', unterminated: true },
  { u: "admin'/**/--",  p: 'x',        comment: 'block', unterminated: true },
];

for (const f of fixtures) {
  run(`fixture u=${JSON.stringify(f.u)} p=${JSON.stringify(f.p)}`, () => {
    const sql = TEMPLATE.replace('{u}', f.u).replace('{p}', f.p);
    const { tokens, unterminated } = PnpSql.tokenize(sql);
    const comments = tokens.filter((t) => t.type === 'comment');
    const info = `\n     sql: ${sql}\n     expected comment=${f.comment} unterminated=${f.unterminated}\n     tokens: ${JSON.stringify(tokens)}\n     unterminated: ${unterminated}`;
    assert.equal(unterminated, f.unterminated, `unterminated mismatch${info}`);
    if (f.comment === 'none') assert.equal(comments.length, 0, `expected no comment tokens${info}`);
    if (f.comment === 'any') assert.ok(comments.length > 0, `expected a comment token${info}`);
    if (f.comment === 'block') {
      assert.ok(comments.length > 0, `expected a comment token${info}`);
      assert.ok(comments.every((t) => t.text.startsWith('/*')), `expected only block comments${info}`);
    }
  });
}

run('empty input', () => {
  assert.deepEqual(PnpSql.tokenize(''), { tokens: [], unterminated: false });
});

run('doubled single quote stays inside string', () => {
  const { tokens, unterminated } = PnpSql.tokenize("'a''b' c");
  assert.equal(unterminated, false);
  assert.deepEqual(tokens.map((t) => t.type), ['string', 'code']);
  assert.equal(tokens[0].text, "'a''b'");
});

run('backslash-escaped quote stays inside string', () => {
  const { tokens, unterminated } = PnpSql.tokenize("'a\\'b' c");
  assert.equal(unterminated, false);
  assert.equal(tokens[0].type, 'string');
  assert.equal(tokens[0].text, "'a\\'b'");
});

run('unterminated string sets flag', () => {
  const r = PnpSql.tokenize("x 'abc");
  assert.equal(r.unterminated, true);
  assert.equal(r.tokens[r.tokens.length - 1].type, 'string');
});

run('# comment runs to end of line', () => {
  const r = PnpSql.tokenize('a#b\nc');
  assert.deepEqual(r.tokens.map((t) => t.type), ['code', 'comment', 'code']);
  assert.equal(r.tokens[1].text, '#b');
});

run('--x is code, not a comment', () => {
  const r = PnpSql.tokenize('--x');
  assert.deepEqual(r.tokens.map((t) => t.type), ['code']);
  assert.equal(r.tokens[0].text, '--x');
});

run('-- at end of input is a comment', () => {
  const r = PnpSql.tokenize('a --');
  const last = r.tokens[r.tokens.length - 1];
  assert.equal(last.type, 'comment');
  assert.equal(last.text, '--');
});

run('-- followed by tab is a comment', () => {
  const r = PnpSql.tokenize('a --\tb');
  assert.equal(r.tokens[r.tokens.length - 1].type, 'comment');
});

run('unclosed block comment runs to end of input', () => {
  const r = PnpSql.tokenize('a /* b');
  const last = r.tokens[r.tokens.length - 1];
  assert.equal(last.type, 'comment');
  assert.equal(last.text, '/* b');
  assert.equal(r.unterminated, false);
});

run('export shape', () => {
  assert.equal(typeof PnpSql.tokenize, 'function');
});

console.log(`${count - failures}/${count} passed`);
if (failures) {
  process.exit(1);
}
console.log('PASS sql-tokenizer');
