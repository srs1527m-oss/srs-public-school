<?php
// JSON API for the Practical Register. Every action checks who is signed in and what they may touch.
define('PR_APP', 1);
require __DIR__ . '/lib/app.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($data) { echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE); exit; }
function body() {
    $j = json_decode(file_get_contents('php://input') ?: 'null', true);
    return is_array($j) ? $j : [];
}
function need_post() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new ApiError('method', 'Use POST for this action.', 405);
    pr_check_csrf();
}
function need_user() {
    $u = pr_user();
    if (!$u) throw new ApiError('auth', 'Sign in again.', 401);
    return $u;
}
// Signed in and no longer on a temporary password.
function need_ready() {
    $u = need_user();
    if ($u['must_change']) throw new ApiError('must_change', 'Set your own password first.', 403);
    return $u;
}
function need_admin() {
    $u = need_ready();
    if ($u['role'] !== 'admin') throw new ApiError('forbidden', 'Only the school admin can do this.', 403);
    return $u;
}
function client_ip() { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 60); }

function entry_photos(PDO $pdo, array $entryIds) {
    $by = [];
    if (!$entryIds) return $by;
    $in = implode(',', array_fill(0, count($entryIds), '?'));
    $st = $pdo->prepare("SELECT id, entry_id, lat, lng, taken, src FROM photos WHERE entry_id IN ($in) ORDER BY created_at, id");
    $st->execute($entryIds);
    foreach ($st as $p) {
        $by[(int)$p['entry_id']][] = ['id' => $p['id'], 'lat' => $p['lat'] === null ? null : (float)$p['lat'], 'lng' => $p['lng'] === null ? null : (float)$p['lng'], 't' => $p['taken'], 'src' => $p['src']];
    }
    return $by;
}
function find_teacher(PDO $pdo, $id) {
    $st = $pdo->prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'");
    $st->execute([(int)$id]);
    $row = $st->fetch();
    if (!$row) throw new ApiError('not_found', 'This teacher ID no longer exists.', 404);
    return $row;
}

try {
    $a = (string)($_GET['a'] ?? '');

    if ($a === 'me') {
        if (!pr_installed()) out(['installed' => false]);
        $u = pr_user();
        out(['installed' => true, 'csrf' => pr_csrf(), 'user' => $u ? pr_user_public($u, true) : null]);
    }
    if (!pr_installed()) throw new ApiError('not_installed', 'The register is not set up yet.', 503);
    $pdo = pr_db();

    switch ($a) {

    /* ---------- signing in ---------- */
    case 'login': {
        need_post();
        $b = body();
        $username = strtolower(pr_str($b['username'] ?? '', 40));
        $password = is_string($b['password'] ?? null) ? $b['password'] : '';
        $key = $username . '|' . client_ip();
        $pdo->prepare('DELETE FROM login_attempts WHERE at < ?')->execute([time() - 86400]);
        $st = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ukey = ? AND at > ?');
        $st->execute([$key, time() - 900]);
        if ((int)$st->fetchColumn() >= 8) throw new ApiError('throttled', 'Too many wrong tries. Wait 15 minutes and try again.', 429);
        $st = $pdo->prepare('SELECT * FROM users WHERE username = ?');
        $st->execute([$username]);
        $row = $st->fetch();
        // Verify against a dummy hash when the ID is unknown, so both cases take the same time.
        $hash = $row ? $row['pass_hash'] : '$2y$10$vmnWZPR5EgDIdkPth41AmOu/KWcVBTvXLV6jAN7oIQO4ThzpugoPe';
        $okPw = password_verify($password, $hash);
        if (!$row || !$okPw || !$row['active']) {
            $pdo->prepare('INSERT INTO login_attempts (ukey, at) VALUES (?, ?)')->execute([$key, time()]);
            throw new ApiError('bad_login', 'The ID or password is not correct.', 401);
        }
        $pdo->prepare('DELETE FROM login_attempts WHERE ukey = ?')->execute([$key]);
        pr_session_start();
        pr_login_session($row);
        out(['user' => pr_user_public($row, true), 'csrf' => pr_csrf()]);
    }
    case 'logout': {
        need_post();
        $_SESSION = [];
        session_regenerate_id(true);
        out([]);
    }
    case 'password': {
        need_post();
        $u = need_user();
        $b = body();
        $cur = is_string($b['current'] ?? null) ? $b['current'] : '';
        $new = is_string($b['next'] ?? null) ? $b['next'] : '';
        if (!password_verify($cur, $u['pass_hash'])) throw new ApiError('bad_current', 'The current password is not correct.', 400);
        if (strlen($new) < 8 || strlen($new) > 100) throw new ApiError('weak', 'The new password needs at least 8 characters.', 400);
        if (hash_equals($cur, $new)) throw new ApiError('same', 'Choose a password different from the current one.', 400);
        if (strtolower($new) === strtolower($u['username'])) throw new ApiError('weak', 'The password cannot be the same as your ID.', 400);
        // Raising sess_ver signs out every other device of this account.
        $sv = (int)$u['sess_ver'] + 1;
        $pdo->prepare('UPDATE users SET pass_hash = ?, must_change = 0, sess_ver = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $sv, $u['id']]);
        $_SESSION['sv'] = $sv;
        out([]);
    }

    /* ---------- reading ---------- */
    case 'state': {
        $u = need_ready();
        $admin = $u['role'] === 'admin';
        $st = $pdo->prepare("SELECT v FROM settings WHERE k = 'sections'");
        $st->execute();
        $sections = json_decode((string)$st->fetchColumn(), true);
        if ($admin) {
            $teachers = array_map(function ($r) { return pr_user_public($r, true); }, $pdo->query("SELECT * FROM users WHERE role = 'teacher' ORDER BY active DESC, name COLLATE NOCASE")->fetchAll());
            $rows = $pdo->query('SELECT * FROM entries ORDER BY date DESC, id DESC')->fetchAll();
        } else {
            // A teacher gets their own profile and their own entries, nothing else.
            $teachers = [pr_user_public($u, true)];
            $st = $pdo->prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY date DESC, id DESC');
            $st->execute([$u['id']]);
            $rows = $st->fetchAll();
        }
        $photos = entry_photos($pdo, array_map(function ($r) { return (int)$r['id']; }, $rows));
        $entries = [];
        foreach ($rows as $r) {
            $entries[] = ['id' => (int)$r['id'], 'uid' => (int)$r['user_id'], 'teacher' => $r['teacher'], 'date' => $r['date'], 'cls' => $r['cls'], 'sec' => $r['sec'],
                'subj' => $r['subj'], 'pid' => $r['pid'], 'title' => $r['title'],
                'present' => $r['present'] === null ? null : (int)$r['present'], 'total' => $r['total'] === null ? null : (int)$r['total'], 'files' => $r['files'] === null ? null : (int)$r['files'],
                'note' => $r['note'], 'at' => $r['created_at'], 'photos' => $photos[(int)$r['id']] ?? []];
        }
        out(['sections' => is_array($sections) ? $sections : new stdClass(), 'teachers' => $teachers, 'entries' => $entries]);
    }

    /* ---------- entries ---------- */
    case 'entry.save': {
        need_post();
        $u = need_ready();
        $admin = $u['role'] === 'admin';
        $b = body();
        $classes = pr_classes();
        $date = is_string($b['date'] ?? null) ? $b['date'] : '';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int)substr($date, 5, 2), (int)substr($date, 8, 2), (int)substr($date, 0, 4))) throw new ApiError('invalid', 'Choose the date of the practical.');
        if ($date > date('Y-m-d', time() + 86400)) throw new ApiError('invalid', 'The date cannot be in the future.');
        $pid = is_string($b['pid'] ?? null) ? $b['pid'] : '';
        $title = pr_str($b['title'] ?? '', 160);
        $present = pr_int($b['present'] ?? null); $total = pr_int($b['total'] ?? null); $files = pr_int($b['files'] ?? 0);
        if ($total === null || $total < 1 || $total > 200) throw new ApiError('invalid', 'Enter the number of students in the section.');
        if ($present === null || $present > $total) throw new ApiError('invalid', 'Students present cannot be more than students in the section.');
        if ($files === null || $files > $total) throw new ApiError('invalid', 'Record files checked cannot be more than students in the section.');
        $note = pr_str($b['note'] ?? '', 300);
        $checkPid = function ($cls, $subj) use ($pid, $title) {
            if ($pid === 'other') { if ($title === '') throw new ApiError('invalid', 'Describe what was done in the lab.'); return; }
            if (!preg_match('/^[A-Za-z0-9.]{3,40}$/', $pid) || strpos($pid, $cls . '.' . $subj . '.') !== 0) throw new ApiError('invalid', 'Choose the practical that was done.');
        };

        if (!empty($b['id'])) {
            // Changing a saved entry: only its owner or the admin, and never its class, section, subject or teacher.
            $st = $pdo->prepare('SELECT * FROM entries WHERE id = ?');
            $st->execute([(int)$b['id']]);
            $e = $st->fetch();
            if (!$e || (!$admin && (int)$e['user_id'] !== (int)$u['id'])) throw new ApiError('not_found', 'This entry no longer exists.', 404);
            $checkPid($e['cls'], $e['subj']);
            $pdo->prepare('UPDATE entries SET date = ?, pid = ?, title = ?, present = ?, total = ?, files = ?, note = ?, updated_at = ? WHERE id = ?')
                ->execute([$date, $pid, $pid === 'other' ? $title : '', $present, $total, $files, $note, pr_now(), $e['id']]);
            out(['id' => (int)$e['id']]);
        }

        $cls = is_string($b['cls'] ?? null) ? $b['cls'] : ''; $subj = is_string($b['subj'] ?? null) ? $b['subj'] : '';
        if (!isset($classes[$cls]) || !in_array($subj, $classes[$cls], true)) throw new ApiError('invalid', 'Choose the board, class and subject.');
        $sec = pr_sec($b['sec'] ?? '');
        if ($sec === '') throw new ApiError('invalid', 'Enter the section, for example A.');
        $checkPid($cls, $subj);
        // The admin may log on behalf of a teacher; a teacher always logs as themselves and only for assigned classes.
        $owner = $u;
        if ($admin && !empty($b['uid']) && (int)$b['uid'] !== (int)$u['id']) {
            $owner = find_teacher($pdo, $b['uid']);
            if (!$owner['active']) throw new ApiError('invalid', 'This teacher ID is deactivated.');
        }
        if (!$admin) {
            $assign = pr_clean_assign(json_decode($u['assign'], true));
            if ($assign) {
                $hit = null;
                foreach ($assign as $x) if ($x['cls'] === $cls && $x['subj'] === $subj) $hit = $x;
                if (!$hit) throw new ApiError('not_assigned', 'This class and subject are not assigned to you. Ask the school admin.', 403);
                if ($hit['secs'] && !in_array($sec, $hit['secs'], true)) throw new ApiError('not_assigned', 'Section ' . $sec . ' is not assigned to you for this class. Ask the school admin.', 403);
            }
        }
        $ids = [];
        foreach (is_array($b['photos'] ?? null) ? $b['photos'] : [] as $pidPhoto) {
            if (is_string($pidPhoto) && preg_match('/^[0-9a-f]{32}$/', $pidPhoto) && !in_array($pidPhoto, $ids, true)) $ids[] = $pidPhoto;
        }
        if (count($ids) > 4) throw new ApiError('invalid', 'An entry can carry up to 4 photos.');
        $pdo->beginTransaction();
        foreach ($ids as $pidPhoto) {
            // Only photos this same account uploaded and has not used yet.
            $st = $pdo->prepare('SELECT 1 FROM photos WHERE id = ? AND user_id = ? AND entry_id IS NULL');
            $st->execute([$pidPhoto, $u['id']]);
            if (!$st->fetchColumn()) { $pdo->rollBack(); throw new ApiError('invalid', 'A photo did not upload fully. Remove the photos and add them again.'); }
        }
        $pdo->prepare('INSERT INTO entries (user_id, teacher, date, cls, sec, subj, pid, title, present, total, files, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$owner['id'], $owner['name'], $date, $cls, $sec, $subj, $pid, $pid === 'other' ? $title : '', $present, $total, $files, $note, pr_now()]);
        $eid = (int)$pdo->lastInsertId();
        foreach ($ids as $pidPhoto) $pdo->prepare('UPDATE photos SET entry_id = ?, user_id = ? WHERE id = ?')->execute([$eid, $owner['id'], $pidPhoto]);
        $pdo->commit();
        out(['id' => $eid]);
    }
    case 'entry.delete': {
        need_post();
        $u = need_ready();
        $b = body();
        $st = $pdo->prepare('SELECT * FROM entries WHERE id = ?');
        $st->execute([(int)($b['id'] ?? 0)]);
        $e = $st->fetch();
        if (!$e || ($u['role'] !== 'admin' && (int)$e['user_id'] !== (int)$u['id'])) throw new ApiError('not_found', 'This entry no longer exists.', 404);
        $st = $pdo->prepare('SELECT id FROM photos WHERE entry_id = ?');
        $st->execute([$e['id']]);
        pr_delete_photos($pdo, array_column($st->fetchAll(), 'id'));
        $pdo->prepare('DELETE FROM entries WHERE id = ?')->execute([$e['id']]);
        out([]);
    }

    /* ---------- photos ---------- */
    case 'photo.upload': {
        need_post();
        $u = need_ready();
        $f = $_FILES['file'] ?? null;
        if (!$f || !is_array($f) || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new ApiError('upload', 'The photo did not reach the server. Try again.');
        if ($f['size'] > 4 * 1024 * 1024) throw new ApiError('too_large', 'The photo is too large.');
        // The page always sends a JPEG it re-drew itself; anything else is refused.
        $info = @getimagesize($f['tmp_name']);
        if (!$info || $info[2] !== IMAGETYPE_JPEG || $info[0] > 5000 || $info[1] > 5000) throw new ApiError('unsupported', 'Only JPG photos can be saved.');
        $dir = PR_DATA . '/photos';
        if (!is_dir($dir) && !@mkdir($dir, 0700, true)) throw new ApiError('storage', 'The server could not store the photo.', 500);
        // Keep at most 12 unsaved photos per account.
        $st = $pdo->prepare('SELECT id FROM photos WHERE user_id = ? AND entry_id IS NULL ORDER BY created_at DESC');
        $st->execute([$u['id']]);
        pr_delete_photos($pdo, array_slice(array_column($st->fetchAll(), 'id'), 11));
        if (random_int(1, 20) === 1) pr_sweep_photos($pdo);
        $id = bin2hex(random_bytes(16));
        if (!move_uploaded_file($f['tmp_name'], pr_photo_path($id))) throw new ApiError('storage', 'The server could not store the photo.', 500);
        @chmod(pr_photo_path($id), 0600);
        $lat = is_numeric($_POST['lat'] ?? null) ? (float)$_POST['lat'] : null; $lng = is_numeric($_POST['lng'] ?? null) ? (float)$_POST['lng'] : null;
        if ($lat === null || $lng === null || abs($lat) > 90 || abs($lng) > 180) { $lat = null; $lng = null; }
        $taken = is_string($_POST['t'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $_POST['t']) ? $_POST['t'] : null;
        $src = in_array($_POST['src'] ?? '', ['photo', 'device'], true) && $lat !== null ? $_POST['src'] : '';
        $pdo->prepare('INSERT INTO photos (id, entry_id, user_id, lat, lng, taken, src, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)')->execute([$id, $u['id'], $lat, $lng, $taken, $src, pr_now()]);
        out(['id' => $id]);
    }
    case 'photo.discard': {
        need_post();
        $u = need_ready();
        $b = body();
        $id = is_string($b['id'] ?? null) ? $b['id'] : '';
        $st = $pdo->prepare('SELECT 1 FROM photos WHERE id = ? AND user_id = ? AND entry_id IS NULL');
        $st->execute([$id, $u['id']]);
        if ($st->fetchColumn()) pr_delete_photos($pdo, [$id]);
        out([]);
    }

    /* ---------- admin: sections and teacher IDs ---------- */
    case 'sections.save': {
        need_post();
        need_admin();
        $b = body(); $clean = [];
        foreach (array_keys(pr_classes()) as $cls) $clean[$cls] = pr_clean_secs($b['sections'][$cls] ?? []);
        $pdo->prepare("INSERT OR REPLACE INTO settings (k, v) VALUES ('sections', ?)")->execute([json_encode($clean, JSON_UNESCAPED_UNICODE)]);
        out([]);
    }
    case 'user.create': {
        need_post();
        need_admin();
        $b = body();
        $name = pr_str($b['name'] ?? '', 60);
        $username = strtolower(pr_str($b['username'] ?? '', 40));
        if ($name === '') throw new ApiError('invalid', 'Enter the teacher\'s name.');
        if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,29}$/', $username)) throw new ApiError('invalid', 'The ID needs 3 to 30 characters: small letters, digits, dot, dash or underscore.');
        $st = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
        $st->execute([$username]);
        if ($st->fetchColumn()) throw new ApiError('taken', 'This ID is already in use. Choose another.');
        $temp = pr_temp_password();
        $pdo->prepare("INSERT INTO users (username, name, role, pass_hash, must_change, active, assign, created_at) VALUES (?, ?, 'teacher', ?, 1, 1, ?, ?)")
            ->execute([$username, $name, password_hash($temp, PASSWORD_DEFAULT), json_encode(pr_clean_assign($b['assign'] ?? [])), pr_now()]);
        out(['user' => pr_user_public(find_teacher($pdo, $pdo->lastInsertId()), true), 'tempPassword' => $temp]);
    }
    // Teachers on the school's list who have no ID yet.
    case 'seed.list': {
        need_admin();
        $have = array_column($pdo->query('SELECT username FROM users')->fetchAll(), 'username');
        $todo = [];
        foreach (pr_seed() as $t) if (!in_array($t['username'], $have, true)) $todo[] = ['name' => $t['name'], 'username' => $t['username']];
        out(['teachers' => $todo]);
    }
    // Create an ID with a temporary password for each of them. The passwords go back to the admin once and are not kept.
    case 'seed.create': {
        need_post();
        need_admin();
        $made = [];
        foreach (pr_seed() as $t) {
            $st = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
            $st->execute([$t['username']]);
            if ($st->fetchColumn()) continue;
            $temp = pr_temp_password();
            $pdo->prepare("INSERT INTO users (username, name, role, pass_hash, must_change, active, assign, created_at) VALUES (?, ?, 'teacher', ?, 1, 1, ?, ?)")
                ->execute([$t['username'], $t['name'], password_hash($temp, PASSWORD_DEFAULT), json_encode($t['assign']), pr_now()]);
            $made[] = ['name' => $t['name'], 'username' => $t['username'], 'tempPassword' => $temp];
        }
        out(['created' => $made]);
    }
    case 'user.update': {
        need_post();
        need_admin();
        $b = body();
        $t = find_teacher($pdo, $b['id'] ?? 0);
        $name = pr_str($b['name'] ?? $t['name'], 60);
        if ($name === '') throw new ApiError('invalid', 'Enter the teacher\'s name.');
        $active = array_key_exists('active', $b) ? ($b['active'] ? 1 : 0) : (int)$t['active'];
        $assign = array_key_exists('assign', $b) ? json_encode(pr_clean_assign($b['assign'])) : $t['assign'];
        // Deactivating signs the teacher out everywhere.
        $sv = (int)$t['sess_ver'] + ($active ? 0 : 1);
        $pdo->prepare('UPDATE users SET name = ?, active = ?, assign = ?, sess_ver = ? WHERE id = ?')->execute([$name, $active, $assign, $sv, $t['id']]);
        out(['user' => pr_user_public(find_teacher($pdo, $t['id']), true)]);
    }
    case 'user.resetpw': {
        need_post();
        need_admin();
        $b = body();
        $t = find_teacher($pdo, $b['id'] ?? 0);
        $temp = pr_temp_password();
        $pdo->prepare('UPDATE users SET pass_hash = ?, must_change = 1, sess_ver = sess_ver + 1 WHERE id = ?')->execute([password_hash($temp, PASSWORD_DEFAULT), $t['id']]);
        $pdo->prepare('DELETE FROM login_attempts WHERE ukey LIKE ?')->execute([$t['username'] . '|%']);
        out(['username' => $t['username'], 'tempPassword' => $temp]);
    }

    default:
        throw new ApiError('unknown', 'Unknown action.', 404);
    }
} catch (ApiError $e) {
    http_response_code($e->status);
    echo json_encode(['ok' => false, 'code' => $e->codeStr, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('practical-register: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'code' => 'server', 'message' => 'The server had a problem. Try again in a minute.']);
}
