<?php
// The register's one page. All data comes from api.php after sign-in.
define('PR_APP', 1);
require __DIR__ . '/lib/app.php';
if (!pr_installed()) { header('Location: install.php'); exit; }

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
$v = '11';   // raise when assets change, so browsers fetch the new files
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>SRS Practical Register</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/app.css?v=<?= $v ?>">
</head>
<body>
<p class="boot" id="bootMsg">Opening the register…</p>

<!-- SIGN IN -->
<div class="auth" id="authView" hidden>
  <div class="auth-card">
    <p class="eyebrow">SRS Public School · Science labs</p>
    <h1>Practical Register</h1>
    <form id="loginForm" class="auth-form" novalidate>
      <div class="field"><label for="lUser">ID</label><input type="text" id="lUser" maxlength="40" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="lPass">Password</label><input type="password" id="lPass" maxlength="100" autocomplete="current-password" required></div>
      <button class="btn" type="submit" id="loginBtn">Sign in</button>
      <p class="form-msg" id="loginMsg" role="status"></p>
    </form>
    <p class="hint-line">Forgot your password? Ask the school admin for a new temporary one.</p>
  </div>
</div>

<!-- SET PASSWORD -->
<div class="auth" id="pwView" hidden>
  <div class="auth-card">
    <p class="eyebrow">SRS Public School · Science labs</p>
    <h1 id="pwTitle">Set your own password</h1>
    <p class="lede" id="pwLede"></p>
    <form id="pwForm" class="auth-form" novalidate>
      <div class="field"><label for="pCur" id="pCurLabel">Temporary password</label><input type="password" id="pCur" maxlength="100" autocomplete="current-password" required></div>
      <div class="field"><label for="pNew">New password</label><input type="password" id="pNew" minlength="8" maxlength="100" autocomplete="new-password" required><span class="hint">At least 8 characters. Only you should know it.</span></div>
      <div class="field"><label for="pNew2">Repeat the new password</label><input type="password" id="pNew2" minlength="8" maxlength="100" autocomplete="new-password" required></div>
      <div class="actions">
        <button class="btn" type="submit" id="pwBtn">Save password</button>
        <button class="btn ghost" type="button" id="pwCancel">Cancel</button>
      </div>
      <p class="form-msg" id="pwMsg" role="status"></p>
    </form>
  </div>
</div>

<!-- REGISTER -->
<div class="page" id="appView" hidden>
  <header class="mast">
    <div class="mast-text">
      <p class="eyebrow">SRS Public School · Science labs</p>
      <h1>Practical Register</h1>
      <p class="lede">CBSE and UP Board practicals for Classes IX to XII: which ones are done in each section, who took them, how many students attended and whose record file is signed.</p>
    </div>
    <div class="mast-meta who">
      <span class="chip">CBSE + UP Board lists 2026-27</span>
      <span class="chip" id="sync"><span class="dot"></span><span id="syncText">Loading</span></span>
      <button class="btn ghost small" type="button" id="pwOpen">Change password</button>
      <button class="btn ghost small" type="button" id="logoutBtn">Sign out</button>
    </div>
  </header>

  <div class="tabs-wrap">
    <div class="tabs" role="tablist" aria-label="Register sections">
      <button class="tab" role="tab" id="tabbtn-overview" data-tab="overview" aria-selected="true">Overview</button>
      <button class="tab" role="tab" id="tabbtn-log" data-tab="log" aria-selected="false">Log a practical</button>
      <button class="tab" role="tab" id="tabbtn-syllabus" data-tab="syllabus" aria-selected="false">Syllabus</button>
      <button class="tab" role="tab" id="tabbtn-entries" data-tab="entries" aria-selected="false">Entries</button>
      <button class="tab" role="tab" id="tabbtn-setup" data-tab="setup" aria-selected="false" hidden>Setup</button>
    </div>
  </div>

  <div class="notice bad" id="banner" hidden></div>

  <!-- OVERVIEW -->
  <section class="view" id="view-overview" role="tabpanel" aria-labelledby="tabbtn-overview">
    <div class="panel" id="emptyPanel" hidden>
      <div class="panel-body empty">
        <h3>No practicals logged yet</h3>
        <ol>
          <li>In Setup, create an ID for each science teacher and add the classes they take.</li>
          <li>Give each teacher their ID and temporary password. They set their own password at first sign-in.</li>
          <li>After each lab period, the teacher saves one entry in Log a practical. Coverage, attendance and record-file checks then build up here.</li>
        </ol>
        <button class="btn" type="button" data-goto="setup" id="emptySetupBtn">Open Setup</button>
      </div>
    </div>
    <div class="toolbar" id="oBoardBar">
      <div class="field" style="width:200px"><label for="oBoard">Board</label>
        <select id="oBoard"><option value="">CBSE and UP Board</option><option value="cbse">CBSE only</option><option value="up">UP Board only</option></select></div>
    </div>
    <div class="panel"><div class="figs" id="figs"></div></div>
    <div class="panel">
      <div class="panel-head"><h2>Class and subject</h2><span class="aside">Covered = practicals done against what the board's list needs, averaged over sections</span></div>
      <div class="table-wrap" id="classTable"></div>
    </div>
    <div class="two">
      <div class="panel" id="teachPanel">
        <div class="panel-head"><h2>Teachers</h2><span class="aside" id="teachAside"></span></div>
        <div class="table-wrap" id="teacherTable"></div>
      </div>
      <div class="panel" id="nextPanel" hidden>
        <div class="panel-head"><h2>Next practicals</h2><span class="aside">First practical still to do in each of your sections</span></div>
        <div id="nextList"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Latest entries</h2><button class="btn ghost small" type="button" data-goto="entries" id="allEntriesBtn">See all</button></div>
        <div id="recent"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Lab photos</h2><span class="aside" id="photoAside"></span></div>
      <div id="gallery"></div>
    </div>
  </section>

  <!-- LOG -->
  <section class="view" id="view-log" role="tabpanel" aria-labelledby="tabbtn-log" hidden>
    <div class="panel">
      <div class="panel-head"><h2>Log a practical</h2><span class="aside">One entry per lab period, per section</span></div>
      <div class="panel-body">
        <div class="notice" id="editNote" hidden style="margin-bottom:14px">You are changing a saved entry. Board, class, section, subject and teacher stay as they were; to change those, delete the entry and log it again. Photos stay as they are.</div>
        <form id="logForm" novalidate>
          <div class="form-grid">
            <div class="field c2"><label for="fDate">Date</label><input type="date" id="fDate" required></div>
            <div class="field c2"><label for="fBoard">Board</label><select id="fBoard"></select></div>
            <div class="field c2"><label for="fClass">Class</label><select id="fClass"></select></div>
            <div class="field c2"><label for="fSec">Section</label><input type="text" id="fSec" list="secList" maxlength="12" placeholder="A" autocomplete="off" required><datalist id="secList"></datalist></div>
            <div class="field c2"><label for="fSubj">Subject</label><select id="fSubj"></select></div>
            <div class="field c2"><label for="fTeacher">Teacher</label><select id="fTeacher"></select></div>
            <div class="field c6"><label for="fPractical">Practical</label><select id="fPractical"></select></div>
            <div class="field c6" id="otherWrap" hidden><label for="fOther">What was done</label><input type="text" id="fOther" maxlength="160" placeholder="e.g. Investigatory project work, viva practice, revision of salt analysis"></div>
            <div class="field c2"><label for="fPresent">Students present</label><input type="number" id="fPresent" min="0" max="200" inputmode="numeric" required></div>
            <div class="field c2"><label for="fTotal">Students in section</label><input type="number" id="fTotal" min="1" max="200" inputmode="numeric" required></div>
            <div class="field c2"><label for="fFiles">Record files checked</label><input type="number" id="fFiles" min="0" max="200" inputmode="numeric" placeholder="0"><span class="hint">Files checked and signed for this practical</span></div>
            <div class="field c6" id="photoField">
              <span class="lab">Photos (optional)</span>
              <div class="photo-pick">
                <input type="file" id="fPhotos" class="vh" accept="image/*" multiple>
                <label class="btn ghost small" for="fPhotos" id="fPhotosLabel">Add photos</label>
                <span class="hint" id="photoHint"></span>
              </div>
              <div class="strip" id="photoStrip" hidden></div>
            </div>
            <div class="field c6"><label for="fNote">Remarks (optional)</label><textarea id="fNote" maxlength="300" placeholder="Apparatus issues, groups that need a repeat, readings pending"></textarea></div>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn" type="submit" id="saveBtn">Save entry</button>
            <button class="btn ghost" type="button" id="cancelEdit" hidden>Cancel changes</button>
            <p class="form-msg" id="formMsg" role="status"></p>
          </div>
        </form>
      </div>
    </div>
  </section>

  <!-- SYLLABUS -->
  <section class="view" id="view-syllabus" role="tabpanel" aria-labelledby="tabbtn-syllabus" hidden>
    <div class="panel">
      <div class="panel-head"><h2>Syllabus coverage</h2><span class="aside">A tick shows the date the practical was first done in that section</span></div>
      <div class="panel-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="toolbar">
          <div class="field" style="width:150px"><label for="sBoard">Board</label>
            <select id="sBoard"><option value="cbse" selected>CBSE</option><option value="up">UP Board</option></select></div>
          <div class="field" style="width:150px"><label for="sClass">Class</label>
            <select id="sClass"><option value="9">IX (9)</option><option value="10">X (10)</option><option value="11">XI (11)</option><option value="12" selected>XII (12)</option></select></div>
          <div class="field" style="width:170px"><label for="sSubj">Subject</label><select id="sSubj"></select></div>
        </div>
        <p class="syl-note" id="sylNote"></p>
      </div>
      <div class="table-wrap" id="sylTable"></div>
    </div>
  </section>

  <!-- ENTRIES -->
  <section class="view" id="view-entries" role="tabpanel" aria-labelledby="tabbtn-entries" hidden>
    <div class="panel">
      <div class="panel-head"><h2 id="entriesTitle">All entries</h2><span class="aside" id="entriesAside"></span></div>
      <div class="panel-body">
        <div class="toolbar">
          <div class="field" style="width:140px"><label for="eBoard">Board</label>
            <select id="eBoard"><option value="">All</option><option value="cbse">CBSE</option><option value="up">UP Board</option></select></div>
          <div class="field" style="width:140px"><label for="eClass">Class</label>
            <select id="eClass"><option value="">All</option><option value="9">IX</option><option value="10">X</option><option value="11">XI</option><option value="12">XII</option></select></div>
          <div class="field" style="width:160px"><label for="eSubj">Subject</label>
            <select id="eSubj"><option value="">All</option><option value="science">Science</option><option value="physics">Physics</option><option value="chemistry">Chemistry</option><option value="biology">Biology</option></select></div>
          <div class="field" style="width:220px" id="eTeacherField"><label for="eTeacher">Teacher</label><select id="eTeacher"><option value="">All</option></select></div>
        </div>
      </div>
      <div class="table-wrap" id="entriesTable"></div>
    </div>
  </section>

  <!-- SETUP (admin) -->
  <section class="view" id="view-setup" role="tabpanel" aria-labelledby="tabbtn-setup" hidden>
    <div class="panel">
      <div class="panel-head"><h2>Teacher IDs</h2><span class="aside">Each teacher signs in with their own ID and password, and sees only their own classes and entries</span></div>
      <div class="panel-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="notice" id="seedBox" hidden></div>
        <form id="newTeacherForm" class="toolbar" novalidate>
          <div class="field" style="width:240px"><label for="ntName">Teacher name</label><input type="text" id="ntName" maxlength="60" autocomplete="off" required></div>
          <div class="field" style="width:200px"><label for="ntUser">ID</label><input type="text" id="ntUser" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="e.g. satendra" required></div>
          <button class="btn" type="submit" id="ntBtn">Create ID</button>
        </form>
        <p class="form-msg" id="teacherMsg" role="status"></p>
        <div class="notice" id="tempPw" hidden></div>
        <div id="tEditor" class="teds"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Sections</h2><span class="aside">Sections listed here show on the Overview even before their first entry</span></div>
      <div class="panel-body">
        <form id="setupForm" novalidate>
          <div class="form-grid">
            <div class="field c3"><label for="sec9">CBSE · Class IX sections</label><input type="text" id="sec9" maxlength="120" placeholder="A, B, C" autocomplete="off"></div>
            <div class="field c3"><label for="sec10">CBSE · Class X sections</label><input type="text" id="sec10" maxlength="120" placeholder="A, B, C" autocomplete="off"></div>
            <div class="field c3"><label for="sec11">CBSE · Class XI science sections</label><input type="text" id="sec11" maxlength="120" placeholder="A, B" autocomplete="off"></div>
            <div class="field c3"><label for="sec12">CBSE · Class XII science sections</label><input type="text" id="sec12" maxlength="120" placeholder="A, B" autocomplete="off"></div>
            <div class="field c3"><label for="secu9">UP Board · Class IX sections</label><input type="text" id="secu9" maxlength="120" placeholder="A, B, C" autocomplete="off"></div>
            <div class="field c3"><label for="secu10">UP Board · Class X sections</label><input type="text" id="secu10" maxlength="120" placeholder="A, B, C" autocomplete="off"></div>
            <div class="field c3"><label for="secu11">UP Board · Class XI science sections</label><input type="text" id="secu11" maxlength="120" placeholder="A, B" autocomplete="off"></div>
            <div class="field c3"><label for="secu12">UP Board · Class XII science sections</label><input type="text" id="secu12" maxlength="120" placeholder="A, B" autocomplete="off"></div>
          </div>
          <div class="actions" style="margin-top:16px">
            <button class="btn" type="submit" id="setupSave">Save sections</button>
            <p class="form-msg" id="setupMsg" role="status"></p>
          </div>
        </form>
      </div>
    </div>
  </section>
</div>
<div class="toast" id="toast" role="status" hidden></div>
<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Lab photo" hidden>
  <div class="lb-inner">
    <img id="lbImg" alt="">
    <p id="lbCap"></p>
    <p id="lbGeo" hidden><span id="lbGeoText"></span> <a id="lbMap" target="_blank" rel="noopener noreferrer" hidden>Open in Maps</a></p>
    <button class="lb-close" type="button" id="lbClose">Close</button>
  </div>
</div>
<script src="assets/syllabus.js?v=<?= $v ?>"></script>
<script src="assets/app.js?v=<?= $v ?>"></script>
</body>
</html>
