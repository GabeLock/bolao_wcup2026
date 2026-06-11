const BR_TZ = "America/Sao_Paulo";
const CONFIG_KEY = "bolao2026.config";
const DEMO_USER_KEY = "bolao2026.demoUser";
const DEMO_PROFILES_KEY = "bolao2026.profiles";
const DEMO_PREDICTIONS_KEY = "bolao2026.predictions";
const DEMO_RESULTS_KEY = "bolao2026.results";
const RESULT_OFFICIAL_DELAY_HOURS = 3;
const ADMIN_LOGIN = "admin";
const ADMIN_EMAIL = "admin@bolao.local";
const TEAM_FLAGS = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  "Bosnia and Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  "Cape Verde": "🇨🇻",
  Colombia: "🇨🇴",
  Croatia: "🇭🇷",
  Curacao: "🇨🇼",
  "Czech Republic": "🇨🇿",
  "DR Congo": "🇨🇩",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Haiti: "🇭🇹",
  Iran: "🇮🇷",
  Iraq: "🇮🇶",
  "Ivory Coast": "🇨🇮",
  Japan: "🇯🇵",
  Jordan: "🇯🇴",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿",
  Norway: "🇳🇴",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Tunisia: "🇹🇳",
  Turkey: "🇹🇷",
  "United States": "🇺🇸",
  Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿"
};

const state = {
  supabase: null,
  user: null,
  profile: null,
  matches: [],
  predictions: [],
  results: [],
  profiles: [],
  view: "palpites",
  config: loadConfig()
};

const el = {
  authPanel: document.querySelector("#authPanel"),
  appShell: document.querySelector("#appShell"),
  modeLabel: document.querySelector("#modeLabel"),
  modeDescription: document.querySelector("#modeDescription"),
  clockValue: document.querySelector("#clockValue"),
  logoutButton: document.querySelector("#logoutButton"),
  refreshButton: document.querySelector("#refreshButton"),
  loginForm: document.querySelector("#loginForm"),
  signupForm: document.querySelector("#signupForm"),
  stageFilter: document.querySelector("#stageFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  matchFilters: document.querySelector("#matchFilters"),
  contentArea: document.querySelector("#contentArea"),
  viewTitle: document.querySelector("#viewTitle"),
  userGreeting: document.querySelector("#userGreeting"),
  toast: document.querySelector("#toast")
};

init();

async function init() {
  hydrateConfigForm();
  setupSupabase();
  bindEvents();
  startClock();
  await restoreSession();
  await refreshData();
}

function bindEvents() {
  el.loginForm.addEventListener("submit", handleLogin);
  el.signupForm.addEventListener("submit", handleSignup);
  el.logoutButton.addEventListener("click", handleLogout);
  el.refreshButton.addEventListener("click", refreshData);
  el.stageFilter.addEventListener("change", render);
  el.statusFilter.addEventListener("change", render);
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function setupSupabase() {
  const sharedConfig = window.BOLAO_CONFIG || {};
  const url = state.config.url || sharedConfig.supabaseUrl;
  const anonKey = state.config.anonKey || sharedConfig.supabaseAnonKey;
  const isConfigured = Boolean(url && anonKey && window.supabase);
  state.supabase = isConfigured ? window.supabase.createClient(url, anonKey) : null;
  el.modeLabel.textContent = isConfigured ? "Supabase ativo" : "Modo local";
  el.modeDescription.textContent = isConfigured
    ? "Login, palpites e ranking compartilhados pelo backend gratuito."
    : "Dados salvos apenas neste navegador. Configure o Supabase no Admin para todos enxergarem o mesmo ranking.";
}

async function restoreSession() {
  if (!state.supabase) {
    const demoUser = JSON.parse(localStorage.getItem(DEMO_USER_KEY) || "null");
    if (demoUser) {
      state.user = demoUser;
      state.profile = { username: demoUser.username, is_admin: true };
    }
    updateAuthUi();
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.user = data.session?.user || null;
  if (state.user) await loadProfile();
  updateAuthUi();
}

async function handleLogin(event) {
  event.preventDefault();
  const login = document.querySelector("#loginEmail").value.trim();
  const email = resolveLoginEmail(login);
  const password = document.querySelector("#loginPassword").value;

  if (!state.supabase) {
    state.user = { id: "demo-user", email, username: email.split("@")[0] || "Palpiteiro" };
    state.profile = { username: state.user.username, is_admin: true };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(state.user));
    upsertDemoProfile(state.user.id, state.profile.username, true);
    updateAuthUi();
    await refreshData();
    toast("Login local realizado.");
    return;
  }

  const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  state.user = data.user;
  await loadProfile();
  updateAuthUi();
  await refreshData();
  toast("Bem-vindo de volta.");
}

function resolveLoginEmail(login) {
  return login.toLowerCase() === ADMIN_LOGIN ? ADMIN_EMAIL : login;
}

async function handleSignup(event) {
  event.preventDefault();
  const username = document.querySelector("#signupUsername").value.trim();
  const email = document.querySelector("#signupEmail").value.trim();
  const password = document.querySelector("#signupPassword").value;

  if (!state.supabase) {
    state.user = { id: "demo-user", email, username };
    state.profile = { username, is_admin: true };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(state.user));
    upsertDemoProfile(state.user.id, username, true);
    updateAuthUi();
    await refreshData();
    toast("Cadastro local criado.");
    return;
  }

  const { data, error } = await state.supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) return toast(error.message);
  state.user = data.user;
  await state.supabase.from("profiles").upsert({
    id: data.user.id,
    username,
    is_admin: false
  });
  await loadProfile();
  updateAuthUi();
  await refreshData();
  toast("Cadastro criado. Confirme o e-mail se o Supabase solicitar.");
}

async function handleLogout() {
  if (state.supabase) await state.supabase.auth.signOut();
  localStorage.removeItem(DEMO_USER_KEY);
  state.user = null;
  state.profile = null;
  state.predictions = [];
  updateAuthUi();
  render();
}

async function loadProfile() {
  if (!state.supabase || !state.user) return;
  const { data, error } = await state.supabase
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .maybeSingle();
  if (error) {
    toast(error.message);
    return;
  }

  if (!data) {
    state.profile = await ensureProfile();
    return;
  }

  state.profile = data;
}

async function ensureProfile() {
  const metadataUsername = state.user.user_metadata?.username;
  const emailUsername = state.user.email?.split("@")[0];
  const desiredUsername = metadataUsername || emailUsername || "palpiteiro";
  const fallbackUsername = `${desiredUsername}`.replace(/\s+/g, "_").slice(0, 31) || "palpiteiro";
  const { data: safeUsername } = await state.supabase.rpc("safe_profile_username", {
    base_username: fallbackUsername,
    user_id: state.user.id
  });
  const profile = {
    id: state.user.id,
    username: safeUsername || (fallbackUsername.length >= 3 ? fallbackUsername : `palpiteiro_${state.user.id.slice(0, 8)}`),
    is_admin: false
  };

  const { data, error } = await state.supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) {
    toast(error.message);
    return { username: state.user.email, is_admin: false };
  }

  return data || profile;
}

async function refreshData() {
  await loadMatches();
  await loadProfiles();
  await loadPredictions();
  await loadResults();
  populateStageFilter();
  updateAuthUi();
  render();
}

async function loadMatches() {
  if (state.supabase) {
    const { data, error } = await state.supabase
      .from("matches")
      .select("*")
      .order("kickoff_utc", { ascending: true });
    if (!error && data?.length) {
      state.matches = data;
      return;
    }
  }
  const response = await fetch("./data/worldcup-2026-seed.json");
  state.matches = await response.json();
}

async function loadProfiles() {
  if (state.supabase) {
    const { data, error } = await state.supabase
      .from("profiles")
      .select("id, username, is_admin, created_at")
      .order("username", { ascending: true });
    state.profiles = error ? [] : data || [];
    return;
  }

  state.profiles = JSON.parse(localStorage.getItem(DEMO_PROFILES_KEY) || "[]");
  if (state.user && !state.profiles.some((profile) => profile.id === state.user.id)) {
    upsertDemoProfile(state.user.id, state.profile?.username || state.user.username || "Participante", true);
  }
}

async function loadPredictions() {
  if (!state.user) {
    state.predictions = [];
    return;
  }

  if (state.supabase) {
    const { data, error } = await state.supabase
      .from("predictions")
      .select("*")
      .eq("user_id", state.user.id);
    state.predictions = error ? [] : data || [];
    return;
  }

  state.predictions = JSON.parse(localStorage.getItem(DEMO_PREDICTIONS_KEY) || "[]");
}

async function loadResults() {
  if (state.supabase) {
    const { data, error } = await state.supabase.from("results").select("*");
    state.results = error ? [] : data || [];
    return;
  }
  state.results = JSON.parse(localStorage.getItem(DEMO_RESULTS_KEY) || "[]");
}

function updateAuthUi() {
  const logged = Boolean(state.user);
  el.authPanel.hidden = logged;
  el.appShell.hidden = !logged;
  el.logoutButton.hidden = !logged;
  el.userGreeting.textContent = logged ? `Ola, ${state.profile?.username || state.user.email}` : "Participante";
}

function populateStageFilter() {
  const current = el.stageFilter.value || "all";
  const stages = [...new Set(state.matches.map((match) => match.stage || match.group_name).filter(Boolean))];
  el.stageFilter.innerHTML = [
    `<option value="all">Todos</option>`,
    ...stages.map((stage) => `<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`)
  ].join("");
  el.stageFilter.value = stages.includes(current) ? current : "all";
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  render();
}

function render() {
  if (!state.user) {
    el.contentArea.innerHTML = "";
    return;
  }

  const titles = {
    palpites: "Palpites dos jogos",
    ranking: "Ranking do bolao",
    regras: "Regras e desempate",
    admin: "Administracao"
  };
  el.viewTitle.textContent = titles[state.view];
  el.matchFilters.hidden = state.view !== "palpites";

  if (state.view === "palpites") return renderMatches();
  if (state.view === "ranking") return renderRanking();
  if (state.view === "regras") return renderRules();
  return renderAdmin();
}

function renderMatches() {
  const stage = el.stageFilter.value;
  const status = el.statusFilter.value;
  const rows = state.matches.filter((match) => {
    const matchStage = match.stage || match.group_name;
    const result = findOfficialResult(match.id);
    const locked = isLocked(match);
    const statusOk =
      status === "all" ||
      (status === "open" && !locked && !result) ||
      (status === "locked" && locked && !result) ||
      (status === "finished" && result);
    return (stage === "all" || matchStage === stage) && statusOk;
  }).sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));

  el.contentArea.innerHTML = rows.length
    ? rows.map(renderMatchCard).join("")
    : `<div class="panel">Nenhum jogo encontrado para este filtro.</div>`;

  document.querySelectorAll("[data-save-prediction]").forEach((form) => {
    form.addEventListener("submit", savePrediction);
  });
}

function renderMatchCard(match) {
  const prediction = findPrediction(match.id);
  const rawResult = findResult(match.id);
  const result = findOfficialResult(match.id);
  const locked = isLocked(match);
  const finished = Boolean(result);
  const points = result && prediction ? scorePrediction(prediction, result, match) : null;
  const className = finished ? "finished" : locked ? "locked" : "";
  const statusText = finished
    ? `Resultado ${result.home_goals} x ${result.away_goals}`
    : rawResult
      ? `Placar aguardando oficializacao (${formatOfficialAt(match)})`
    : locked
      ? "JOGO INICIADO"
      : "Aberto";

  return `
    <article class="match-card ${className}">
      <div>
        <p class="match-meta">
          <span class="pill">${escapeHtml(match.stage || match.group_name || "Copa")}</span>
          <span>${formatKickoff(match.kickoff_utc)}</span>
          <span>${escapeHtml(match.venue || "")}</span>
          <span>${escapeHtml(match.city || "")}</span>
          <span>${statusText}</span>
          ${points === null ? "" : `<span>${points} pts</span>`}
        </p>
        <div class="teams">
          ${renderTeamName(match.home_team, "home")}
          <span>x</span>
          ${renderTeamName(match.away_team, "away")}
        </div>
      </div>
      ${
        locked || finished
          ? `<div class="locked-message">${finished ? "Pontuacao apurada." : "JOGOS INICIADOS NAO PERMITEM PREENCHIMENTO. Pontuacao 0 sem palpite valido."}</div>`
          : `
            <form class="score-form" data-save-prediction="${escapeHtml(match.id)}">
              <label>
                ${renderTeamName(match.home_team, "home", "score-team")}
                <input name="home_goals" type="number" min="0" max="30" value="${prediction?.home_goals ?? ""}" required>
              </label>
              <label>
                ${renderTeamName(match.away_team, "away", "score-team")}
                <input name="away_goals" type="number" min="0" max="30" value="${prediction?.away_goals ?? ""}" required>
              </label>
              <button class="primary-button" type="submit">Salvar palpite</button>
            </form>
          `
      }
    </article>
  `;
}

function renderTeamName(team, side, extraClass = "") {
  const flag = TEAM_FLAGS[team] || "";
  const name = `<span class="team-name">${escapeHtml(team)}</span>`;
  const flagHtml = flag ? `<span class="team-flag" aria-hidden="true">${flag}</span>` : "";
  const content = side === "home"
    ? `${name}${flagHtml}`
    : `${flagHtml}${name}`;
  return `<span class="team-side ${side} ${extraClass}">${content}</span>`;
}

async function savePrediction(event) {
  event.preventDefault();
  const matchId = event.currentTarget.dataset.savePrediction;
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || isLocked(match)) {
    toast("JOGOS INICIADOS NAO PERMITEM PREENCHIMENTO.");
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = {
    match_id: matchId,
    user_id: state.user.id,
    home_goals: Number(formData.get("home_goals")),
    away_goals: Number(formData.get("away_goals")),
    submitted_at: new Date().toISOString()
  };

  if (state.supabase) {
    const { error } = await state.supabase.rpc("upsert_prediction", {
      p_match_id: matchId,
      p_home_goals: payload.home_goals,
      p_away_goals: payload.away_goals
    });
    if (error) {
      const { error: tableError } = await state.supabase
        .from("predictions")
        .upsert(payload, { onConflict: "user_id,match_id" });
      if (tableError) return toast(tableError.message || error.message);
    }
  } else {
    const others = state.predictions.filter((item) => item.match_id !== matchId);
    state.predictions = [...others, payload];
    localStorage.setItem(DEMO_PREDICTIONS_KEY, JSON.stringify(state.predictions));
  }

  await loadPredictions();
  render();
  toast("Palpite salvo.");
}

async function renderRanking() {
  const ranking = await buildRanking();
  el.contentArea.innerHTML = `
    ${state.supabase ? "" : `
      <div class="panel local-ranking-warning">
        Este ranking esta em modo local neste navegador. Para todos os palpiteiros se verem, configure o Supabase compartilhado na aba Admin ou em docs/config.js.
      </div>
    `}
    <table class="ranking-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Participante</th>
          <th>Pontos</th>
          <th>Placares exatos</th>
          <th>Vencedor/empate</th>
        </tr>
      </thead>
      <tbody>
        ${ranking.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.username)}</td>
            <td>${row.points}</td>
            <td>${row.exacts}</td>
            <td>${row.outcomes}</td>
          </tr>
        `).join("") || `<tr><td colspan="5">Nenhum participante inscrito ainda.</td></tr>`}
      </tbody>
    </table>
    ${renderCompactResults()}
  `;
}

function renderCompactResults() {
  const playedMatches = state.matches
    .filter((match) => canUpdateOfficialResult(match))
    .sort((a, b) => new Date(b.kickoff_utc) - new Date(a.kickoff_utc));

  return `
    <section class="ranking-results">
      <div class="section-heading compact-heading">
        <p class="eyebrow">Resultados</p>
        <h3>Jogos realizados</h3>
      </div>
      <div class="results-compact-grid">
        ${playedMatches.map((match) => {
          const official = findOfficialResult(match.id);
          const rawResult = findResult(match.id);
          const score = official
            ? `${official.home_goals} x ${official.away_goals}`
            : rawResult
              ? `${rawResult.home_goals} x ${rawResult.away_goals}`
              : "-";
          const status = official
            ? "Oficial"
            : rawResult
              ? `Oficial em ${formatOfficialAt(match)}`
              : `Aguardando placar (${formatOfficialAt(match)})`;

          return `
            <article class="result-mini-card">
              <div class="result-mini-meta">
                <span>${formatKickoff(match.kickoff_utc)}</span>
                <span>${escapeHtml(match.stage || match.group_name || "Copa")}</span>
              </div>
              <div class="result-mini-teams">
                <span>${escapeHtml(match.home_team)}</span>
                <strong>${score}</strong>
                <span>${escapeHtml(match.away_team)}</span>
              </div>
              <p>${escapeHtml(match.city || match.venue || "")}</p>
              <small>${status}</small>
            </article>
          `;
        }).join("") || `<div class="panel">Nenhum jogo realizado ainda.</div>`}
      </div>
    </section>
  `;
}

async function buildRanking() {
  if (state.supabase) {
    const { data, error } = await state.supabase.rpc("get_leaderboard");
    if (error) {
      toast(error.message);
      return buildProfileOnlyRanking();
    }
    const ranking = (data || []).map((row) => ({
      username: row.username,
      points: row.points,
      exacts: row.exacts,
      outcomes: row.outcomes
    }));
    return ranking.length ? ranking : buildProfileOnlyRanking();
  }

  const users = new Map();
  const predictions = JSON.parse(localStorage.getItem(DEMO_PREDICTIONS_KEY) || "[]");
  const profiles = JSON.parse(localStorage.getItem(DEMO_PROFILES_KEY) || "[]");

  profiles.forEach((profile) => {
    users.set(profile.id, {
      username: profile.username || "Participante",
      points: 0,
      exacts: 0,
      outcomes: 0
    });
  });

  predictions.forEach((prediction) => {
    const result = findOfficialResult(prediction.match_id);
    if (!result) return;
    const match = state.matches.find((item) => item.id === prediction.match_id);
    const row = users.get(prediction.user_id) || {
      username: state.profile?.username || "Participante",
      points: 0,
      exacts: 0,
      outcomes: 0
    };
    const points = scorePrediction(prediction, result, match);
    row.points += points;
    if (points === 5) row.exacts += 1;
    if (sameOutcome(prediction, result)) row.outcomes += 1;
    users.set(prediction.user_id, row);
  });

  return [...users.values()].sort((a, b) =>
    b.points - a.points ||
    b.exacts - a.exacts ||
    b.outcomes - a.outcomes
  );
}

function buildProfileOnlyRanking() {
  return state.profiles.map((profile) => ({
    username: profile.username || "Participante",
    points: 0,
    exacts: 0,
    outcomes: 0
  })).sort((a, b) => a.username.localeCompare(b.username));
}

function renderRules() {
  const rules = [
    "Palpites precisam ser enviados antes do horario previsto de inicio da partida.",
    "Ao atingir o horario do jogo, o preenchimento fica travado e palpites ausentes valem 0.",
    "Placar exato vale 5 pontos.",
    "Acerto de vencedor ou empate vale 3 pontos.",
    "Cada numero de gols correto de uma equipe soma 1 ponto quando nao houver placar exato.",
    "No mata-mata, considerar tempo normal mais prorrogacao; penaltis nao entram.",
    "Desempate: placares exatos, acertos de vencedor/empate, palpite correto do campeao e sorteio.",
    "A tabela de pontuacao deve ser atualizada apos cada rodada ou na periodicidade combinada pela organizacao.",
    "Os placares reais devem ser atualizados no sistema 3 horas apos o horario de inicio de cada jogo, quando passam a ser considerados oficiais para conferencia dos palpites.",
    "Todos os participantes devem ter acesso a classificacao geral.",
    "Casos omissos ou situacoes nao previstas serao decididos pela organizacao do bolao, sempre buscando transparencia e igualdade entre os participantes."
  ];

  el.contentArea.innerHTML = `
    <div class="rules-list">
      ${rules.map((rule, index) => `<div class="rule-item"><strong>${index + 1}.</strong> ${rule}</div>`).join("")}
    </div>
  `;
}

async function renderAdmin() {
  const admin = state.profile?.is_admin || !state.supabase;
  if (!admin) {
    el.contentArea.innerHTML = `<div class="panel">Apenas administradores podem lancar resultados e importar jogos.</div>`;
    return;
  }

  const auditRows = await loadAdminPredictionAudit();
  el.contentArea.innerHTML = `
    ${renderAdminSetup()}
    ${renderAdminPredictionAudit(auditRows)}
    <div class="section-heading admin-results-heading">
      <p class="eyebrow">Placares oficiais</p>
      <h3>Atualizar resultados</h3>
    </div>
    <div class="admin-grid">
      ${state.matches.map((match) => {
        const result = findResult(match.id);
        const canUpdateResult = canUpdateOfficialResult(match);
        return `
          <form class="panel admin-result-form" data-result-match="${escapeHtml(match.id)}">
            <h3>${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)}</h3>
            <p>${formatKickoff(match.kickoff_utc)} - ${escapeHtml(match.city || "")}</p>
            <p>${canUpdateResult ? "Placares liberados para conferencia oficial." : `Atualizacao liberada em ${formatOfficialAt(match)}.`}</p>
            <label>
              Gols ${escapeHtml(match.home_team)}
              <input name="home_goals" type="number" min="0" max="30" value="${result?.home_goals ?? ""}" ${canUpdateResult ? "" : "disabled"} required>
            </label>
            <label>
              Gols ${escapeHtml(match.away_team)}
              <input name="away_goals" type="number" min="0" max="30" value="${result?.away_goals ?? ""}" ${canUpdateResult ? "" : "disabled"} required>
            </label>
            <button class="secondary-button" type="submit" ${canUpdateResult ? "" : "disabled"}>Salvar resultado oficial</button>
          </form>
        `;
      }).join("")}
    </div>
  `;

  document.querySelectorAll(".admin-result-form").forEach((form) => {
    form.addEventListener("submit", saveResult);
  });
  bindAdminSetupEvents();
}

async function loadAdminPredictionAudit() {
  if (state.supabase) {
    const { data, error } = await state.supabase.rpc("get_admin_predictions_audit");
    if (error) {
      toast(error.message);
      return [];
    }
    return data || [];
  }

  const profilesById = new Map(state.profiles.map((profile) => [profile.id, profile]));
  return state.predictions.map((prediction) => {
    const match = state.matches.find((item) => item.id === prediction.match_id) || {};
    const profile = profilesById.get(prediction.user_id);
    const official = findOfficialResult(prediction.match_id);
    return {
      user_id: prediction.user_id,
      username: profile?.username || "Participante",
      match_id: prediction.match_id,
      match_number: match.match_number,
      stage: match.stage || match.group_name || "Copa",
      home_team: match.home_team || "Time A",
      away_team: match.away_team || "Time B",
      kickoff_utc: match.kickoff_utc,
      predicted_home_goals: prediction.home_goals,
      predicted_away_goals: prediction.away_goals,
      submitted_at: prediction.submitted_at,
      official_home_goals: official?.home_goals ?? null,
      official_away_goals: official?.away_goals ?? null
    };
  }).sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
}

function renderAdminPredictionAudit(rows) {
  return `
    <section class="admin-audit">
      <div class="section-heading admin-results-heading">
        <p class="eyebrow">Governanca dos dados</p>
        <h3>Auditoria de palpites</h3>
      </div>
      <div class="audit-table-wrapper">
        <table class="ranking-table audit-table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Jogo</th>
              <th>Palpite</th>
              <th>Resultado</th>
              <th>Enviado em</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const officialScore = row.official_home_goals === null || row.official_home_goals === undefined
                ? "-"
                : `${row.official_home_goals} x ${row.official_away_goals}`;
              return `
                <tr>
                  <td>${escapeHtml(row.username || "Participante")}</td>
                  <td>
                    <strong>${escapeHtml(row.home_team)} x ${escapeHtml(row.away_team)}</strong>
                    <small>${escapeHtml(row.stage || "Copa")} ${row.match_number ? `- Jogo ${row.match_number}` : ""}</small>
                  </td>
                  <td>${row.predicted_home_goals} x ${row.predicted_away_goals}</td>
                  <td>${officialScore}</td>
                  <td>${formatAuditDate(row.submitted_at)}</td>
                </tr>
              `;
            }).join("") || `<tr><td colspan="5">Nenhum palpite registrado ainda.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAdminSetup() {
  return `
    <section class="admin-setup">
      <div class="section-heading">
        <p class="eyebrow">Publicacao gratuita</p>
        <h3>Configurar GitHub Pages + Supabase</h3>
      </div>
      <div class="setup-grid">
        <form id="configForm" class="panel">
          <h3>Credenciais publicas do Supabase</h3>
          <label>
            URL do projeto
            <input id="supabaseUrl" type="url" placeholder="https://xxxx.supabase.co">
          </label>
          <label>
            Chave anon publica
            <input id="supabaseAnonKey" type="text" placeholder="eyJhbGciOi...">
          </label>
          <button class="secondary-button" type="submit">Salvar configuracao</button>
          <button class="ghost-button" id="clearConfigButton" type="button">Usar modo local</button>
        </form>

        <div class="panel">
          <h3>Fonte dos jogos</h3>
          <p>
            O site aceita importacao por JSON/API gratuita. Para chaves privadas,
            use uma Supabase Edge Function ou outro proxy gratuito.
          </p>
          <form id="scheduleImportForm">
            <label>
              URL JSON da agenda
              <input id="scheduleUrl" type="url" placeholder="https://.../worldcup-2026.json">
            </label>
            <button class="secondary-button" type="submit">Importar jogos</button>
          </form>
        </div>
      </div>
    </section>
  `;
}

function bindAdminSetupEvents() {
  const configForm = document.querySelector("#configForm");
  const clearConfigButton = document.querySelector("#clearConfigButton");
  const scheduleImportForm = document.querySelector("#scheduleImportForm");

  if (configForm) configForm.addEventListener("submit", handleConfigSave);
  if (clearConfigButton) clearConfigButton.addEventListener("click", clearConfig);
  if (scheduleImportForm) scheduleImportForm.addEventListener("submit", handleScheduleImport);
  hydrateConfigForm();
}

async function saveResult(event) {
  event.preventDefault();
  const matchId = event.currentTarget.dataset.resultMatch;
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || !canUpdateOfficialResult(match)) {
    toast(`Placares oficiais so podem ser atualizados ${RESULT_OFFICIAL_DELAY_HOURS} horas apos o inicio do jogo.`);
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = {
    match_id: matchId,
    home_goals: Number(formData.get("home_goals")),
    away_goals: Number(formData.get("away_goals")),
    updated_at: new Date().toISOString()
  };

  if (state.supabase) {
    const { error } = await state.supabase.from("results").upsert(payload, { onConflict: "match_id" });
    if (error) return toast(error.message);
  } else {
    const others = state.results.filter((item) => item.match_id !== matchId);
    state.results = [...others, payload];
    localStorage.setItem(DEMO_RESULTS_KEY, JSON.stringify(state.results));
  }

  await loadResults();
  render();
  toast("Resultado salvo.");
}

async function handleScheduleImport(event) {
  event.preventDefault();
  const url = document.querySelector("#scheduleUrl").value.trim();
  if (!url) return;
  const response = await fetch(url);
  if (!response.ok) {
    toast("Nao foi possivel baixar a agenda.");
    return;
  }
  const imported = normalizeMatches(await response.json());
  if (!imported.length) {
    toast("JSON sem jogos reconhecidos.");
    return;
  }

  if (state.supabase) {
    const { error } = await state.supabase.from("matches").upsert(imported, { onConflict: "id" });
    if (error) return toast(error.message);
  } else {
    state.matches = imported;
  }

  populateStageFilter();
  render();
  toast(`${imported.length} jogos importados.`);
}

function normalizeMatches(payload) {
  const items = Array.isArray(payload) ? payload : payload.matches || payload.fixtures || payload.response || [];
  return items.map((item, index) => {
    const fixture = item.fixture || item;
    const teams = item.teams || {};
    const venue = fixture.venue || item.venue || {};
    return {
      id: String(item.id || fixture.id || item.match_id || `api-${index + 1}`),
      match_number: Number(item.match_number || item.matchNumber || index + 1),
      stage: item.stage || item.round || item.league?.round || "Fase de grupos",
      group_name: item.group_name || item.group || null,
      home_team: item.home_team || item.homeTeam || teams.home?.name || item.home || "Time A",
      away_team: item.away_team || item.awayTeam || teams.away?.name || item.away || "Time B",
      kickoff_utc: toUtcIso(item.kickoff_utc || item.kickoff || fixture.date || item.date),
      venue: item.venue_name || venue.name || item.stadium || "",
      city: item.city || venue.city || "",
      source: item.source || "api"
    };
  }).filter((match) => match.kickoff_utc);
}

function handleConfigSave(event) {
  event.preventDefault();
  state.config = {
    url: document.querySelector("#supabaseUrl").value.trim(),
    anonKey: document.querySelector("#supabaseAnonKey").value.trim()
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  setupSupabase();
  restoreSession().then(refreshData);
  toast("Configuracao salva.");
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  state.config = {};
  hydrateConfigForm();
  setupSupabase();
  restoreSession().then(refreshData);
  toast(state.supabase ? "Configuracao local removida. Supabase publicado ativo." : "Modo local ativado.");
}

function hydrateConfigForm() {
  const supabaseUrl = document.querySelector("#supabaseUrl");
  const supabaseAnonKey = document.querySelector("#supabaseAnonKey");
  const sharedConfig = window.BOLAO_CONFIG || {};
  if (supabaseUrl) supabaseUrl.value = state.config.url || sharedConfig.supabaseUrl || "";
  if (supabaseAnonKey) supabaseAnonKey.value = state.config.anonKey || sharedConfig.supabaseAnonKey || "";
}

function loadConfig() {
  return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
}

function findPrediction(matchId) {
  return state.predictions.find((prediction) => prediction.match_id === matchId);
}

function findResult(matchId) {
  return state.results.find((result) => result.match_id === matchId);
}

function findOfficialResult(matchId) {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || !canUpdateOfficialResult(match)) return null;
  return findResult(matchId);
}

function isLocked(match) {
  return new Date(match.kickoff_utc).getTime() <= Date.now();
}

function officialResultAt(match) {
  return new Date(new Date(match.kickoff_utc).getTime() + RESULT_OFFICIAL_DELAY_HOURS * 60 * 60 * 1000);
}

function canUpdateOfficialResult(match) {
  return officialResultAt(match).getTime() <= Date.now();
}

function scorePrediction(prediction, result) {
  if (!prediction || !result) return 0;
  if (prediction.home_goals === result.home_goals && prediction.away_goals === result.away_goals) return 5;
  let points = sameOutcome(prediction, result) ? 3 : 0;
  if (prediction.home_goals === result.home_goals) points += 1;
  if (prediction.away_goals === result.away_goals) points += 1;
  return points;
}

function sameOutcome(a, b) {
  return Math.sign(a.home_goals - a.away_goals) === Math.sign(b.home_goals - b.away_goals);
}

function formatKickoff(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BR_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatOfficialAt(match) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BR_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(officialResultAt(match));
}

function formatAuditDate(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BR_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function upsertDemoProfile(id, username, isAdmin = false) {
  const profiles = JSON.parse(localStorage.getItem(DEMO_PROFILES_KEY) || "[]");
  const next = [
    ...profiles.filter((profile) => profile.id !== id),
    { id, username, is_admin: isAdmin, created_at: new Date().toISOString() }
  ];
  localStorage.setItem(DEMO_PROFILES_KEY, JSON.stringify(next));
  state.profiles = next;
}

function startClock() {
  const tick = () => {
    el.clockValue.textContent = new Intl.DateTimeFormat("pt-BR", {
      timeZone: BR_TZ,
      dateStyle: "short",
      timeStyle: "medium"
    }).format(new Date());
  };
  tick();
  setInterval(tick, 1000);
}

function toUtcIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
