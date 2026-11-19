<header class="site-header">
  <a class="brand" href="/index.php"><span class="brand-moon">☾</span><span>달빛 고양이 아틀리에</span></a>
  <nav><a href="/index.php">홈</a><a href="/board/board_list.php">별빛 게시판</a><a href="/oracle.php">수정구슬</a>
    <?php if (!empty($_SESSION['user_id'])): ?><a href="/member/member_info.php"><?=$_SESSION['nickname']?>의 방</a><a class="nav-pill" href="/member/member_logout.php">로그아웃</a>
    <?php else: ?><a href="/member/member_login.php">로그인</a><a class="nav-pill" href="/member/member_register.php">회원가입</a><?php endif; ?>
  </nav>
</header>
