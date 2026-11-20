
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
setText('#theory-text', challenge.theory);
setText('.badges span:first-child', challenge.level);
setText('.badges span:nth-child(2)', challenge.category);
const theoryLink = document.createElement('a');
theoryLink.href = `lesson.html?topic=${encodeURIComponent(challenge.courseId)}`;
theoryLink.textContent = '관련 학습 과정 보기';
document.querySelector('.disclosures details:last-child').append(theoryLink);
document.querySelector('.target-note').textContent = 'PHP·Python·Spring 실습 사이트를 선택할 수 있습니다. 이 챌린지의 전용 문제와 최종 플래그는 Python에서 제공됩니다.';
document.querySelector('.flag-note').textContent = '최종 플래그 하나를 제출하면 해결 기록이 현재 브라우저에 저장됩니다.';

const hintList = document.querySelector('#hint-list');
const hintItems = Array.isArray(challenge.hints) && challenge.hints.length ? challenge.hints : [challenge.hint];
hintItems.forEach((text, index) => {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = hintItems.length > 1 ? `힌트 ${index + 1} ` : '힌트 보기 ';
  const marker = document.createElement('span');
  marker.textContent = '+';
  summary.append(marker);
  const body = document.createElement('p');
  body.textContent = text;
  details.append(summary, body);
  hintList.append(details);
});

const frame = document.querySelector('#lab-frame');
frame.src = 'about:blank';
frame.title = `${challenge.title} Python 실습 사이트`;
document.querySelectorAll('.lab-header a, .browser-bar a').forEach((link) => { link.href = challenge.labUrl; });

const tabs = [...document.querySelectorAll('[role="tab"]')];
const alternatePaths = {
  'sqli-login': { php: '/member/member_login.php', spring: '/login' },
  'ssrf-oracle': { php: '/oracle.php', spring: '/oracle' },
  'upload-filter': { php: '/board/board_write.php', spring: '/board/write' }
};
const paths = alternatePaths[challenge.id] || { php: '/', spring: '/' };
const targets = {
  python: { name: 'Python', url: challenge.labUrl },
  php: { name: 'PHP', url: `http://localhost:10001${paths.php}` },
  spring: { name: 'Spring', url: `http://localhost:10003${paths.spring}` }
};
let currentTarget = targets.python;
let labAvailable = false;
let managedLabMode = false;
const labHome = document.querySelector('#lab-home');
const labAddress = document.querySelector('#lab-address');
const labAddressError = document.querySelector('#lab-address-error');
const labGo = document.querySelector('#lab-go');
const labLinks = [...document.querySelectorAll('.lab-header a, .browser-bar a')];
function openTarget() {
  frame.src = labAvailable ? currentTarget.url : 'about:blank';
  frame.title = `${currentTarget.name} 실습 사이트`;
  labAddress.value = labAvailable ? currentTarget.url : '';
  labAddress.disabled = !labAvailable;
  labGo.disabled = !labAvailable;
  labAddressError.hidden = true;
  labHome.disabled = !labAvailable;
  labLinks.forEach(link => {
    if (labAvailable) { link.href = currentTarget.url; link.removeAttribute('aria-disabled'); }
    else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
  });
}
openTarget();
const labConfig = window.PnpLabSession.connect((bases, selectedTarget) => {
  if (selectedTarget && targets[selectedTarget]) {
    currentTarget = targets[selectedTarget];
    document.querySelectorAll('[data-target]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.target === selectedTarget)));
  }
  labAvailable = bases !== null;
  if (bases) {
    const pythonPath = new URL(challenge.labUrl);
    if (bases.python) targets.python.url = bases.python + pythonPath.pathname + pythonPath.search;
    if (bases.php) targets.php.url = bases.php + paths.php;
    if (bases.spring) targets.spring.url = bases.spring + paths.spring;
  }
  openTarget();
}, challenge.id);
document.querySelector('#lab-home').addEventListener('click', () => {
  if (labAvailable) openTarget();
});
document.querySelector('#lab-address-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!labAvailable) return;
  try {
    const base = new URL(currentTarget.url);
    const destination = new URL(labAddress.value.trim(), base);
    if (!['http:', 'https:'].includes(destination.protocol) || destination.origin !== base.origin || destination.username || destination.password) throw new Error('invalid address');
    frame.src = destination.href;
    labAddress.value = destination.href;
    labLinks.forEach(link => { link.href = destination.href; });
    labAddressError.hidden = true;
  } catch {
    labAddressError.textContent = '현재 선택한 실습 서버의 주소나 경로를 입력해 주세요.';
    labAddressError.hidden = false;
  }
});
const targetButtons = [...document.querySelectorAll('[data-target]')];
targetButtons.forEach((button) => button.addEventListener('click', () => {
  if (button.getAttribute('aria-pressed') === 'true') {
    selectTab(document.querySelector('#tab-site'));
    return;
  }
  const target = targets[button.dataset.target];
  if (!target) return;
  currentTarget = target;
  targetButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  if (labConfig.selectTarget(button.dataset.target)) labAvailable = false;
  openTarget();
  selectTab(document.querySelector('#tab-site'));
}));

function selectTab(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.querySelector(`#panel-${item.dataset.panel}`).hidden = !selected;
  });
}
tabs.forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const navTabs = tabs.filter((item) => !item.hidden);
    const index = navTabs.indexOf(tab);
    if (index === -1) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? navTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + navTabs.length) % navTabs.length;
    selectTab(navTabs[next]);
    navTabs[next].focus();
  });
});

// Tool tabs (data-tool="<name>") mount only when the challenge declares the
// tool and it is registered in window.pnpTools; otherwise they stay hidden.
tabs.filter((tab) => tab.dataset.tool).forEach((tab) => {
  const name = tab.dataset.tool;
  const panel = document.getElementById(tab.getAttribute('aria-controls'));
  const declared = Array.isArray(challenge.tools) && challenge.tools.includes(name);
  const mounted = declared && window.pnpTools && window.pnpTools.mountTool(name, panel, challenge);
  if (!mounted) {
    tab.hidden = true;
    if (panel) panel.hidden = true;
  }
});

// Server-side tool gates (GET /api/config -> tools.<key>): a tool tab is
// hidden whenever its gate is exactly false. Gate keys can differ from tool
// names — the lab shell gates the terminal tab, the attacker service gates
// the exploit-server tab.
const TOOL_GATE = { terminal: 'shell', 'exploit-server': 'attacker' };
labConfig
  .then((config) => {
    if (config.managedLabs) {
      managedLabMode = true;
      setText('.target-note', '사이트 전체 기능은 공통으로 제공하며 선택한 문제의 플래그만 활성화합니다. 선택한 버전과 필요한 DB만 실행합니다. 버전을 바꾸면 기존 환경을 삭제하고 새로 시작합니다. 최종 플래그는 Python에서 제공합니다.');
    }
    const gates = (config && config.tools) || {};
    tabs.forEach((tab) => {
      const tool = tab.dataset.tool;
      if (!tool) return;
      const key = Object.prototype.hasOwnProperty.call(TOOL_GATE, tool) ? TOOL_GATE[tool] : tool;
      if (gates[key] !== false) return;
      tab.hidden = true;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = true;
    });
  });

const solvedKey = 'pnp_completed_challenges';
const readSolved = () => { try { const saved = JSON.parse(localStorage.getItem(solvedKey) || '[]'); return Array.isArray(saved) ? saved : []; } catch { return []; } };
const showSolved = () => {
  const status = document.querySelector('.bar-status');
  status.replaceChildren(document.createElement('i'), document.createTextNode(' 해결 완료'));
  document.querySelector('.badges .unsolved').textContent = '해결 완료';
};
window.PnpAuth.ready.then(()=>{if(readSolved().includes(challenge.id)) showSolved();});

document.querySelector('#flag-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const notice = document.querySelector('#flag-notice');
  const button = event.currentTarget.querySelector('button');
  if (managedLabMode && currentTarget !== targets.python) {
    notice.textContent = '최종 플래그는 Python 버전에서 찾아 제출해 주세요. PHP·Spring은 비교 실습용입니다.';
    return;
  }
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
      notice.textContent = '정답입니다! 계정에 챌린지 해결 기록이 저장되었습니다.';
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
  const button = event.currentTarget;
  button.setAttribute('aria-expanded', String(!collapsed));
  const marker = document.createElement('span');
  marker.textContent = collapsed ? '›' : '‹';
  button.replaceChildren(document.createTextNode(collapsed ? '문제 펼치기 ' : '문제 접기 '), marker);
});
