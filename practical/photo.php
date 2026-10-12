<?php
// Serves one lab photo, only to the signed-in teacher who owns it or to the admin.
define('PR_APP', 1);
require __DIR__ . '/lib/app.php';

function gone() { http_response_code(404); header('Content-Type: text/plain'); echo 'Not found'; exit; }

try {
    if (!pr_installed()) gone();
    $u = pr_user();
    session_write_close();   // photos load in parallel; do not hold the session lock
    if (!$u || $u['must_change']) gone();
    $id = (string)($_GET['id'] ?? '');
    if (!preg_match('/^[0-9a-f]{32}$/', $id)) gone();
    $st = pr_db()->prepare('SELECT user_id FROM photos WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row || ($u['role'] !== 'admin' && (int)$row['user_id'] !== (int)$u['id'])) gone();
    $file = pr_photo_path($id);
    if (!is_file($file)) gone();
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=86400');
    readfile($file);
} catch (Throwable $e) {
    error_log('practical-register photo: ' . $e->getMessage());
    gone();
}
