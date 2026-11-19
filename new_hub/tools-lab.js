// tools-lab: development/practice page that mounts every registered tool in
// window.pnpTools against a sample context. Direct access only — the page is
// intentionally not linked from portal navigation.
const ctx = {
  id: 'tools-lab',
  workbenchPresets: [
    { name: 'Echo GET', method: 'GET', url: 'http://localhost:10002/lab/echo', headers: [], body: '' },
    { name: 'Echo POST', method: 'POST', url: 'http://localhost:10002/lab/echo', headers: [['Content-Type', 'text/plain']], body: 'hello tools-lab' }
  ],
  logPaths: undefined,
  queryTemplate: "SELECT * FROM member_modern WHERE user_id='{user_id}' AND password='{password}'",
  terminalChips: [
    { label: '현재 위치/파일 확인', command: 'pwd && ls -la' },
    { label: '실습 서버 헬스 체크', command: 'curl -i http://localhost:10002/health' }
  ]
};

const tabs = [...document.querySelectorAll('[role="tab"]')];

tabs.filter((tab) => tab.dataset.tool).forEach((tab) => {
  const panel = document.getElementById(tab.dataset.panel);
  const mounted = window.pnpTools && window.pnpTools.mountTool(tab.dataset.tool, panel, ctx);
  if (mounted) {
    tab.hidden = false;
    return;
  }
  tab.hidden = true;
  if (panel) panel.hidden = true;
});

function selectTab(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.dataset.panel).hidden = !selected;
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

// Same gate as challenge.js: config.tools[key] === false hides the tool tab.
const TOOL_GATE = { terminal: 'shell', 'exploit-server': 'attacker' };
fetch('/api/config')
  .then((response) => (response.ok ? response.json() : {}))
  .catch(() => ({}))
  .then((config) => {
    const gates = (config && config.tools) || {};
    tabs.forEach((tab) => {
      const tool = tab.dataset.tool;
      if (!tool) return;
      const key = Object.prototype.hasOwnProperty.call(TOOL_GATE, tool) ? TOOL_GATE[tool] : tool;
      if (gates[key] !== false) return;
      tab.hidden = true;
      const panel = document.getElementById(tab.dataset.panel);
      if (panel) panel.hidden = true;
    });
  });
