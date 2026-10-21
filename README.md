# Business HQ · Ramadan drop

One shared app for the uniform business: daily tasks, launch plan, team activity,
money, orders, pricing, the Ramadan drop specs, brand, Instagram, exhibitions and
suppliers. Both partners sign in with their email; anything one of you adds,
ticks or deletes shows up on the other's screen within about a second.

**What runs automatically (in the database)**
- **Daily task feed:** each of you gets 3 tasks a day (change it in Settings). Unfinished tasks carry over. Finish your batch and the next one loads straight away. Tasks are handed out in launch-plan order and never to both of you at once. Set "Who" on a task in the Launch plan to keep it for one person.
- **Activity log:** every task completed, expense, order, status change, exhibition and supplier is recorded with who did it and when. See it on Today and Team activity.
- **Project manager's notes:** on the Today page, flags phases that are behind or overdue, tasks stuck for days, budget over 80%, sets priced above your 14–20 KD range, exhibition deadlines, unpaid deliveries, and a partner who hasn't been active.
- **Prices and totals:** cost per set, suggested price, pack price, margins, budget, revenue, profit and break-even.

- **Frontend:** a plain website (`index.html`, `app.js`, `config.js`), hosted free on GitHub Pages.
- **Backend:** a free [Supabase](https://supabase.com) database. All the maths
  (cost per set, suggested price, pack price, margins, totals, break-even) is
  done by the database itself in `supabase/schema.sql`, so the numbers are the
  same no matter who adds an entry or from which phone.
- **Live:** when one of you adds something, the other's screen updates within a second.

You can open `index.html` right now to try it in **demo mode**. Demo entries are saved only in that browser.

---

## Setup (about 15 minutes, once)

### 1. Create the database
1. Go to supabase.com, sign up, and click **New project**. Pick a name (e.g. `ramadan-drop`), set a database password, and choose the region closest to Kuwait.
2. When it's ready, open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this folder, copy all of it, paste it in, and click **Run**.
4. Add both of you as members (the name is what the app shows on Team activity). In a new query, run (with your real emails):
   ```sql
   insert into members (email, name) values
     ('you@example.com', 'Sara'),
     ('partner@example.com', 'Partner');
   ```
   Only emails in this table can see or change anything.

### 2. Connect the website to the database
1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key (newer projects may call it the **publishable** key, starting `sb_publishable_`; either works).
3. Open `config.js` and paste them in place of `https://YOUR-PROJECT.supabase.co` and `YOUR-ANON-PUBLIC-KEY`.

The anon key is designed to be public. The database's security rules block anyone who isn't in `members`.

### 3. Put it on GitHub
1. Create a new repository on github.com (it can be **private** if you have GitHub Pro; on a free account, Pages needs a public repo, which is fine because your data lives in Supabase, not in the code).
2. Upload all files in this folder (keep the `supabase` folder too).
3. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
4. After a minute, GitHub shows your site address, e.g. `https://yourname.github.io/ramadan-drop/`.

### 4. Let sign-in links come back to your site
1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to your GitHub Pages address, and add the same address under **Redirect URLs**.
3. Under **Authentication → Providers**, make sure **Email** is enabled.

### 5. Sign in
Open your site, type your email, and tap the link Supabase emails you. Share the site address with your partner and they do the same.

---

## How the automatic pricing works

| You enter | The database works out |
|---|---|
| An expense for a set, with "sets it covers" (e.g. KD 120 fabric for 30 tops) | Cost per set for that category (KD 4) |
| An expense for "All sets (shared)" (e.g. embroidery digitizing) | Added to every set's cost |
| An overhead (booth, photoshoot, samples…) | Spread over the planned number of sets |
| Settings: multiplier, rounding, pack size and discount | Suggested price, pack price, margin, and whether each set is inside your 14–20 KD target |
| An order (set + quantity) | Price per set, order total, balance due, cost of goods, profit |

If you buy the same thing twice (e.g. a second fabric order), the cost per set
becomes the average of both. Typing a price under **Pricing → Your price**
overrides the suggestion; clear it to go back to automatic.

## Changing the sets or categories
In Supabase, open **Table Editor**:
- **styles**: rename a set, change its target price, or add a new one.
- **categories**: add a category; set `kind` to `per_set` (part of each set's cost) or `overhead`.

The website picks up the changes on the next refresh.

## Files
```
index.html            page layout and styles
app.js                screens, forms, live updates, project manager's notes
config.js             your Supabase URL and anon key
supabase/schema.sql   tables, security rules, daily task feed, activity log, calculations
```

## Editing tasks
Add tasks at the bottom of any phase in **Launch plan**, or in Supabase → Table Editor → tasks.
Phase dates live in the **phases** table; change them if your timeline moves.

## Backups
Supabase → **Table Editor** → pick a table → **Export to CSV** at any time.
