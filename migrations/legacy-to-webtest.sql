-- One-time migration. Back up all three databases before running.
START TRANSACTION;
INSERT IGNORE INTO WebTest.member (u_id,u_pass,u_name,nickname,age,email,reg_date)
SELECT user_id,password,name,nickname,age,email,created_at FROM mooncat.member;
INSERT IGNORE INTO WebTest.member (u_id,u_pass,u_name,nickname,age,email,reg_date)
SELECT user_id,password,name,nickname,age,email,created_at FROM mooncat_spring.member;
INSERT INTO WebTest.board (strName,strPassword,strEmail,strSubject,strContent,htmlTag,viewCount,filename,filesize,writeDate)
SELECT author,password,email,subject,content,IF(allow_html='Y','T','F'),view_count,filename,file_size,created_at FROM mooncat.board;
INSERT INTO WebTest.board (strName,strPassword,strEmail,strSubject,strContent,htmlTag,viewCount,filename,filesize,writeDate)
SELECT author,password,email,subject,content,IF(allow_html='Y','T','F'),view_count,filename,file_size,created_at FROM mooncat_spring.board;
COMMIT;
