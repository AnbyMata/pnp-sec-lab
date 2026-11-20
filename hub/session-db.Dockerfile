FROM mariadb:11.4
COPY unified-init/ /docker-entrypoint-initdb.d/
COPY db-init/01-webtest.sql /schemas/php.sql
