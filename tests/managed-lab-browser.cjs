// Real Chrome + Docker integration. Requires the dedicated smoke stack on port 18766.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 try {
  await page.goto('http://localhost:18766/login.html');
  await page.evaluate(()=>localStorage.setItem('pnp_authenticated','true'));
  await page.goto('http://localhost:18766/challenge.html?id=sqli-login');
  await page.locator('[data-session=start]').click();
  const frame=page.frameLocator('#lab-frame');
  await frame.locator('input[name=user_id]').waitFor({timeout:200000});
  await frame.locator('input[name=user_id]').fill('test');
  await frame.locator('input[name=password]').fill('test1234');
  await frame.locator('button.primary').click();
  await frame.getByText('test의 방').waitFor({timeout:15000});
  console.log('PASS real browser iframe login and session cookies');
 } finally {
  await page.request.post('http://localhost:18766/api/lab-sessions/stop',{headers:{Origin:'http://localhost:18766'},data:{challengeId:'sqli-login'}}).catch(()=>{});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
