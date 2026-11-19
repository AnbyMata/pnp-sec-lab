const fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
 const file='reports/training-command-check.json',report=JSON.parse(fs.readFileSync(file));
 const mark=(i,j,proof,detail)=>{const row=report.find(x=>x.i===i&&x.j===j);Object.assign(row,{proof,detail,status:proof?'verified':'failed'});if(!proof)throw Error(detail)};
 const b=await chromium.launch({headless:true});
 const context=await b.newContext();const page=await context.newPage();const alerts=[];
 page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept()});
 try{
  await page.goto('http://localhost:10002/board?keyword='+encodeURIComponent('<script>alert(1)</script>'),{waitUntil:'domcontentloaded'});
  mark(1,0,alerts.includes('1'),'Browser alert(1) observed');
  const form={author:'verify-stored',password:'verify123',subject:'verification-stored-xss',content:'<script>alert(2)</script>',allow_html:'T'};
  const r=await context.request.post('http://localhost:10002/board/write',{form,maxRedirects:0});
  const loc=r.headers().location;if(!loc)throw Error('Missing post location');
  try{await page.goto('http://localhost:10002'+loc,{waitUntil:'domcontentloaded'});mark(1,1,alerts.includes('2'),'Stored browser alert(2) observed');}
  finally{await context.request.post('http://localhost:10002'+loc+'/delete',{form:{password:'verify123'}})}
  await context.request.post('http://localhost:10002/login',{form:{user_id:'test',password:'test1234'}});
  await page.goto('http://localhost:10002/profile',{waitUntil:'domcontentloaded'});
  mark(2,0,(await page.locator('h1').innerText()).includes('csrf_demo'),'Nickname changed without CSRF token');
  await context.request.get('http://localhost:10002/profile/nickname',{params:{nickname:'보라냥이'}});
  for(const row of report)if(row.proof===true&&!row.status)row.status='verified';
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log('Verified:',report.filter(x=>x.status==='verified').length,'Unavailable:',report.filter(x=>x.status==='not-implemented').length);
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
