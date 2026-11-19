// query-lab tool: assemble the challenge's SQL template from live inputs and
// render it with token highlighting via PnpSql.tokenize (MariaDB 11.4 rules).
window.pnpTools = window.pnpTools || {};
window.pnpTools['query-lab'] = (() => {
  'use strict';

  const CAVEAT = '단순화된 모델이며 실제 서버 결과와 다를 수 있습니다.';
  const WARN_UNTERMINATED = '따옴표가 닫히지 않아 문법 오류(HTTP 500)가 납니다.';
  const NOTE_COMMENT = '주석으로 무시되는 부분이 있습니다(회색 취소선).';
  const NOTE_DASH = '`--` 뒤에 공백이 없으면 주석이 아니라 일반 코드로 취급됩니다.';

  const placeholders = (template) => [...new Set([...template.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]))];
  const assemble = (template, values) => template.replace(/\{([^{}]+)\}/g, (m, name) => values[name] ?? m);

  return {
    mount(el, ctx) {
      const template = (ctx && ctx.queryTemplate) || '';
      const values = {};

      el.classList.add('query-lab');

      const intro = document.createElement('p');
      intro.className = 'ql-intro';
      intro.textContent = '입력값이 서버의 SQL 쿼리에서 어떻게 보이는지 확인해 보세요.';

      const fields = document.createElement('div');
      fields.className = 'ql-fields';
      for (const name of placeholders(template)) {
        values[name] = '';
        const label = document.createElement('label');
        label.className = 'ql-field';
        const labelText = document.createElement('span');
        labelText.textContent = name;
        const input = document.createElement('input');
        input.type = 'text';
        input.name = name;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.addEventListener('input', () => {
          values[name] = input.value;
          render();
        });
        label.append(labelText, input);
        fields.append(label);
      }

      const sqlBox = document.createElement('pre');
      sqlBox.className = 'ql-sql';

      const warn = document.createElement('p');
      warn.className = 'ql-warn';
      warn.textContent = WARN_UNTERMINATED;
      warn.hidden = true;

      const commentNote = document.createElement('p');
      commentNote.className = 'ql-note ql-note-comment';
      commentNote.textContent = NOTE_COMMENT;
      commentNote.hidden = true;

      const dashNote = document.createElement('p');
      dashNote.className = 'ql-note ql-note-dash';
      dashNote.textContent = NOTE_DASH;
      dashNote.hidden = true;

      const caveat = document.createElement('p');
      caveat.className = 'ql-caveat';
      caveat.textContent = CAVEAT;

      el.append(intro, fields, sqlBox, warn, commentNote, dashNote, caveat);

      // Collapsed server query log (T15/W7): shared component, query kind only.
      window.PnpServerLog.mount(el, ctx, {
        kinds: ['query'],
        title: '서버가 실제로 실행한 쿼리',
        description: '쿼리 실험실은 입력을 보고 예상한 모습이고, 여기는 서버가 DB에 실제로 보낸 쿼리와 결과입니다. 풀이 힌트가 될 수 있으니 막힐 때 열어 보세요.'
      });

      function render() {
        const { tokens, unterminated } = window.PnpSql.tokenize(assemble(template, values));
        sqlBox.textContent = '';
        for (const token of tokens) {
          const span = document.createElement('span');
          span.className = `ql-${token.type}`;
          span.textContent = token.text;
          sqlBox.append(span);
        }
        warn.hidden = !unterminated;
        const comments = tokens.filter((t) => t.type === 'comment');
        commentNote.hidden = comments.length === 0;
        const hasDashComment = comments.some((t) => t.text.startsWith('--'));
        const strayDash = tokens.some((t) => t.type === 'code' && t.text.includes('--'));
        dashNote.hidden = !(strayDash && !hasDashComment);
      }

      render();
    }
  };
})();
