<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>메뉴</title><link rel="stylesheet" href="/shared/style.css">
  <link rel="stylesheet" href="style_head.css?v=20261113-2"></head>
<body>
<?php session_start(); ?>
<header class="site-header">
  <a class="brand" href="/index.php" target="_parent"><span class="brand-moon">☾</span><span>달빛 고양이 아틀리에</span></a>
  <nav aria-label="주 메뉴">
    <a href="/index.php" target="_parent">홈</a>
    <a href="/board/board_list.php" target="_parent">별빛 게시판</a>
    <a href="/oracle.php" target="_parent">수정구슬</a>
    <?php if (empty($_SESSION['user_id'])): ?>
      <a href="/member/member_login.php" target="_parent">로그인</a>
      <a class="nav-pill" href="/member/member_register.php" target="_parent">회원가입</a>
    <?php else: ?>
      <a href="/member/member_info.php" target="_parent"><?=$_SESSION['nickname']?>의 방</a>
      <a href="/member/member_nick.php" target="_parent">닉네임 수정</a>
      <a class="nav-pill" href="/member/member_logout.php" target="_parent">로그아웃</a>
    <?php endif; ?>
  </nav>
</header>
</body></html>
