window.getPracticeUrls = (i, j, web) => {
 const base = 'http://localhost:10002';
 const url = (path, params) => base + path + (params ? '?' + new URLSearchParams(params).toString() : '');
 const card = (title, address, note) => ({title, url:address, note});
 const form = (path, note) => [card('실습 화면 열기 · 폼 입력 필요', url(path), note)];
 const search = (value) => url('/board', {field:'subject',keyword:value});
 if(i===0){
  if(j===0)return form('/login','URL은 로그인 화면을 엽니다. 위 이론 아래의 입력값을 아이디 칸에 넣고 로그인 버튼을 눌러야 POST 요청이 전송됩니다.');
  if(j===2)return web[1].split('\n').map((value,n)=>card(n===0?'참 조건 URL':'거짓 조건 URL',search(value),n===0?'기존 게시글이 표시되는지 확인하세요.':'검색 결과 0개와 참 조건의 차이를 비교하세요.'));
  if(j===3)return [card('기준 응답 URL',search("' AND 1=1 -- "),'먼저 이 요청의 소요 시간을 확인하세요.'),card('약 1초 지연 URL',search(web[1]),'게시글이 최소 한 건 있어야 합니다. 개발자 도구에서 기준 요청과 시간을 비교하세요.')];
  return [card(j===4?'오류 관찰 URL':'UNION 결과 확인 URL',search(web[1]),j===4?'HTTP 500과 Internal Server Error가 예상 결과입니다.':'주소를 열면 합성 제목 UNION_TEST가 표시됩니다.')];
 }
 if(i===1){
  if(j===0)return [card('반사형 XSS 실행 URL',search(web[1]),'새 탭에서 열면 브라우저 알림 1이 실행됩니다. curl에서는 알림이 실행되지 않습니다.')];
  if(j===1)return form('/board/write','본문 입력과 저장이 필요합니다. 아래 입력값을 내용 칸에 넣고 HTML로 꾸미기를 선택하세요. URL을 여는 것만으로 글이 저장되지는 않습니다.');
  return [card('DOM XSS 실행 URL',web[1],'# 뒤 입력값을 브라우저가 처리하며 알림 1이 실행됩니다.')];
 }
 if(i===2)return [card(j===0?'닉네임 변경 URL · 로그인 필요':'로그인 CSRF 실행 URL',web[1],j===0?'먼저 같은 브라우저에서 test로 로그인하세요. 열면 닉네임이 csrf_demo로 변경됩니다. 원래 닉네임을 기록하고 실습 후 복원하세요.':'열면 자동 폼 전송으로 Python 서버의 로그인 계정이 test로 바뀝니다. 실습 후 로그아웃하세요.')];
 if(i===3){
  if(j===0)return [card('SSRF 요청 실행 URL',url('/oracle',{url:web[1]}),'서버가 내부 health 주소로 요청하고 응답 내용을 표시합니다.')];
  return [card('Blind SSRF 요청 실행 URL',web[1],'대상 응답은 숨기고 내부 수신기에 blind-demo 기록을 남깁니다.'),card('수신 기록 확인 URL',url('/lab/callbacks',{token:'blind-demo'}),'첫 URL 실행 후 열어 token과 최근 도착 시간을 확인하세요.')];
 }
 if(i===4){
  if(j===2)return [card('관리자 해시 분석 URL',web[1],'실습 관리자 테이블의 해시를 읽고 작은 레인보우 테이블에서 원문 후보 cat07을 찾습니다.')];
  return form('/login','후보 비밀번호는 로그인 폼에 하나씩 입력해야 합니다. URL만으로 비밀번호 대입이 자동 실행되지는 않습니다.');
 }
 if(i===5)return [card('내 프로필 URL · test 로그인 필요',url('/lab/profile',{user_id:'test'}),'먼저 Python에서 test로 로그인하세요. viewer와 조회 대상을 비교할 기준입니다.'),card('다른 계정 조회 URL · 로그인 필요',web[1],'test 세션으로 admin 프로필이 반환되는지 확인합니다. 로그인되지 않았다면 401이 표시됩니다.')];
 if(i===6)return form('/profile','로그인이 필요합니다. 아래 번호 안내대로 쿠키를 저장·복원해야 하며 이 URL만으로 이전 세션이 재사용되지는 않습니다.');
 if(i===7)return form('/board/write','파일을 선택하고 글을 저장하는 POST 요청이 필요합니다. URL만으로 PC의 파일을 업로드할 수는 없습니다.');
 return [card('공개 문서 URL',url('/lab/file',{name:'welcome.txt'}),'기본 공개 문서를 먼저 확인하세요.'),card('경로 탐색 URL',web[1],'가상 private 문서가 표시됩니다. 접근 범위는 준비된 실습 폴더 내부로 제한됩니다.')];
};
