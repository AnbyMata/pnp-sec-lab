// inspect-lib (W4): pure codec/inspection helpers shared by the inspector UI
// (browser) and unit tests (Node). String in -> {ok:true, ...} | {ok:false, error}.
// No DOM, no fetch, no external packages.
(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.PnpInspect = lib;
})(typeof self !== 'undefined' ? self : globalThis, () => {
  'use strict';

  const te = new TextEncoder();
  const td = new TextDecoder('utf-8', { fatal: true });
  const fail = (error) => ({ ok: false, error: String(error) });
  const ok = (extra) => ({ ok: true, ...extra });

  const strToB64 = (bytes) => {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };
  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  const b64urlFromB64 = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64FromB64url = (b64url) => {
    const b64 = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
    return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  };

  // ---------- URL / percent ----------
  const urlEncode = (s) => {
    try {
      return ok({ value: encodeURIComponent(String(s)) });
    } catch (err) {
      return fail(`URL 인코딩 실패: ${err.message}`);
    }
  };
  const urlDecode = (s, opts = {}) => {
    try {
      const input = opts.plusAsSpace ? String(s).replace(/\+/g, ' ') : String(s);
      return ok({ value: decodeURIComponent(input) });
    } catch (err) {
      return fail(`URL 디코딩 실패: ${err.message}`);
    }
  };
  const doubleUrlEncode = (s) => {
    try {
      return ok({ value: encodeURIComponent(encodeURIComponent(String(s))) });
    } catch (err) {
      return fail(`URL 인코딩 실패: ${err.message}`);
    }
  };

  // ---------- base64 ----------
  const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
  const B64URL_RE = /^[A-Za-z0-9_-]*={0,2}$/;
  const base64Encode = (s, opts = {}) => {
    const b64 = strToB64(te.encode(String(s)));
    return ok({ value: opts.urlSafe ? b64urlFromB64(b64) : b64 });
  };
  const base64Decode = (s, opts = {}) => {
    const input = String(s).replace(/\s+/g, '');
    if (!(opts.urlSafe ? B64URL_RE : B64_RE).test(input)) {
      return fail('Base64 문자가 아닌 값이 포함되어 있습니다.');
    }
    try {
      const bytes = b64ToBytes(opts.urlSafe ? b64FromB64url(input) : input);
      return ok({ value: td.decode(bytes) });
    } catch {
      return fail('Base64 또는 UTF-8 디코딩에 실패했습니다.');
    }
  };

  // ---------- hex ----------
  const hexEncode = (s) =>
    ok({ value: [...te.encode(String(s))].map((b) => b.toString(16).padStart(2, '0')).join('') });
  const hexDecode = (s) => {
    const clean = String(s).replace(/\s+/g, '');
    if (!clean.length || clean.length % 2 || /[^0-9a-f]/i.test(clean)) {
      return fail('짝수 자리 16진 문자열이 아닙니다.');
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    try {
      return ok({ value: td.decode(bytes) });
    } catch {
      return fail('UTF-8 디코딩에 실패했습니다.');
    }
  };

  // ---------- HTML entities ----------
  const NAMED_ENTITIES = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  const ENTITY_NAMES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–'
  };
  const htmlEntityEncode = (s) =>
    ok({ value: String(s).replace(/[&<>"']/g, (c) => NAMED_ENTITIES[c]) });
  const htmlEntityDecode = (s) =>
    ok({
      value: String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
        if (body[0] === '#') {
          const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
        }
        return Object.prototype.hasOwnProperty.call(ENTITY_NAMES, body) ? ENTITY_NAMES[body] : m;
      })
    });

  // ---------- unicode escape ----------
  const unicodeEscape = (s) => {
    const input = String(s);
    let out = '';
    for (let i = 0; i < input.length; i += 1) {
      out += `\\u${input.charCodeAt(i).toString(16).padStart(4, '0')}`;
    }
    return ok({ value: out });
  };
  const unicodeUnescape = (s) => {
    const input = String(s);
    if (/\\u(?![0-9a-fA-F]{4})/.test(input)) {
      return fail('잘못된 \\uXXXX 이스케이프가 있습니다.');
    }
    return ok({ value: input.replace(/\\u([0-9a-fA-F]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16))) });
  };

  // ---------- JWT ----------
  const b64urlJson = (obj) => b64urlFromB64(strToB64(te.encode(JSON.stringify(obj))));

  const jwtDecode = (token) => {
    const parts = String(token).trim().split('.');
    if (parts.length !== 3) return fail('JWT는 header.payload.signature 세 부분이어야 합니다.');
    try {
      const header = JSON.parse(td.decode(b64ToBytes(b64FromB64url(parts[0]))));
      const payload = JSON.parse(td.decode(b64ToBytes(b64FromB64url(parts[1]))));
      const readable = {};
      for (const claim of ['exp', 'iat', 'nbf']) {
        if (typeof payload[claim] === 'number') {
          readable[claim] = new Date(payload[claim] * 1000).toISOString();
        }
      }
      return ok({ header, payload, signature: parts[2], readable });
    } catch {
      return fail('JWT의 Base64URL/JSON 해석에 실패했습니다.');
    }
  };

  const jwtEncodeUnsigned = (header, payload) => {
    try {
      const head = { ...(typeof header === 'object' && header ? header : JSON.parse(header)), alg: 'none' };
      const body = typeof payload === 'object' && payload ? payload : JSON.parse(payload);
      return ok({ value: `${b64urlJson(head)}.${b64urlJson(body)}.` });
    } catch {
      return fail('header/payload JSON이 잘못되었습니다.');
    }
  };

  const jwtSignHS256 = async (header, payload, secret) => {
    try {
      if (!globalThis.crypto || !crypto.subtle) return fail('crypto.subtle을 사용할 수 없습니다.');
      const head = { ...(typeof header === 'object' && header ? header : JSON.parse(header)), alg: 'HS256' };
      const body = typeof payload === 'object' && payload ? payload : JSON.parse(payload);
      const data = `${b64urlJson(head)}.${b64urlJson(body)}`;
      const key = await crypto.subtle.importKey('raw', te.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, te.encode(data));
      return ok({ value: `${data}.${b64urlFromB64(strToB64(new Uint8Array(sig)))}` });
    } catch (err) {
      return fail(`HS256 서명 실패: ${err.message}`);
    }
  };

  // ---------- parseUrl ----------
  const DEFAULT_PORTS = { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' };
  const parseUrl = (input) => {
    let url;
    try {
      url = new URL(String(input));
    } catch {
      return fail('URL 형식이 아닙니다.');
    }
    const raw = String(input);
    const warnings = [];

    const authority = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').split(/[/?#]/)[0];
    const atIdx = authority.lastIndexOf('@');
    const rawHostPort = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
    const rawHost = rawHostPort.replace(/:\d*$/, '');

    if (atIdx >= 0 || url.username || url.password) {
      warnings.push('userinfo가 포함되어 있습니다. @ 앞부분은 호스트가 아니라 사용자 정보입니다.');
      if (atIdx >= 0) warnings.push('@ 앞뒤 혼동: 진짜 호스트는 @ 뒤쪽입니다.');
    }
    if (/^\d+$/.test(rawHost)) warnings.push('호스트가 정수형 IP 표기입니다.');
    else if (/^0x[0-9a-f]+$/i.test(rawHost)) warnings.push('호스트가 16진 IP 표기입니다.');
    else if (/0x[0-9a-f]/i.test(rawHost)) warnings.push('호스트에 16진 표기가 섞여 있습니다.');
    // IPv4-ish host with any 0-prefixed octet (e.g. 0177.1) is octal notation
    if (/^[0-9xXa-fA-F.]+$/.test(rawHost) && rawHost.split('.').some((part) => /^0[0-7]+$/.test(part))) {
      warnings.push('호스트가 8진 IP 표기입니다.');
    }
    else if (/^\d+\.\d+\.\d+\.\d+$/.test(rawHost) && !/^(\d{1,3}\.){3}\d{1,3}$/.test(rawHost)) warnings.push('비표준 IP 표기입니다.');
    if (rawHost.startsWith('[') || url.hostname.startsWith('[')) warnings.push('호스트가 IPv6 리터럴입니다.');

    const host = url.hostname.toLowerCase();
    const hostBare = host.replace(/^\[|\]$/g, '');
    const isV6Private = hostBare.includes(':')
      && (/^f[cd][0-9a-f]/.test(hostBare) || /^fe[89ab][0-9a-f]/.test(hostBare));
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]'
      || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
      || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || isV6Private) {
      warnings.push('localhost/사설/루프백 대역 호스트입니다.');
    }
    if (/%2f/i.test(raw)) warnings.push('퍼센트 인코딩된 슬래시(%2f)가 있습니다.');
    if (/%5c/i.test(raw)) warnings.push('퍼센트 인코딩된 역슬래시(%5c)가 있습니다.');
    if (url.pathname.includes('//')) warnings.push('경로에 // 가 연속 사용되었습니다.');
    if (url.port && DEFAULT_PORTS[url.protocol] !== url.port) warnings.push(`비표준 포트 ${url.port}입니다.`);

    return ok({
      scheme: url.protocol.replace(/:$/, ''),
      username: url.username,
      password: url.password,
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      query: [...url.searchParams.entries()],
      fragment: url.hash.replace(/^#/, ''),
      warnings
    });
  };

  // ---------- resolvePath ----------
  const normalize = (combined) => {
    const stack = [];
    let over = false;
    for (const seg of String(combined).split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (stack.length) stack.pop();
        else over = true;
        continue;
      }
      stack.push(seg);
    }
    return { path: `/${stack.join('/')}`, over };
  };

  const resolvePath = (base, input, opts = {}) => {
    const decode = opts.decode || 'none';
    const times = decode === 'once' ? 1 : decode === 'twice' ? 2 : 0;
    let decoded = String(input);
    try {
      for (let i = 0; i < times; i += 1) decoded = decodeURIComponent(decoded);
    } catch (err) {
      return fail(`디코딩 실패: ${err.message}`);
    }
    const combined = `${String(base).replace(/\/+$/, '')}/${decoded.replace(/^\/+/, '')}`;
    // escapes is true if any '..' takes the walk out of the base prefix, even
    // when later segments re-enter, or when the final path ends outside base.
    const baseSegs = normalize(base).path.split('/').filter(Boolean);
    const stack = [];
    let escaped = false;
    const inBase = () => baseSegs.every((seg, i) => stack[i] === seg);
    for (const seg of combined.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (!inBase() || stack.length <= baseSegs.length) escaped = true;
        stack.pop();
        continue;
      }
      stack.push(seg);
    }
    const path = `/${stack.join('/')}`;
    const baseNorm = `/${baseSegs.join('/')}`;
    const escapes = escaped || (path !== baseNorm && !path.startsWith(`${baseNorm === '/' ? '' : baseNorm}/`));
    return ok({
      steps: { decoded, combined, normalized: path },
      path,
      escapes
    });
  };

  return {
    urlEncode, urlDecode, doubleUrlEncode,
    base64Encode, base64Decode,
    hexEncode, hexDecode,
    htmlEntityEncode, htmlEntityDecode,
    unicodeEscape, unicodeUnescape,
    jwtDecode, jwtEncodeUnsigned, jwtSignHS256,
    parseUrl, resolvePath
  };
});
