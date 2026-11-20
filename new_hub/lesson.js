const parameter = new URLSearchParams(location.search).get('topic');
const lesson = window.theoryCatalog.find((item) => item.id === parameter) || (!parameter ? window.theoryCatalog[0] : null);
function highlightSql(code) {
  const text = code.textContent;
  const pattern = /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|\b(?:SELECT|FROM|WHERE|AND|OR|UPDATE|SET|INSERT|INTO|VALUES|ORDER|BY|AS|UNION|NULL|TRUE|FALSE|LIKE|JOIN|ON|LIMIT)\b|\b\d+(?:\.\d+)?\b)/gi;
  const fragment = document.createDocumentFragment();
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(end, match.index)));
    const token = document.createElement('span');
    token.className = match[0].startsWith('--') || match[0].startsWith('/*') ? 'sql-comment' : match[0].startsWith("'") ? 'sql-string' : /^\d/.test(match[0]) ? 'sql-number' : 'sql-keyword';
    token.textContent = match[0];
    fragment.append(token);
    end = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(end)));
  code.replaceChildren(fragment);
}
if (!lesson) {
  document.querySelector('#title').textContent = '학습 주제를 찾을 수 없습니다.';
  document.querySelector('.lesson-layout').hidden = true;
} else {
  window.PnpAuth.ready.then(() => {
  document.title = `${lesson.name} | PNP Security Lab`;
  document.querySelector('#title').textContent = lesson.name;
  document.querySelector('#description').textContent = lesson.sub;
  const navigation = document.querySelector('#topics');
  const related = (window.pnpChallenges || []).find((item) => item.courseId === lesson.id);
  if (related) {
    const link = document.createElement('a');
    link.href = `challenge.html?id=${encodeURIComponent(related.id)}`;
    link.textContent = `관련 챌린지: ${related.title}`;
    link.style.display = 'block';
    link.style.marginBottom = '16px';
    document.querySelector('.completion').prepend(link);
  }
  const readProgress = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  };
  const completeButton = document.querySelector('#complete-lesson');
  const nextButton = document.querySelector('#next-episode');
  const completeNote = document.querySelector('#completion-note');
  let activeTopic = 0;
  const progressKey = () => `${lesson.id}:ep${activeTopic + 1}`;
  function updateCompletion() {
    const completed = readProgress('pnp_completed_lessons').includes(progressKey());
    completeButton.setAttribute('aria-pressed', String(completed));
    completeButton.textContent = completed ? '학습 완료 취소' : '학습 완료';
    completeNote.textContent = completed ? '이 에피소드를 완료했어요. 다시 누르면 완료가 취소됩니다.' : '완료하면 내 계정의 학습 기록에 반영됩니다.';
  }
  completeButton.addEventListener('click', async () => {
    if (localStorage.getItem('pnp_authenticated') !== 'true') {
      completeNote.textContent = '학습 완료 기록은 로그인 후 저장할 수 있습니다.';
      return;
    }
    const key = progressKey();
    const completed = readProgress('pnp_completed_lessons');
    completeButton.disabled=true;
    try {
      await window.PnpProgress.record('lesson',key,!completed.includes(key));
      updateCompletion();
    } catch(error) { completeNote.textContent=error.message; }
    finally {completeButton.disabled=false;}
  });
  nextButton.addEventListener('click', () => {
    render(activeTopic + 1);
    document.querySelector('.lesson-heading').scrollIntoView({ behavior: 'smooth' });
  });
  const buttons = lesson.types.map(([title], topic) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = title;
    button.addEventListener('click', () => render(topic));
    navigation.append(button);
    return button;
  });
  function render(topic) {
    activeTopic = topic;
    if (localStorage.getItem('pnp_authenticated') === 'true') {
      const key = progressKey();
      const started = readProgress('pnp_started_lessons').filter((item) => item !== key);
      localStorage.setItem('pnp_started_lessons', JSON.stringify([...started, key]));
      if(lesson.id==='sql-injection' && topic<4) window.PnpProgress.record('started',key,true).catch(error=>{completeNote.textContent=error.message;});
    }
    nextButton.hidden = topic >= lesson.types.length - 1;
    nextButton.textContent = `EP.${topic + 2} →`;
    buttons.forEach((button, i) => button.setAttribute('aria-current', String(i === topic)));
    document.querySelector('#topic-title').textContent = lesson.types[topic][0];
    document.querySelector('#topic-intro').textContent = lesson.types[topic][1];
    document.querySelector('#section-count').textContent = `${String(topic + 1).padStart(2, '0')} / ${String(lesson.types.length).padStart(2, '0')}`;
    const container = document.querySelector('#theory-content');
    container.replaceChildren();
    const body = document.querySelector('#episode-body');
    body.replaceChildren();
    if (lesson.id === 'sql-injection') {
      const urls = ['https://anbymata.tistory.com/81', 'https://anbymata.tistory.com/83', 'https://anbymata.tistory.com/86', 'https://anbymata.tistory.com/87'];
      if (urls[topic]) {
        const link = document.createElement('a');
        link.href = urls[topic];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `블로그 원문: ${urls[topic]}`;
        container.append(link);
      }
      if (topic === 0) body.innerHTML = window.sqlInjectionEp1;
      if (topic === 1) body.innerHTML = window.sqlInjectionEp2;
      if (topic === 2) body.innerHTML = window.sqlInjectionEp3;
      if (topic === 3) body.innerHTML = window.sqlInjectionEp4;
      body.querySelectorAll('table').forEach((table) => {
        if (!table.textContent.includes('[보충 설명]')) table.classList.add('comparison-table');
      });
      body.querySelectorAll('pre.sql code, pre[data-ke-language="sql"] code').forEach(highlightSql);
    }
    updateCompletion();
    if(lesson.id!=='sql-injection' || topic>=4) {
      completeButton.disabled=true;
      completeNote.textContent='준비 중인 에피소드는 학습 진도율에 포함되지 않습니다.';
    } else completeButton.disabled=false;
  }
  const requestedEpisode = Number(new URLSearchParams(location.search).get('episode'));
  render(Number.isInteger(requestedEpisode) && requestedEpisode >= 1 && requestedEpisode <= lesson.types.length ? requestedEpisode - 1 : 0);
  });
}
