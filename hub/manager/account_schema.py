"""Transactional migration from email accounts to unique login usernames."""
import re

SCHEMA="CREATE TABLE {table} (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', active INTEGER NOT NULL DEFAULT 1)"

def migrate_users(db):
    db.execute('PRAGMA secure_delete=ON')
    columns={row[1] for row in db.execute('PRAGMA table_info(users)')}
    changed=False
    if not columns:
        db.execute(SCHEMA.format(table='users'))
    elif 'email' in columns:
        db.execute('BEGIN IMMEDIATE')
        db.execute(SCHEMA.format(table='users_without_email'))
        used=set()
        for row in db.execute('SELECT * FROM users ORDER BY id').fetchall():
            base=re.sub(r'[^a-z0-9_.-]','_',row['email'].split('@',1)[0].lower())[:32]
            if len(base)<3:base='user_'+base
            username=base;counter=1
            while username in used:
                suffix='_'+str(counter);username=base[:32-len(suffix)]+suffix;counter+=1
            used.add(username)
            db.execute('INSERT INTO users_without_email VALUES (?,?,?,?,?,?,?)',(row['id'],username,row['nickname'],row['salt'],row['password'],row['role'] if 'role' in columns else 'member',row['active'] if 'active' in columns else 1))
        db.execute('DROP TABLE users')
        db.execute('ALTER TABLE users_without_email RENAME TO users')
        changed=True
    for table in ('email_checks','attempts','invitations'):
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone():
            db.execute('DROP TABLE '+table);changed=True
    if 'email' in {row[1] for row in db.execute('PRAGMA table_info(auth_failures)')}:
        db.execute('DROP TABLE auth_failures');changed=True
    return changed
