<?php
// First-time setup, and resetting the admin password later.
// Both need the setup code that this page writes into data/setup-key.php, a file only the hosting owner can read.
define('PR_APP', 1);
require __DIR__ . '/lib/app.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; form-action 'self'; frame-ancestors 'none'");

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$problems = [];
if (version_compare(PHP_VERSION, '7.4', '<')) $problems[] = 'This hosting runs PHP ' . PHP_VERSION . '. The register needs PHP 7.4 or newer. Change the PHP version in your hosting panel.';
if (!extension_loaded('pdo_sqlite')) $problems[] = 'The SQLite database driver (pdo_sqlite) is switched off on this hosting. Turn it on in the PHP settings of your hosting panel, or ask hosting support to enable it.';
if (!extension_loaded('mbstring')) $problems[] = 'The PHP "mbstring" extension is switched off on this hosting. Turn it on in the PHP settings of your hosting panel.';
if (!function_exists('getimagesize')) $problems[] = 'PHP image support is missing on this hosting, so photos cannot be checked.';
if (!is_dir(PR_DATA)) @mkdir(PR_DATA, 0700, true);
if (!is_dir(PR_DATA) || !is_writable(PR_DATA)) $problems[] = 'The "data" folder cannot be written to. In your hosting File Manager, set its permission to 755 (or 775).';

$keyFile = PR_DATA . '/setup-key.php';
if (!$problems && !is_file($keyFile)) {
    $abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; $k = '';
    for ($i = 0; $i < 12; $i++) $k .= $abc[random_int(0, strlen($abc) - 1)];
    @file_put_contents($keyFile, "<?php // Setup code for the Practical Register. Keep this file private.\nreturn '" . $k . "';\n", LOCK_EX);
    @chmod($keyFile, 0600);
}
$setupKey = is_file($keyFile) ? (include $keyFile) : null;
if (!$problems && !is_string($setupKey)) $problems[] = 'The setup code file could not be created in the "data" folder. Check that the folder can be written to.';

$installed = !$problems && pr_installed();
$msg = ''; $bad = false; $done = false;
$f = ['name' => '', 'username' => ''];

if (!$problems && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $key = strtoupper(trim((string)($_POST['key'] ?? '')));
    $f['name'] = pr_str($_POST['name'] ?? '', 60);
    $f['username'] = strtolower(pr_str($_POST['username'] ?? '', 40));
    $pw = (string)($_POST['password'] ?? ''); $pw2 = (string)($_POST['password2'] ?? '');
    if (!hash_equals($setupKey, $key)) { sleep(2); $msg = 'The setup code is not correct. Open data/setup-key.php in your hosting File Manager and copy the code written inside the quotes.'; $bad = true; }
    elseif (!preg_match('/^[a-z0-9][a-z0-9._-]{2,29}$/', $f['username'])) { $msg = 'The admin ID needs 3 to 30 characters: small letters, digits, dot, dash or underscore.'; $bad = true; }
    elseif (strlen($pw) < 8 || strlen($pw) > 100) { $msg = 'The password needs at least 8 characters.'; $bad = true; }
    elseif ($pw !== $pw2) { $msg = 'The two passwords do not match.'; $bad = true; }
    elseif (strtolower($pw) === $f['username']) { $msg = 'The password cannot be the same as the ID.'; $bad = true; }
    else {
        try {
            if (!$installed) {
                if ($f['name'] === '') { $msg = 'Enter your name.'; $bad = true; }
                else {
                    $db = 'register-' . bin2hex(random_bytes(12)) . '.sqlite';
                    $pdo = new PDO('sqlite:' . PR_DATA . '/' . $db);
                    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    pr_create_schema($pdo);
                    $pdo->prepare("INSERT INTO users (username, name, role, pass_hash, must_change, active, created_at) VALUES (?, ?, 'admin', ?, 0, 1, ?)")
                        ->execute([$f['username'], $f['name'], password_hash($pw, PASSWORD_DEFAULT), pr_now()]);
                    $pdo = null;
                    @chmod(PR_DATA . '/' . $db, 0600);
                    file_put_contents(PR_DATA . '/config.php', "<?php // Written by install.php. Keep this file private.\nreturn ['db' => '" . $db . "'];\n", LOCK_EX);
                    foreach (['photos', 'sessions'] as $d) if (!is_dir(PR_DATA . '/' . $d)) @mkdir(PR_DATA . '/' . $d, 0700, true);
                    $done = true; $msg = 'The register is ready. Sign in with the admin ID and password you just set.';
                }
            } else {
                // Already installed: this form resets the password of an existing admin ID.
                $pdo = pr_db();
                $st = $pdo->prepare("SELECT id FROM users WHERE username = ? AND role = 'admin'");
                $st->execute([$f['username']]);
                $id = $st->fetchColumn();
                if (!$id) { sleep(1); $msg = 'There is no admin with this ID.'; $bad = true; }
                else {
                    $pdo->prepare('UPDATE users SET pass_hash = ?, must_change = 0, active = 1, sess_ver = sess_ver + 1 WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $id]);
                    $pdo->exec('DELETE FROM login_attempts');
                    $done = true; $msg = 'The admin password is changed. Sign in with the new password.';
                }
            }
        } catch (Throwable $e) {
            error_log('practical-register install: ' . $e->getMessage());
            $msg = 'Setup could not finish: the server could not write the database in the "data" folder.'; $bad = true;
        }
    }
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Set up the Practical Register</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<div class="auth">
  <div class="auth-card" style="max-width:520px">
    <p class="eyebrow">SRS Public School · Science labs</p>
    <h1><?= $installed && !$done ? 'Reset the admin password' : 'Set up the register' ?></h1>
<?php if ($problems): ?>
    <div class="notice bad"><strong>The hosting needs a change before setup can start.</strong></div>
    <ul class="plain"><?php foreach ($problems as $p) echo '<li>' . h($p) . '</li>'; ?></ul>
    <p class="lede">After fixing it, reload this page.</p>
<?php elseif ($done): ?>
    <div class="notice"><?= h($msg) ?></div>
    <p><a class="btn" href="index.php">Open the register</a></p>
<?php else: ?>
    <p class="lede"><?= $installed
        ? 'Use this only if the admin password is lost. You need the setup code from your hosting.'
        : 'This is done once. You create the admin ID here; teacher IDs are created later from inside the register.' ?></p>
<?php if ($msg): ?><div class="notice<?= $bad ? ' bad' : '' ?>"><?= h($msg) ?></div><?php endif; ?>
    <form method="post" action="install.php" autocomplete="off" class="auth-form">
      <div class="field"><label for="key">Setup code</label><input type="text" id="key" name="key" required maxlength="20" autocomplete="off" autocapitalize="characters">
        <span class="hint">In your hosting File Manager, open the file <b>data/setup-key.php</b> inside this register's folder. The code is the 12 letters and digits inside the quotes.</span></div>
<?php if (!$installed): ?>
      <div class="field"><label for="name">Your name</label><input type="text" id="name" name="name" required maxlength="60" value="<?= h($f['name']) ?>"></div>
<?php endif; ?>
      <div class="field"><label for="username">Admin ID</label><input type="text" id="username" name="username" required maxlength="30" value="<?= h($f['username']) ?>" autocapitalize="none" autocomplete="off">
        <?php if (!$installed): ?><span class="hint">Small letters and digits, for example srs.admin</span><?php endif; ?></div>
      <div class="field"><label for="password"><?= $installed ? 'New password' : 'Password' ?></label><input type="password" id="password" name="password" required minlength="8" maxlength="100" autocomplete="new-password">
        <span class="hint">At least 8 characters. Do not reuse a password from another site.</span></div>
      <div class="field"><label for="password2">Repeat the password</label><input type="password" id="password2" name="password2" required minlength="8" maxlength="100" autocomplete="new-password"></div>
      <button class="btn" type="submit"><?= $installed ? 'Change admin password' : 'Create admin and finish setup' ?></button>
    </form>
<?php if ($installed): ?><p><a href="index.php">Back to sign in</a></p><?php endif; ?>
<?php endif; ?>
  </div>
</div>
</body>
</html>
