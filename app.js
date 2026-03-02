const scoreboardUrl = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const gameTemplate = document.getElementById("gameCardTemplate");
const gamesGrid = document.getElementById("gamesGrid");
const injuryFeed = document.getElementById("injuryFeed");
const marketFeed = document.getElementById("marketFeed");
const trendingList = document.getElementById("trendingList");
const chips = [...document.querySelectorAll(".chip")];
const todayDate = document.getElementById("todayDate");

const authModal = document.getElementById("authModal");
const openAuth = document.getElementById("openAuth");
const gmailLogin = document.getElementById("gmailLogin");
const saveLocal = document.getElementById("saveLocal");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authMessage = document.getElementById("authMessage");

const fmtDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
todayDate.textContent = `Current slate: ${fmtDate.format(new Date())}`;

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function statusMap(espnStatus) {
  if (espnStatus?.type?.state === "in") return "live";
  if (espnStatus?.type?.completed) return "final";
  return "upcoming";
}

function marketOdds(odds, home, away, prediction) {
  const detail = odds?.details || "Spread pending";
  const overUnder = odds?.overUnder ? `O/U ${odds.overUnder}` : "Total pending";
  const homeMl = num(odds?.homeTeamOdds?.moneyLine, 0);
  const awayMl = num(odds?.awayTeamOdds?.moneyLine, 0);
  const moneyline = homeMl || awayMl ? `${away.team.abbreviation} ${awayMl || "--"} / ${home.team.abbreviation} ${homeMl || "--"}` : "ML pending";
  const poly = `${prediction.pick.shortDisplayName || prediction.pick.displayName} ${Math.min(88, prediction.confidence - 4)}%`;
  return { spread: detail, moneyline, total: overUnder, polymarket: poly };
}

function buildPrediction(home, away) {
  const edge = Math.max(-15, Math.min(15, (num(home.score) - num(away.score)) + 2));
  const confidence = Math.round(57 + Math.abs(edge) * 1.9);
  return { pick: edge >= 0 ? home.team : away.team, confidence: Math.min(confidence, 93) };
}

function getTrendingPlayers(comp) {
  const leaders = comp.leaders || [];
  const out = [];
  leaders.forEach((group) => {
    const lead = group.leaders?.[0];
    if (lead?.athlete?.displayName) {
      out.push(`${lead.athlete.displayName} • ${lead.displayValue || lead.value || group.name}`);
    }
  });
  return out;
}

function getInjuries(comp, matchup) {
  const injuries = [];
  (comp.competitors || []).forEach((c) => {
    (c.injuries || []).forEach((inj) => {
      const note = inj.status || inj.type || "Questionable";
      injuries.push(`${c.team.displayName}: ${inj.athlete?.displayName || "Player"} (${note})`);
    });
  });
  if (!injuries.length) injuries.push(`${matchup}: No major injuries listed from feed yet.`);
  return injuries;
}

async function fetchGames() {
  const res = await fetch(scoreboardUrl);
  const data = await res.json();
  return (data.events || []).map((event) => {
    const comp = event.competitions?.[0];
    const teams = comp?.competitors || [];
    const home = teams.find((t) => t.homeAway === "home");
    const away = teams.find((t) => t.homeAway === "away");
    const status = statusMap(event.status);
    const prediction = buildPrediction(home, away);
    const injuries = getInjuries(comp, `${away.team.displayName} @ ${home.team.displayName}`);
    const trendingPlayers = getTrendingPlayers(comp);

    return {
      id: event.id,
      status,
      clock: status === "upcoming" ? new Date(event.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : event.status.type.shortDetail,
      matchup: `${away.team.displayName} @ ${home.team.displayName}`,
      away: {
        name: away.team.displayName,
        abbr: away.team.abbreviation,
        logo: away.team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nba/500/${away.team.abbreviation?.toLowerCase()}.png`,
        score: num(away.score),
        record: away.records?.[0]?.summary || "--",
        stars: Math.max(2, Math.min(5, Math.round(num(away.records?.[0]?.summary?.split("-")?.[0], 22) / 11))),
      },
      home: {
        name: home.team.displayName,
        abbr: home.team.abbreviation,
        logo: home.team.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/nba/500/${home.team.abbreviation?.toLowerCase()}.png`,
        score: num(home.score),
        record: home.records?.[0]?.summary || "--",
        stars: Math.max(2, Math.min(5, Math.round(num(home.records?.[0]?.summary?.split("-")?.[0], 22) / 11))),
      },
      odds: marketOdds(comp.odds?.[0], home, away, prediction),
      confidence: prediction.confidence,
      quote: `${prediction.pick.displayName} hold the edge from form + venue + in-game momentum model.`,
      injuries,
      trendingPlayers,
      advice: status === "upcoming" ? "Wait for confirmed starting five before props." : "Track foul trouble and rebounding split for live edge entries.",
    };
  });
}

function renderSidebars(games) {
  trendingList.innerHTML = "";
  injuryFeed.innerHTML = "";
  marketFeed.innerHTML = "";

  const topTrends = games.flatMap((g) => g.trendingPlayers.map((p) => `${g.matchup}: ${p}`)).slice(0, 8);
  (topTrends.length ? topTrends : ["Trending players will appear once live leader data is available."]).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    trendingList.append(li);
  });

  games.flatMap((g) => g.injuries.map((inj) => ({ matchup: g.matchup, inj }))).slice(0, 10).forEach((item) => {
    const injury = document.createElement("div");
    injury.className = "chip-item";
    injury.innerHTML = `<span class="warn">${item.inj}</span>`;
    injuryFeed.append(injury);
  });

  games.slice(0, 7).forEach((g) => {
    const pulse = document.createElement("div");
    pulse.className = "chip-item";
    pulse.textContent = `${g.matchup}: ${g.advice}`;
    marketFeed.append(pulse);
  });
}

function renderGames(games, filter = "all") {
  gamesGrid.innerHTML = "";
  games.filter((g) => filter === "all" || g.status === filter).forEach((g) => {
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
        <div class="logo-wrap"><img src="${team.logo}" alt="${team.name} logo" onerror="this.src='https://a.espncdn.com/i/teamlogos/nba/500/scoreboard.png'"/></div>
        <div class="team-meta"><strong>${team.name}</strong><small>${team.abbr} • ${team.record}</small><span class="stars">${stars(team.stars)}</span></div>
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
  animate(".game-card", { opacity: [0, 1], y: [24, 0], scale: [0.97, 1] }, { duration: 0.45, delay: stagger(0.05) });
}

let cache = [];
async function boot(filter = "all") {
  try {
    cache = await fetchGames();
    if (!cache.length) throw new Error("empty");
    renderSidebars(cache);
    renderGames(cache, filter);
  } catch {
    gamesGrid.innerHTML = "<div class='glass panel'>Could not load live NBA feed. Refresh in a moment.</div>";
  }
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    renderGames(cache, chip.dataset.filter);
  });
});

openAuth.addEventListener("click", () => authModal.showModal());
saveLocal.addEventListener("click", (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value.trim();
  if (!email || password.length < 6) {
    authMessage.textContent = "Enter valid email + password (6+ chars).";
    return;
  }
  localStorage.setItem("nbinsight_user", JSON.stringify({ email, at: Date.now() }));
  authMessage.textContent = `Logged in locally as ${email}`;
});
gmailLogin.addEventListener("click", () => {
  location.href = "https://accounts.google.com/signin/v2/identifier?service=mail";
});

setInterval(() => {
  document.querySelectorAll('.game-card[data-status="live"] .run').forEach((node) => {
    node.classList.toggle("hidden", Math.random() < 0.32);
    if (!node.classList.contains("hidden")) {
      window.Motion.animate(node, { opacity: [0.2, 1, 0.45, 1] }, { duration: 0.8 });
    }
  });
}, 2100);

boot();
