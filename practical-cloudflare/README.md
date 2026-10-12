# SRS Practical Register — Cloudflare version

Teacher login (ID + password), practical entries, photos and syllabus coverage.
Runs on Cloudflare only: one Worker, **D1** (database) and **R2** (private photo storage).
It is separate from the school website. The front end is the same as the PHP version; only the server was rewritten (`src/worker.js`).

Tested locally with `wrangler dev`: setup, login, forced password change, class-wise access, photo upload/serve/delete,
other teacher gets 404, admin-only actions 403, missing CSRF 403, non-JPEG refused, password reset and deactivate
end sessions, 9th wrong password gives 429. Not yet run on real Cloudflare.

## Deploy (Hinglish, ek baar)

Computer par Node.js 18+ chahiye. Is folder mein terminal kholo.

1. `npm install`
2. `npx wrangler login`  (browser khulega, Cloudflare account se Allow karo)
3. Database banao: `npx wrangler d1 create srs-practical-register`
   Jo `database_id` dikhe use `wrangler.jsonc` mein `PUT-YOUR-D1-DATABASE-ID-HERE` ki jagah daalo.
4. Tables banao: `npx wrangler d1 execute srs-practical-register --remote --file=schema.sql`
5. Photo storage: `npx wrangler r2 bucket create srs-practical-photos`
   (R2 ek baar dashboard mein enable karna padta hai; free tier kaafi hai, card maang sakta hai.)
6. Setup code (kam se kam 12 akshar, khud socho aur likh lo): `npx wrangler secret put REGISTER_SETUP_KEY`
7. `npx wrangler deploy`  → `https://srs-practical-register.<naam>.workers.dev` milega.
8. Us URL ke aage `/setup` kholo. Setup code, apna naam, Admin ID aur password daalo.
9. Admin ID se sign in karo > Setup tab > "Create these IDs": 9 teachers ki ID aur temporary password ek baar dikhte hain, note kar lo.

Apna domain (jaise `practical.srspublicschool.in`): Cloudflare dashboard > Workers & Pages > srs-practical-register >
Settings > Domains & Routes > Add > Custom domain. (Domain Cloudflare DNS mein hona chahiye.)

## Zaroori baatein

- **Free plan par CPU limit**: password check mein 100,000-round PBKDF2 chalta hai. Agar login ya "Create these IDs" par
  "server problem" aaye, to Workers Paid plan ($5/month) lo.
- Admin password bhool jao to `/setup` dobara kholo, wahi setup code do: admin ka password reset ho jata hai.
- Photos private hain: sirf login ke baad owner teacher ya admin ko dikhti hain. R2 bucket ko public mat karo.
- Backup: `npx wrangler d1 export srs-practical-register --remote --output=backup.sql` mahine mein ek baar.
- Local test: `.dev.vars` mein `REGISTER_SETUP_KEY=...` likho, `npx wrangler d1 execute srs-practical-register --local --file=schema.sql`, phir `npm run dev`.

## Farak PHP version se
Password PBKDF2-SHA256 se store hota hai (bcrypt Workers mein nahi hota). Session D1 mein rehta hai (cookie mein sirf random token,
DB mein uska hash). Baaki rules (CSRF, 8 galat try par 15 min lock, sess_ver, JPEG byte-check, 4 MB / 5000 px) same hain.
