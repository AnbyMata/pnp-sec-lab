<header class="site-header">
  <a class="brand" href="/index.php"><span class="brand-moon">✧</span><span>NEBULA<span class="brand-version">php.ver</span><small>YOUR NEXT WORLD</small></span></a>
  <nav><a href="/index.php">우주 항구</a><a href="/store.php">우주 상점</a><a href="/board/board_list.php">탐험 일지</a><a href="/oracle.php">심우주 관측</a>
    <?php if (!empty($_SESSION['user_id'])): ?><a href="/member/member_info.php"><?=$_SESSION['nickname']?>의 방</a><a class="nav-pill" href="/member/member_logout.php">로그아웃</a>
    <?php else: ?><a href="/member/member_login.php">로그인</a><a class="nav-pill" href="/member/member_register.php">회원가입</a><?php endif; ?>
  </nav>
</header>
