# Practical Register: adding it to srspublicschool.in

This note is for whoever works in the source code of https://srspublicschool.in (a person or a coding agent).
The school wants the Practical Register to be part of that website, with its own ID and password sign-in
for teachers. The school's owner cannot explain the technical side, so everything needed is written here.

## 1. What the register is

A small web app for the science labs of SRS Public School (Classes IX to XII, CBSE and UP Board):

- Teachers sign in with their own ID and password and log each practical: date, board, class, section, subject,
  which practical from the board's list, students present, record files checked, remarks, up to 4 photos.
- Each photo is shrunk in the browser to a 1600 px JPEG and stamped with time, location (GPS from the photo's EXIF,
  else the phone's position), class and teacher.
- A teacher sees only their own classes and entries. The admin sees the whole school, creates teacher IDs,
  assigns classes, resets passwords and deactivates IDs.
- Syllabus coverage per section is worked out in the browser from the entries and the practical lists.

## 2. What is in this folder

A complete, working reference implementation in PHP 7.4+ with SQLite. It was tested end to end on a local PHP server
(install, sign-in, teacher IDs, entries, photos, edit, delete, password reset, access rules). It has not run on real hosting.

| Path | What it is |
|---|---|
| `index.php` | The one page: sign-in screen, set-password screen and the register markup. Sends the security headers. |
| `assets/app.js` | All page logic (plain JavaScript, no framework, no build step). |
| `assets/syllabus.js` | CBSE and UP Board practical lists 2026-27, as data. |
| `assets/app.css` | Styles, light and dark. |
| `api.php` | JSON API. Every action checks the session and role. Read this for exact behaviour. |
| `photo.php` | Serves one photo to its owner or the admin only. |
| `install.php` | First-run setup (creates the admin) and admin password reset, both guarded by a setup code. |
| `lib/app.php` | Schema, session, helpers. |
| `lib/seed.php` | The school's own list of 9 science teachers with their classes. |
| `README.txt` | Setup guide for the school (Hinglish), for the PHP route. |

## 3. Why it cannot simply be uploaded

srspublicschool.in is a Next.js site. It does not run PHP, and if it is deployed on a serverless platform it has
no writable disk, so the SQLite file and the photo folder used here cannot live there.

## 4. Two ways to do what the school asked

**A. Subdomain, no code change (least work).** Put this folder on any PHP hosting with HTTPS and point
`practical.srspublicschool.in` at it with a DNS record. Add a link to it from the site's footer or a staff page.
Everything in this folder then works as tested.

**B. Port it into the Next.js app (what the owner chose).** Keep the front end as it is and rewrite only the server
side as route handlers. Plan below.

## 5. Port plan (option B)

### 5.1 Routes

- `/register`: the page. Keep it outside the `[locale]` routing and exclude it from the i18n middleware matcher.
  Mark it `noindex`. It is a staff tool, not a public page.
- `/register/api?a=<action>`: one route handler that switches on `a`, like `api.php`.
- `/register/photo?id=<32 hex>`: returns the JPEG after the same checks as `photo.php`.

### 5.2 Front end: reuse unchanged

`assets/app.js` is a self-contained vanilla JS app. It needs no React. Serve the three asset files as static files
(for example from `public/register/`) and use the `<body>` markup of `index.php` as the page.
Only two constants at the top of `app.js` name the server: `API_URL` and `PHOTO_URL`. Point them at the new routes.
`app.js` also redirects to `install.php` when the API says `installed: false`; change that one line to your setup page.

Headers to keep on the page (see `index.php`): a Content-Security-Policy with `script-src 'self'`,
`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`. Geolocation needs HTTPS.

### 5.3 API contract

GET for reads, POST for everything else. POST bodies are JSON except `photo.upload` (multipart).
Every POST must carry the header `X-CSRF` equal to the token returned by `me`.
Success: `{ ok: true, ... }`. Failure: HTTP status plus `{ ok: false, code, message }`; `message` is shown to the user as is.

| Action | Who | Purpose |
|---|---|---|
| `me` (GET) | anyone | `{ installed, csrf, user \| null }`. `user` has `id, name, role, assign, username, active, mustChange`. |
| `login` | anyone | `{ username, password }`. 8 wrong tries per ID and IP lock that pair for 15 minutes (429 `throttled`). |
| `logout` | signed in | Ends the session. |
| `password` | signed in | `{ current, next }`, minimum 8 characters. Clears `mustChange`, signs out other devices. |
| `state` (GET) | ready user | Admin: all teachers, all entries. Teacher: own profile, own entries only. Plus `sections`. |
| `entry.save` | ready user | Create, or update when `id` is given. Update never changes class, section, subject or teacher. |
| `entry.delete` | owner or admin | Deletes the entry and its photo files. |
| `photo.upload` | ready user | Multipart `file` (JPEG only, 4 MB max) plus optional `lat, lng, t, src`. Returns `{ id }`. |
| `photo.discard` | uploader | Removes an uploaded photo that was never attached to an entry. |
| `sections.save` | admin | `{ sections: { "9": ["A"], "u9": ["D"], ... } }` |
| `user.create` | admin | `{ name, username }`. Returns a temporary password once; `mustChange` is set. |
| `user.update` | admin | `{ id, name?, active?, assign? }`. Deactivating ends that teacher's sessions. |
| `user.resetpw` | admin | New temporary password, returned once; ends that teacher's sessions. |
| `seed.list` (GET), `seed.create` | admin | The school's teacher list (section 5.7). |

"Ready user" means signed in and no longer on a temporary password (`mustChange` false); otherwise 403 `must_change`.
An expired session answers 401 `auth`; the page then shows the sign-in screen.

Class keys: `"9".."12"` are CBSE, `"u9".."u12"` are UP Board. Subjects: `science` for IX and X; `physics`, `chemistry`,
`biology` for XI and XII. A practical id looks like `12.chemistry.J.1` or `u12.physics.A.3`, or the word `other`
(then `title` is required).

### 5.4 Data model

Same tables as `pr_create_schema()` in `lib/app.php`:

- `users`: id, username (unique, lower case), name, role (`admin` or `teacher`), pass_hash, must_change, active,
  sess_ver, assign (JSON list of `{ cls, subj, secs[] }`), created_at
- `settings`: key/value; `sections` holds the sections JSON
- `entries`: id, user_id, teacher (name at the time), date, cls, sec, subj, pid, title, present, total, files, note,
  created_at, updated_at
- `photos`: id (32 hex), entry_id (null until attached), user_id, lat, lng, taken, src (`photo`, `device` or empty), created_at
- `login_attempts`: ukey (`username|ip`), at

### 5.5 Rules that must survive the port

These are the points the reference implementation was tested for. Please keep each one.

1. Passwords are stored only as a slow hash (bcrypt or argon2). Temporary passwords are returned to the admin once and never stored in clear.
2. Session cookie: HttpOnly, SameSite=Lax, Secure on HTTPS. A new session id at sign-in.
3. `sess_ver` on the user row: raising it (password change, reset, deactivation) ends every existing session of that user.
4. CSRF header check on every POST, including `login`.
5. A teacher can read and change only their own entries and photos. Another teacher's entry or photo answers 404.
6. A teacher with assigned classes can create entries only for those class and subject pairs, and only for the listed sections when sections are listed. A `uid` sent by a teacher is ignored.
7. Admin-only actions answer 403 for teachers.
8. Server-side validation of dates (not in the future), counts (`present` and `files` not above `total`, `total` 1 to 200), and that the practical id belongs to the entry's class and subject.
9. Uploads: accept only real JPEGs (check the bytes, not the name), 4 MB and 5000 px limits, random 32-hex names, at most 4 per entry, attach only photos uploaded by the same account and not yet used.
10. Photos are private. Serve them only through the authenticated photo route. Do not use public bucket URLs: the photos show children.
11. Login throttling as in `login`.
12. The first admin can be created only by someone who can prove control of the hosting. Here that is a setup code written to a private file; in the port use a secret environment variable (for example `REGISTER_SETUP_KEY`) checked by a setup page, and reuse it for admin password reset.

### 5.6 Storage in the port

Use whatever the site already has. If it has none: a SQL database (Postgres, or SQLite-compatible such as D1 or Turso)
and private object storage for photos. Each photo is roughly 100 to 400 KB. Entries are small: a few thousand rows a year.

### 5.7 The school's teacher list

`lib/seed.php` holds the 9 science teachers and their classes for 2026-27, copied from the school's handwritten sheet.
`seed.list` shows the admin which of them have no ID yet; `seed.create` creates those IDs with temporary passwords and
returns them once. Two readings of the sheet were assumptions and the school has not confirmed them yet:
9-D and 9-E carried ditto marks and were read as the same teachers as 9-C; 10-D was read as the same teachers as 10-C.

## 6. What only the school's owner can do

- Create and pay for any database, storage or hosting account, and sign in to them.
- Put secrets (database URL, storage keys, setup key) into the deployment's environment settings.
- Change DNS for srspublicschool.in if a subdomain is used.

## 7. Checks to repeat after the port

Install or first-admin flow; wrong and right password; forced password change on a temporary password; teacher sees only
own classes; entry with one EXIF-GPS photo and one without; edit; delete (photo files gone); second teacher gets 404 on
the first teacher's entry and photo; teacher gets 403 on admin actions; POST without `X-CSRF` gets 403; non-JPEG upload
refused; reset password and deactivate both end the teacher's session; ninth wrong password answers 429.
