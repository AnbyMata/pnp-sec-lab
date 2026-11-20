const status=document.querySelector('#rank-status');
const refresh=document.querySelector('#refresh-ranks');
const percent=(count,total)=>`${total?Math.round(count/total*100):0}%`;
function rows(selector,data,total,learning) {
  const body=document.querySelector(selector);body.replaceChildren();
  data.top.forEach(row=>{
    const tr=document.createElement('tr');if(row.isMe) tr.className='is-me';
    const values=[row.rank,`${row.nickname}${row.isMe?' (나)':''}`,...(learning?[percent(row.count,total),`${row.count} / ${total}`]:[`${row.count}개`])];
    values.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});body.append(tr);
  });
  if(!data.top.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=learning?4:3;td.textContent='아직 참여 기록이 없습니다.';tr.append(td);body.append(tr);}
}
async function load() {
  refresh.disabled=true;status.textContent='기록을 불러오고 있습니다.';
  try {
    const user=await window.PnpAuth.ready;
    if(!user){status.textContent='로그인하면 대시보드를 볼 수 있습니다.';const link=document.createElement('a');link.href='login.html';link.textContent=' 로그인하기 →';status.append(link);return;}
    const response=await fetch('/api/dashboard',{cache:'no-store'});const data=await response.json();
    if(!response.ok) throw new Error(data.error || '순위를 불러오지 못했습니다.');
    rows('#learning-ranks',data.learning,data.lessonTotal,true);rows('#challenge-ranks',data.challenges,data.challengeTotal,false);
    document.querySelector('#learning-note').textContent=`공개된 ${data.lessonTotal}개 에피소드의 완료 비율`;
    document.querySelector('#my-learning').textContent=data.learning.me?`내 순위 ${data.learning.me.rank}위 · ${percent(data.learning.me.count,data.lessonTotal)}`:'';
    document.querySelector('#my-challenges').textContent=data.challenges.me?`내 순위 ${data.challenges.me.rank}위 · ${data.challenges.me.count}개 해결`:'';
    status.textContent=`전체 ${data.learners}명 · ${new Date().toLocaleTimeString('ko-KR')} 기준`;
  } catch(error){status.textContent=error.message;} finally {refresh.disabled=false;}
}
refresh.addEventListener('click',load);load();
