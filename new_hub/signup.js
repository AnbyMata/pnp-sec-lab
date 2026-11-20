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
document.querySelector('#signup-form').addEventListener('submit', async event => {
  event.preventDefault();
  if(password.value !== document.querySelector('#password-confirm').value) { notice.textContent='비밀번호가 일치하지 않습니다.'; return; }
  const button=event.currentTarget.querySelector('[type=submit]'); button.disabled=true;
  try {
    const response=await fetch('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('#username').value,nickname:document.querySelector('#name').value,password:password.value,inviteCode:document.querySelector('#invite-code').value.trim()})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || '회원가입에 실패했습니다.');
    localStorage.setItem('pnp_authenticated','true'); localStorage.setItem('pnp_nickname',data.user.nickname);
    location.assign('home.html');
  } catch(error) {notice.textContent=error.message;} finally {button.disabled=false;}
});
