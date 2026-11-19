FROM alpine:3.21
RUN apk add --no-cache bash curl coreutils && adduser -D -u 1000 student
USER student
WORKDIR /home/student
CMD ["sleep", "infinity"]
