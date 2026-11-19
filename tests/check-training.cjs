const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('hub/index.html', 'utf8');
function data(name) { const start = source.indexOf('const '+name+'='); const end = source.indexOf('\n];',start)+3; return vm.runInNewContext(source.slice(start,end)+'\n'+name); }
const lessons=data('lessons'), examples=data('examples');
const report=[];
const runId=Date.now();
const workdir='/tmp/training-verification-'+runId;
const uploadName='verify-upload-'+runId+'.xyz';
async function shell(command) {
 const r=await fetch('http://localhost:8000/api/shell',{method:'POST',headers:{Origin:'http://localhost:8000','Content-Type':'application/json'},body:JSON.stringify({command:'mkdir -p '+workdir+'; cd '+workdir+'; '+command})});
 const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;
}
(async()=>{
 for(let i=0;i<examples.length;i++)for(let j=0;j<examples[i].length;j++){
  const name=lessons[i].name+' / '+lessons[i].types[j][0];
  const command=examples[i][j][0].replaceAll('lab-upload.xyz',uploadName);
  if(command.startsWith('<')){report.push({i,j,name,status:'browser-required'});continue;}
  const start=Date.now();const result=await shell(command);
  const codes=[...result.output.matchAll(/HTTP\/1\.1 (\d+)/g)].map(x=>x[1]);
  let proof;
  if(i===0&&j===0)proof=codes.includes('303');
  if(i===0&&j===1)proof=result.output.includes('class="subject">UNION_TEST');
  if(i===0&&j===2)proof=result.output.includes('검색 결과 0개')&&/검색 결과 [1-9][0-9]*개/.test(result.output);
  if(i===0&&j===3){const baseline=result.output.match(/baseline: ([0-9.]+)s/),delay=result.output.match(/delayed: ([0-9.]+)s/);proof=!!baseline&&!!delay&&Number(delay[1])-Number(baseline[1])>.8;}
  if(i===0&&j===4)proof=codes.includes('500');
  if(i===1&&j===1){const loc=result.output.match(/location: (\/board\/\d+)/i);proof=!!loc&&codes.includes('303');if(loc)await fetch('http://localhost:10002'+loc[1]+'/delete',{method:'POST',body:new URLSearchParams({password:'1234'}),redirect:'manual'});}
  if(i===3&&j===0)proof=result.output.includes('{"status":"ok"}');
  if(i===3&&j===1)proof=result.output.includes('class="success"')&&!result.output.includes('PRIVATE_CALLBACK_BODY');
  if(i===4&&j<2)proof=result.output.includes('wrong1: 200')&&result.output.includes('wrong2: 200')&&result.output.includes('test1234: 303');
  if(i===4&&j===2)proof=result.output.includes('id="rainbow-result"')&&result.output.includes('cat07');
  if(i===5)proof=result.output.includes('"user_id":"admin"')&&result.output.includes('"viewer":"test"');
  if(i===6)proof=codes.includes('303')&&codes.includes('200')&&result.output.includes('MY MOON ROOM');
  if(i===7){const loc=result.output.match(/location: (\/board\/\d+)/i);const r=await fetch('http://localhost:10002/uploads/'+uploadName);proof=!!loc&&r.ok&&(await r.text()).includes('upload test');if(loc)await fetch('http://localhost:10002'+loc[1]+'/delete',{method:'POST',body:new URLSearchParams({password:'1234'}),redirect:'manual'});}
  if(i===8)proof=result.output.includes('비공개 실습 문서');
  report.push({i,j,name,exit:result.exit_code,ms:Date.now()-start,codes,proof,serverError:result.output.includes('Internal Server Error'),status:proof?'verified':undefined});
  console.log(name,JSON.stringify(report.at(-1)));
 }
 fs.writeFileSync('reports/training-command-check.json',JSON.stringify(report,null,2));
 await shell('rm -f cookies.txt lab-cookie.txt lab-passwords.txt lab-upload.txt; cd /tmp; rmdir '+workdir);
})().catch(e=>{console.error(e);process.exitCode=1});
