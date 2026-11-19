SET NAMES utf8mb4;
USE mooncat;

CREATE TABLE IF NOT EXISTS member (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  name VARCHAR(40) NOT NULL,
  nickname VARCHAR(40) NOT NULL,
  age INT DEFAULT 0,
  email VARCHAR(100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author VARCHAR(40) NOT NULL,
  password VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  subject VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  allow_html CHAR(1) NOT NULL DEFAULT 'Y',
  view_count INT NOT NULL DEFAULT 0,
  filename VARCHAR(255),
  file_size INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO member (user_id, password, name, nickname, age, email) VALUES
  ('admin', 'P@ssw0rd', '관리자', '달빛지기', 111, 'admin@mooncat.local'),
  ('test', 'test1234', '테스트', '보라냥이', 20, 'test@mooncat.local');

INSERT INTO board (author, password, email, subject, content, allow_html, view_count) VALUES
  ('달빛지기', '1234', 'admin@mooncat.local', '달빛 고양이 상담소에 오신 걸 환영해요', '운세와 타로, 수수께끼가 기다리고 있어요. 편하게 이야기해 주세요!', 'N', 7),
  ('보라냥이', 'test1234', 'test@mooncat.local', '오늘의 행운색은 연보라', '<strong>별빛이 반짝이는 밤이에요 ✨</strong>', 'Y', 3);
