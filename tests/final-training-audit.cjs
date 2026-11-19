const fs=require('fs');
const {execFileSync}=require('child_process');
const {chromium}=require('playwright');
const vm=require('vm');
const source=fs.readFileSync('hub/index.html','utf8');
function data(name){const start=source.indexOf('const '+name+'=');return vm.runInNewContext(source.slice(start,source.indexOf('\n];',start)+3)+'\n'+name)}
const lessons=data('lessons'),examples=data('examples'),web=data('webExamples');
function assert(ok,message){if(!ok)throw Error(message)}
async function boardIds(api){const r=await api.get('http://localhost:10002/board');return [...(await r.text()).matchAll(/href="\/board\/(\d+)"/g)].map(x=>x[1]).sort().join(',')}
(async()=>{
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
 let nickname,before;
 try{
  await context.request.post('http://localhost:10002/login',{form:{user_id:'test',password:'test1234'}});
  await page.goto('http://localhost:10002/profile');nickname=await page.locator('[name=nickname]').inputValue();before=await boardIds(context.request);
  if(!process.argv.includes('--ui-only'))for(const script of ['check-training.cjs','check-training-browser.cjs','check-url-labs.cjs'])execFileSync(process.execPath,['tests/'+script],{stdio:'inherit',timeout:120000});
  const report=JSON.parse(fs.readFileSync('reports/training-command-check.json'));
  assert(report.length===19&&report.every(x=>x.status==='verified'&&x.proof===true),'All 19 attack results must be verified');
  const ui=[];
  for(const width of [1400,390]){
   await page.setViewportSize({width,height:900});await page.goto('http://localhost:8000',{waitUntil:'domcontentloaded'});
   for(let i=0;i<lessons.length;i++){
    const group=page.locator('.lesson-group').nth(i);if(!await group.evaluate(e=>e.open))await group.locator('summary').click();
    assert(examples[i].length===lessons[i].types.length&&web[i].length===lessons[i].types.length,'Example count mismatch');
    for(let j=0;j<lessons[i].types.length;j++){
     await group.locator('.lesson-type').nth(j).click();assert(!await page.locator('#lesson-list-view').isVisible(),'List hidden');
     assert(await page.locator('#modal-title').innerText()===lessons[i].types[j][0],'Correct lesson title');
     assert(await page.locator('#modal-theory .theory-section').count()===5,'Expanded theory sections missing');
     assert((await page.locator('#modal-theory').innerText()).length>500,'Theory content too short');
     assert(await page.locator('#web-steps > li').count()===5,'Numbered web steps missing');
     const urlCards=page.locator('#practice-urls .practice-url');assert(await urlCards.count()>0,'Practice URL missing');
     for(let n=0;n<await urlCards.count();n++){
      const card=urlCards.nth(n),address=await card.locator('code').textContent();const parsed=new URL(address);
      assert(parsed.hostname==='localhost'&&['8000','10002'].includes(parsed.port),'Unexpected practice host');
      assert(await card.locator('a').getAttribute('href')===address,'Practice link mismatch');
      assert(await card.locator('a').getAttribute('target')==='_blank','Practice URL must open a new tab');
      await card.locator('button').click();await page.waitForFunction(async value=>(await navigator.clipboard.readText())===value,address,{timeout:3000});
     }
     assert(await page.locator('#web-practice-area').evaluate(e=>!!(e.compareDocumentPosition(document.querySelector('#cli-practice-area'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Web practice must precede CLI');
     for(const [button,code] of [['#copy-command','#modal-command'],['#copy-web','#web-command']]){await page.locator(button).click();const expected=await page.locator(code).textContent();try{await page.waitForFunction(async expected=>(await navigator.clipboard.readText()).replaceAll('\r\n','\n')===expected,expected,{timeout:3000})}catch(error){throw Error('Clipboard mismatch: '+width+' '+lessons[i].types[j][0]+' '+button)}}
     const left=await page.locator('#lesson-modal').boundingBox(),right=await page.locator('.workspace').boundingBox();if(width===1400)assert(left.x+left.width<=right.x,'Workspace overlap');
     assert(await page.locator('.side').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Sidebar horizontal overflow');
     await page.locator('#lesson-back').click();assert(await page.locator('#lesson-list-view').isVisible(),'Return to list');
     assert(await group.evaluate(e=>e.open),'Toggle state preserved');
     ui.push({width,name:lessons[i].name+' / '+lessons[i].types[j][0],passed:true});
    }
   }
  }
  assert(before===await boardIds(context.request),'Test posts were not removed');
  fs.writeFileSync('reports/final-training-audit.json',JSON.stringify({date:new Date().toISOString(),attackCount:report.length,verified:report.filter(x=>x.proof).length,uiChecks:ui,boardDataPreserved:true},null,2));
  console.log('FINAL: 19 attacks verified; 38 responsive detail/copy/back checks passed');
 }finally{
  if(nickname!==undefined){await context.request.get('http://localhost:10002/profile/nickname',{params:{nickname}});console.log('Original test nickname restored')}
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
