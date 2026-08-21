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

/* Given an array of week objects ({games:[{picks,winner}...]}), compute
   {playerId: {wins, losses}} across all games that have a recorded winner. */
function computeStandings(weeks) {
  const record = {};
  PLAYERS.forEach((p) => (record[p.id] = { wins: 0, losses: 0 }));

  weeks.forEach((week) => {
    (week.games || []).forEach((game) => {
      if (!game.winner) return; // game not decided yet, doesn't count
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
