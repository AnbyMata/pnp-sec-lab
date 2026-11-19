// inspector tool (W5): local-only codec/JWT/URL/path inspector built on
// window.PnpInspect (inspect-lib.js). Zero network requests — secrets,
// tokens and inputs never leave the browser. DOM API + textContent only.
window.pnpTools = window.pnpTools || {};
window.pnpTools['inspector'] = (() => {
  'use strict';

  const CONVERT_OPS = [
    ['url-encode', 'URL 인코딩'],
    ['url-decode', 'URL 디코딩'],
    ['url-decode-plus', 'URL 디코딩 (+ → 공백)'],
    ['double-url-encode', '이중 URL 인코딩'],
    ['b64-encode', 'Base64 인코딩'],
    ['b64-decode', 'Base64 디코딩'],
    ['b64url-encode', 'URL-safe Base64 인코딩'],
    ['b64url-decode', 'URL-safe Base64 디코딩'],
    ['hex-encode', 'Hex 인코딩'],
    ['hex-decode', 'Hex 디코딩'],
    ['html-encode', 'HTML 엔티티 인코딩'],
    ['html-decode', 'HTML 엔티티 디코딩'],
    ['uni-escape', '유니코드 이스케이프 (\\uXXXX)'],
    ['uni-unescape', '유니코드 이스케이프 해제']
  ];

  const runConvert = (op, input) => {
    const L = window.PnpInspect;
    switch (op) {
      case 'url-encode': return L.urlEncode(input);
      case 'url-decode': return L.urlDecode(input);
      case 'url-decode-plus': return L.urlDecode(input, { plusAsSpace: true });
      case 'double-url-encode': return L.doubleUrlEncode(input);
      case 'b64-encode': return L.base64Encode(input);
      case 'b64-decode': return L.base64Decode(input);
      case 'b64url-encode': return L.base64Encode(input, { urlSafe: true });
      case 'b64url-decode': return L.base64Decode(input, { urlSafe: true });
      case 'hex-encode': return L.hexEncode(input);
      case 'hex-decode': return L.hexDecode(input);
      case 'html-encode': return L.htmlEntityEncode(input);
      case 'html-decode': return L.htmlEntityDecode(input);
      case 'uni-escape': return L.unicodeEscape(input);
      case 'uni-unescape': return L.unicodeUnescape(input);
      default: return { ok: false, error: '알 수 없는 변환입니다.' };
    }
  };

  return {
    mount(el, ctx) {
      el.classList.add('inspector');
      const L = window.PnpInspect;
      const defaults = (ctx && ctx.inspectorDefaults) || {};
      const $ = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
      };

      if (!L) {
        el.append($('p', 'in-err', 'inspect-lib.js가 로드되지 않았습니다.'));
        return;
      }

      const tabs = [
        ['convert', '변환'],
        ['jwt', 'JWT'],
        ['url', 'URL 분해'],
        ['path', '경로 해석']
      ];
      const tabBar = $('div', 'in-tabs');
      tabBar.setAttribute('role', 'tablist');
      const panelWrap = $('div', 'in-panels');
      const panels = {};
      tabs.forEach(([id, label], idx) => {
        const btn = $('button', 'in-tab', label);
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.dataset.inTab = id;
        btn.setAttribute('aria-selected', String(idx === 0));
        const panel = $('div', 'in-panel');
        panel.dataset.inPanel = id;
        panel.setAttribute('role', 'tabpanel');
        if (idx !== 0) panel.hidden = true;
        panels[id] = panel;
        btn.addEventListener('click', () => {
          for (const b of tabBar.children) b.setAttribute('aria-selected', String(b === btn));
          for (const p of panelWrap.children) p.hidden = p !== panel;
        });
        tabBar.append(btn);
        panelWrap.append(panel);
      });
      el.append(tabBar, panelWrap);

      const copyBtn = (srcEl, statusEl) => {
        const btn = $('button', 'wb-curl', '복사');
        btn.type = 'button';
        btn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(srcEl.value);
            if (statusEl) statusEl.textContent = '복사했습니다.';
          } catch {
            if (statusEl) statusEl.textContent = '복사 실패 — 결과를 직접 선택해 복사해 주세요.';
            srcEl.focus();
            srcEl.select();
          }
        });
        return btn;
      };

      // ---------- 1. 변환 ----------
      {
        const panel = panels.convert;
        const inLabel = $('label', 'wb-label', '입력');
        const input = $('textarea', 'in-input');
        input.rows = 4;
        input.spellcheck = false;
        inLabel.append(input);
        const row = $('div', 'wb-editor');
        const opSel = $('select', 'wb-method');
        opSel.setAttribute('aria-label', '변환 종류');
        for (const [value, label] of CONVERT_OPS) {
          const o = document.createElement('option');
          o.value = value;
          o.textContent = label;
          opSel.append(o);
        }
        const run = $('button', 'wb-send', '변환');
        run.type = 'button';
        row.append(opSel, run);
        const outLabel = $('label', 'wb-label', '결과');
        const out = $('textarea', 'in-result');
        out.readOnly = true;
        out.rows = 4;
        out.spellcheck = false;
        outLabel.append(out);
        const err = $('p', 'in-err');
        const copy = copyBtn(out, null);
        panel.append(inLabel, row, outLabel, copy, err);
        run.addEventListener('click', () => {
          const r = runConvert(opSel.value, input.value);
          if (r.ok) { out.value = r.value; err.textContent = ''; }
          else { err.textContent = r.error; }
        });
      }

      // ---------- 2. JWT ----------
      {
        const panel = panels.jwt;
        const tokLabel = $('label', 'wb-label', 'JWT 토큰');
        const tokIn = $('textarea', 'in-jwt-in');
        tokIn.rows = 3;
        tokIn.spellcheck = false;
        tokIn.placeholder = 'header.payload.signature';
        tokLabel.append(tokIn);
        const decodeBtn = $('button', 'wb-send', '디코딩');
        decodeBtn.type = 'button';
        const headLabel = $('label', 'wb-label', 'Header (JSON)');
        const headIn = $('textarea', 'in-jwt-head');
        headIn.rows = 3;
        headIn.spellcheck = false;
        headLabel.append(headIn);
        const payLabel = $('label', 'wb-label', 'Payload (JSON)');
        const payIn = $('textarea', 'in-jwt-payload');
        payIn.rows = 5;
        payIn.spellcheck = false;
        payLabel.append(payIn);
        const sigRow = $('div', 'wb-editor');
        const sigMode = $('select', 'wb-method');
        sigMode.setAttribute('aria-label', '서명 방식');
        for (const [v, label] of [['keep', '서명 유지'], ['none', 'alg:none'], ['hs256', 'HS256']]) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = label;
          sigMode.append(o);
        }
        const secret = $('input', 'wb-url in-jwt-secret');
        secret.type = 'password';
        secret.placeholder = 'HS256 시크릿';
        secret.setAttribute('aria-label', 'HS256 시크릿');
        secret.hidden = true;
        const genBtn = $('button', 'wb-send', '토큰 생성');
        genBtn.type = 'button';
        sigRow.append(sigMode, secret, genBtn);
        sigMode.addEventListener('change', () => { secret.hidden = sigMode.value !== 'hs256'; });
        const outLabel = $('label', 'wb-label', '새 토큰');
        const tokOut = $('textarea', 'in-jwt-out');
        tokOut.readOnly = true;
        tokOut.rows = 3;
        tokOut.spellcheck = false;
        outLabel.append(tokOut);
        const err = $('p', 'in-err');
        const sigInfo = $('p', 'wb-empty');
        const copy = copyBtn(tokOut, null);
        panel.append(tokLabel, decodeBtn, headLabel, payLabel, sigInfo, sigRow, outLabel, copy, err);

        let origSig = '';
        decodeBtn.addEventListener('click', () => {
          const r = L.jwtDecode(tokIn.value);
          if (!r.ok) { err.textContent = r.error; return; }
          err.textContent = '';
          headIn.value = JSON.stringify(r.header, null, 2);
          payIn.value = JSON.stringify(r.payload, null, 2);
          origSig = r.signature;
          const read = Object.entries(r.readable || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
          sigInfo.textContent = read ? `시각 클레임: ${read}` : '';
        });
        genBtn.addEventListener('click', async () => {
          err.textContent = '';
          try {
            const header = JSON.parse(headIn.value);
            const payload = JSON.parse(payIn.value);
            if (sigMode.value === 'none') {
              const r = L.jwtEncodeUnsigned(header, payload);
              if (r.ok) tokOut.value = r.value; else err.textContent = r.error;
            } else if (sigMode.value === 'hs256') {
              const r = await L.jwtSignHS256(header, payload, secret.value);
              if (r.ok) tokOut.value = r.value; else err.textContent = r.error;
            } else {
              // keep mode: re-encode edited JSON, keep the original signature
              const enc = (o) => {
                const b64 = btoa([...new TextEncoder().encode(JSON.stringify(o))].map((b) => String.fromCharCode(b)).join(''));
                return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
              };
              tokOut.value = `${enc(header)}.${enc(payload)}.${origSig}`;
            }
          } catch (e) {
            err.textContent = `JSON 파싱 실패: ${e.message}`;
          }
        });
      }

      // ---------- 3. URL 분해 ----------
      {
        const panel = panels.url;
        const inLabel = $('label', 'wb-label', 'URL');
        const input = $('input', 'wb-url in-url-in');
        input.type = 'text';
        input.placeholder = 'http://localhost:10002@evil.com/';
        input.spellcheck = false;
        inLabel.append(input);
        const go = $('button', 'wb-send', '분해');
        go.type = 'button';
        const viz = $('div', 'in-url-viz');
        const table = $('table', 'in-url-table');
        const tbody = document.createElement('tbody');
        table.append(tbody);
        const warnTitle = $('p', 'wb-section', '경고');
        const warnList = $('ul', 'in-warn-list');
        const err = $('p', 'in-err');
        panel.append(inLabel, go, viz, table, warnTitle, warnList, err);

        go.addEventListener('click', () => {
          const r = L.parseUrl(input.value);
          err.textContent = '';
          tbody.textContent = '';
          warnList.textContent = '';
          viz.textContent = '';
          if (!r.ok) { err.textContent = r.error; return; }
          const comps = [
            ['scheme', r.scheme, 'in-c-scheme'], ['username', r.username, 'in-c-user'],
            ['password', r.password, 'in-c-user'], ['host', r.host, 'in-c-host'],
            ['port', r.port, 'in-c-port'], ['path', r.path, 'in-c-path'],
            ['fragment', r.fragment, 'in-c-frag']
          ];
          for (const [label, value, cls] of comps) {
            const tr = document.createElement('tr');
            const a = document.createElement('td');
            a.textContent = label;
            const b = document.createElement('td');
            const span = $('span', cls, value || '—');
            b.append(span);
            tr.append(a, b);
            tbody.append(tr);
          }
          const qRow = document.createElement('tr');
          const qa = document.createElement('td');
          qa.textContent = 'query';
          const qb = document.createElement('td');
          qb.textContent = r.query.length ? r.query.map(([k, v]) => `${k}=${v}`).join('&') : '—';
          qRow.append(qa, qb);
          tbody.append(qRow);
          // colored reconstruction
          const vizParts = [
            [r.scheme + '://', 'in-c-scheme'],
            [r.username ? r.username + (r.password ? ':***' : '') + '@' : '', 'in-c-user'],
            [r.host, 'in-c-host'],
            [r.port ? ':' + r.port : '', 'in-c-port'],
            [r.path || '/', 'in-c-path'],
            [input.value.includes('?') ? '?' + r.query.map(([k, v]) => `${k}=${v}`).join('&') : '', 'in-c-query'],
            [r.fragment ? '#' + r.fragment : '', 'in-c-frag']
          ];
          for (const [text, cls] of vizParts) {
            if (!text) continue;
            viz.append($('span', cls, text));
          }
          for (const w of r.warnings) {
            const li = document.createElement('li');
            li.textContent = w;
            warnList.append(li);
          }
          if (!r.warnings.length) {
            const li = document.createElement('li');
            li.textContent = '경고 없음';
            warnList.append(li);
          }
        });
      }

      // ---------- 4. 경로 해석 ----------
      {
        const panel = panels.path;
        const baseLabel = $('label', 'wb-label', '기준 디렉터리');
        const baseIn = $('input', 'wb-url in-base');
        baseIn.type = 'text';
        baseIn.value = defaults.base || '';
        baseIn.placeholder = '/var/www/files';
        baseIn.spellcheck = false;
        baseLabel.append(baseIn);
        const inLabel = $('label', 'wb-label', '입력 경로');
        const inIn = $('input', 'wb-url in-path-input');
        inIn.type = 'text';
        inIn.value = defaults.input || '';
        inIn.placeholder = '../../etc/passwd';
        inIn.spellcheck = false;
        inLabel.append(inIn);
        const row = $('div', 'wb-editor');
        const decSel = $('select', 'wb-method in-decode');
        decSel.setAttribute('aria-label', '디코딩 횟수');
        for (const [v, label] of [['none', '디코딩 없음'], ['once', '1회 디코딩'], ['twice', '2회 디코딩']]) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = label;
          decSel.append(o);
        }
        const go = $('button', 'wb-send', '해석');
        go.type = 'button';
        row.append(decSel, go);
        const stepsTable = $('table', 'in-url-table');
        const stepsBody = document.createElement('tbody');
        stepsTable.append(stepsBody);
        const badge = $('span', 'wb-badge');
        const err = $('p', 'in-err');
        panel.append(baseLabel, inLabel, row, stepsTable, badge, err);

        go.addEventListener('click', () => {
          const r = L.resolvePath(baseIn.value, inIn.value, { decode: decSel.value });
          err.textContent = '';
          stepsBody.textContent = '';
          if (!r.ok) { err.textContent = r.error; badge.textContent = ''; badge.className = 'wb-badge'; return; }
          const rows = [['decoded', r.steps.decoded], ['combined', r.steps.combined], ['normalized', r.steps.normalized]];
          for (const [label, value] of rows) {
            const tr = document.createElement('tr');
            const a = document.createElement('td');
            a.textContent = label;
            const b = document.createElement('td');
            b.textContent = value;
            tr.append(a, b);
            stepsBody.append(tr);
          }
          badge.textContent = r.escapes ? '기준 밖 탈출' : '기준 내부';
          badge.className = `wb-badge in-esc-badge ${r.escapes ? 'wb-err' : 'wb-ok'}`;
        });
      }
    }
  };
})();
