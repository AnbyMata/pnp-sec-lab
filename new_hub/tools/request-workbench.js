// request-workbench tool (W2 core + W3 advanced): build an HTTP request,
// relay it through /api/tools/request and view the raw response. Adds body
// modes (raw/JSON/form/multipart), a cookie jar, request history with diff,
// and concurrent sends. DOM API + textContent only.
window.pnpTools = window.pnpTools || {};
window.pnpTools['request-workbench'] = (() => {
  'use strict';

  const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  const STATUS_ERRORS = {
    403: '허용되지 않는 요청입니다. 실습 서버 주소(localhost:10001/10002/10003/10010)만 보낼 수 있습니다.',
    413: '요청 본문이 너무 큽니다(최대 1MB).',
    429: '요청이 너무 많습니다. 잠시 후 다시 시도해 보세요.',
    502: '실습 서버에 연결하지 못했습니다. 주소와 서버 실행 상태를 확인해 보세요.'
  };
  const BODY_MODES = ['raw', 'json', 'form', 'multipart'];
  const JAR_KEY = 'pnp_workbench_jar';
  const HIST_KEY = 'pnp_workbench_history';
  const HIST_MAX = 20;

  const toB64 = (text) => {
    let bin = '';
    for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
    return btoa(bin);
  };
  const bytesToB64 = (bytes) => {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };
  const fromB64 = (b64) => {
    const bin = atob(b64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  const looksBinary = (bytes) => {
    const sample = bytes.subarray(0, Math.min(bytes.length, 512));
    if (!sample.length) return false;
    let bad = 0;
    for (const b of sample) {
      if (b === 0) return true;
      if (b < 9 || (b > 13 && b < 32)) bad += 1;
    }
    return bad / sample.length > 0.1;
  };
  const hexPreview = (bytes) =>
    [...bytes.subarray(0, 64)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

  // http-body.js is a sibling script; inject the tag lazily because the pages
  // that host this tool do not list it in their script tags yet.
  let libPromise = null;
  const loadHttpBody = () => {
    if (window.PnpHttpBody) return Promise.resolve(window.PnpHttpBody);
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = 'tools/http-body.js?v=1';
        tag.onload = () => resolve(window.PnpHttpBody);
        tag.onerror = () => reject(new Error('http-body.js를 불러오지 못했습니다.'));
        document.head.append(tag);
      });
    }
    return libPromise;
  };

  // ---------- storage with memory fallbacks ----------
  const memoryStore = {};
  const readStore = (key, storage) => {
    try { return JSON.parse(storage.getItem(key)) || {}; } catch { return memoryStore[key] || {}; }
  };
  const writeStore = (key, value, storage) => {
    memoryStore[key] = value;
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* memory copy kept */ }
  };

  const parseSetCookie = (line) => {
    const segs = String(line).split(';').map((s) => s.trim());
    const eq = segs[0].indexOf('=');
    if (eq < 1) return null;
    const attrs = segs.slice(1);
    const pick = (name) => {
      const seg = attrs.find((a) => a.toLowerCase().startsWith(`${name}=`));
      return seg ? seg.slice(name.length + 1) : '';
    };
    return { name: segs[0].slice(0, eq), value: segs[0].slice(eq + 1), domain: pick('domain'), path: pick('path'), attrs };
  };

  // Classic line LCS -> [{type:' '|'+'|'-', text}]
  const lineDiff = (aLines, bLines) => {
    const n = aLines.length;
    const m = bLines.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (aLines[i] === bLines[j]) { out.push({ type: ' ', text: aLines[i] }); i += 1; j += 1; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: '-', text: aLines[i] }); i += 1; }
      else { out.push({ type: '+', text: bLines[j] }); j += 1; }
    }
    while (i < n) { out.push({ type: '-', text: aLines[i] }); i += 1; }
    while (j < m) { out.push({ type: '+', text: bLines[j] }); j += 1; }
    return out;
  };

  return {
    mount(el, ctx) {
      el.classList.add('workbench');
      const presets = Array.isArray(ctx && ctx.workbenchPresets) ? ctx.workbenchPresets : [];
      const $ = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      loadHttpBody().catch(() => {});

      const intro = $('p', 'wb-intro', '브라우저 폼으로 보내기 어려운 HTTP 요청을 직접 만들어 실습 서버에 보내 보세요.');

      // Presets (only when the challenge provides them; otherwise the editor stays empty)
      let presetSelect = null;
      if (presets.length) {
        const presetRow = $('div', 'wb-presets-row');
        const presetLabel = $('label', 'wb-label', '프리셋');
        presetSelect = $('select', 'wb-presets');
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '직접 입력';
        presetSelect.append(empty);
        presets.forEach((preset, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = preset.name || `프리셋 ${index + 1}`;
          presetSelect.append(option);
        });
        presetLabel.append(presetSelect);
        presetRow.append(presetLabel);
        el.append(intro, presetRow);
      } else {
        el.append(intro);
      }

      const editor = $('div', 'wb-editor');
      const method = $('select', 'wb-method');
      method.setAttribute('aria-label', 'HTTP 메서드');
      for (const name of METHODS) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        method.append(option);
      }
      const url = $('input', 'wb-url');
      url.type = 'text';
      url.placeholder = 'http://localhost:10002/lab/echo';
      url.setAttribute('aria-label', '요청 URL');
      url.spellcheck = false;
      const countInput = $('input', 'wb-count');
      countInput.type = 'number';
      countInput.min = '1';
      countInput.max = '30';
      countInput.value = '1';
      countInput.setAttribute('aria-label', '동시 전송 횟수');
      countInput.title = '동시 전송 횟수 (1~30)';
      const send = $('button', 'wb-send', '전송');
      send.type = 'button';
      const curlBtn = $('button', 'wb-curl', 'curl로 복사');
      curlBtn.type = 'button';
      editor.append(method, url, countInput, send, curlBtn);

      const headersBox = $('fieldset', 'wb-headers');
      const legend = document.createElement('legend');
      legend.textContent = '헤더';
      const headerRows = $('div', 'wb-header-rows');
      const addHeader = $('button', 'wb-add-header', '헤더 추가');
      addHeader.type = 'button';
      headersBox.append(legend, headerRows, addHeader);

      const addRow = (name = '', value = '') => {
        const row = $('div', 'wb-hrow');
        const nameInput = $('input', 'wb-hname');
        nameInput.type = 'text';
        nameInput.placeholder = '헤더 이름';
        nameInput.value = name;
        nameInput.setAttribute('aria-label', '헤더 이름');
        const valueInput = $('input', 'wb-hvalue');
        valueInput.type = 'text';
        valueInput.placeholder = '값';
        valueInput.value = value;
        valueInput.setAttribute('aria-label', '헤더 값');
        const remove = $('button', 'wb-hremove', '삭제');
        remove.type = 'button';
        remove.addEventListener('click', () => row.remove());
        row.append(nameInput, valueInput, remove);
        headerRows.append(row);
        return row;
      };
      addHeader.addEventListener('click', () => addRow().querySelector('.wb-hname').focus());
      addRow();

      // ---------- body modes ----------
      const modeBar = $('div', 'wb-bmode');
      modeBar.setAttribute('role', 'group');
      modeBar.setAttribute('aria-label', '본문 형식');
      const bodyPanels = $('div', 'wb-body-panels');
      const jsonErr = $('p', 'wb-json-err');
      const rawLabel = $('label', 'wb-label wb-body-label', '본문 (raw)');
      const body = $('textarea', 'wb-body');
      body.rows = 5;
      body.spellcheck = false;
      rawLabel.append(body);

      // form editor
      const formPanel = $('div', 'wb-form');
      const formRows = $('div', 'wb-form-rows');
      const addFormRowBtn = $('button', 'wb-add-header', '필드 추가');
      addFormRowBtn.type = 'button';
      const addFormRow = (key = '', value = '') => {
        const row = $('div', 'wb-hrow');
        const keyInput = $('input', 'wb-fkey');
        keyInput.type = 'text';
        keyInput.placeholder = '필드 이름';
        keyInput.value = key;
        keyInput.setAttribute('aria-label', '폼 필드 이름');
        const valInput = $('input', 'wb-fval');
        valInput.type = 'text';
        valInput.placeholder = '값';
        valInput.value = value;
        valInput.setAttribute('aria-label', '폼 필드 값');
        const remove = $('button', 'wb-hremove', '삭제');
        remove.type = 'button';
        remove.addEventListener('click', () => row.remove());
        row.append(keyInput, valInput, remove);
        formRows.append(row);
        return row;
      };
      addFormRowBtn.addEventListener('click', () => addFormRow().querySelector('.wb-fkey').focus());
      formPanel.append(formRows, addFormRowBtn);
      addFormRow();

      // multipart editor
      const mpPanel = $('div', 'wb-mp');
      const boundaryLabel = $('label', 'wb-label', '경계(boundary)');
      const boundaryInput = $('input', 'wb-boundary');
      boundaryInput.type = 'text';
      boundaryInput.value = `----pnp${Math.random().toString(16).slice(2, 14)}`;
      boundaryInput.spellcheck = false;
      boundaryLabel.append(boundaryInput);
      const mpRows = $('div', 'wb-mp-rows');
      const addPartBtn = $('button', 'wb-add-header', '파트 추가');
      addPartBtn.type = 'button';
      const addPart = (part = {}) => {
        const box = $('div', 'wb-part');
        const head = $('div', 'wb-part-head');
        const nameInput = $('input', 'wb-pname');
        nameInput.type = 'text';
        nameInput.placeholder = '필드 이름';
        nameInput.value = part.name || '';
        nameInput.setAttribute('aria-label', '파트 필드 이름');
        const fnInput = $('input', 'wb-pfile');
        fnInput.type = 'text';
        fnInput.placeholder = '파일명 (선택)';
        fnInput.value = part.filename || '';
        fnInput.setAttribute('aria-label', '파트 파일명');
        const ctInput = $('input', 'wb-pct');
        ctInput.type = 'text';
        ctInput.placeholder = '파트 Content-Type (선택)';
        ctInput.value = part.contentType || '';
        ctInput.setAttribute('aria-label', '파트 Content-Type');
        head.append(nameInput, fnInput, ctInput);
        const textArea = $('textarea', 'wb-ptext');
        textArea.rows = 3;
        textArea.placeholder = '파트 내용 (텍스트)';
        textArea.spellcheck = false;
        textArea.value = part.bodyText || '';
        textArea.setAttribute('aria-label', '파트 내용');
        const tail = $('div', 'wb-part-tail');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'wb-pick';
        fileInput.setAttribute('aria-label', '파트 파일 선택');
        fileInput.addEventListener('change', () => {
          if (fileInput.files[0] && !fnInput.value) fnInput.value = fileInput.files[0].name;
        });
        const prefixInput = $('input', 'wb-pprefix');
        prefixInput.type = 'text';
        prefixInput.placeholder = '앞 바이트 hex (예: 474946383961)';
        prefixInput.value = part.prefixHex || '';
        prefixInput.spellcheck = false;
        prefixInput.setAttribute('aria-label', '앞에 붙일 바이트(hex)');
        const remove = $('button', 'wb-hremove', '파트 삭제');
        remove.type = 'button';
        remove.addEventListener('click', () => box.remove());
        tail.append(fileInput, prefixInput, remove);
        box.append(head, textArea, tail);
        mpRows.append(box);
        return box;
      };
      addPartBtn.addEventListener('click', () => addPart().querySelector('.wb-pname').focus());
      mpPanel.append(boundaryLabel, mpRows, addPartBtn);
      addPart();

      // ---------- Content-Type auto-fill ----------
      const MODE_CT = () => ({
        raw: '', json: 'application/json',
        form: 'application/x-www-form-urlencoded',
        multipart: `multipart/form-data; boundary=${boundaryInput.value}`
      });
      let lastAutoCT = '';
      const findCTInput = () => {
        for (const row of headerRows.querySelectorAll('.wb-hrow')) {
          if (row.querySelector('.wb-hname').value.trim().toLowerCase() === 'content-type') {
            return row.querySelector('.wb-hvalue');
          }
        }
        return null;
      };
      const syncCT = (mode) => {
        const ct = MODE_CT()[mode];
        if (!ct) return;
        const existing = findCTInput();
        if (!existing) {
          addRow('Content-Type', ct);
          lastAutoCT = ct;
        } else if (existing.value === lastAutoCT || existing.value === '') {
          existing.value = ct;
          lastAutoCT = ct;
        }
      };

      let bodyMode = 'raw';
      const panelsFor = { raw: rawLabel, json: rawLabel, form: formPanel, multipart: mpPanel };
      const setMode = (mode) => {
        bodyMode = mode;
        for (const btn of modeBar.children) btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
        bodyPanels.textContent = '';
        bodyPanels.append(panelsFor[mode]);
        jsonErr.hidden = mode !== 'json';
        jsonErr.textContent = '';
        if (mode === 'json') checkJson();
        syncCT(mode);
      };
      for (const mode of BODY_MODES) {
        const btn = $('button', 'wb-bmode-btn', { raw: 'raw', json: 'JSON', form: 'form', multipart: 'multipart' }[mode]);
        btn.type = 'button';
        btn.dataset.mode = mode;
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => setMode(mode));
        modeBar.append(btn);
      }
      const checkJson = async () => {
        const lib = await loadHttpBody().catch(() => null);
        const result = lib ? lib.validateJson(body.value) : { ok: true, message: '' };
        jsonErr.textContent = result.ok ? '' : `JSON 문법 오류: ${result.message} (전송은 가능합니다)`;
      };
      body.addEventListener('input', () => { if (bodyMode === 'json') checkJson(); });
      boundaryInput.addEventListener('input', () => { if (bodyMode === 'multipart') syncCT('multipart'); });

      // ---------- cookie jar ----------
      const jarBox = $('fieldset', 'wb-headers');
      const jarLegend = document.createElement('legend');
      jarLegend.textContent = '쿠키 보관 (도메인별)';
      const autoLabel = $('label', 'wb-json-toggle');
      const autoToggle = document.createElement('input');
      autoToggle.type = 'checkbox';
      autoToggle.checked = true;
      autoLabel.append(autoToggle, document.createTextNode(' 응답 Set-Cookie 저장 + 다음 요청에 자동 첨부'));
      const jarList = $('div', 'wb-jar-list');
      const clearJar = $('button', 'wb-hremove', '전체 삭제');
      clearJar.type = 'button';
      clearJar.addEventListener('click', () => { writeStore(JAR_KEY, {}, localStorage); renderJar(); });
      jarBox.append(jarLegend, autoLabel, jarList, clearJar);

      const readJar = () => readStore(JAR_KEY, localStorage);
      const writeJar = (jar) => writeStore(JAR_KEY, jar, localStorage);

      const renderJar = () => {
        jarList.textContent = '';
        const jar = readJar();
        const hosts = Object.keys(jar).filter((h) => jar[h].length);
        if (!hosts.length) {
          jarList.append($('p', 'wb-empty', '저장된 쿠키가 없습니다.'));
          return;
        }
        for (const host of hosts) {
          jarList.append($('p', 'wb-jar-host', host));
          jar[host].forEach((cookie, index) => {
            const row = $('div', 'wb-jar-row');
            const name = $('span', 'wb-jar-name', cookie.name);
            const val = $('input', 'wb-jar-val');
            val.type = 'text';
            val.value = cookie.value;
            val.setAttribute('aria-label', `${cookie.name} 값`);
            val.addEventListener('change', () => {
              const fresh = readJar();
              fresh[host][index].value = val.value;
              writeJar(fresh);
            });
            const detail = $('span', 'wb-jar-meta',
              [cookie.domain && `domain=${cookie.domain}`, cookie.path && `path=${cookie.path}`, ...cookie.attrs]
                .filter(Boolean).join(' · ') || '속성 없음');
            const del = $('button', 'wb-hremove', '삭제');
            del.type = 'button';
            del.addEventListener('click', () => {
              const fresh = readJar();
              fresh[host].splice(index, 1);
              writeJar(fresh);
              renderJar();
            });
            row.append(name, val, detail, del);
            jarList.append(row);
          });
        }
      };
      renderJar();

      const storeResponseCookies = (reqUrl, headers) => {
        let host;
        try { host = new URL(reqUrl).hostname; } catch { return; }
        if (!host) return;
        const jar = readJar();
        const bucket = jar[host] || (jar[host] = []);
        let changed = false;
        for (const [name, value] of headers || []) {
          if (name.toLowerCase() !== 'set-cookie') continue;
          const cookie = parseSetCookie(value);
          if (!cookie) continue;
          const idx = bucket.findIndex((c) => c.name === cookie.name);
          if (idx >= 0) bucket[idx] = cookie;
          else bucket.push(cookie);
          changed = true;
        }
        if (changed) { writeJar(jar); renderJar(); }
      };

      // ---------- history ----------
      const histBox = $('fieldset', 'wb-headers');
      const histLegend = document.createElement('legend');
      histLegend.textContent = '히스토리 (최근 20건)';
      const histHint = $('p', 'wb-empty', '두 항목을 체크하면 응답을 비교합니다. 항목을 클릭하면 편집기에 복원됩니다.');
      const histList = $('div', 'wb-hist-list');
      const diffBox = $('div', 'wb-diff');
      diffBox.hidden = true;
      histBox.append(histLegend, histHint, histList, diffBox);

      const readHist = () => {
        const v = readStore(HIST_KEY, sessionStorage);
        return Array.isArray(v) ? v : (v.entries || []);
      };
      const writeHist = (list) => writeStore(HIST_KEY, { entries: list }, sessionStorage);

      const collectHeaders = () =>
        [...headerRows.querySelectorAll('.wb-hrow')]
          .map((row) => [row.querySelector('.wb-hname').value.trim(), row.querySelector('.wb-hvalue').value.trim()])
          .filter(([name, value]) => name || value);

      const collectForm = () =>
        [...formRows.querySelectorAll('.wb-hrow')]
          .map((row) => [row.querySelector('.wb-fkey').value, row.querySelector('.wb-fval').value])
          .filter(([key, value]) => key || value);

      const collectPartsText = () =>
        [...mpRows.querySelectorAll('.wb-part')].map((box) => ({
          name: box.querySelector('.wb-pname').value,
          filename: box.querySelector('.wb-pfile').value,
          contentType: box.querySelector('.wb-pct').value,
          prefixHex: box.querySelector('.wb-pprefix').value,
          bodyText: box.querySelector('.wb-ptext').value
        }));

      const bodySnapshot = () => {
        if (bodyMode === 'form') return { mode: 'form', pairs: collectForm() };
        if (bodyMode === 'multipart') return { mode: 'multipart', boundary: boundaryInput.value, parts: collectPartsText() };
        return { mode: bodyMode, text: body.value };
      };

      const restoreBody = (snap) => {
        if (!snap) return;
        setMode(snap.mode || 'raw');
        if (snap.mode === 'form') {
          formRows.textContent = '';
          (snap.pairs || []).forEach(([k, v]) => addFormRow(k, v));
          if (!snap.pairs || !snap.pairs.length) addFormRow();
        } else if (snap.mode === 'multipart') {
          boundaryInput.value = snap.boundary || boundaryInput.value;
          mpRows.textContent = '';
          (snap.parts || []).forEach((p) => addPart(p));
          if (!snap.parts || !snap.parts.length) addPart();
          syncCT('multipart');
        } else {
          body.value = snap.text || '';
          if (snap.mode === 'json') checkJson();
        }
      };

      let histEntries = readHist();
      const diffSelect = new Set();

      const renderDiff = () => {
        diffBox.textContent = '';
        const picks = [...diffSelect].sort((a, b) => a - b);
        if (picks.length !== 2) { diffBox.hidden = true; return; }
        const [a, b] = picks.map((i) => histEntries[i]);
        if (!a || !b || !a.resp || !b.resp) {
          diffBox.hidden = false;
          diffBox.append($('p', 'wb-empty', '응답이 저장된 두 항목만 비교할 수 있습니다.'));
          return;
        }
        diffBox.hidden = false;
        const sections = [
          ['헤더', (a.resp.headers || []).map(([n, v]) => `${n}: ${v}`), (b.resp.headers || []).map(([n, v]) => `${n}: ${v}`)],
          ['본문', (a.resp.bodyText || '').split('\n'), (b.resp.bodyText || '').split('\n')]
        ];
        for (const [title, aLines, bLines] of sections) {
          diffBox.append($('p', 'wb-section', `${title} 비교 (이전 → 이후)`));
          const table = $('div', 'wb-diff-lines');
          let changes = 0;
          for (const row of lineDiff(aLines, bLines)) {
            if (row.type === ' ') continue;
            changes += 1;
            const line = $('div', `wb-diff-line wb-diff-${row.type === '+' ? 'add' : 'del'}`, `${row.type} ${row.text}`);
            table.append(line);
          }
          if (!changes) table.append($('div', 'wb-diff-line', '동일'));
          diffBox.append(table);
        }
      };

      const renderHist = () => {
        histList.textContent = '';
        if (!histEntries.length) {
          histList.append($('p', 'wb-empty', '아직 보낸 요청이 없습니다.'));
          return;
        }
        histEntries.forEach((entry, index) => {
          const row = $('div', 'wb-hist-row');
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.checked = diffSelect.has(index);
          check.setAttribute('aria-label', `비교 대상 ${index + 1}`);
          check.addEventListener('change', () => {
            if (check.checked) diffSelect.add(index);
            else diffSelect.delete(index);
            if (diffSelect.size > 2) {
              diffSelect.delete([...diffSelect].sort((a, b) => a - b)[0]);
            }
            renderHist();
            renderDiff();
          });
          const summary = $('button', 'wb-hist-item');
          summary.type = 'button';
          const resp = entry.resp ? ` → ${entry.resp.status} (${entry.resp.elapsed_ms}ms)` : entry.note ? ` (${entry.note})` : '';
          summary.textContent = `${entry.method} ${entry.url}${entry.count > 1 ? ` ×${entry.count}` : ''}${resp}`;
          summary.addEventListener('click', () => {
            method.value = entry.method;
            url.value = entry.url;
            headerRows.textContent = '';
            (entry.headers || []).forEach(([n, v]) => addRow(n, v));
            if (!entry.headers || !entry.headers.length) addRow();
            lastAutoCT = '';
            restoreBody(entry.body);
          });
          row.append(check, summary);
          histList.append(row);
        });
      };
      renderHist();

      const pushHistory = (entry) => {
        histEntries = [entry, ...histEntries].slice(0, HIST_MAX);
        diffSelect.clear();
        writeHist(histEntries);
        renderHist();
        renderDiff();
      };

      // ---------- status / response ----------
      const status = $('p', 'wb-status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const curlOut = $('textarea', 'wb-curl-out');
      curlOut.readOnly = true;
      curlOut.rows = 3;
      curlOut.hidden = true;

      const response = $('div', 'wb-response');
      response.hidden = true;
      const respHead = $('div', 'wb-resp-head');
      const badge = $('span', 'wb-badge');
      const meta = $('span', 'wb-meta');
      respHead.append(badge, meta);
      const headersTitle = $('p', 'wb-section', '응답 헤더');
      const headersTable = $('table', 'wb-resp-headers');
      const headersBody = document.createElement('tbody');
      headersTable.append(headersBody);
      const bodyTitle = $('p', 'wb-section', '응답 본문');
      const jsonLabel = $('label', 'wb-json-toggle');
      const jsonToggle = document.createElement('input');
      jsonToggle.type = 'checkbox';
      jsonLabel.append(jsonToggle, document.createTextNode(' JSON 정리'));
      const respBody = $('pre', 'wb-resp-body');
      response.append(respHead, headersTitle, headersTable, bodyTitle, jsonLabel, respBody);

      const batchBox = $('div', 'wb-batch');
      batchBox.hidden = true;

      el.append(editor, headersBox, modeBar, bodyPanels, jsonErr, jarBox, status, curlOut, response, batchBox, histBox);
      setMode('raw');

      let lastText = '';
      let lastParsed = null;

      const renderBody = () => {
        respBody.textContent = jsonToggle.checked && lastParsed !== null ? JSON.stringify(lastParsed, null, 2) : lastText;
      };
      jsonToggle.addEventListener('change', renderBody);

      const buildCurl = () => {
        const esc = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
        const parts = ['curl', '-s', '-X', method.value, esc(url.value.trim() || 'http://')];
        for (const [name, value] of collectHeaders()) parts.push('-H', esc(`${name}: ${value}`));
        if (bodyMode === 'raw' || bodyMode === 'json') {
          if (body.value) parts.push('--data-binary', esc(body.value));
        } else {
          parts.push('--data-binary', esc(`(${bodyMode} 본문 — 워크벤치에서 전송)`));
        }
        return parts.join(' ');
      };

      const buildBodyB64 = async () => {
        const lib = await loadHttpBody();
        if (bodyMode === 'form') return toB64(lib.buildUrlencoded(collectForm()));
        if (bodyMode === 'multipart') {
          const parts = await Promise.all([...mpRows.querySelectorAll('.wb-part')].map(async (box) => {
            const file = box.querySelector('.wb-pick').files[0];
            return {
              name: box.querySelector('.wb-pname').value,
              filename: box.querySelector('.wb-pfile').value || undefined,
              contentType: box.querySelector('.wb-pct').value || undefined,
              prefixHex: box.querySelector('.wb-pprefix').value || undefined,
              body: file ? new Uint8Array(await file.arrayBuffer()) : box.querySelector('.wb-ptext').value
            };
          }));
          return bytesToB64(lib.buildMultipart(parts, boundaryInput.value));
        }
        return toB64(body.value);
      };

      const jarCookieHeader = (reqUrl) => {
        if (!autoToggle.checked) return null;
        let host;
        try { host = new URL(reqUrl).hostname; } catch { return null; }
        const cookies = (readJar()[host] || []).filter((c) => c.name);
        if (!cookies.length) return null;
        if (collectHeaders().some(([n]) => n.toLowerCase() === 'cookie')) return null;
        return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      };

      const renderResult = (result) => {
        response.hidden = false;
        batchBox.hidden = true;
        const code = result.status;
        badge.textContent = `${code} ${result.reason || ''}`.trim();
        badge.className = `wb-badge ${code >= 200 && code < 300 ? 'wb-ok' : 'wb-err'}`;
        const metaText = `${result.elapsed_ms}ms · ${result.size}B`;
        meta.textContent = result.truncated ? `${metaText} · 잘림(200KB까지 표시)` : metaText;

        headersBody.textContent = '';
        for (const [name, value] of result.headers || []) {
          const tr = document.createElement('tr');
          const tdName = document.createElement('td');
          tdName.textContent = name;
          const tdValue = document.createElement('td');
          tdValue.textContent = value;
          tr.append(tdName, tdValue);
          headersBody.append(tr);
        }

        const bytes = fromB64(result.body_b64);
        if (looksBinary(bytes)) {
          jsonLabel.hidden = true;
          lastParsed = null;
          lastText = `이진 데이터 ${result.size}바이트\n${hexPreview(bytes)}${bytes.length > 64 ? ' …' : ''}`;
        } else {
          lastText = new TextDecoder().decode(bytes);
          try {
            lastParsed = JSON.parse(lastText);
          } catch {
            lastParsed = null;
          }
          jsonLabel.hidden = lastParsed === null;
          jsonToggle.checked = lastParsed !== null;
        }
        renderBody();
        return lastText;
      };

      const renderBatch = (data, count) => {
        response.hidden = true;
        batchBox.hidden = false;
        batchBox.textContent = '';
        const table = $('table', 'wb-batch-table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (const h of ['#', 'start_ms', 'elapsed_ms', '상태', '크기']) {
          const th = document.createElement('th');
          th.textContent = h;
          headRow.append(th);
        }
        thead.append(headRow);
        const tbody = document.createElement('tbody');
        const agg = {};
        const dupKeys = new Map();
        for (const r of data.results || []) {
          const tr = document.createElement('tr');
          const statusText = r.status === null || r.status === undefined ? '실패' : String(r.status);
          for (const cell of [r.index + 1, r.start_ms, r.elapsed_ms, statusText, r.size]) {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.append(td);
          }
          tbody.append(tr);
          agg[statusText] = (agg[statusText] || 0) + 1;
          const key = [...fromB64(r.body_b64).subarray(0, 200)].join(',');
          dupKeys.set(key, (dupKeys.get(key) || 0) + 1);
        }
        table.append(thead, tbody);
        const aggText = Object.entries(agg).map(([k, v]) => `${k} ×${v}`).join(', ');
        const maxDup = Math.max(...dupKeys.values());
        const dupText = dupKeys.size === 1
          ? `응답 본문 앞 200바이트 기준 ${count}건 모두 동일`
          : `동일 응답 최대 ${maxDup}건 (총 ${dupKeys.size}종)`;
        const foot = $('p', 'wb-batch-foot', `상태 집계: ${aggText} · ${dupText}`);
        batchBox.append(table, foot);
      };

      const sendRequest = async () => {
        const count = Math.min(30, Math.max(1, parseInt(countInput.value, 10) || 1));
        send.disabled = true;
        send.setAttribute('aria-busy', 'true');
        status.textContent = '전송 중…';
        const reqUrl = url.value.trim();
        const reqHeaders = collectHeaders();
        const jarCookie = jarCookieHeader(reqUrl);
        const payload = {
          method: method.value, url: reqUrl,
          headers: jarCookie ? [...reqHeaders, ['Cookie', jarCookie]] : reqHeaders
        };
        try {
          payload.body_b64 = await buildBodyB64();
          if (count > 1) payload.count = count;
          const res = await fetch('/api/tools/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || data.ok === false) {
            const detail = data && data.message ? ` (${data.message})` : '';
            status.textContent = (STATUS_ERRORS[res.status] || `요청이 실패했습니다(HTTP ${res.status}).`) + detail;
            return;
          }
          status.textContent = '';
          const entry = {
            method: payload.method, url: reqUrl, headers: reqHeaders,
            count, body: bodySnapshot(), when: Date.now()
          };
          if (count > 1) {
            renderBatch(data, count);
            entry.note = `${count}회 동시 전송`;
          } else {
            const bodyText = renderResult(data.result);
            storeResponseCookies(reqUrl, data.result.headers);
            entry.resp = {
              status: data.result.status, elapsed_ms: data.result.elapsed_ms,
              headers: data.result.headers || [], bodyText
            };
          }
          pushHistory(entry);
        } catch (err) {
          status.textContent = err && err.message === 'http-body.js를 불러오지 못했습니다.'
            ? err.message : '프록시 서버에 연결하지 못했습니다.';
        } finally {
          send.disabled = false;
          send.removeAttribute('aria-busy');
        }
      };

      send.addEventListener('click', sendRequest);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          sendRequest();
        }
      });

      curlBtn.addEventListener('click', async () => {
        const command = buildCurl();
        try {
          await navigator.clipboard.writeText(command);
          curlOut.hidden = true;
          status.textContent = 'curl 명령을 클립보드에 복사했습니다.';
        } catch {
          curlOut.value = command;
          curlOut.hidden = false;
          curlOut.focus();
          curlOut.select();
          status.textContent = '복사에 실패했습니다. 아래 명령을 직접 복사해 주세요.';
        }
      });

      if (presetSelect) {
        presetSelect.addEventListener('change', () => {
          const preset = presets[Number(presetSelect.value)];
          if (!preset) return;
          if (preset.method) method.value = preset.method;
          url.value = preset.url || '';
          setMode(preset.bodyMode || 'raw');
          body.value = preset.body || '';
          headerRows.textContent = '';
          const rows = Array.isArray(preset.headers) ? preset.headers : [];
          if (rows.length) rows.forEach(([name, value]) => addRow(name, value));
          else addRow();
          const presetCT = findCTInput();
          lastAutoCT = presetCT ? presetCT.value : '';
          if (preset.bodyMode === 'form' && Array.isArray(preset.pairs)) {
            formRows.textContent = '';
            preset.pairs.forEach(([k, v]) => addFormRow(k, v));
          }
          syncCT(bodyMode);
        });
      }
    }
  };
})();
