const form = document.querySelector('#login-form');
const notice = document.querySelector('#notice');
const password = document.querySelector('#password');
const toggle = document.querySelector('.show-password');

toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? '숨기기' : '보기';
  toggle.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 표시');
  toggle.setAttribute('aria-pressed', String(show));
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.querySelector('#email').value.trim().toLowerCase();
  if (email === 'test@pnp.local' && password.value === 'pnp1234') {
    localStorage.setItem('pnp_nickname', '테스트 사용자');
    localStorage.setItem('pnp_authenticated', 'true');
    window.location.assign('home.html');
  } else {
    notice.textContent = '계정 정보가 없거나 아직 관리자 승인을 기다리고 있습니다.';
  }
});
