const fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true});const context=await b.newContext();const page=await context.newPage();const results=[];
 const check=(ok,name)=>{results.push({name,passed:!!ok});console.log(ok?'PASS':'FAIL',name);if(!ok)throw Error(name)};
 try{
  const alerts=[];page.on('dialog',async d=>{alerts.push(d.message());await d.accept()});
  await page.goto('http://localhost:10002/lab/dom#%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  check(alerts.includes('1'),'DOM XSS URL executes alert');
  await context.request.post('http://localhost:10002/login',{form:{user_id:'admin',password:'P@ssw0rd'}});
  let r=await context.request.get('http://localhost:10002/lab/profile?user_id=admin');check((await r.json()).viewer==='admin','Before CSRF viewer is admin');
  await page.goto('http://localhost:8000/lab/login-csrf.html?run=1');await page.waitForURL('http://localhost:10002/');
  r=await context.request.get('http://localhost:10002/lab/profile?user_id=admin');check((await r.json()).viewer==='test','Cross-origin login CSRF URL changes viewer to test');
  const token='check-'+Date.now();
  r=await context.request.get('http://localhost:10002/lab/callbacks',{params:{token}});check(!(await r.text()).includes('class="success"'),'No initial callback');
  r=await context.request.get('http://localhost:10002/lab/blind',{params:{url:'http://127.0.0.1:9001/observe?token='+token,token}});const html=await r.text();check(r.ok()&&!html.includes('PRIVATE_CALLBACK_BODY'),'Blind request hides target body');
  await page.goto('http://localhost:10002/lab/callbacks?token='+token);check((await page.locator('#callback-events .success').count())===1,'Receiver records exactly one callback');
  await page.goto('http://localhost:10002/lab/rainbow?hash=4c8467fc2428bd3fffd752c7ce3d895d');check((await page.locator('#rainbow-result').innerText()).includes('cat07'),'Rainbow URL recovers cat07');
  await page.goto('http://localhost:10002/lab/rainbow?admin_id=1');check((await page.locator('#admin-record').innerText()).includes('lab_admin')&&(await page.locator('#rainbow-result').innerText()).includes('cat07'),'Dedicated admin table hash lookup');
  r=await context.request.get('http://localhost:10002/lab/rainbow?admin_id=99999');check(r.ok()&&!(await r.text()).includes('id="rainbow-result"'),'Missing admin does not produce match');
  r=await context.request.get('http://localhost:10002/lab/rainbow?hash=invalid');check(r.ok()&&!(await r.text()).includes('id="rainbow-result"'),'Invalid hash does not produce match');
  fs.writeFileSync('reports/url-labs-check.json',JSON.stringify(results,null,2));
  const reportFile='reports/training-command-check.json';
  if(fs.existsSync(reportFile)){
   const report=JSON.parse(fs.readFileSync(reportFile));
   for(const [i,j] of [[1,2],[2,1],[3,1],[4,2]])Object.assign(report.find(x=>x.i===i&&x.j===j),{status:'verified',proof:true,detail:'URL lab verified; see url-labs-check.json'});
   fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  }
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
