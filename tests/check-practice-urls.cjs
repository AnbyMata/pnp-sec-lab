const fs=require('fs'),vm=require('vm');const {chromium}=require('playwright');
const source=fs.readFileSync('hub/index.html','utf8');const start=source.indexOf('const webExamples=');
const web=vm.runInNewContext(source.slice(start,source.indexOf('\n];',start)+3)+'\nwebExamples');
const context={window:{},URLSearchParams};vm.runInNewContext(fs.readFileSync('hub/urls.js','utf8'),context);
const cards=(i,j)=>context.window.getPracticeUrls(i,j,web[i][j]);
(async()=>{const b=await chromium.launch();const p=await b.newPage();const result=[];const check=(ok,name)=>{if(!ok)throw Error(name);result.push({name,passed:true});console.log('PASS',name)};
 try{
  await p.goto(cards(0,1)[0].url);check((await p.locator('.subject').allTextContents()).includes('UNION_TEST'),'UNION encoded URL');
  await p.goto(cards(0,2)[0].url);const truth=await p.locator('.board-row:not(.board-head)').count();await p.goto(cards(0,2)[1].url);check(truth>0&&await p.locator('.board-row:not(.board-head)').count()===0,'Boolean URL pair');
  const error=await p.goto(cards(0,4)[0].url);check(error.status()===500,'Error URL intentionally returns 500');
  const alerts=[];p.on('dialog',async d=>{alerts.push(d.message());await d.accept()});await p.goto(cards(1,0)[0].url);check(alerts.includes('1'),'Reflected XSS URL');
  await p.goto(cards(3,0)[0].url);check((await p.locator('.oracle-result').innerText()).includes('"status":"ok"'),'SSRF encoded nested URL');
  await p.goto(cards(8,0)[0].url);const publicText=await p.locator('body').innerText();await p.goto(cards(8,0)[1].url);check(publicText!==await p.locator('body').innerText(),'Traversal URL pair');
  fs.writeFileSync('reports/practice-urls-check.json',JSON.stringify(result,null,2));
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
