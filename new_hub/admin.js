const status=document.querySelector('#admin-status'),panel=document.querySelector('#admin-panel');
const search=document.querySelector('#member-search'),filter=document.querySelector('#member-filter'),refresh=document.querySelector('#admin-refresh');
let currentUser=null,data=null,busy=false;
const label=item=>{
  const challenge=(window.pnpChallenges||[]).find(row=>row.id===item);if(challenge)return challenge.title;
  const match=item.match(/^(.*):ep(\d+)$/),lesson=match&&(window.theoryCatalog||[]).find(row=>row.id===match[1]);
  return lesson?lesson.types[Number(match[2])-1]?.[0]||item:item;
};
function cell(row,text){const td=document.createElement('td');if(text!==undefined)td.textContent=text;row.append(td);return td;}
function progress(td,items,total){
  td.append(document.createTextNode(`${items.length} / ${total} · ${total?Math.round(items.length/total*100):0}%`));
  const bar=document.createElement('progress');bar.max=total||1;bar.value=items.length;bar.setAttribute('aria-label','완료 비율');td.append(bar);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='완료 항목 보기';details.append(summary);
  if(!items.length)details.append(document.createTextNode('완료한 항목이 없습니다.'));
  else{const list=document.createElement('ul');items.forEach(item=>{const li=document.createElement('li');li.textContent=label(item);list.append(li);});details.append(list);}td.append(details);
}
function render(){
  const body=document.querySelector('#member-rows');body.replaceChildren();if(!data)return;
  const query=search.value.trim().toLowerCase();
  const rows=data.users.filter(u=>(u.nickname+' '+u.username).toLowerCase().includes(query)&&(filter.value==='all'||filter.value==='active'&&u.active||filter.value==='suspended'&&!u.active||filter.value==='admin'&&u.role==='admin'));
  for(const user of rows){
    const tr=document.createElement('tr');if(user.id===currentUser.id)tr.className='is-me';
    const name=cell(tr,user.nickname+(user.id===currentUser.id?' (나)':''));const username=document.createElement('span');username.className='member-username';username.textContent=user.username;name.append(username);
    cell(tr,`${user.role==='admin'?'관리자':'일반 회원'} / ${user.active?'활성':'정지'}`);
    progress(cell(tr),user.completedLessons,data.lessonTotal);progress(cell(tr),user.solvedChallenges,data.challengeTotal);
    const controls=cell(tr);controls.className='member-actions';
    for(const [title,action,value] of [[user.active?'계정 정지':'정지 해제','active',!user.active],[user.role==='admin'?'일반 회원으로':'관리자로 지정','role',user.role==='admin'?'member':'admin'],['계정 삭제','delete',null]]){
      const button=document.createElement('button');button.type='button';button.textContent=title;button.disabled=busy||user.id===currentUser.id;if(action==='delete')button.className='danger';
      button.addEventListener('click',()=>change(user,title,action,value));controls.append(button);
    }body.append(tr);
  }
  if(!rows.length){const tr=document.createElement('tr');const td=cell(tr,'해당하는 회원이 없습니다.');td.colSpan=5;body.append(tr);}
}
async function load(){
  refresh.disabled=true;
  try{
    const response=await fetch('/api/admin/users',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'회원 정보를 불러오지 못했습니다.');
    data=result;panel.hidden=false;const summary=document.querySelector('#admin-summary');summary.replaceChildren();
    for(const [title,count] of [['전체 회원',data.users.length],['관리자',data.users.filter(u=>u.role==='admin').length],['정지 계정',data.users.filter(u=>!u.active).length]]){const p=document.createElement('p');p.textContent=title;const strong=document.createElement('strong');strong.textContent=count;p.append(strong);summary.append(p);}
    render();status.textContent='회원 현황을 불러왔습니다.';
  }catch(error){status.textContent=error.message;panel.hidden=true;data=null;}finally{refresh.disabled=false;}
}
async function change(user,title,action,value){
  if(busy||!confirm(`${user.nickname} (${user.username}) 계정을 ${title} 처리할까요?${action==='delete'?' 계정과 학습 기록이 영구 삭제됩니다.':''}`))return;
  busy=true;render();status.textContent='처리하고 있습니다.';
  try{const response=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,action,value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'처리하지 못했습니다.');await load();}
  catch(error){status.textContent=error.message;}finally{busy=false;render();}
}
search.addEventListener('input',render);filter.addEventListener('change',render);refresh.addEventListener('click',load);
window.PnpAuth.ready.then(user=>{if(!user){status.textContent='로그인이 필요합니다.';return;}if(user.role!=='admin'){status.textContent='관리자만 이용할 수 있습니다.';return;}currentUser=user;load();});
