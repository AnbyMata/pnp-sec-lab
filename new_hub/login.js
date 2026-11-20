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
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.querySelector('#email').value.trim().toLowerCase();
  const button=form.querySelector('[type=submit]'); button.disabled=true;
  try {
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:password.value})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || '로그인에 실패했습니다.');
    localStorage.setItem('pnp_nickname', data.user.nickname);
    localStorage.setItem('pnp_authenticated', 'true');
    window.location.assign('home.html');
  } catch(error) { notice.textContent=error.message; }
  finally { button.disabled=false; }
});
