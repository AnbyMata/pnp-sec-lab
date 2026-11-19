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
document.querySelector('#send-code').addEventListener('click', () => { notice.textContent = '이메일 인증 코드 발송 기능은 준비 중입니다.'; });
document.querySelector('#verify-code').addEventListener('click', () => { notice.textContent = '인증 코드 확인 기능은 준비 중입니다.'; });
document.querySelector('#signup-form').addEventListener('submit', event => {
  event.preventDefault();
  notice.textContent = password.value !== document.querySelector('#password-confirm').value ? '비밀번호가 일치하지 않습니다.' : '가입 신청이 접수되었습니다. 이메일 인증과 관리자 승인 후 로그인할 수 있습니다.';
});
