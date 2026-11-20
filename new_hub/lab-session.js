// Server time is authoritative. Never derive a lease from localStorage or the browser clock.
window.PnpLabSession = {
  connect(onChange, challengeId) {
    const panel = document.querySelector('#lab-session');
    const status = panel.querySelector('[role="status"]');
    const start = panel.querySelector('[data-session="start"]');
    const extend = panel.querySelector('[data-session="extend"]');
    const stop = panel.querySelector('[data-session="stop"]');
    const timer = panel.querySelector('time');
    let desiredTarget = 'python', managed = false, seenState = false;
    let current = { state: 'idle' }, receivedAt = 0, busy = false, serial = 0, lastTargets = '';
    let signedIn = false;
    const remaining = () => Math.max(0, Math.ceil((current.expiresAt || 0) - current.serverTime - (performance.now() - receivedAt) / 1000));
    function render() {
      const running = current.state === 'ready' && remaining() > 0;
      const pending = ['queued', 'starting', 'deleting', 'expired', 'failed'].includes(current.state);
      const switching = current.state === 'other';
      start.textContent = !signedIn ? '로그인 후 시작' : switching ? '전환' : '시작';
      start.setAttribute('aria-label', !signedIn ? '로그인 후 실습 시작' : switching ? '이 문제로 전환' : '실습 시작');
      start.disabled = busy || running || pending;
      extend.disabled = busy || !running || current.expiresAt >= current.maxExpiresAt;
      stop.disabled = busy || !['queued', 'ready', 'starting'].includes(current.state);
      timer.hidden = !running;
      const seconds = remaining();
      timer.textContent = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      timer.dateTime = `PT${seconds}S`;
      const targets = running ? current.targets : null;
      const key = JSON.stringify([desiredTarget, targets]);
      if (key !== lastTargets) { lastTargets = key; onChange(targets, desiredTarget); }
    }
    const messages = { queued: '기존 실습을 정리한 뒤 이 문제의 환경을 준비합니다.', other: '다른 문제 또는 버전이 실행 중입니다. 시작하면 기존 환경을 종료하고 선택한 환경으로 전환합니다.', idle: '실습을 시작하면 개인 환경이 1시간 동안 실행됩니다.', starting: '개인 실습 환경을 준비하고 있습니다. 잠시 기다려 주세요.', ready: '실습 환경 실행 중 · 1시간 연장할 수 있으며 총 실습 시간은 최대 2시간입니다.', expired: '실습 시간이 만료되어 환경을 정리하고 있습니다.', deleting: '실습 환경과 데이터를 삭제하고 있습니다.', failed: '실습 환경 생성에 실패했습니다. 정리 후 다시 시작해 주세요.', stopped: '실습이 종료되었습니다. 다시 시작하면 새 환경이 생성됩니다.' };
    async function request(action) {
      if (!signedIn) return;
      if (busy && !action) return;
      const id = ++serial;
      if (action) busy = true;
      render();
      try {
        const response = await fetch(`/api/lab-sessions${action ? '/' + action : ''}`, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, target: desiredTarget }) } : { cache: 'no-store' });
        const data = await response.json();
        if (id !== serial) return;
        if(response.status===401) { signedIn=false; current={state:'idle'}; throw new Error('로그인 후 실습을 시작할 수 있습니다.'); }
        if (!response.ok) throw new Error(data.error || '실습 상태를 확인하지 못했습니다.');
        if (!seenState && !action && data.challengeId === challengeId && data.target) desiredTarget = data.target;
        seenState = true;
        current = data.challengeId && (data.challengeId !== challengeId || (data.target || 'python') !== desiredTarget) && data.state !== 'stopped' ? { ...data, state: 'other', targets: null } : data; receivedAt = performance.now();
        status.textContent = messages[current.state] || '실습 상태를 확인하고 있습니다.';
      } catch (error) {
        if (id === serial) status.textContent = error.message;
      } finally {
        if (id === serial) { busy = false; render(); }
      }
    }
    [start, extend, stop].forEach(button => button.addEventListener('click', async () => {
      await window.PnpAuth.ready;
      if(!signedIn) { location.assign('login.html'); return; }
      request(button.dataset.session);
    }));
    const configPromise = fetch('/api/config', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('실습 설정을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return response.json();
    }).then(async config => {
      signedIn = !!await window.PnpAuth.ready;
      if(!signedIn) {
        managed=true; panel.hidden=false; render();
        status.textContent='로그인 후 실습을 시작할 수 있습니다.';
        return {...config,tools:{shell:false,attacker:false,'request-workbench':false}};
      }
      if (!config.managedLabs) { onChange(undefined); return config; }
      managed = true;
      panel.hidden = false;
      document.querySelector('.target > span').textContent = 'PERSONAL LAB';
      request();
      setInterval(() => request(), 5000);
      setInterval(render, 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) request(); });
      return config;
    }).catch(error => {
      panel.hidden = false;
      status.textContent = error.message;
      start.disabled = extend.disabled = stop.disabled = true;
      return { tools: { shell: false, attacker: false } };
    });
    configPromise.selectTarget = (target) => {
      if (!managed) return false;
      if (target === desiredTarget) return true;
      const switchRunning = ['queued', 'starting', 'ready', 'other'].includes(current.state);
      seenState = true;
      desiredTarget = target;
      current = { ...current, state: switchRunning ? 'other' : current.state, targets: null };
      render();
      if (switchRunning) request('start');
      return true;
    };
    return configPromise;
  }
};
