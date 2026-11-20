"""Server-owned recipes: clients select a challenge, never containers or flags."""
FLAGS = {
    'sqli-login': 'SQLI_LAB_FLAG', 'path-traversal': 'TRAVERSAL_LAB_FLAG',
    'auth-recovery': 'AUTH_LAB_FLAG', 'upload-filter': 'UPLOAD_LAB_FLAG',
    'ssrf-oracle': 'SSRF_LAB_FLAG', 'nosql-login': 'NOSQL_LAB_FLAG',
}
RECIPES = {
    'sqli-login': {'services': ['db', 'mongo', 'python', 'shell', 'gateway'], 'entry': '/login'},
    'path-traversal': {'services': ['db', 'mongo', 'python', 'gateway'], 'entry': '/lab/file?name=welcome.txt'},
    'auth-recovery': {'services': ['db', 'mongo', 'python', 'gateway'], 'entry': '/lab/auth-recovery'},
    'upload-filter': {'services': ['db', 'mongo', 'python', 'gateway'], 'entry': '/lab/upload-filter'},
    'ssrf-oracle': {'services': ['db', 'mongo', 'python', 'gateway'], 'entry': '/oracle'},
    'nosql-login': {'services': ['db', 'mongo', 'python', 'gateway'], 'entry': '/lab/nosql-login'},
}
TARGETS = {'python', 'php', 'spring'}


def services_for(challenge, target):
    if target != 'python':
        return ['db', target, 'gateway']
    return RECIPES[challenge]['services']
