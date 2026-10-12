<?php
// Shared code for the Practical Register. Never served directly.
if (!defined('PR_APP')) { http_response_code(404); exit; }

define('PR_ROOT', dirname(__DIR__));
define('PR_DATA', PR_ROOT . '/data');
date_default_timezone_set('Asia/Kolkata');

class ApiError extends Exception {
    public $status; public $codeStr;
    function __construct($codeStr, $message, $status = 400) { parent::__construct($message); $this->codeStr = $codeStr; $this->status = $status; }
}

/* ---------- install state ---------- */
// data/config.php is written by install.php and holds the (random) database file name.
function pr_config() {
    static $c = null;
    if ($c === null) {
        $f = PR_DATA . '/config.php';
        $c = is_file($f) ? (include $f) : false;
        if (!is_array($c)) $c = false;
    }
    return $c;
}
function pr_installed() {
    $c = pr_config();
    return $c && !empty($c['db']) && is_file(PR_DATA . '/' . $c['db']);
}
function pr_db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = pr_config();
    if (!$c || empty($c['db'])) throw new ApiError('not_installed', 'The register is not set up yet.', 503);
    $pdo = new PDO('sqlite:' . PR_DATA . '/' . $c['db']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    return $pdo;
}
function pr_create_schema(PDO $pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL,
        pass_hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
        sess_ver INTEGER NOT NULL DEFAULT 1, assign TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, teacher TEXT NOT NULL, date TEXT NOT NULL,
        cls TEXT NOT NULL, sec TEXT NOT NULL, subj TEXT NOT NULL, pid TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
        present INTEGER, total INTEGER, files INTEGER, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS entries_user ON entries(user_id)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY, entry_id INTEGER, user_id INTEGER NOT NULL, lat REAL, lng REAL, taken TEXT,
        src TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS photos_entry ON photos(entry_id)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ukey TEXT NOT NULL, at INTEGER NOT NULL)");
}

/* ---------- small helpers ---------- */
function pr_now() { return date('c'); }
function pr_str($v, $max) {
    if (!is_string($v)) return '';
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}
function pr_sec($v) { return mb_strtoupper(pr_str(is_scalar($v) ? (string)$v : '', 12)); }
function pr_int($v) { return (is_int($v) || (is_string($v) && preg_match('/^\d{1,4}$/', $v))) ? (int)$v : null; }
// Class keys: the class number for CBSE, the same with a "u" in front for UP Board.
function pr_classes() {
    $sci = ['science']; $pcb = ['physics', 'chemistry', 'biology'];
    return ['9' => $sci, '10' => $sci, '11' => $pcb, '12' => $pcb, 'u9' => $sci, 'u10' => $sci, 'u11' => $pcb, 'u12' => $pcb];
}
function pr_clean_secs($arr) {
    $out = [];
    foreach (is_array($arr) ? $arr : [] as $s) { $s = pr_sec($s); if ($s !== '' && !in_array($s, $out, true)) $out[] = $s; }
    return array_slice($out, 0, 20);
}
function pr_clean_assign($arr) {
    $classes = pr_classes(); $out = [];
    foreach (is_array($arr) ? $arr : [] as $a) {
        if (!is_array($a)) continue;
        $cls = isset($a['cls']) ? (string)$a['cls'] : ''; $subj = isset($a['subj']) ? (string)$a['subj'] : '';
        if (!isset($classes[$cls]) || !in_array($subj, $classes[$cls], true)) continue;
        $key = $cls . '|' . $subj;
        $secs = pr_clean_secs($a['secs'] ?? []);
        if (isset($out[$key])) $out[$key]['secs'] = array_values(array_unique(array_merge($out[$key]['secs'], $secs)));
        else $out[$key] = ['cls' => $cls, 'subj' => $subj, 'secs' => $secs];
    }
    return array_slice(array_values($out), 0, 40);
}
function pr_temp_password() {
    // No look-alike characters, so it can be read out or written on paper.
    $abc = 'abcdefghjkmnpqrstuvwxyz23456789'; $s = '';
    for ($i = 0; $i < 10; $i++) { $s .= $abc[random_int(0, strlen($abc) - 1)]; if ($i === 4) $s .= '-'; }
    return $s;
}
function pr_user_public($r, $full = false) {
    $o = ['id' => (int)$r['id'], 'name' => $r['name'], 'role' => $r['role'], 'assign' => pr_clean_assign(json_decode($r['assign'], true))];
    if ($full) { $o['username'] = $r['username']; $o['active'] = (bool)$r['active']; $o['mustChange'] = (bool)$r['must_change']; }
    return $o;
}

// The school's own teacher list (lib/seed.php), cleaned. Used only when the admin asks for these IDs to be created.
function pr_seed() {
    $f = PR_ROOT . '/lib/seed.php';
    $raw = is_file($f) ? (include $f) : [];
    $out = [];
    foreach (is_array($raw) ? $raw : [] as $t) {
        $name = pr_str($t['name'] ?? '', 60);
        $username = strtolower(pr_str($t['username'] ?? '', 40));
        if ($name === '' || !preg_match('/^[a-z0-9][a-z0-9._-]{2,29}$/', $username)) continue;
        $out[] = ['name' => $name, 'username' => $username, 'assign' => pr_clean_assign($t['assign'] ?? [])];
    }
    return $out;
}

/* ---------- session ---------- */
function pr_is_https() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}
function pr_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $dir = PR_DATA . '/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) {
        ini_set('session.save_path', $dir);
        // Some hosts never clean a custom session folder, so old sign-ins are cleared here now and then.
        if (random_int(1, 100) === 1) {
            foreach (glob($dir . '/sess_*') ?: [] as $f) if (@filemtime($f) < time() - 15 * 86400) @unlink($f);
        }
    }
    ini_set('session.gc_maxlifetime', (string)(14 * 86400));
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    session_name('prsess');
    session_set_cookie_params(['lifetime' => 14 * 86400, 'path' => $path, 'secure' => pr_is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}
function pr_csrf() {
    pr_session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}
function pr_check_csrf() {
    $sent = $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals(pr_csrf(), $sent)) throw new ApiError('csrf', 'The page is out of date. Reload it and try again.', 403);
}
// The signed-in user row, or null. A deactivated account or a reset password ends its sessions at once.
function pr_user() {
    static $u = false;
    if ($u !== false) return $u;
    pr_session_start();
    $u = null;
    if (!empty($_SESSION['uid'])) {
        $st = pr_db()->prepare('SELECT * FROM users WHERE id = ?');
        $st->execute([(int)$_SESSION['uid']]);
        $row = $st->fetch();
        if ($row && $row['active'] && (int)$row['sess_ver'] === (int)($_SESSION['sv'] ?? 0)) $u = $row;
        else { unset($_SESSION['uid'], $_SESSION['sv']); }
    }
    return $u;
}
function pr_login_session($row) {
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$row['id'];
    $_SESSION['sv'] = (int)$row['sess_ver'];
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

/* ---------- photos ---------- */
function pr_photo_path($id) { return PR_DATA . '/photos/' . $id . '.jpg'; }
function pr_delete_photos(PDO $pdo, array $ids) {
    foreach ($ids as $id) {
        if (!preg_match('/^[0-9a-f]{32}$/', $id)) continue;
        $pdo->prepare('DELETE FROM photos WHERE id = ?')->execute([$id]);
        @unlink(pr_photo_path($id));
    }
}
// Photos uploaded for an entry that was never saved are removed after two days.
function pr_sweep_photos(PDO $pdo) {
    $st = $pdo->prepare('SELECT id FROM photos WHERE entry_id IS NULL AND created_at < ?');
    $st->execute([date('c', time() - 2 * 86400)]);
    pr_delete_photos($pdo, array_column($st->fetchAll(), 'id'));
}
