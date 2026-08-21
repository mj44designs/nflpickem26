/* ============================================================
   Archive page logic
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

const SEASONS = [SEASON, PREVIOUS_SEASON];
let activeSeason = SEASON;
let seasonWeeksCache = {};

function seasonYears(s) {
  return `${s}\u2013${parseInt(s, 10) + 1}`;
}

async function getWeeks(season) {
  if (!seasonWeeksCache[season]) {
    seasonWeeksCache[season] = await fetchSeasonWeeks(season);
  }
  return seasonWeeksCache[season];
}

function renderSeasonTabs() {
  const container = $("#season-tabs");
  container.innerHTML = SEASONS.map(
    (s) => `<button data-season="${s}" class="${s === activeSeason ? "active" : ""}" type="button">${seasonYears(s)}</button>`
  ).join("");
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSeason = btn.dataset.season;
      renderSeasonTabs();
      loadSeason();
    });
  });
}

function renderWeekDetail(week) {
  const box = $("#week-detail");
  if (!week) {
    box.innerHTML = "";
    return;
  }

  const rows = (week.games || [])
    .map((g) => {
      const cells = PLAYERS.map((p) => {
        const pick = (g.picks && g.picks[p.id]) || "\u2014";
        let cls = "";
        if (g.winner && g.picks && g.picks[p.id]) {
          cls = g.picks[p.id] === g.winner ? "pick-select-correct" : "pick-select-wrong";
        }
        return `<td class="${cls}">${pick}</td>`;
      }).join("");
      return `
        <tr>
          <td class="game-matchup">${g.away}<span class="at">@</span>${g.home}</td>
          ${cells}
          <td>${g.winner || "\u2014"}</td>
        </tr>`;
    })
    .join("");

  box.innerHTML = `
    <div class="table-wrap" style="margin-top:16px;">
      <table>
        <thead>
          <tr><th>Game</th>${PLAYERS.map((p) => `<th>${p.name}</th>`).join("")}<th>Winner</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${PLAYERS.length + 2}">No games recorded.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderWeekList(weeks) {
  const container = $("#week-list");
  if (!weeks.length) {
    container.innerHTML = "";
    $("#week-detail").innerHTML = `
      <div class="empty-state">
        <h3>Nothing here yet</h3>
        <p>No weeks have been saved for the ${seasonYears(activeSeason)} season. Once weeks are exported from the
        Weekly Picks tool and committed to <code>data/${activeSeason}/</code>, they'll show up here.</p>
      </div>`;
    return;
  }

  container.innerHTML = weeks
    .map((w, i) => `<span class="week-pill ${i === 0 ? "active" : ""}" data-week="${w.week}">Week ${w.week}</span>`)
    .join("");

  container.querySelectorAll(".week-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      container.querySelectorAll(".week-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const w = weeks.find((wk) => wk.week === parseInt(pill.dataset.week, 10));
      renderWeekDetail(w);
    });
  });

  renderWeekDetail(weeks[0]);
}

async function loadSeason() {
  $("#season-standings-sub").textContent = `${seasonYears(activeSeason)} season`;
  $("#season-standings").innerHTML = `<p class="status-line">Loading\u2026</p>`;
  $("#week-list").innerHTML = "";
  $("#week-detail").innerHTML = "";

  const weeks = await getWeeks(activeSeason);
  const record = computeStandings(weeks);
  renderStandingsTable($("#season-standings"), record);
  renderWeekList(weeks);
}

document.addEventListener("DOMContentLoaded", () => {
  renderSeasonTabs();
  loadSeason();
});
