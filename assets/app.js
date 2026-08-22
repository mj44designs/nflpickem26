/* ============================================================
   Shared helpers used by picks.html, archive.html, index.html
   ============================================================ */

const DATA_ROOT = "data"; // relative to site root

/* ---------- Generic helpers ---------- */

function pct(wins, losses) {
  const total = wins + losses;
  if (total === 0) return "0.0%";
  return ((wins / total) * 100).toFixed(1) + "%";
}

function download(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (e) { reject(new Error("That file isn't valid JSON.")); }
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsText(file);
  });
}

/* Parse lines like "Patriots @ Seahawks" into {away, home} objects. */
function parseMatchupLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split("@").map((s) => s.trim());
      const away = parts[0] || "Away";
      const home = parts[1] || "Home";
      return { id: "g" + (i + 1), away, home, picks: {}, winner: null };
    });
}

/* ---------- Remote data (committed week files) ---------- */

async function fetchJSONQuiet(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null; // e.g. running from file:// or file not committed yet
  }
}

async function fetchSeasonIndex(season) {
  const idx = await fetchJSONQuiet(`${DATA_ROOT}/${season}/index.json`);
  return Array.isArray(idx) ? idx : [];
}

async function fetchSeasonWeeks(season) {
  const ids = await fetchSeasonIndex(season);
  const weeks = [];
  for (const id of ids) {
    const wk = await fetchJSONQuiet(`${DATA_ROOT}/${season}/${id}.json`);
    if (wk) weeks.push(wk);
  }
  // sort by week number
  weeks.sort((a, b) => (a.week || 0) - (b.week || 0));
  return weeks;
}

/* ---------- Standings math ---------- */

/* Given an array of week objects, compute {playerId: {wins, losses}}.
   Two week shapes are supported:
   - Per-game (2026+): { games: [{picks, winner}, ...] } — tallied from each
     decided game.
   - Legacy/aggregate (imported old seasons): { weeklyRecord: {playerId:{wins,losses}} }
     — used directly, since old exports didn't preserve a per-game winner. */
function computeStandings(weeks) {
  const record = {};
  PLAYERS.forEach((p) => (record[p.id] = { wins: 0, losses: 0 }));

  weeks.forEach((week) => {
    if (week.weeklyRecord) {
      PLAYERS.forEach((p) => {
        const wr = week.weeklyRecord[p.id];
        if (!wr) return;
        record[p.id].wins += wr.wins || 0;
        record[p.id].losses += wr.losses || 0;
      });
      return;
    }
    (week.games || []).forEach((game) => {
      if (!game.winner || game.winner === "TIE") return; // undecided or a push — doesn't count either way
      PLAYERS.forEach((p) => {
        const pick = game.picks && game.picks[p.id];
        if (!pick) return; // no pick made, doesn't count either way
        if (pick === game.winner) record[p.id].wins += 1;
        else record[p.id].losses += 1;
      });
    });
  });

  return record;
}

/* Renders a week's games table. Handles both per-game winners (2026+) and
   legacy weeks where only the aggregate weeklyRecord is known (no winner
   per game, so no correct/incorrect coloring — just picks on record). */
function renderGamesTable(games, weeklyRecord) {
  const rows = (games || [])
    .map((g) => {
      const isTie = g.winner === "TIE";
      const cells = PLAYERS.map((p) => {
        const pick = (g.picks && g.picks[p.id]) || "\u2014";
        let cls = "";
        if (g.winner && !isTie && g.picks && g.picks[p.id]) {
          cls = g.picks[p.id] === g.winner ? "pick-select-correct" : "pick-select-wrong";
        }
        return `<td class="${cls}">${pick}</td>`;
      }).join("");
      const label = g.home ? `${g.away}<span class="at">@</span>${g.home}` : g.away;
      const winnerText = isTie ? "Tie (push)" : (g.winner || "\u2014");
      return `<tr><td class="game-matchup">${label}</td>${cells}<td>${winnerText}</td></tr>`;
    })
    .join("");

  const table = `
    <div class="table-wrap" style="margin-top:16px;">
      <table>
        <thead>
          <tr><th>Game</th>${PLAYERS.map((p) => `<th>${p.name}</th>`).join("")}<th>Winner</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${PLAYERS.length + 2}">No games recorded.</td></tr>`}</tbody>
      </table>
    </div>`;

  if (!weeklyRecord) return table;

  const summary = PLAYERS
    .map((p) => {
      const wr = weeklyRecord[p.id] || { wins: 0, losses: null };
      const line = wr.losses === null ? `${wr.wins} correct` : `${wr.wins}-${wr.losses}`;
      return `<span style="margin-right:18px;"><strong>${p.name}</strong> ${line}</span>`;
    })
    .join("");

  return `<p class="status-line" style="color:var(--chalk-dim);">${summary}</p>` + table;
}

function renderScoreboard(container, record, opts = {}) {
  const entries = PLAYERS.map((p) => ({ ...p, ...record[p.id] }));
  const maxWins = Math.max(0, ...entries.map((e) => e.wins));
  const anyGames = entries.some((e) => e.wins + e.losses > 0);

  container.innerHTML = entries
    .map((e) => {
      const isLeader = anyGames && e.wins === maxWins && maxWins > 0;
      return `
        <div class="score-panel ${isLeader ? "is-leader" : ""}" style="--panel-color:${e.primary}">
          <p class="p-name">${e.name}</p>
          <p class="p-team">${e.team}</p>
          <div class="p-record">${e.wins}-${e.losses}</div>
          <div class="p-pct">${pct(e.wins, e.losses)} WIN PCT</div>
        </div>`;
    })
    .join("");

  if (!anyGames && opts.emptyNote) {
    container.insertAdjacentHTML(
      "afterend",
      `<p class="status-line">${opts.emptyNote}</p>`
    );
  }
}

function renderStandingsTable(container, record) {
  const entries = PLAYERS.map((p) => ({ ...p, ...record[p.id] }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  const rows = entries
    .map(
      (e, i) => `
      <tr>
        <td class="standings-rank">${i + 1}</td>
        <td>
          <div class="standings-name">${e.name}</div>
          <div class="standings-team">${e.team}</div>
        </td>
        <td>${e.wins}-${e.losses}</td>
        <td>${pct(e.wins, e.losses)}</td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <table>
      <thead>
        <tr><th>#</th><th>Player</th><th>Record</th><th>Win %</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
