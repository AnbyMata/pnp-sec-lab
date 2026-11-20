const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();let sent=null;
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname==='/api/auth/username-request')data={verificationId:'a'.repeat(64),expiresIn:600};
  if(url.pathname==='/api/auth/username-verify')data={verified:true};
  if(url.pathname==='/api/auth/signup'){sent=route.request().postDataJSON();data={user:{nickname:'테스트'}};}
  if(data)return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  const file=path.join(__dirname,'..','new_hub',url.pathname);
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html',body:fs.readFileSync(file)});
 });
 await page.goto('http://portal.test/signup.html');
 assert.equal(await page.locator('#send-code').count(),0);
 await page.locator('#name').fill('테스트');await page.locator('#username').fill('test');
 await page.locator('#invite-code').fill('local-invitation-code-example');
 await page.locator('#password').fill('long-password');await page.locator('#password-confirm').fill('long-password');
 await page.locator('[type=submit]').click();await page.waitForURL('**/home.html');
 assert.equal(sent.username,'test');assert.equal(sent.inviteCode,'local-invitation-code-example');assert.equal('verificationId' in sent,false);
 console.log('PASS signup UI: onsite invitation required, no username verification');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
