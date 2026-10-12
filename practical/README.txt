SRS PRACTICAL REGISTER - WEBSITE LAGANE KI GUIDE
=================================================

Yeh ek chhoti website hai jisme har teacher apni ID aur password se sign in karta hai.
Claude account ki zaroorat nahi. Data aapki apni hosting par rehta hai.


1. KYA CHAHIYE
--------------
- Koi bhi web hosting jisme PHP 7.4 ya naya ho (lagbhag har "shared hosting" / cPanel hosting).
  Alag database banane ki zaroorat nahi: register apni database file khud banata hai.
- SSL (https) chalu hona chahiye. Zyadatar hosting mein yeh free milta hai ("Free SSL" / "Let's Encrypt").
  https ke bina phone ki location nahi milegi aur password surakshit nahi jayega.


2. LAGANE KE STEPS (ek baar)
----------------------------
1) Hosting ke File Manager mein jao, "public_html" folder kholo.
2) Wahan ek naya folder banao, jaise:  practical
3) Is zip ki saari files us folder mein upload karke "Extract" karo.
   Andar yeh dikhna chahiye: index.php, api.php, install.php, photo.php, assets, lib, data
   Dhyan do: ".htaccess" naam ki files bhi upload honi chahiye (File Manager mein
   "Show hidden files" on kar lo). Yeh files data folder ko band rakhti hain.
4) Browser mein kholo:  https://aapki-website.com/practical/
   Pehli baar "Set up the register" page khulega.
5) Setup code: File Manager mein  practical/data/setup-key.php  file kholo.
   Usme quotes ke andar 12 akshar/ank ka code likha hai. Wahi setup page par daalo.
6) Apna naam, Admin ID aur password bharo. Password kam se kam 8 akshar ka, aur aisa jo
   aap kisi aur website par use nahi karte. "Create admin and finish setup" dabao.
7) Ab Admin ID se sign in karo.


3. TEACHER KI ID BANANA
-----------------------
School ki list wale 9 science teachers pehle se is register mein likhe hain (naam aur classes).
Setup tab mein upar ek box dikhega: "9 teachers on the school's list have no ID yet".
Uska button "Create these IDs" dabao: sabki ID aur TEMPORARY PASSWORD ek table mein dikhenge.
Yeh table sirf ek baar dikhti hai, isliye turant likh lo ya photo le lo, phir har teacher ko uska de do.

Kisi naye teacher ke liye:
1) Sign in karke "Setup" tab kholo.
2) "Teacher IDs" mein teacher ka naam aur ID likho (jaise: satendra) aur "Create ID" dabao.
3) Screen par ID aur ek TEMPORARY PASSWORD dikhega. Yeh sirf ek baar dikhta hai.
   Ise teacher ko de do (likh kar ya bol kar).
4) Teacher pehli baar sign in karega to use apna password khud banana padega.
   Uske baad password sirf teacher ko pata hota hai, aapko bhi nahi.
5) Usi card mein teacher ki classes jodo (Board, Class, Subject, Sections) aur "Save changes" dabao.
   Classes jodne ke baad teacher sirf unhi classes ki entry kar sakta hai.

Teacher password bhool jaye:  Setup > us teacher ka card > "New temporary password".
Teacher school chhod de:      Setup > "Deactivate ID". Uski purani entries register mein rehti hain.


4. TEACHER KYA KARTA HAI
------------------------
- Apni ID se sign in karta hai. Use sirf apni classes aur apni entries dikhti hain.
- "Log a practical" mein practical chun kar present students aur checked files bharta hai.
- Photo jodne par phone location poochta hai: "Allow" dabana hai. Photo par time, location,
  class aur teacher ka naam chhap jaata hai.
- Apni entry "My entries" se edit ya delete kar sakta hai.


5. BACKUP (zaroori)
-------------------
Saara data  practical/data  folder mein hai (entries, IDs aur photos).
Mahine mein ek baar File Manager se is poore "data" folder ko zip karke apne computer par
download kar lo. Hosting kharab ho jaye to isi folder ko wapas daal kar sab laut aata hai.


6. ADMIN PASSWORD BHOOL GAYE
----------------------------
Browser mein kholo:  https://aapki-website.com/practical/install.php
Setup code (data/setup-key.php se), Admin ID aur naya password daalo.
Setup code ke bina yeh page kuch nahi badalta, isliye use kisi ko mat batao.


SCHOOL KI WEBSITE (srspublicschool.in) MEIN JODNA HO TO
-------------------------------------------------------
Is folder mein HANDOVER.md naam ki file hai. Woh us vyakti ya tool ke liye hai jiske paas
school website ka code hai. Use yeh poora folder de do; usme likha hai kya-kya karna hai.


7. NAYA VERSION DAALNA
----------------------
Nayi files purani files ke upar upload kar do. "data" folder ko mat hatana aur mat badalna.


8. DIKKAT AAYE TO
-----------------
- Setup page par "pdo_sqlite is switched off" likha aaye:
  hosting panel ki PHP settings (Select PHP Version / PHP Extensions) mein "pdo_sqlite" on karo,
  ya hosting support se kaho.
- "data folder cannot be written": File Manager mein data folder ki permission 755 karo.
- Phone location nahi aa rahi: website https se khulni chahiye, aur phone ke browser mein
  is site ke liye Location "Allow" honi chahiye.
- Kisi ID par 8 baar galat password dalne se woh ID usi network se 15 minute ke liye
  band ho jaati hai. 15 minute baad dobara koshish karo.


9. SURAKSHA KI BAATEIN
----------------------
- "data" aur "lib" folder browser se nahi khulne chahiye. Apache / LiteSpeed hosting par
  saath di gayi .htaccess files yeh kaam karti hain. Jaanchne ke liye browser mein kholo:
      https://aapki-website.com/practical/data/
  "Forbidden" ya "403" aana chahiye. Agar folder ki list ya koi file dikhe, to hosting
  support se kaho ki is register ke /data aur /lib folder ko web se band kar dein.
- Admin password kisi ke saath share mat karo. Har teacher ki apni ID honi chahiye.
- Photos mein bachche hain: register ka link aur IDs sirf school staff ko do.
