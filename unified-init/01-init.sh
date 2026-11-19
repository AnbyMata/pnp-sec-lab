#!/bin/sh
set -eu
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" <<'SQL'
CREATE DATABASE IF NOT EXISTS WebTest CHARACTER SET utf8;
CREATE USER IF NOT EXISTS 'mooncat'@'%' IDENTIFIED BY 'mooncat123';
GRANT ALL PRIVILEGES ON WebTest.* TO 'mooncat'@'%';
CREATE USER IF NOT EXISTS 'labreader'@'%' IDENTIFIED BY 'labreader';
GRANT SELECT ON WebTest.* TO 'labreader'@'%';
CREATE USER IF NOT EXISTS 'labreader'@'localhost' IDENTIFIED BY 'labreader';
GRANT SELECT ON WebTest.* TO 'labreader'@'localhost';
FLUSH PRIVILEGES;
SQL
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" WebTest < /schemas/php.sql
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" WebTest -e "INSERT IGNORE INTO member (u_id,u_pass,u_name,nickname,age,email,reg_date) VALUES ('test','test1234','test','test',20,'test@mooncat.local',NOW())"
