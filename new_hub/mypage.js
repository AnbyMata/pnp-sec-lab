if (localStorage.getItem('pnp_authenticated') !== 'true') {
  location.replace('login.html');
}
const readProgress = (key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
const setStat = (selector, count) => {
  const stat = document.querySelector(selector);
  if (stat) stat.innerHTML = `${count}<small>개</small>`;
};
const startedLessons = readProgress('pnp_started_lessons');
const completedLessons = readProgress('pnp_completed_lessons');
setStat('#in-progress-lessons', startedLessons.filter((id) => !completedLessons.includes(id)).length);
setStat('#completed-lessons', completedLessons.length);
setStat('#completed-challenges', readProgress('pnp_completed_challenges').length);
const total = document.querySelector('#total-challenges');
if (total && window.pnpChallenges) total.textContent = String(window.pnpChallenges.length).padStart(2, '0');
