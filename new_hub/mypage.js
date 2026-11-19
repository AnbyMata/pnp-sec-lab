if (localStorage.getItem('pnp_authenticated') !== 'true') location.replace('login.html');
const readProgress = (key) => {
  try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(saved) ? saved : []; }
  catch { return []; }
};
const lessons = window.theoryCatalog || [];
const started = readProgress('pnp_started_lessons');
const completed = readProgress('pnp_completed_lessons');
const challenges = window.pnpChallenges || [];
const solved = readProgress('pnp_completed_challenges');
const findEpisode = (key) => {
  const match = typeof key === 'string' && key.match(/^(.*):ep(\d+)$/);
  if (!match) return null;
  const lesson = lessons.find((item) => item.id === match[1]);
  const episode = Number(match[2]);
  return lesson && episode >= 1 && episode <= lesson.types.length ? { key, lesson, episode, title: lesson.types[episode - 1][0] } : null;
};
const startedItems = [...new Set(started)].map(findEpisode).filter(Boolean);
const solvedItems = challenges.filter((item) => solved.includes(item.id));
const setStat = (selector, count) => { document.querySelector(selector).innerHTML = `${count}<small>개</small>`; };
const courseProgress = lessons.map((lesson) => {
  const keys = lesson.types.map((_, i) => `${lesson.id}:ep${i + 1}`);
  return {
    started: keys.some((key) => started.includes(key) || completed.includes(key)),
    completed: keys.length > 0 && keys.every((key) => completed.includes(key))
  };
});
setStat('#in-progress-lessons', courseProgress.filter((course) => course.started && !course.completed).length);
setStat('#completed-lessons', courseProgress.filter((course) => course.completed).length);
setStat('#completed-challenges', solvedItems.length);
const course = document.querySelector('.course');
const latestCourse = [...startedItems].reverse().find((item) =>
  item.lesson.types.some((_, i) => !completed.includes(`${item.lesson.id}:ep${i + 1}`))
);
let last = null;
if (latestCourse) {
  last = [...startedItems].reverse().find((item) => item.lesson.id === latestCourse.lesson.id && !completed.includes(item.key));
  if (!last) {
    const episode = latestCourse.lesson.types.findIndex((_, i) => !completed.includes(`${latestCourse.lesson.id}:ep${i + 1}`)) + 1;
    last = findEpisode(`${latestCourse.lesson.id}:ep${episode}`);
  }
}
if (last) {
  const count = last.lesson.types.filter((_, i) => completed.includes(`${last.lesson.id}:ep${i + 1}`)).length;
  const percent = Math.round(count / last.lesson.types.length * 100);
  course.querySelector('.course-category').textContent = 'LEARNING · 학습 중';
  course.querySelector('h3').textContent = last.lesson.name;
  course.querySelector('.course-task').textContent = last.title;
  course.querySelector('.progress-caption strong').textContent = `${percent}%`;
  const bar = course.querySelector('[role="progressbar"]');
  bar.setAttribute('aria-label', `${last.lesson.name} 학습 진행도`);
  bar.setAttribute('aria-valuenow', percent);
  bar.querySelector('span').style.width = `${percent}%`;
  const link = course.querySelector('.course-action');
  link.href = `lesson.html?topic=${encodeURIComponent(last.lesson.id)}&episode=${last.episode}`;
  link.textContent = '이어서 학습하기';
} else {
  course.replaceChildren();
  const message = document.createElement('p');
  message.textContent = '학습 중인 에피소드가 없습니다.';
  const link = document.createElement('a');
  link.className = 'course-action'; link.href = 'learning.html'; link.textContent = '학습 목록 보기';
  course.append(message, link);
}
const timeline = document.querySelector('.timeline');
timeline.replaceChildren();
const recent = [...startedItems].reverse().slice(0, 5);
if (!recent.length) timeline.textContent = '아직 학습 기록이 없습니다.';
recent.forEach((item) => {
  const row = document.createElement('div');
  const dot = document.createElement('span'); dot.className = 'dot';
  const details = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = item.title;
  const state = document.createElement('p'); state.textContent = completed.includes(item.key) ? '학습 완료' : '학습 중';
  details.append(title, state); row.append(dot, details); timeline.append(row);
});
const challengeTotal = document.querySelector('.challenge-total strong');
challengeTotal.replaceChildren(document.createTextNode(`${solvedItems.length} `));
const small = document.createElement('small'); small.textContent = `/ ${String(challenges.length).padStart(2, '0')}`; challengeTotal.append(small);
const percent = challenges.length ? Math.round(solvedItems.length / challenges.length * 100) : 0;
document.querySelector('.challenge-total > span').textContent = `${percent}%`;
const challengeBar = document.querySelector('.challenge-body [role="progressbar"]');
challengeBar.setAttribute('aria-valuenow', percent); challengeBar.querySelector('span').style.width = `${percent}%`;
const empty = document.querySelector('.empty-challenges');
if (solvedItems.length) {
  empty.remove();
  const head = document.querySelector('.recent-head');
  solvedItems.slice(-5).reverse().forEach((item) => {
    const row = document.createElement('div'); row.className = 'challenge-row'; row.textContent = item.title; head.after(row);
  });
}
