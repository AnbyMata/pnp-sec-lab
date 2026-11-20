const legacyAuthenticated = sessionStorage.getItem('pnp_authenticated') === 'true';
if (legacyAuthenticated) localStorage.setItem('pnp_authenticated', 'true');
let authenticated = localStorage.getItem('pnp_authenticated') === 'true' || legacyAuthenticated;
const guestNotice = document.querySelector('#guest-notice');
const list = document.querySelector('#challenge-list');
const accessDialog = document.querySelector('#access-dialog');
const comingDialog = document.querySelector('#coming-dialog');
if (authenticated) guestNotice.hidden = true;
document.querySelector('#challenge-count').textContent = String(window.pnpChallenges.length).padStart(2, '0');

window.pnpChallenges.forEach((challenge, index) => {
  const card = document.createElement('article');
  card.className = 'learning-card challenge-card';
  const status = challenge.ready ? '실습 가능' : '실습 준비 중';
  card.innerHTML = `<div class="card-number">${String(index + 1).padStart(2, '0')} <span>↗</span></div><div class="card-content"><p class="card-category">PNP CHALLENGE <span>/</span> ${challenge.level}</p><h2>${challenge.title}</h2><p></p><div class="card-meta"><span>${status}</span><span>${challenge.level}</span></div></div><button class="card-state" type="button">챌린지 시작 ↗</button>`;
  card.querySelector('button').addEventListener('click', async () => {
    if (challenge.ready) {
      location.assign(`challenge.html?id=${encodeURIComponent(challenge.id)}`);
      return;
    }
    document.querySelector('#coming-title').textContent = `${challenge.title} 준비 중`;
    comingDialog.showModal();
  });
  card.querySelector('.card-content > p:not(.card-category)').textContent = challenge.description;
  card.querySelector('.card-category').textContent = challenge.category;
  list.append(card);
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

