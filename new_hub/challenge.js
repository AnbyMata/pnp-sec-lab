const legacyAuthenticated = sessionStorage.getItem('pnp_authenticated') === 'true';
if (legacyAuthenticated) localStorage.setItem('pnp_authenticated', 'true');
if (localStorage.getItem('pnp_authenticated') !== 'true' && !legacyAuthenticated) location.replace('challenges.html');

const challengeId = new URLSearchParams(location.search).get('id') || 'sqli-login';
const challenge = window.pnpChallenges.find((item) => item.id === challengeId);
if (!challenge) location.replace('challenges.html');

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
};

document.title = `${challenge.title} | PNP Security Lab`;
setText('.challenge-bar strong', challenge.title);
setText('.bar-label', `CHALLENGE / ${String(window.pnpChallenges.indexOf(challenge) + 1).padStart(2, '0')}`);
setText('#challenge-title', challenge.title);
setText('.eyebrow', `CHALLENGE ${String(window.pnpChallenges.indexOf(challenge) + 1).padStart(2, '0')} / ${challenge.category}`);
setText('.problem h2', challenge.mission);
setText('.description', challenge.description);
setText('.disclosures details:first-child p', challenge.hint);
setText('.disclosures details:last-child p', challenge.theory);
setText('.lab-header h2', `${challenge.category} 실습 환경`);
setText('.browser-bar .address', challenge.labUrl);
document.querySelector('.target-note').textContent = '이 문제의 플래그는 Python 실습 사이트에만 준비되어 있습니다. 실습 환경에서 찾아 제출해 주세요.';

const frame = document.querySelector('#lab-frame');
frame.src = challenge.labUrl;
frame.title = `${challenge.title} Python 실습 사이트`;
document.querySelectorAll('.lab-header a, .browser-bar a').forEach((link) => { link.href = challenge.labUrl; });

const tabs = [...document.querySelectorAll('[role="tab"]')];
const targets = {
  python: { name: 'Python', url: challenge.labUrl },
  php: { name: 'PHP', url: 'http://localhost:10001/' },
  spring: { name: 'Spring', url: 'http://localhost:10003/' }
};
const targetButtons = [...document.querySelectorAll('[data-target]')];
targetButtons.forEach((button) => button.addEventListener('click', () => {
  const target = targets[button.dataset.target];
  if (!target) return;
  targetButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  frame.src = target.url;
  frame.title = `${target.name} 실습 사이트`;
  setText('.browser-bar .address', target.url);
  document.querySelectorAll('.lab-header a, .browser-bar a').forEach((link) => { link.href = target.url; });
}));

function selectTab(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.querySelector(`#panel-${item.dataset.panel}`).hidden = !selected;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next]);
    tabs[next].focus();
  });
});

const solvedKey = 'pnp_completed_challenges';
const readSolved = () => { try { const saved = JSON.parse(localStorage.getItem(solvedKey) || '[]'); return Array.isArray(saved) ? saved : []; } catch { return []; } };
const showSolved = () => {
  document.querySelector('.bar-status').innerHTML = '<i></i> 해결 완료';
  document.querySelector('.badges .unsolved').textContent = '해결 완료';
};
if (readSolved().includes(challenge.id)) showSolved();

document.querySelector('#flag-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const notice = document.querySelector('#flag-notice');
  const button = event.currentTarget.querySelector('button');
  if (!['http:', 'https:'].includes(location.protocol)) {
    notice.textContent = '채점하려면 http://localhost:8000에서 접속해 주세요.';
    return;
  }
  button.disabled = true;
  notice.textContent = '플래그를 확인하고 있습니다.';
  try {
    const response = await fetch(`/api/challenges/${encodeURIComponent(challenge.id)}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag: document.querySelector('#flag').value })
    });
    if (!response.ok) throw new Error('verification unavailable');
    const result = await response.json();
    if (result.correct) {
      const solved = readSolved();
      if (!solved.includes(challenge.id)) localStorage.setItem(solvedKey, JSON.stringify([...solved, challenge.id]));
      notice.textContent = '정답입니다! 챌린지 해결 기록이 내 계정에 저장되었습니다.';
      showSolved();
    } else {
      notice.textContent = '플래그가 일치하지 않습니다. 다시 확인해 주세요.';
    }
  } catch {
    notice.textContent = '채점 서버에 연결하지 못했습니다. Python 실습 서버가 실행 중인지 확인해 주세요.';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#toggle-panel').addEventListener('click', (event) => {
  const collapsed = document.querySelector('#workspace').classList.toggle('collapsed');
  event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
  event.currentTarget.innerHTML = collapsed ? '문제 펼치기 <span>›</span>' : '문제 접기 <span>‹</span>';
});
