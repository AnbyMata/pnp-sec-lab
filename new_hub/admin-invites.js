window.PnpAuth.ready.then(user=>{
 if(user?.role!=='admin')return;
 const section=document.createElement('section');section.className='invite-management';
 const title=document.createElement('h2');title.textContent='현장 가입 코드';
 const note=document.createElement('p');note.textContent='1회용 코드를 발급해 현장에서 전달하세요. 코드 원문은 발급 직후 한 번만 표시됩니다.';
 const days=document.createElement('input');days.type='number';days.min='1';days.max='30';days.value='7';days.setAttribute('aria-label','코드 유효기간(일)');
 const button=document.createElement('button');button.textContent='가입 코드 발급';button.type='button';
 const result=document.createElement('p');result.setAttribute('role','status');
 const code=document.createElement('input');code.readOnly=true;code.hidden=true;code.setAttribute('aria-label','새 가입 코드');code.style.width='100%';code.addEventListener('click',()=>code.select());
 const list=document.createElement('div');
 section.append(title,note,days,document.createTextNode(' 일 '),button,result,code,list);document.querySelector('#admin-panel').prepend(section);
 async function request(body){const response=await fetch('/api/admin/invites',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'처리하지 못했습니다.');return data;}
 async function load(){try{const data=await request();list.replaceChildren();for(const item of data.invites){const p=document.createElement('p');const state=item.used_by?'사용 완료':item.revoked?'폐기':item.expires*1000<Date.now()?'만료':'사용 가능';p.textContent=`${item.id.slice(0,8)} · ${state} · 만료 ${new Date(item.expires*1000).toLocaleString('ko-KR')} `;if(state==='사용 가능'){const revoke=document.createElement('button');revoke.textContent='폐기';revoke.type='button';revoke.onclick=async()=>{if(!confirm('이 코드를 폐기할까요?'))return;revoke.disabled=true;try{await request({action:'revoke',id:item.id});await load();}catch(e){result.textContent=e.message;revoke.disabled=false;}};p.append(revoke);}list.append(p);}if(!data.invites.length)list.textContent='발급된 코드가 없습니다.';}catch(e){result.textContent=e.message;}}
 button.onclick=async()=>{button.disabled=true;code.value='';code.hidden=true;try{const data=await request({action:'issue',days:Number(days.value)});code.value=data.code;code.hidden=false;result.textContent='코드를 복사해 보관하세요. 새로고침하면 다시 볼 수 없습니다.';await load();}catch(e){result.textContent=e.message;}finally{button.disabled=false;}};
 load();
});
