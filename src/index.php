<?php
session_start();
require 'dbconn.php';
$latest = mysql_query('SELECT * FROM board ORDER BY strNumber DESC LIMIT 3');
?>
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>달빛 고양이 아틀리에</title><link rel="stylesheet" href="/shared/style.css"></head><body>
<div class="glow glow-one"></div><div class="glow glow-two"></div>
<?php include 'site_header.php'; ?>
<main class="page-shell">
<section class="hero">
  <div class="hero-copy"><span class="eyebrow">MOONCAT ATELIER</span><h1>오늘 밤,<br><em>고양이들의 비밀</em>을<br>만나 보세요.</h1><p>운세와 타로, 신비한 수수께끼가 모이는 달빛 아틀리에예요. 당신의 이야기를 별빛 게시판에 남겨 주세요.</p><div class="hero-actions"><a class="button primary" href="/board/board_list.php">이야기 보러 가기</a><a class="button ghost" href="/oracle.php">수정구슬 열기</a></div></div>
  <div class="hero-art"><div class="spark s1">✦</div><div class="spark s2">✧</div><div class="spark s3">✦</div><img src="/cats-hero.png" alt="운세, 타로, 탐정을 맡은 보라색 고양이 세 마리"></div>
</section>
<section class="feature-grid"><article class="feature fortune"><span class="feature-icon">☾</span><h3>오늘의 운세</h3><p>달빛을 따라온 작은 행운을 발견해요.</p></article><article class="feature tarot"><span class="feature-icon">✦</span><h3>별자리 타로</h3><p>마음속 질문을 카드에 살짝 건네 보세요.</p></article><article class="feature mystery"><span class="feature-icon">⌕</span><h3>고양이 탐정</h3><p>수상한 이야기의 실마리를 함께 찾아요.</p></article></section>
<section class="latest"><div class="section-heading"><div><span class="eyebrow">LATEST STORIES</span><h2>최근 별빛 이야기</h2></div><a href="/board/board_list.php">모두 보기 →</a></div><div class="story-list"><?php $n=0; while($post=mysql_fetch_assoc($latest)): $n++; ?><a class="story-card" href="/board/board_view.php?num=<?=$post['strNumber']?>"><span class="story-no">0<?=$n?></span><div><h3><?=$post['strSubject']?></h3><p><?=$post['strName']?> · 조회 <?=$post['viewCount']?></p></div><span>↗</span></a><?php endwhile; ?></div></section>
</main><footer><span>✦ 달빛 아래에서 만나는 작은 이야기들 ✦</span></footer></body></html>
