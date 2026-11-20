FROM nginx:alpine
COPY hub/session-gateway.conf /etc/nginx/conf.d/default.conf
COPY shared/style.css /usr/share/nginx/html/lab-base.css
