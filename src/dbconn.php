<?php
//DB연결(주소,계정,비밀번호 = #mysql -u root -p P@ssw0rd)
	$conn=mysql_connect(getenv('DB_HOST') ?: 'db', getenv('DB_USER') ?: 'root', getenv('DB_PASSWORD') ?: 'P@ssw0rd');
	mysql_set_charset("utf8", $conn);
//DB선택(use webtest)
	$connDB=mysql_select_db(getenv('DB_NAME') ?: 'WebTest', $conn);
//DB동작 확인(성공 : 1, 실패 : 에러)
//echo $connDB;
?>
