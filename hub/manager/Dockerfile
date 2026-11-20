FROM docker:cli
RUN apk add --no-cache python3
COPY server.py /server.py
COPY sessions.py session_http.py recipes.py accounts.py progress.py /
CMD ["python3", "/server.py"]
