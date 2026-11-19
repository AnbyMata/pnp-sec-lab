CREATE TABLE IF NOT EXISTS WebTest.lab_admin_members (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(40) NOT NULL UNIQUE,
    password_hash CHAR(32) NOT NULL,
    hash_algorithm VARCHAR(10) NOT NULL DEFAULT 'MD5',
    description VARCHAR(100) NOT NULL DEFAULT 'Rainbow table training only'
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT IGNORE INTO WebTest.lab_admin_members (username,password_hash)
VALUES ('lab_admin', '4c8467fc2428bd3fffd752c7ce3d895d');
