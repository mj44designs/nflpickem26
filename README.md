# The Pick'em Line — 2026–27 NFL Season

A family pick'em site for Michael, Antonio, PFF, and SS. Static site,
no login, no backend — just HTML/CSS/JS and JSON files.

## Pages

- **index.html** — home page with the live All-Time scoreboard
- **picks.html** — the weekly picks tool (make picks, calculate results, export)
- **archive.html** — full history by season and week (2026 and 2025)

## How the data works

There's no database. Each week's matchups, picks, and results live in a
JSON file:

```
data/2026/week01.json
data/2026/week02.json
data/2026/index.json   <- list of which weeks exist, e.g. ["week01","week02"]
```

The site reads `index.json` to know which weeks to load, then fetches each
week file to build standings and the archive. That means **a week only
counts once its JSON file is committed to the repo** — that's what makes it
official and visible to both of you, on any device.

`data/2025/` is set up the same way for last season's archive — currently
empty (`index.json` is `[]`). Send me last year's results and I'll port
them into `week01.json`, `week02.json`, etc. so the Archive page shows
2025 too.

## Weekly workflow

1. Open **picks.html**.
2. Enter the week number, then either:
   - Click **Next Week Template** to start fresh, and type matchups into
     the box as `Away @ Home` (one per line), then **Update Pick Options**, or
   - Click **Load Weekly Matchups (JSON)** if you already have a matchups
     file for that week.
3. Each of you picks a winner for every game in your column.
4. Click **Save Picks** any time to keep a draft in your browser (handy
   mid-week, but it doesn't sync between devices — that's what export/commit
   is for).
5. After the games finish, set the **Actual Winner** for each game and
   click **Calculate Results** to see the weekly leaderboard.
6. Click **Export Picks & Results (JSON)**. This downloads `weekNN.json`.
7. Save that file into `data/2026/`, add `"weekNN"` to `data/2026/index.json`,
   then commit and push. The week is now permanent — it counts in All-Time
   Standings and shows up in the Archive.

## Hosting on GitHub Pages

1. Create a new GitHub repo (public or private) and push this whole folder
   to it.
2. In the repo, go to **Settings → Pages**, set **Source** to the `main`
   branch, root folder.
3. GitHub will give you a URL like `https://yourname.github.io/repo-name/`.
   That's your live site — bookmark it.
4. Every time you commit a new week's JSON file (step 7 above), the site
   updates automatically within a minute or two.

Note: opening `index.html` directly by double-clicking it (a `file://` URL)
won't load the JSON data in most browsers — that's a browser security
restriction, not a bug. Either host it on GitHub Pages, or run a quick
local server while testing:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000/`.

## Editing players or colors

Everything about the four players — names, team, and colors — lives in
one place: `assets/players.js`. Change it there and it updates the whole
site (scoreboard, tables, picks page).
