// terminal tool: run commands in the isolated lab shell via POST /api/shell.
window.pnpTools = window.pnpTools || {};
window.pnpTools['terminal'] = (() => {
  'use strict';

  // Example chips: a health probe and a cookie-jar login flow against the
  // Python lab (/home/student is a fresh tmpfs each restart).
  const CHIPS = [
    'curl -s http://localhost:10002/health',
    'curl -s -c jar -X POST http://localhost:10002/login --data-urlencode "user_id=test" --data-urlencode "password=test1234"',
    'curl -s -b jar http://localhost:10002/admin'
  ];

  return {
    mount(el, ctx) {
      el.classList.add('terminal');
      // Per-challenge chips from challenge-data (normal requests only);
      // fall back to the generic examples when the challenge declares none.
      const chips = ctx && Array.isArray(ctx.terminalChips) && ctx.terminalChips.length ? ctx.terminalChips : CHIPS;

      const intro = document.createElement('p');
      intro.className = 'term-intro';
      intro.textContent = '격리된 실습 셸입니다. localhost:1000x 주소는 셸 안에서 실습 컨테이너 주소로 자동 변환됩니다. 값에 공백이나 따옴표 같은 특수문자가 들어갈 때는 --data-urlencode로 인코딩해서 보내면 안전합니다.';

      const chipRow = document.createElement('div');
      chipRow.className = 'term-chips';

      const form = document.createElement('form');
      form.className = 'term-form';
      const prompt = document.createElement('span');
      prompt.className = 'term-prompt';
      prompt.textContent = '$';
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'command';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', '실행할 명령');
      const runButton = document.createElement('button');
      runButton.type = 'submit';
      runButton.textContent = '실행';
      form.append(prompt, input, runButton);

      const output = document.createElement('pre');
      output.className = 'term-output';
      output.setAttribute('aria-live', 'polite');

      el.append(intro, chipRow, form, output);

      for (const command of chips) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'term-chip';
        chip.textContent = command;
        chip.addEventListener('click', () => {
          input.value = command;
          input.focus();
        });
        chipRow.append(chip);
      }

      const history = [];
      let historyIndex = -1;
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' || history.length === 0) return;
        event.preventDefault();
        historyIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const command = input.value.trim();
        if (!command) return;
        runButton.disabled = true;
        input.disabled = true;
        let text;
        try {
          const response = await fetch('/api/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
          });
          const data = await response.json().catch(() => ({}));
          text = response.ok ? (data.output ?? '') : `오류: ${data.error || `HTTP ${response.status}`}`;
        } catch {
          text = 'shell 서비스에 연결하지 못했습니다. 실습 환경이 실행 중인지 확인해 주세요.';
        }
        history.push(command);
        historyIndex = -1;
        input.value = '';
        const block = `$ ${command}\n${text || '(출력 없음)'}`;
        output.textContent = output.textContent ? `${output.textContent}\n\n${block}` : block;
        output.scrollTop = output.scrollHeight;
        runButton.disabled = false;
        input.disabled = false;
        input.focus();
      });
    }
  };
})();
