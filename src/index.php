<?php
session_start();
require 'dbconn.php';
$latest = mysql_query('SELECT * FROM board ORDER BY strNumber DESC LIMIT 3');
?>
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEBULA</title><link rel="stylesheet" href="/shared/style.css"><link rel="stylesheet" href="/static/nebula.css"><link rel="stylesheet" href="/static/nebula-space.css"><link rel="stylesheet" href="/static/nebula-ocean.css?v=9"></head><body>
<div class="glow glow-one"></div><div class="glow glow-two"></div>
<?php include 'site_header.php'; ?>
<main class="page-shell"><section class="space-hero harbor-hero"><div class="hero-copy"><span class="eyebrow">NEBULA / YOUR HOME AMONG THE STARS</span><h1>모든 항해의 시작,<br><em>네뷸라 우주 항구.</em></h1><p>수많은 별 사이에서 발견하는 새로운 가능성.<br>잠시 머물고, 다음 여정을 준비하세요.</p><div class="hero-actions"><a class="button primary" href="/store.php">우주 상점 둘러보기</a><a class="button ghost" href="/board/board_list.php">탐험 일지</a></div><div class="hero-caption">EST. 2086 &nbsp; / &nbsp; YOUR JOURNEY STARTS HERE</div></div><div class="space-art" aria-hidden="true"><div class="planet-coordinate">DEEP SPACE ARCHIVE<br>RA 00h 42m / DEC +41° 16′</div><div class="discovery-tag"><span class="signal-dot"></span> LIVE FROM THE UNIVERSE</div></div></section>
<div class="space-divider"><span>WELCOME TO NEBULA HARBOR</span><span>✧</span><span>당신의 다음 항해를 기다립니다</span></div></main><footer><strong>NEBULA</strong><span>끝없는 우주, 당신의 다음 세계.</span><small>INTERSTELLAR EXPLORATION NETWORK</small></footer></body></html>
