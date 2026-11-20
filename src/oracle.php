<?php
session_start();
$url = isset($_GET['url']) ? $_GET['url'] : '';
$result = '';
$error = '';
if ($url !== '') {
    $scheme = parse_url($url, PHP_URL_SCHEME);
    if ($scheme !== 'http' && $scheme !== 'https') {
        $error = 'HTTP 또는 HTTPS 주소를 입력해 주세요.';
    } else {
        $context = stream_context_create(array('http' => array('timeout' => 4)));
        $result = @file_get_contents($url, false, $context, 0, 5000);
        if ($result === false) { $result = ''; $error = '주소를 불러오지 못했어요.'; }
    }
}
?>
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>심우주 관측 · NEBULA</title><link rel="stylesheet" href="/shared/style.css"><link rel="stylesheet" href="/static/nebula.css"><link rel="stylesheet" href="/static/nebula-space.css"><link rel="stylesheet" href="/static/nebula-ocean.css?v=9"></head><body>
<div class="glow glow-one"></div><div class="glow glow-two"></div><?php include 'site_header.php'; ?>
<main class="page-shell"><section class="oracle-layout"><div class="oracle-copy"><span class="eyebrow">DEEP SPACE OBSERVATORY</span><h1>심우주 관측으로<br>먼 곳을 들여다봐요.</h1><p>관측할 주소를 입력하면 항구의 탐사기가 신호를 수신합니다.</p><img class="observatory-planet" src="/static/planet-purple.png" alt="" aria-hidden="true"></div><div class="form-card"><form method="get"><label>들여다볼 주소<input type="url" name="url" value="<?=htmlspecialchars($url, ENT_QUOTES, 'UTF-8')?>" placeholder="http://example.com" required></label><button class="button primary wide">심우주 관측 비추기</button></form><?php if ($error): ?><div class="alert"><?=htmlspecialchars($error, ENT_QUOTES, 'UTF-8')?></div><?php endif; ?><?php if ($result !== ''): ?><pre class="oracle-result"><?=htmlspecialchars($result, ENT_QUOTES, 'UTF-8')?></pre><?php endif; ?></div></section></main><footer><strong>NEBULA</strong><span>끝없는 우주, 당신의 다음 세계.</span><small>INTERSTELLAR EXPLORATION NETWORK</small></footer></body></html>
