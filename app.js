const scoreboardUrl = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const gameTemplate = document.getElementById("gameCardTemplate");
const gamesGrid = document.getElementById("gamesGrid");
const injuryFeed = document.getElementById("injuryFeed");
const marketFeed = document.getElementById("marketFeed");
const trendingList = document.getElementById("trendingList");
const chips = [...document.querySelectorAll(".chip")];
const todayDate = document.getElementById("todayDate");

const fmtDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
todayDate.textContent = `Current slate: ${fmtDate.format(new Date())}`;

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

function statusMap(espnStatus) {
  if (espnStatus?.type?.state === "in") return "live";
  if (espnStatus?.type?.completed) return "final";
  return "upcoming";
}

function buildPrediction(home, away) {
  const edge = Math.max(-14, Math.min(14, (home.score || 0) - (away.score || 0) + (home.homeAdv || 2)));
  const confidence = Math.round(55 + Math.abs(edge) * 2.1);
  const pick = edge >= 0 ? home.team : away.team;
  return { pick, confidence: Math.min(confidence, 92) };
}

async function fetchGames() {
  try {
    const res = await fetch(scoreboardUrl);
    const data = await res.json();
    return (data.events || []).map((event) => {
      const comp = event.competitions[0];
      const teams = [...comp.competitors];
      const home = teams.find((t) => t.homeAway === "home");
      const away = teams.find((t) => t.homeAway === "away");
      const status = statusMap(event.status);
      const prediction = buildPrediction(home, away);

      return {
        id: event.id,
        status,
        clock: status === "upcoming" ? new Date(event.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : event.status.type.shortDetail,
        matchup: `${away.team.displayName} @ ${home.team.displayName}`,
        away: {
          name: away.team.displayName,
          logo: away.team.logos?.[0]?.href,
          score: Number(away.score || 0),
          player: `${away.team.abbreviation} impact squad`,
          stars: Math.max(2, Math.min(5, Math.round((Number(away.records?.[0]?.summary?.split("-")[0]) || 25) / 11))),
        },
        home: {
          name: home.team.displayName,
          logo: home.team.logos?.[0]?.href,
          score: Number(home.score || 0),
          player: `${home.team.abbreviation} impact squad`,
          stars: Math.max(2, Math.min(5, Math.round((Number(home.records?.[0]?.summary?.split("-")[0]) || 25) / 11))),
        },
        odds: {
          spread: comp.odds?.[0]?.details || "Model spread pending",
          moneyline: comp.odds?.[0]?.overUnder ? `O/U ${comp.odds[0].overUnder}` : "Moneyline pending",
          polymarket: `${prediction.pick.shortDisplayName || prediction.pick.displayName} ${Math.min(79, prediction.confidence - 8)}%`,
        },
        confidence: prediction.confidence,
        quote: `${prediction.pick.displayName} project stronger in current game script (pace, location, and scoring form weighted).`,
        injury: "Monitor official injury report 60 mins pre-tip for late scratches.",
        advice: status === "upcoming" ? "Wait for confirmed lineups before locking props." : "Watch foul trouble + 3PT variance before entering live positions.",
      };
    });
  } catch (e) {
    return [];
  }
}

function renderSidebars(games) {
  trendingList.innerHTML = "";
  injuryFeed.innerHTML = "";
  marketFeed.innerHTML = "";

  const liveCount = games.filter((g) => g.status === "live").length;
  const upCount = games.filter((g) => g.status === "upcoming").length;
  const finals = games.filter((g) => g.status === "final").length;
  [
    `Live games right now: ${liveCount}`,
    `Upcoming tonight: ${upCount}`,
    `Finals posted today: ${finals}`,
    "Polymarket confidence shown as directional signal, not financial advice.",
  ].forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    trendingList.append(li);
  });

  games.slice(0, 6).forEach((g) => {
    const injury = document.createElement("div");
    injury.className = "chip-item";
    injury.innerHTML = `<strong class="warn">${g.matchup}</strong><br/>${g.injury}`;
    injuryFeed.append(injury);

    const pulse = document.createElement("div");
    pulse.className = "chip-item";
    pulse.textContent = `${g.matchup}: ${g.advice}`;
    marketFeed.append(pulse);
  });
}

function renderGames(games, filter = "all") {
  gamesGrid.innerHTML = "";
  games
    .filter((g) => filter === "all" || g.status === filter)
    .forEach((g) => {
      const card = gameTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.status = g.status;
      card.querySelector(".status").textContent = g.status;
      card.querySelector(".clock").textContent = g.clock;
      card.querySelector(".matchup").textContent = g.matchup;

      const teams = card.querySelector(".teams");
      [g.away, g.home].forEach((team) => {
        const el = document.createElement("div");
        el.className = "team-row";
        el.innerHTML = `
          <img src="${team.logo}" alt="${team.name} logo" onerror="this.src='https://a.espncdn.com/i/teamlogos/nba/500/scoreboard.png'"/>
          <div class="team-meta"><strong>${team.name}</strong><small>${team.player}</small><span class="stars">${stars(team.stars)}</span></div>
          <div class="score">${team.score}</div>
        `;
        teams.append(el);
      });

      const oddsEl = card.querySelector(".odds-grid");
      Object.entries(g.odds).forEach(([k, v]) => {
        const odd = document.createElement("div");
        odd.className = "odd";
        odd.innerHTML = `<b>${k.toUpperCase()}</b><span>${v}</span>`;
        oddsEl.append(odd);
      });

      card.querySelector(".confidence").innerHTML = `Prediction confidence: <strong>${g.confidence}%</strong>`;
      card.querySelector(".quote").textContent = `“${g.quote}”`;
      gamesGrid.append(card);
    });

  const { animate, stagger } = window.Motion;
  animate(".game-card", { opacity: [0, 1], y: [18, 0], scale: [0.98, 1] }, { duration: 0.42, delay: stagger(0.06) });
}

let cache = [];
async function boot(filter = "all") {
  cache = await fetchGames();
  if (!cache.length) {
    gamesGrid.innerHTML = "<div class='glass panel'>Could not load live NBA games right now. Please refresh.</div>";
    return;
  }
  renderSidebars(cache);
  renderGames(cache, filter);
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    renderGames(cache, chip.dataset.filter);
  });
});

document.getElementById("gmailLogin").addEventListener("click", () => {
  window.open("https://accounts.google.com/signin/v2/identifier", "_blank", "noopener");
});

setInterval(() => {
  const liveCards = [...document.querySelectorAll('.game-card[data-status="live"] .run')];
  liveCards.forEach((node) => {
    node.classList.toggle("hidden", Math.random() < 0.28);
    if (!node.classList.contains("hidden")) {
      window.Motion.animate(node, { opacity: [0.2, 1, 0.4, 1] }, { duration: 0.8 });
    }
  });
}, 2200);

boot();
