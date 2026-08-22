/* ============================================================
   Weekly Picks tool logic
   ============================================================ */

let currentWeek = {
  season: SEASON,
  week: 1,
  label: "Week 1",
  games: []
};

const $ = (sel) => document.querySelector(sel);

function pad(n) { return n.toString().padStart(2, "0"); }
function weekFileId(n) { return "week" + pad(n); }
function draftKey(season, week) { return `pickem-draft-${season}-${week}`; }

function setStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
}

/* ---------- Rendering ---------- */

function renderTableHead() {
  const head = $("#picks-table-head");
  head.innerHTML =
    "<th>Game</th>" +
    PLAYERS.map((p) => `<th>${p.name}</th>`).join("") +
    "<th>Actual Winner</th>";
}

function renderTableBody() {
  const body = $("#picks-table-body");
  if (!currentWeek.games.length) {
    body.innerHTML = `<tr><td colspan="${PLAYERS.length + 2}" style="color:var(--chalk-dim);">No matchups loaded yet.</td></tr>`;
    return;
  }

  body.innerHTML = currentWeek.games
    .map((g) => {
      const playerCells = PLAYERS.map((p) => {
        const val = (g.picks && g.picks[p.id]) || "";
        return `
          <td>
            <select data-game="${g.id}" data-player="${p.id}" class="pick-select">
              <option value="">&mdash;</option>
              <option value="${g.away}" ${val === g.away ? "selected" : ""}>${g.away}</option>
              <option value="${g.home}" ${val === g.home ? "selected" : ""}>${g.home}</option>
            </select>
          </td>`;
      }).join("");

      return `
        <tr>
          <td class="game-matchup">${g.away}<span class="at">@</span>${g.home}</td>
          ${playerCells}
          <td>
            <select data-game="${g.id}" class="winner-select">
              <option value="">&mdash;</option>
              <option value="${g.away}" ${g.winner === g.away ? "selected" : ""}>${g.away}</option>
              <option value="${g.home}" ${g.winner === g.home ? "selected" : ""}>${g.home}</option>
              <option value="TIE" ${g.winner === "TIE" ? "selected" : ""}>Tie</option>
            </select>
          </td>
        </tr>`;
    })
    .join("");
}

function renderAll() {
  $("#season-label").textContent = SEASON + "\u2013" + (parseInt(SEASON, 10) + 1);
  $("#season-label-2").textContent = SEASON;
  $("#matchups-title").textContent = currentWeek.label || `Week ${currentWeek.week}`;
  $("#results-week-num").textContent = currentWeek.week;
  $("#week-number").value = currentWeek.week;
  renderTableHead();
  renderTableBody();
}

/* ---------- Form <-> state ---------- */

function collectFormState() {
  const gamesById = {};
  currentWeek.games.forEach((g) => (gamesById[g.id] = g));

  document.querySelectorAll(".pick-select").forEach((sel) => {
    const g = gamesById[sel.dataset.game];
    if (!g) return;
    g.picks = g.picks || {};
    g.picks[sel.dataset.player] = sel.value || null;
  });

  document.querySelectorAll(".winner-select").forEach((sel) => {
    const g = gamesById[sel.dataset.game];
    if (!g) return;
    g.winner = sel.value || null;
  });

  currentWeek.week = parseInt($("#week-number").value, 10) || currentWeek.week;
  currentWeek.label = `Week ${currentWeek.week}`;
}

/* ---------- Actions ---------- */

function updatePickOptions() {
  const text = $("#matchup-text").value.trim();
  if (text) {
    const parsed = parseMatchupLines(text);
    // Preserve existing picks/winners if the matchup list is unchanged in length & teams
    parsed.forEach((g, i) => {
      const existing = currentWeek.games[i];
      if (existing && existing.away === g.away && existing.home === g.home) {
        g.picks = existing.picks;
        g.winner = existing.winner;
      }
    });
    currentWeek.games = parsed;
  }
  renderAll();
  setStatus($("#week-status"), `Pick options updated for ${currentWeek.games.length} game(s).`);
}

function matchupTextFromGames() {
  return currentWeek.games.map((g) => `${g.away} @ ${g.home}`).join("\n");
}

function calculateResults() {
  collectFormState();

  const tally = {};
  PLAYERS.forEach((p) => (tally[p.id] = { correct: 0, total: 0 }));

  let anyWinner = false;
  currentWeek.games.forEach((g) => {
    if (!g.winner) return;
    anyWinner = true;
    if (g.winner === "TIE") return; // push — doesn't count for anyone
    PLAYERS.forEach((p) => {
      const pick = g.picks && g.picks[p.id];
      if (!pick) return;
      tally[p.id].total += 1;
      if (pick === g.winner) tally[p.id].correct += 1;
    });
  });

  // Re-render with correct/wrong coloring
  document.querySelectorAll(".pick-select").forEach((sel) => {
    const g = currentWeek.games.find((gm) => gm.id === sel.dataset.game);
    sel.classList.remove("pick-select-correct", "pick-select-wrong");
    if (g && g.winner && g.winner !== "TIE" && sel.value) {
      sel.classList.add(sel.value === g.winner ? "pick-select-correct" : "pick-select-wrong");
    }
  });

  const resultsBox = $("#weekly-results");
  if (!anyWinner) {
    resultsBox.innerHTML = `<p style="color:var(--chalk-dim);">No winners selected yet.</p>`;
  } else {
    const rows = PLAYERS
      .map((p) => ({ ...p, ...tally[p.id] }))
      .sort((a, b) => b.correct - a.correct)
      .map(
        (p) => `
        <tr>
          <td>
            <div class="standings-name">${p.name}</div>
            <div class="standings-team">${p.team}</div>
          </td>
          <td>${p.correct}-${p.total - p.correct}</td>
          <td>${pct(p.correct, p.total - p.correct)}</td>
        </tr>`
      )
      .join("");
    resultsBox.innerHTML = `
      <table>
        <thead><tr><th>Player</th><th>Record</th><th>Win %</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  refreshAllTime();
}

function saveDraft() {
  collectFormState();
  localStorage.setItem(draftKey(currentWeek.season, currentWeek.week), JSON.stringify(currentWeek));
  setStatus($("#week-status"), `Draft saved locally for Week ${currentWeek.week} (this browser only).`);
}

function loadDraft() {
  const raw = localStorage.getItem(draftKey(SEASON, parseInt($("#week-number").value, 10) || currentWeek.week));
  if (!raw) {
    setStatus($("#week-status"), "No saved draft found for that week in this browser.", true);
    return;
  }
  currentWeek = JSON.parse(raw);
  $("#matchup-text").value = matchupTextFromGames();
  renderAll();
  setStatus($("#week-status"), `Loaded saved draft for Week ${currentWeek.week}.`);
}

async function loadCommittedWeek() {
  const n = parseInt($("#week-number").value, 10) || 1;
  const data = await fetchJSONQuiet(`${DATA_ROOT}/${SEASON}/${weekFileId(n)}.json`);
  if (!data) {
    setStatus($("#week-status"), `No committed file found for Week ${n} yet (data/${SEASON}/${weekFileId(n)}.json). Try Next Week Template or load a matchups JSON.`, true);
    return;
  }
  currentWeek = data;
  $("#matchup-text").value = matchupTextFromGames();
  renderAll();
  setStatus($("#week-status"), `Loaded committed Week ${n} from the site.`);
}

async function nextWeekTemplate() {
  const ids = await fetchSeasonIndex(SEASON);
  let maxWeek = 0;
  ids.forEach((id) => {
    const n = parseInt(id.replace(/\D/g, ""), 10);
    if (!isNaN(n)) maxWeek = Math.max(maxWeek, n);
  });
  const next = Math.max(maxWeek, currentWeek.week) + 1;
  currentWeek = { season: SEASON, week: next, label: `Week ${next}`, games: [] };
  $("#matchup-text").value = "";
  renderAll();
  $("#weekly-results").innerHTML = `<p style="color:var(--chalk-dim);">No winners selected yet.</p>`;
  setStatus($("#week-status"), `Started a fresh template for Week ${next}. Paste in matchups below.`);
}

async function loadWeeklyMatchupsJSON(file) {
  try {
    const data = await readJSONFile(file);
    const games = Array.isArray(data) ? data : data.games;
    if (!Array.isArray(games)) throw new Error("Expected a games array.");
    currentWeek.games = games.map((g, i) => ({
      id: g.id || "g" + (i + 1),
      away: g.away,
      home: g.home,
      picks: g.picks || {},
      winner: g.winner || null
    }));
    if (data.week) currentWeek.week = data.week;
    if (data.label) currentWeek.label = data.label;
    $("#matchup-text").value = matchupTextFromGames();
    renderAll();
    setStatus($("#week-status"), `Loaded ${currentWeek.games.length} matchup(s) from file.`);
  } catch (e) {
    setStatus($("#week-status"), e.message, true);
  }
}

async function importWeek(file) {
  try {
    const data = await readJSONFile(file);
    currentWeek = {
      season: data.season || SEASON,
      week: data.week || currentWeek.week,
      label: data.label || `Week ${data.week || currentWeek.week}`,
      games: data.games || []
    };
    $("#matchup-text").value = matchupTextFromGames();
    renderAll();
    calculateResults();
    setStatus($("#week-status"), `Imported Week ${currentWeek.week} picks & results.`);
  } catch (e) {
    setStatus($("#week-status"), e.message, true);
  }
}

function exportWeek() {
  collectFormState();
  const filename = `${weekFileId(currentWeek.week)}.json`;
  download(filename, currentWeek);
  setStatus(
    $("#export-status"),
    `Downloaded ${filename}. Save it into data/${SEASON}/ and add "${weekFileId(currentWeek.week)}" to data/${SEASON}/index.json, then commit & push to make it official.`
  );
}

async function refreshAllTime() {
  collectFormState();
  const committed = await fetchSeasonWeeks(SEASON);
  // Overlay the in-progress form week on top of the committed data (by week number)
  const merged = committed.filter((w) => w.week !== currentWeek.week);
  merged.push(currentWeek);

  const record = computeStandings(merged);
  renderStandingsTable($("#alltime-standings"), record);
}

async function renderWeekPills() {
  const ids = await fetchSeasonIndex(SEASON);
  const container = $("#week-pills");
  if (!ids.length) {
    container.innerHTML = `<span class="status-line">No committed weeks yet &mdash; this season is wide open.</span>`;
    return;
  }
  container.innerHTML = ids
    .map((id) => {
      const n = parseInt(id.replace(/\D/g, ""), 10);
      return `<span class="week-pill" data-week="${n}">Week ${n}</span>`;
    })
    .join("");
  container.querySelectorAll(".week-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      $("#week-number").value = pill.dataset.week;
      loadCommittedWeek();
      container.querySelectorAll(".week-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });
}

/* ---------- Wire up ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  renderAll();
  renderWeekPills();
  refreshAllTime();

  $("#btn-update-options").addEventListener("click", updatePickOptions);
  $("#btn-calculate").addEventListener("click", calculateResults);
  $("#btn-save").addEventListener("click", saveDraft);
  $("#btn-load").addEventListener("click", loadDraft);
  $("#btn-export").addEventListener("click", exportWeek);
  $("#btn-load-committed").addEventListener("click", loadCommittedWeek);
  $("#btn-next-week").addEventListener("click", nextWeekTemplate);
  $("#btn-refresh-alltime").addEventListener("click", refreshAllTime);

  $("#file-load-matchups").addEventListener("change", (e) => {
    if (e.target.files[0]) loadWeeklyMatchupsJSON(e.target.files[0]);
    e.target.value = "";
  });
  $("#file-import-week").addEventListener("change", (e) => {
    if (e.target.files[0]) importWeek(e.target.files[0]);
    e.target.value = "";
  });
});
