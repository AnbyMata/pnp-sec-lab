# Web Test Site (웹해킹 연습용) - PHP 5.3 원본 CentOS VM에서 추출한 코드를 그대로 돌리기 위한 이미지
# mysql_* 레거시 함수(및 그로 인한 SQL 인젝션 취약점)를 유지하기 위해 PHP 5.6 + mysql 확장을 사용합니다.
# (PHP 7+ 에서는 mysql_* 함수가 완전히 제거되어 원본 코드가 동작하지 않습니다.)
FROM php:5.6-apache

RUN docker-php-ext-install mysql mysqli \
    && a2enmod rewrite

# 원본 CentOS6의 php.ini 기본값(output_buffering On)을 맞춰서
# "headers already sent" 경고가 뜨지 않도록 함 (소스코드는 수정하지 않음)
RUN { \
      echo 'output_buffering = 4096'; \
      echo 'short_open_tag = On'; \
    } > /usr/local/etc/php/conf.d/centos-compat.ini

# 원본 소스 복사 (CentOS VM /var/www/html 에서 그대로 추출)
COPY src/ /var/www/html/

# 업로드 폴더 권한 (원본과 동일하게 쓰기 가능하도록 유지 - 파일 업로드 취약점 실습용)
RUN mkdir -p /var/www/html/board/upload /var/www/html/shared \
    && chmod -R 777 /var/www/html/board/upload

EXPOSE 80
