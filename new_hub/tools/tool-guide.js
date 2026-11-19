// tool-guide tool: a per-challenge map of which tools to use and when.
// Reads ctx.toolGuide = { summary, steps: [{tool, label, when, how}] } and
// renders with DOM APIs/textContent only — no answers or payloads live here.
window.pnpTools = window.pnpTools || {};
window.pnpTools['tool-guide'] = (() => {
  'use strict';

  const TOOL_NAMES = {
    'query-lab': '쿼리 실험실',
    'query-log': '서버 쿼리 로그',
    'request-workbench': '요청 워크벤치',
    inspector: '인스펙터',
    'server-log': '서버 로그',
    'exploit-server': '공격자 서버',
    terminal: '터미널',
    browser: '실습 사이트'
  };
  const BADGE_CLASS = { '필수': 'tg-req', '권장': 'tg-rec', '선택': 'tg-opt' };

  return {
    mount(el, ctx) {
      el.classList.add('tool-guide');
      const guide = ctx && ctx.toolGuide;

      if (guide && guide.summary) {
        const summary = document.createElement('p');
        summary.className = 'tg-summary';
        summary.textContent = guide.summary;
        el.append(summary);
      }

      const steps = guide && Array.isArray(guide.steps) ? guide.steps : [];
      if (!steps.length) {
        const empty = document.createElement('p');
        empty.className = 'tg-empty';
        empty.textContent = '이 챌린지에는 별도의 도구 안내가 없습니다.';
        el.append(empty);
        return;
      }

      const list = document.createElement('ol');
      list.className = 'tg-steps';
      for (const step of steps) {
        const item = document.createElement('li');
        item.className = 'tg-step';

        const head = document.createElement('div');
        head.className = 'tg-head';
        const name = document.createElement('span');
        name.className = 'tg-tool';
        name.textContent = TOOL_NAMES[step.tool] || step.tool;
        const badge = document.createElement('span');
        badge.className = `tg-badge ${BADGE_CLASS[step.label] || 'tg-opt'}`;
        badge.textContent = step.label;
        head.append(name, badge);

        const when = document.createElement('p');
        when.className = 'tg-line';
        const whenLabel = document.createElement('span');
        whenLabel.className = 'tg-label';
        whenLabel.textContent = '언제';
        const whenText = document.createElement('span');
        whenText.textContent = step.when;
        when.append(whenLabel, whenText);

        const how = document.createElement('p');
        how.className = 'tg-line';
        const howLabel = document.createElement('span');
        howLabel.className = 'tg-label';
        howLabel.textContent = '어떻게';
        const howText = document.createElement('span');
        howText.textContent = step.how;
        how.append(howLabel, howText);

        item.append(head, when, how);
        list.append(item);
      }
      el.append(list);
    }
  };
})();
