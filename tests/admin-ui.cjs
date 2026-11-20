const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});let role='admin',changed=false;
 const data={lessonTotal:4,challengeTotal:6,users:[{id:'me',username:'admin',nickname:'관리자',role:'admin',active:1,completedLessons:[],startedLessons:[],solvedChallenges:[]},{id:'other',username:'member',nickname:'회원',role:'member',active:1,completedLessons:['sql-injection:ep1'],startedLessons:[],solvedChallenges:['sqli-login']}]};
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());let body;
  if(url.pathname==='/api/auth/me')body={user:{id:'me',nickname:'관리자',role}};
  if(url.pathname==='/api/progress')body={completedLessons:[],startedLessons:[],solvedChallenges:[]};
  if(url.pathname==='/api/admin/invites')body=route.request().method()==='POST'?{code:'onsite-code-example-for-test',id:'invite1',expires:Date.now()/1000+86400}:{invites:[]};
  if(url.pathname==='/api/admin/users'){
   if(route.request().method()==='POST'){const change=route.request().postDataJSON();assert.equal(change.userId,'other');assert.equal(change.value,false);changed=true;data.users[1].active=0;body={ok:true};}else body=data;
  }
  if(body)return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  const file=path.join(__dirname,'..','new_hub',url.pathname);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html',body:fs.readFileSync(file)});
 });
 await page.goto('http://portal.test/admin.html');await page.getByText('회원 현황을 불러왔습니다.').waitFor();
 assert.equal(await page.locator('#member-rows tr').count(),2);assert.match(await page.locator('#member-rows').innerText(),/25%/);
 await page.getByRole('button',{name:'가입 코드 발급'}).click();await page.getByLabel('새 가입 코드').waitFor();assert.equal(await page.getByLabel('새 가입 코드').inputValue(),'onsite-code-example-for-test');
 assert.equal(await page.locator('#member-rows tr').first().getByRole('button',{name:'계정 삭제'}).isDisabled(),true);
 await page.locator('#member-search').fill('member');assert.equal(await page.locator('#member-rows tr').count(),1);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'계정 정지',exact:true}).click();await page.getByRole('button',{name:'정지 해제'}).waitFor();assert.equal(changed,true);
 await page.setViewportSize({width:390,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 role='member';await page.reload();await page.getByText('관리자만 이용할 수 있습니다.').waitFor();assert.equal(await page.locator('#admin-panel').isHidden(),true);
 console.log('PASS admin UI: progress, search, suspension, self protection, access, mobile');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
