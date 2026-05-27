<?php
setcookie('afk_theme', 'glass', time() + 60*60*24*365, '/');
header('Location: /dashboard.php');
exit;
