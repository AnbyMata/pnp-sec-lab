<?php
session_start();
require '../dbconn.php';
$key = isset($_GET['keyword']) ? $_GET['keyword'] : '';
$k_s = isset($_GET['k_s']) ? $_GET['k_s'] : '1';
if ($key) {
    switch ($k_s) {
        case '1': $strSQL="select * from board where strSubject like '%$key%' order by strNumber desc"; break;
        case '2': $strSQL="select * from board where strContent like '%$key%' order by strNumber desc"; break;
        case '3': $strSQL="select * from board where strName like '%$key%' order by strNumber desc"; break;
        default: $strSQL='select * from board order by strNumber desc';
    }
} else { $strSQL='select * from board order by strNumber desc'; }
$rs=mysql_query($strSQL); $rs_num=mysql_num_rows($rs);
?>
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>별빛 게시판 · 달빛 고양이</title><link rel="stylesheet" href="/shared/style.css"></head><body><div class="glow glow-one"></div><div class="glow glow-two"></div><?php include '../site_header.php'; ?>
<main class="page-shell"><section class="board-hero"><div><span class="eyebrow">STARRY BOARD</span><h1>별빛 게시판</h1><p>오늘의 운세와 수수께끼, 소소한 이야기를 나눠요.</p></div><a class="button primary" href="/board/board_write.php">새 이야기 쓰기</a></section>
<form class="search-bar" method="get"><select name="k_s"><option value="1" <?=$k_s=='1'?'selected':''?>>제목</option><option value="2" <?=$k_s=='2'?'selected':''?>>내용</option><option value="3" <?=$k_s=='3'?'selected':''?>>작성자</option></select><input name="keyword" value="<?=$key?>" placeholder="별빛 이야기 검색"><button>검색</button></form>
<?php if($key): ?><p class="search-summary"><strong><?=$key?></strong> 검색 결과 <?=$rs_num?>개</p><?php endif; ?>
<div class="board-table"><div class="board-row board-head"><span>번호</span><span>제목</span><span>작성자</span><span>날짜</span><span>조회</span></div><?php if($rs_num): while($post=mysql_fetch_assoc($rs)): ?><a class="board-row" href="/board/board_view.php?num=<?=$post['strNumber']?>"><span><?=$post['strNumber']?></span><span class="subject"><?=$post['strSubject']?><?php if($post['filename']): ?><small>📎</small><?php endif; ?></span><span><?=$post['strName']?></span><span><?=substr($post['writeDate'],0,10)?></span><span><?=$post['viewCount']?></span></a><?php endwhile; else: ?><div class="empty">아직 별빛 이야기가 없어요.</div><?php endif; ?></div></main><footer><span>✦ 달빛 아래에서 만나는 작은 이야기들 ✦</span></footer></body></html>
