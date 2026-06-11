const BR_TZ = "America/Sao_Paulo";
const CONFIG_KEY = "bolao2026.config";
const DEMO_USER_KEY = "bolao2026.demoUser";
const DEMO_PREDICTIONS_KEY = "bolao2026.predictions";
const DEMO_RESULTS_KEY = "bolao2026.results";

const state = {
  supabase: null,
  user: null,
  profile: null,
  matches: [],
  predictions: [],
  results: [],
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
  configForm: document.querySelector("#configForm"),
  clearConfigButton: document.querySelector("#clearConfigButton"),
  scheduleImportForm: document.querySelector("#scheduleImportForm"),
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
  el.configForm.addEventListener("submit", handleConfigSave);
  el.clearConfigButton.addEventListener("click", clearConfig);
  el.scheduleImportForm.addEventListener("submit", handleScheduleImport);
  el.stageFilter.addEventListener("change", render);
  el.statusFilter.addEventListener("change", render);
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function setupSupabase() {
  const isConfigured = Boolean(state.config.url && state.config.anonKey && window.supabase);
  state.supabase = isConfigured ? window.supabase.createClient(state.config.url, state.config.anonKey) : null;
  el.modeLabel.textContent = isConfigured ? "Supabase ativo" : "Modo local";
  el.modeDescription.textContent = isConfigured
    ? "Login, palpites e ranking compartilhados pelo backend gratuito."
    : "Dados salvos neste navegador. Configure o Supabase para publicar para todos.";
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
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;

  if (!state.supabase) {
    state.user = { id: "demo-user", email, username: email.split("@")[0] || "Palpiteiro" };
    state.profile = { username: state.user.username, is_admin: true };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(state.user));
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

async function handleSignup(event) {
  event.preventDefault();
  const username = document.querySelector("#signupUsername").value.trim();
  const email = document.querySelector("#signupEmail").value.trim();
  const password = document.querySelector("#signupPassword").value;

  if (!state.supabase) {
    state.user = { id: "demo-user", email, username };
    state.profile = { username, is_admin: true };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(state.user));
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
  state.profile = data || { username: state.user.email, is_admin: false };
}

async function refreshData() {
  await loadMatches();
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
  renderAdmin();
}

function renderMatches() {
  const stage = el.stageFilter.value;
  const status = el.statusFilter.value;
  const rows = state.matches.filter((match) => {
    const matchStage = match.stage || match.group_name;
    const result = findResult(match.id);
    const locked = isLocked(match);
    const statusOk =
      status === "all" ||
      (status === "open" && !locked && !result) ||
      (status === "locked" && locked && !result) ||
      (status === "finished" && result);
    return (stage === "all" || matchStage === stage) && statusOk;
  });

  el.contentArea.innerHTML = rows.length
    ? rows.map(renderMatchCard).join("")
    : `<div class="panel">Nenhum jogo encontrado para este filtro.</div>`;

  document.querySelectorAll("[data-save-prediction]").forEach((form) => {
    form.addEventListener("submit", savePrediction);
  });
}

function renderMatchCard(match) {
  const prediction = findPrediction(match.id);
  const result = findResult(match.id);
  const locked = isLocked(match);
  const finished = Boolean(result);
  const points = result && prediction ? scorePrediction(prediction, result, match) : null;
  const className = finished ? "finished" : locked ? "locked" : "";
  const statusText = finished
    ? `Resultado ${result.home_goals} x ${result.away_goals}`
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
          <span>${escapeHtml(match.home_team)}</span>
          <span>x</span>
          <span>${escapeHtml(match.away_team)}</span>
        </div>
      </div>
      ${
        locked || finished
          ? `<div class="locked-message">${finished ? "Pontuacao apurada." : "JOGOS INICIADOS NAO PERMITEM PREENCHIMENTO. Pontuacao 0 sem palpite valido."}</div>`
          : `
            <form class="score-form" data-save-prediction="${escapeHtml(match.id)}">
              <label>
                ${escapeHtml(match.home_team)}
                <input name="home_goals" type="number" min="0" max="30" value="${prediction?.home_goals ?? ""}" required>
              </label>
              <label>
                ${escapeHtml(match.away_team)}
                <input name="away_goals" type="number" min="0" max="30" value="${prediction?.away_goals ?? ""}" required>
              </label>
              <button class="primary-button" type="submit">Salvar palpite</button>
            </form>
          `
      }
    </article>
  `;
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
    const { error } = await state.supabase.from("predictions").upsert(payload, {
      onConflict: "user_id,match_id"
    });
    if (error) return toast(error.message);
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
    <table class="ranking-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Participante</th>
          <th>Pontos</th>
          <th>Placares exatos</th>
          <th>Vencedor/empate</th>
          <th>Mata-mata</th>
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
            <td>${row.knockoutPoints}</td>
          </tr>
        `).join("") || `<tr><td colspan="6">Sem resultados apurados ainda.</td></tr>`}
      </tbody>
    </table>
  `;
}

async function buildRanking() {
  if (state.supabase) {
    const { data, error } = await state.supabase.rpc("get_leaderboard");
    if (error) {
      toast(error.message);
      return [];
    }
    return (data || []).map((row) => ({
      username: row.username,
      points: row.points,
      exacts: row.exacts,
      outcomes: row.outcomes,
      knockoutPoints: row.knockout_points
    }));
  }

  const users = new Map();
  const predictions = JSON.parse(localStorage.getItem(DEMO_PREDICTIONS_KEY) || "[]");

  predictions.forEach((prediction) => {
    const result = findResult(prediction.match_id);
    if (!result) return;
    const match = state.matches.find((item) => item.id === prediction.match_id);
    const row = users.get(prediction.user_id) || {
      username: state.profile?.username || "Participante",
      points: 0,
      exacts: 0,
      outcomes: 0,
      knockoutPoints: 0
    };
    const points = scorePrediction(prediction, result, match);
    row.points += points;
    if (points === 5) row.exacts += 1;
    if (sameOutcome(prediction, result)) row.outcomes += 1;
    if (match?.stage?.toLowerCase().includes("mata") || match?.stage?.toLowerCase().includes("final")) {
      row.knockoutPoints += points;
    }
    users.set(prediction.user_id, row);
  });

  return [...users.values()].sort((a, b) =>
    b.points - a.points ||
    b.exacts - a.exacts ||
    b.outcomes - a.outcomes ||
    b.knockoutPoints - a.knockoutPoints
  );
}

function renderRules() {
  const rules = [
    "Palpites precisam ser enviados antes do horario previsto de inicio da partida.",
    "Ao atingir o horario do jogo, o preenchimento fica travado e palpites ausentes valem 0.",
    "Placar exato vale 5 pontos.",
    "Acerto de vencedor ou empate vale 3 pontos.",
    "Cada numero de gols correto de uma equipe soma 1 ponto quando nao houver placar exato.",
    "No mata-mata, considerar tempo normal mais prorrogacao; penaltis nao entram.",
    "Desempate: placares exatos, acertos de vencedor/empate, pontos no mata-mata, campeao correto e sorteio.",
    "A tabela de pontuacao deve ser atualizada apos cada rodada ou na periodicidade combinada pela organizacao.",
    "Todos os participantes devem ter acesso a classificacao geral.",
    "Casos omissos ou situacoes nao previstas serao decididos pela organizacao do bolao, sempre buscando transparencia e igualdade entre os participantes."
  ];

  el.contentArea.innerHTML = `
    <div class="rules-list">
      ${rules.map((rule, index) => `<div class="rule-item"><strong>${index + 1}.</strong> ${rule}</div>`).join("")}
    </div>
  `;
}

function renderAdmin() {
  const admin = state.profile?.is_admin || !state.supabase;
  if (!admin) {
    el.contentArea.innerHTML = `<div class="panel">Apenas administradores podem lancar resultados e importar jogos.</div>`;
    return;
  }

  el.contentArea.innerHTML = `
    <div class="admin-grid">
      ${state.matches.map((match) => {
        const result = findResult(match.id);
        return `
          <form class="panel admin-result-form" data-result-match="${escapeHtml(match.id)}">
            <h3>${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)}</h3>
            <p>${formatKickoff(match.kickoff_utc)} - ${escapeHtml(match.city || "")}</p>
            <label>
              Gols ${escapeHtml(match.home_team)}
              <input name="home_goals" type="number" min="0" max="30" value="${result?.home_goals ?? ""}" required>
            </label>
            <label>
              Gols ${escapeHtml(match.away_team)}
              <input name="away_goals" type="number" min="0" max="30" value="${result?.away_goals ?? ""}" required>
            </label>
            <button class="secondary-button" type="submit">Salvar resultado</button>
          </form>
        `;
      }).join("")}
    </div>
  `;

  document.querySelectorAll(".admin-result-form").forEach((form) => {
    form.addEventListener("submit", saveResult);
  });
}

async function saveResult(event) {
  event.preventDefault();
  const matchId = event.currentTarget.dataset.resultMatch;
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
  state.supabase = null;
  hydrateConfigForm();
  setupSupabase();
  restoreSession().then(refreshData);
  toast("Modo local ativado.");
}

function hydrateConfigForm() {
  document.querySelector("#supabaseUrl").value = state.config.url || "";
  document.querySelector("#supabaseAnonKey").value = state.config.anonKey || "";
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

function isLocked(match) {
  return new Date(match.kickoff_utc).getTime() <= Date.now();
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
