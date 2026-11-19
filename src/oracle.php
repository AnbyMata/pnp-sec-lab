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
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수정구슬 · 달빛 고양이</title><link rel="stylesheet" href="/shared/style.css"></head><body>
<div class="glow glow-one"></div><div class="glow glow-two"></div><?php include 'site_header.php'; ?>
<main class="page-shell"><section class="oracle-layout"><div class="oracle-copy"><span class="eyebrow">CRYSTAL ORACLE</span><h1>수정구슬로<br>먼 곳을 들여다봐요.</h1><p>궁금한 주소를 적으면 타로 고양이가 그곳의 첫 장면을 보여드려요.</p><div class="orb">☾</div></div><div class="form-card"><form method="get"><label>들여다볼 주소<input type="url" name="url" value="<?=htmlspecialchars($url, ENT_QUOTES, 'UTF-8')?>" placeholder="http://example.com" required></label><button class="button primary wide">수정구슬 비추기</button></form><?php if ($error): ?><div class="alert"><?=htmlspecialchars($error, ENT_QUOTES, 'UTF-8')?></div><?php endif; ?><?php if ($result !== ''): ?><pre class="oracle-result"><?=htmlspecialchars($result, ENT_QUOTES, 'UTF-8')?></pre><?php endif; ?></div></section></main><footer><span>✦ 달빛 아래에서 만나는 작은 이야기들 ✦</span></footer></body></html>
