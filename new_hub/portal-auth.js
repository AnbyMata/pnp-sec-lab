(() => {
  const key = 'pnp_authenticated';
  if (sessionStorage.getItem(key) === 'true') {
    localStorage.setItem(key, 'true');
    sessionStorage.removeItem(key);
  }
  let user = null;
  const update = () => {
    const nav=document.querySelector('.topbar nav');
    if(nav && !nav.querySelector('a[href="dashboard.html"]')) {
      const link=document.createElement('a');link.href='dashboard.html';link.textContent='대시보드';nav.append(link);
    }
    const signedIn = !!user;
    document.querySelectorAll('.topbar .account').forEach(link => {
      link.href = signedIn ? 'mypage.html' : 'login.html';
      link.innerHTML = signedIn
        ? '<span class="avatar" aria-hidden="true"><img src="hacker-avatar-transparent.png?v=20261118" alt=""></span><span>내 계정</span>'
        : '<span class="avatar" aria-hidden="true"><img src="hacker-avatar-transparent.png?v=20261118" alt=""></span><span>로그인</span><span aria-hidden="true">↗</span>';
      if (signedIn) link.querySelector('span:not(.avatar)').textContent = localStorage.getItem('pnp_nickname') || '테스트 사용자';
    });
    const banner = document.querySelector('#guest-notice');
    if (banner) banner.hidden = signedIn;
    let logout = document.querySelector('#portal-logout');
    if (signedIn && !logout && document.querySelector('.topbar')) {
      logout = document.createElement('button');
      logout.id = 'portal-logout';
      logout.type = 'button';
      logout.textContent = '로그아웃';
      logout.addEventListener('click', async () => {
        const response = await fetch('/api/auth/logout', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if (!response.ok) { alert('로그아웃에 실패했습니다.'); return; }
        localStorage.removeItem(key);
        localStorage.removeItem('pnp_nickname');
        sessionStorage.removeItem(key);
        location.assign('home.html');
      });
      document.querySelector('.topbar').append(logout);
    } else if (!signedIn && logout) logout.remove();
  };
  document.addEventListener('DOMContentLoaded', update);
  window.addEventListener('pageshow', update);
  window.addEventListener('storage', update);
  window.PnpAuth = {ready: fetch('/api/auth/me', {cache:'no-store'}).then(response=>{
    if(!response.ok) throw new Error(); return response.json();
  }).then(async data=>{
    user=data.user;
    for (const key of ['pnp_completed_lessons','pnp_started_lessons','pnp_completed_challenges']) localStorage.removeItem(key);
    window.PnpProgress = {
      save(data) {
        localStorage.setItem('pnp_completed_lessons',JSON.stringify(data.completedLessons));
        localStorage.setItem('pnp_started_lessons',JSON.stringify(data.startedLessons));
        localStorage.setItem('pnp_completed_challenges',JSON.stringify(data.solvedChallenges));
      },
      async record(kind,item,complete) {
        const response=await fetch('/api/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,item,complete})});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error || '기록을 저장하지 못했습니다.');
        this.save(data);
      }
    };
    if(user) {
      const response=await fetch('/api/progress',{cache:'no-store'});
      if(!response.ok) throw new Error('학습 기록을 불러오지 못했습니다.');
      window.PnpProgress.save(await response.json());
    }
    localStorage.removeItem(key); localStorage.removeItem('pnp_nickname');
    sessionStorage.removeItem(key);
    if(user) {localStorage.setItem(key,'true');localStorage.setItem('pnp_nickname',user.nickname);}
    update(); return user;
  }).catch(()=>{localStorage.removeItem(key);update();return null;})};
})();
