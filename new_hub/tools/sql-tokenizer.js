// MariaDB 11.4 string/comment tokenizer (verified against the lab server).
// PnpSql.tokenize(sql) -> { tokens: [{type:'code'|'string'|'comment', text}], unterminated:boolean }
(function () {
  'use strict';

  // `--` starts a comment only when the next char is space/control or end of input.
  function isSpaceOrControl(ch) {
    return ch !== undefined && ch.charCodeAt(0) <= 32;
  }

  function tokenize(sql) {
    const tokens = [];
    const n = sql.length;
    let unterminated = false;
    let code = '';
    let i = 0;

    const flush = () => {
      if (code) {
        tokens.push({ type: 'code', text: code });
        code = '';
      }
    };

    while (i < n) {
      const ch = sql[i];

      // '...' string; '' and \' escapes; unclosed -> unterminated
      if (ch === "'") {
        flush();
        let j = i + 1;
        let closed = false;
        while (j < n) {
          const c = sql[j];
          if (c === '\\') {
            j += 2;
            continue;
          }
          if (c === "'") {
            if (sql[j + 1] === "'") {
              j += 2;
              continue;
            }
            closed = true;
            j += 1;
            break;
          }
          j += 1;
        }
        tokens.push({ type: 'string', text: sql.slice(i, j) });
        if (!closed) unterminated = true;
        i = j;
        continue;
      }

      // # -> comment to end of line
      if (ch === '#') {
        flush();
        let j = i;
        while (j < n && sql[j] !== '\n') j += 1;
        tokens.push({ type: 'comment', text: sql.slice(i, j) });
        i = j;
        continue;
      }

      // -- -> line comment only if followed by space/control/EOF, else code
      if (ch === '-' && sql[i + 1] === '-' && (i + 2 >= n || isSpaceOrControl(sql[i + 2]))) {
        flush();
        let j = i + 2;
        while (j < n && sql[j] !== '\n') j += 1;
        tokens.push({ type: 'comment', text: sql.slice(i, j) });
        i = j;
        continue;
      }

      // /* ... */ block comment; unclosed -> comment to end of input
      if (ch === '/' && sql[i + 1] === '*') {
        flush();
        const end = sql.indexOf('*/', i + 2);
        const j = end === -1 ? n : end + 2;
        tokens.push({ type: 'comment', text: sql.slice(i, j) });
        i = j;
        continue;
      }

      code += ch;
      i += 1;
    }

    flush();
    return { tokens, unterminated };
  }

  const PnpSql = { tokenize };
  if (typeof window !== 'undefined') window.PnpSql = PnpSql;
  if (typeof module !== 'undefined' && module.exports) module.exports = PnpSql;
})();
