/* ============================================================
   Bulk import old-format week export files (from the original
   single-page tool) into the site's archive data format.

   Old export shape (per week):
   {
     week: 3,
     picks: { "Michael": { "Jets @ Patriots": "Patriots", ... }, "Antonio": {...}, "PFF": {...}, "SS": {...} },
     results: { "Michael": 9, "Antonio": 7, "PFF": 11, "SS": 6 },   // wins only
     allTimeStandings: { "Michael": {wins, losses, winPct}, ... }  // cumulative through this week
   }

   The old tool never saved the actual per-game winner, only aggregate
   win counts and a running cumulative snapshot. So we reconstruct each
   week's win/loss (not just wins) by diffing consecutive cumulative
   snapshots, sorted by week number. Final standings come straight from
   the last week's snapshot.
   ============================================================ */

const $$ = (sel) => document.querySelector(sel);

let importedWeeks = []; // normalized, ready to preview/download

function labelToIdMap() {
  const map = {};
  PLAYERS.forEach((p) => (map[p.name] = p.id));
  return map;
}

function isLegacyFormat(raw) {
  return raw && typeof raw === "object" && raw.picks && !Array.isArray(raw.games);
}

function isNewFormat(raw) {
  return raw && typeof raw === "object" && Array.isArray(raw.games);
}

function convertLegacyWeek(raw, season) {
  const labelToId = labelToIdMap();
  const gamesMap = {};

  Object.keys(raw.picks || {}).forEach((label) => {
    const id = labelToId[label];
    if (!id) return;
    const gamesForPlayer = raw.picks[label] || {};
    Object.keys(gamesForPlayer).forEach((gameName) => {
      if (!gamesMap[gameName]) {
        let away = gameName, home = "";
        if (gameName.includes("@")) {
          const parts = gameName.split("@").map((s) => s.trim());
          away = parts[0]; home = parts[1];
        }
        gamesMap[gameName] = { id: gameName, away, home, picks: {}, winner: null };
      }
      gamesMap[gameName].picks[id] = gamesForPlayer[gameName];
    });
  });

  const cumulative = {};
  PLAYERS.forEach((p) => (cumulative[p.id] = { wins: 0, losses: 0 }));
  let hasCumulative = false;
  if (raw.allTimeStandings) {
    hasCumulative = true;
    Object.keys(raw.allTimeStandings).forEach((label) => {
      const id = labelToId[label];
      if (!id) return;
      cumulative[id] = {
        wins: Number(raw.allTimeStandings[label].wins) || 0,
        losses: Number(raw.allTimeStandings[label].losses) || 0
      };
    });
  }

  const weeklyWinsOnly = {};
  PLAYERS.forEach((p) => (weeklyWinsOnly[p.id] = 0));
  if (raw.results) {
    Object.keys(raw.results).forEach((label) => {
      const id = labelToId[label];
      if (id) weeklyWinsOnly[id] = Number(raw.results[label]) || 0;
    });
  }

  return {
    season,
    week: raw.week,
    label: `Week ${raw.week}`,
    games: Object.values(gamesMap),
    _cumulative: hasCumulative ? cumulative : null,
    _weeklyWinsOnly: weeklyWinsOnly
  };
}

/* Fills in weeklyRecord for every week by diffing cumulative snapshots
   (falls back to wins-only, unknown losses, if no snapshot was present). */
function finalizeWeeklyRecords(weeks) {
  weeks.sort((a, b) => (a.week || 0) - (b.week || 0));
  let prevCumulative = {};
  PLAYERS.forEach((p) => (prevCumulative[p.id] = { wins: 0, losses: 0 }));

  weeks.forEach((w) => {
    const weeklyRecord = {};
    PLAYERS.forEach((p) => {
      if (w._cumulative) {
        const cur = w._cumulative[p.id];
        const prev = prevCumulative[p.id];
        weeklyRecord[p.id] = {
          wins: Math.max(0, cur.wins - prev.wins),
          losses: Math.max(0, cur.losses - prev.losses)
        };
      } else {
        weeklyRecord[p.id] = { wins: w._weeklyWinsOnly[p.id] || 0, losses: null };
      }
    });
    w.weeklyRecord = weeklyRecord;
    if (w._cumulative) prevCumulative = w._cumulative;
    delete w._cumulative;
    delete w._weeklyWinsOnly;
  });

  return weeks;
}

async function handleFiles(fileList) {
  const status = $$("#import-status");
  status.textContent = "Reading files\u2026";
  status.classList.remove("is-error");

  const season = $$("#import-season").value.trim() || PREVIOUS_SEASON;
  const converted = [];
  const errors = [];

  for (const file of Array.from(fileList)) {
    try {
      const raw = await readJSONFile(file);
      if (isNewFormat(raw)) {
        converted.push({ ...raw, season });
      } else if (isLegacyFormat(raw)) {
        converted.push(convertLegacyWeek(raw, season));
      } else {
        errors.push(`${file.name}: doesn't look like a week export (no "games" or "picks" found).`);
      }
    } catch (e) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }

  if (!converted.length) {
    status.textContent = errors.join(" ") || "No valid files found.";
    status.classList.add("is-error");
    return;
  }

  importedWeeks = finalizeWeeklyRecords(converted);
  status.textContent =
    `Converted ${importedWeeks.length} week(s) for the ${season} season.` +
    (errors.length ? ` (${errors.length} file(s) skipped: ${errors.join(" ")})` : "");

  renderImportPreview();
  $$("#import-download-row").style.display = "flex";
}

function renderImportPreview() {
  const record = computeStandings(importedWeeks);
  renderStandingsTable($$("#import-standings"), record);

  const pillBox = $$("#import-week-pills");
  pillBox.innerHTML = importedWeeks
    .map((w, i) => `<span class="week-pill ${i === 0 ? "active" : ""}" data-idx="${i}">Week ${w.week}</span>`)
    .join("");
  pillBox.querySelectorAll(".week-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      pillBox.querySelectorAll(".week-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      $$("#import-week-detail").innerHTML = renderGamesTable(
        importedWeeks[pill.dataset.idx].games,
        importedWeeks[pill.dataset.idx].weeklyRecord
      );
    });
  });
  if (importedWeeks.length) {
    $$("#import-week-detail").innerHTML = renderGamesTable(importedWeeks[0].games, importedWeeks[0].weeklyRecord);
  }
}

function pad(n) { return n.toString().padStart(2, "0"); }

function downloadBundle() {
  if (!importedWeeks.length) return;
  const season = importedWeeks[0].season;
  const ids = importedWeeks.map((w) => "week" + pad(w.week));

  importedWeeks.forEach((w, i) => {
    setTimeout(() => download(`week${pad(w.week)}.json`, w), i * 300);
  });
  setTimeout(() => download("index.json", ids), importedWeeks.length * 300);

  $$("#import-status").textContent =
    `Downloading ${importedWeeks.length} week file(s) plus index.json. ` +
    `Move them into data/${season}/ in your project, then commit & push.`;
}

document.addEventListener("DOMContentLoaded", () => {
  $$("#import-season").value = PREVIOUS_SEASON;

  $$("#import-files").addEventListener("change", (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
  });
  $$("#btn-download-bundle").addEventListener("click", downloadBundle);
});
