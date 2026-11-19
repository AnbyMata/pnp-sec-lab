(() => {
  const key = 'pnp_authenticated';
  if (sessionStorage.getItem(key) === 'true') {
    localStorage.setItem(key, 'true');
    sessionStorage.removeItem(key);
  }
  const update = () => {
    const signedIn = localStorage.getItem(key) === 'true';
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
      logout.addEventListener('click', () => {
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
})();
