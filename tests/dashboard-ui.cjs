const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const data={lessonTotal:4,challengeTotal:6,learners:2,learning:{top:[{rank:1,nickname:'학습왕',count:4,isMe:false},{rank:2,nickname:'테스트',count:2,isMe:true}],me:{rank:2,count:2}},challenges:{top:[{rank:1,nickname:'테스트',count:3,isMe:true}],me:{rank:1,count:3}}};
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());let body;
   if(url.pathname==='/api/auth/me') body={user:{id:'me',nickname:'테스트'}};
   if(url.pathname==='/api/progress') body={completedLessons:[],startedLessons:[],solvedChallenges:[]};
   if(url.pathname==='/api/dashboard') body=data;
   if(body) return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   const file=path.join(__dirname,'..','new_hub',url.pathname);
   if(!fs.existsSync(file)) return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('http://portal.test/dashboard.html');
  await page.getByText('내 순위 2위 · 50%').waitFor();
  assert.match(await page.locator('#learning-ranks').innerText(),/100%/);
  assert.match(await page.locator('#challenge-ranks').innerText(),/3개/);
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  console.log('PASS dashboard: ranking, own rank, desktop and mobile layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
