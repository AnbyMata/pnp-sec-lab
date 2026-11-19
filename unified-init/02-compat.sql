ALTER DATABASE WebTest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE WebTest.member CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE WebTest.board CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE OR REPLACE ALGORITHM=MERGE VIEW WebTest.member_modern AS
SELECT no AS id, u_id AS user_id, u_pass AS password, u_name AS name,
       nickname, age, email, reg_date AS created_at FROM WebTest.member;
CREATE OR REPLACE ALGORITHM=MERGE VIEW WebTest.board_modern AS
SELECT strNumber AS id, strName AS author, strPassword AS password,
       strEmail AS email, strSubject AS subject, strContent AS content,
       htmlTag AS allow_html, viewCount AS view_count, filename,
       filesize AS file_size, writeDate AS created_at FROM WebTest.board;
GRANT ALL PRIVILEGES ON WebTest.* TO 'mooncat'@'%';
