// PnpServerLog (W7): shared collapsible server-event log. Moved from
// query-lab.js (T15) so both the query-lab panel and the standalone
// server-log tool render the same UI. DOM API + textContent only.
window.PnpServerLog = (() => {
  'use strict';

  const KIND_BADGE = { file: '파일 열기', 'http-out': '서버가 보낸 요청' };

  const relativeTime = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff) || diff < 5000) return '방금 전';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  return {
    // options: { kinds, title, description, emptyText }
    // kinds resolution: options.kinds -> ctx.logKinds -> all kinds.
    // paths resolution: ctx.logPaths array -> filter, otherwise no filter.
    mount(el, ctx, options) {
      const opts = options || {};
      const kinds = Array.isArray(opts.kinds) ? opts.kinds
        : (ctx && Array.isArray(ctx.logKinds) ? ctx.logKinds : null);
      const queryOnly = !!(kinds && kinds.length === 1 && kinds[0] === 'query');
      const title = opts.title || (queryOnly ? '서버가 실제로 실행한 쿼리' : '서버에서 일어난 일');
      const description = opts.description || '실습 서버가 실제로 기록한 쿼리·파일 접근·외부 요청 이벤트입니다.';
      const emptyText = opts.emptyText || (queryOnly
        ? '이 챌린지와 관련된 쿼리가 아직 없습니다. 사이트에서 먼저 시도해 보세요.'
        : '기록된 서버 이벤트가 아직 없습니다. 실습 사이트에서 먼저 작업해 보세요.');
      const logPaths = Array.isArray(ctx && ctx.logPaths) ? ctx.logPaths : [];

      const logSection = document.createElement('div');
      logSection.className = 'ql-log';
      const logHead = document.createElement('div');
      logHead.className = 'ql-log-head';
      const logTitle = document.createElement('span');
      logTitle.textContent = title;
      const logControls = document.createElement('div');
      logControls.className = 'ql-log-controls';
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'ql-log-btn ql-log-toggle';
      toggleBtn.textContent = '열기';
      toggleBtn.setAttribute('aria-expanded', 'false');
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'ql-log-btn ql-log-refresh';
      refreshBtn.textContent = '새로고침';
      const autoBtn = document.createElement('button');
      autoBtn.type = 'button';
      autoBtn.className = 'ql-log-btn ql-log-auto';
      autoBtn.textContent = '자동 갱신';
      autoBtn.setAttribute('aria-pressed', 'false');
      logControls.append(toggleBtn, refreshBtn, autoBtn);
      logHead.append(logTitle, logControls);
      const logDesc = document.createElement('p');
      logDesc.className = 'ql-log-desc';
      logDesc.textContent = description;
      const logBody = document.createElement('div');
      logBody.className = 'ql-log-body';
      logBody.hidden = true;
      logSection.append(logHead, logDesc, logBody);
      el.append(logSection);

      let logOpen = false;
      let logLimit = 5;
      let autoOn = false;
      let autoTimer = null;

      const cardHead = (when, ...badges) => {
        const head = document.createElement('div');
        head.className = 'ql-log-card-head';
        head.append(when, ...badges);
        return head;
      };
      const timeBadge = (entry) => {
        const when = document.createElement('span');
        when.className = 'ql-log-time';
        const iso = entry.time || entry.ts;
        when.textContent = relativeTime(iso);
        const local = new Date(iso);
        if (!Number.isNaN(local.getTime())) when.title = local.toLocaleString();
        return when;
      };

      const renderQueryCard = (entry) => {
        const card = document.createElement('div');
        card.className = 'ql-log-card';
        const badge = document.createElement('span');
        if (entry.error) {
          badge.className = 'ql-log-badge ql-log-badge-err';
          badge.textContent = '오류';
        } else {
          badge.className = 'ql-log-badge';
          badge.textContent = `${entry.rows ?? 0}행`;
        }
        const sql = document.createElement('div');
        sql.className = 'ql-sql ql-log-sql';
        for (const token of window.PnpSql.tokenize(entry.sql).tokens) {
          const span = document.createElement('span');
          span.className = `ql-${token.type}`;
          span.textContent = token.text;
          sql.append(span);
        }
        card.append(cardHead(timeBadge(entry), badge), sql);
        if (entry.error) {
          const details = document.createElement('details');
          details.className = 'ql-log-err';
          const summary = document.createElement('summary');
          summary.textContent = '자세히';
          const errText = document.createElement('pre');
          errText.textContent = entry.error;
          details.append(summary, errText);
          card.append(details);
        }
        return card;
      };

      const renderEventCard = (entry) => {
        const card = document.createElement('div');
        card.className = 'ql-log-card';
        const kindBadge = document.createElement('span');
        kindBadge.className = 'ql-log-badge ql-log-kind';
        kindBadge.textContent = KIND_BADGE[entry.kind] || entry.kind;
        const note = entry.note || (entry.ok === false ? '오류' : 'ok');
        const longNote = note.length > 40;
        const resultBadge = document.createElement('span');
        resultBadge.className = entry.ok === false ? 'ql-log-badge ql-log-badge-err' : 'ql-log-badge';
        resultBadge.textContent = longNote ? (entry.ok === false ? '오류' : 'ok') : note;
        const head = document.createElement('div');
        head.className = 'ql-log-card-head';
        const left = document.createElement('span');
        left.className = 'ql-log-head-left';
        left.append(timeBadge(entry), kindBadge);
        head.append(left, resultBadge);
        const detail = document.createElement('div');
        detail.className = 'ql-log-detail';
        detail.textContent = entry.detail || '';
        card.append(head, detail);
        if (longNote) {
          const details = document.createElement('details');
          details.className = 'ql-log-err';
          const summary = document.createElement('summary');
          summary.textContent = '자세히';
          const noteText = document.createElement('pre');
          noteText.textContent = note;
          details.append(summary, noteText);
          card.append(details);
        }
        return card;
      };

      const renderEntries = (entries, total) => {
        logBody.textContent = '';
        if (!entries.length) {
          const empty = document.createElement('p');
          empty.className = 'ql-log-empty';
          empty.textContent = emptyText;
          logBody.append(empty);
          return;
        }
        for (const entry of entries) {
          logBody.append(entry.sql !== undefined ? renderQueryCard(entry) : renderEventCard(entry));
        }
        if (total > entries.length) {
          const foot = document.createElement('div');
          foot.className = 'ql-log-foot';
          const totalText = document.createElement('span');
          totalText.textContent = `총 ${total}건 중 ${entries.length}건 표시`;
          foot.append(totalText);
          if (logLimit < 20) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'ql-log-btn ql-log-more';
            more.textContent = '더 보기';
            more.addEventListener('click', () => { logLimit = 20; loadLog(); });
            foot.append(more);
          }
          logBody.append(foot);
        }
      };

      async function loadLog() {
        if (!logOpen) return;
        refreshBtn.setAttribute('aria-busy', 'true');
        try {
          const params = new URLSearchParams();
          if (logPaths.length) params.set('paths', logPaths.join(','));
          params.set('limit', String(logLimit));
          if (kinds && kinds.length) params.set('kinds', kinds.join(','));
          const response = await fetch(`/api/lab/querylog?${params}`);
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            const entries = Array.isArray(data.entries) ? data.entries : [];
            renderEntries(entries, Number.isInteger(data.total) ? data.total : entries.length);
          } else {
            logBody.textContent = `로그를 불러오지 못했습니다(HTTP ${response.status}).`;
          }
        } catch {
          logBody.textContent = '로그 서버에 연결하지 못했습니다.';
        }
        refreshBtn.removeAttribute('aria-busy');
      }

      const stopAuto = () => {
        if (autoTimer !== null) { clearInterval(autoTimer); autoTimer = null; }
      };
      // The interval exists only while the log is open, this tool tab is
      // visible, and the browser tab is visible — it is fully cleared the
      // moment the section collapses or the tab hides, and restarted on return.
      const syncAuto = () => {
        stopAuto();
        if (autoOn && logOpen && !document.hidden && !el.hidden) {
          autoTimer = setInterval(loadLog, 2000);
        }
      };
      new MutationObserver(syncAuto).observe(el, { attributes: true, attributeFilter: ['hidden'] });
      document.addEventListener('visibilitychange', syncAuto);

      toggleBtn.addEventListener('click', () => {
        logOpen = !logOpen;
        toggleBtn.textContent = logOpen ? '접기' : '열기';
        toggleBtn.setAttribute('aria-expanded', String(logOpen));
        logBody.hidden = !logOpen;
        if (logOpen) loadLog();
        syncAuto();
      });
      refreshBtn.addEventListener('click', loadLog);
      autoBtn.addEventListener('click', () => {
        autoOn = !autoOn;
        autoBtn.setAttribute('aria-pressed', String(autoOn));
        syncAuto();
      });
    }
  };
})();

// The standalone tool tab mounts the same component with default resolution.
window.pnpTools = window.pnpTools || {};
window.pnpTools['server-log'] = {
  mount(el, ctx) {
    window.PnpServerLog.mount(el, ctx);
  }
};
