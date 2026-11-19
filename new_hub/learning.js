const filters = document.querySelectorAll('[data-filter]');
const list = document.querySelector('#courses');
const search = document.querySelector('#search');
const labels = { server: 'SERVER-SIDE', client: 'CLIENT-SIDE', api: 'API 및 서비스 로직' };
list.replaceChildren();
window.theoryCatalog.forEach((lesson, index) => {
  const article = document.createElement('article');
  article.className = 'learning-card';
  article.dataset.category = lesson.category;
  const number = document.createElement('div');
  number.className = 'card-number';
  number.textContent = String(index + 1).padStart(2, '0');
  const content = document.createElement('div');
  content.className = 'card-content';
  const category = document.createElement('p');
  category.className = 'card-category';
  category.textContent = labels[lesson.category];
  const title = document.createElement('h2');
  title.textContent = lesson.name;
  const description = document.createElement('p');
  description.textContent = lesson.sub;
  const meta = document.createElement('div');
  meta.className = 'card-meta';
  let completed = [];
  try { const saved = JSON.parse(localStorage.getItem('pnp_completed_lessons') || '[]'); if (Array.isArray(saved)) completed = saved; } catch {}
  const count = lesson.types.filter((_, i) => completed.includes(`${lesson.id}:ep${i + 1}`)).length;
  meta.textContent = localStorage.getItem('pnp_authenticated') === 'true' ? `이론 · ${lesson.types.length}개 에피소드 · ${count}개 완료` : `이론 · ${lesson.types.length}개 에피소드`;
  content.append(category, title, description, meta);
  const link = document.createElement('a');
  link.className = 'card-state';
  link.href = `lesson.html?topic=${encodeURIComponent(lesson.id)}`;
  link.textContent = '이론 보기';
  link.setAttribute('aria-label', `${lesson.name} 이론 보기`);
  article.append(number, content, link);
  list.append(article);
});
const courses = [...document.querySelectorAll('.learning-card')];
let activeFilter = 'all';
function updateCourses() {
  const query = search.value.trim().toLocaleLowerCase();
  let count = 0;
  for (const course of courses) {
    const matches = (activeFilter === 'all' || course.dataset.category === activeFilter) && course.textContent.toLocaleLowerCase().includes(query);
    course.hidden = !matches;
    if (matches) count++;
  }
  document.querySelector('#count').textContent = String(count).padStart(2, '0');
  document.querySelector('#empty').hidden = count !== 0;
}
filters.forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  filters.forEach((item) => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  updateCourses();
}));
search.addEventListener('input', updateCourses);
updateCourses();
