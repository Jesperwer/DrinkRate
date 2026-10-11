(() => {
  "use strict";

  const CFG = window.DR_CONFIG || {};
  const FAMILY = CFG.family || [];
  const BARS = window.BARS;
  const DRINKS = window.DRINKS;
  const BAR = Object.fromEntries(BARS.map((b) => [b.id, b]));
  const DRINK = Object.fromEntries(DRINKS.map((d) => [d.id, d]));
  const CATS = [
    { id: "all", name: "Alle" },
    { id: "cocktail", name: "Cocktails" },
    { id: "free", name: "Alkoholfritt" },
    { id: "beerwine", name: "Øl & vin" },
  ];
  const CAT_TITLE = { cocktail: "Cocktails", free: "Alkoholfritt", beerwine: "Øl & vin" };
  const SCORE_WORDS = ["", "Uff", "Dårlig", "Svak", "Så som så", "Helt ok", "Grei", "God", "Veldig god", "Nydelig", "Perfekt!"];
  const AVATAR_COLORS = ["#e2553f", "#0d6b86", "#e39b21", "#5b8c5a", "#8a5cb8", "#c2577f", "#3d7fd1", "#a0703c"];
  const LS_KEY = "drinkrate.session";

  const root = document.getElementById("root");
  const toastEl = document.getElementById("toast");

  // ── Helpers ────────────────────────────────────────────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const initial = (name) => esc((name || "?").trim().charAt(0).toUpperCase());
  const colorFor = (name) => {
    const i = FAMILY.findIndex((n) => norm(n) === norm(name));
    if (i >= 0) return AVATAR_COLORS[i % AVATAR_COLORS.length];
    let h = 0;
    for (const ch of norm(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
  const barNames = (ids) => ids.map((id) => BAR[id].name).join(" · ");
  const ICONS = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14l-7 8z"/><path d="M12 12v7M8 20h8"/></svg>',
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // ── 6-7 ────────────────────────────────────────────────────
  let sixSevenTimer;
  function sixSeven() {
    document.querySelector(".six7")?.remove();
    const el = document.createElement("div");
    el.className = "six7";
    el.setAttribute("aria-hidden", "true");
    const bits = Array.from({ length: 28 }, (_, i) => {
      const x = (Math.random() * 2 - 1) * 46;
      const y = -(20 + Math.random() * 60);
      const r = Math.round(Math.random() * 720 - 360);
      const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
      return `<i style="--x:${x.toFixed(1)}vw;--y:${y.toFixed(1)}vh;--r:${r}deg;background:${c};animation-delay:${(Math.random() * 0.25).toFixed(2)}s"></i>`;
    }).join("");
    el.innerHTML = `<div class="six7-burst">${bits}</div>
      <div class="six7-nums"><b class="n6">6</b><b class="n7">7</b></div>
      <div class="six7-hands"><span class="h1">🫴</span><span class="h2">🫴</span></div>
      <div class="six7-text">SIX SEVEN!</div>`;
    el.addEventListener("click", () => el.remove());
    document.body.appendChild(el);
    if (navigator.vibrate) navigator.vibrate([60, 80, 60, 80, 60]);
    clearTimeout(sixSevenTimer);
    sixSevenTimer = setTimeout(() => el.remove(), 3200);
  }
  const has67 = (s) => /6\s*-?\s*7/.test(s || "");

  // ── API ────────────────────────────────────────────────────
  const ERR = {
    BAD_NAME: "Ugyldig navn.",
    BAD_PIN: "Feil PIN-kode. Prøv igjen.",
    NO_USER: "Du har ikke valgt PIN-kode ennå. Velg en nå.",
    NAME_TAKEN: "Du har allerede en PIN-kode. Logg inn med den.",
    LOCKED: "For mange forsøk. Vent 5 minutter og prøv igjen.",
    NETWORK: "Får ikke kontakt. Sjekk nettet og prøv igjen.",
  };

  async function rpc(fn, args, attempt = 0) {
    const headers = { "Content-Type": "application/json", apikey: CFG.key };
    if (String(CFG.key).startsWith("eyJ")) headers.Authorization = "Bearer " + CFG.key;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${CFG.url.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
        method: "POST", headers, body: JSON.stringify(args || {}), signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      if (attempt < 1) return rpc(fn, args, attempt + 1);
      const err = new Error("NETWORK");
      err.cause = e;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── State ──────────────────────────────────────────────────
  const state = {
    session: loadSession(), // { token, name }
    users: [],
    ratings: [], // { drink, name, score, bar, comment, at }
    loaded: false,
    tab: "list",
    bar: "all",
    cat: "all",
    q: "",
    topCat: "all",
    sheet: null, // drink id | "menu"
    draft: null, // { score, bar, comment }
    saving: false,
  };

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
  }
  function saveSession(s) {
    state.session = s;
    try { s ? localStorage.setItem(LS_KEY, JSON.stringify(s)) : localStorage.removeItem(LS_KEY); } catch { /* private mode */ }
  }

  async function refresh() {
    if (!state.session) return;
    try {
      const data = await rpc("dr_get_ratings", { p_token: state.session.token });
      if (data.error === "BAD_TOKEN") { logout(); return; }
      state.ratings = (data.ratings || []).filter((r) => DRINK[r.drink]);
      if (data.me && data.me !== state.session.name) saveSession({ ...state.session, name: data.me });
      const wasLoaded = state.loaded;
      state.loaded = true;
      if (wasLoaded && document.activeElement?.name === "q") updateResults();
      else render();
    } catch {
      if (!state.loaded) { state.loaded = true; render(); }
      toast(ERR.NETWORK);
    }
  }

  function logout() {
    saveSession(null);
    state.ratings = [];
    state.loaded = false;
    state.sheet = null;
    Object.assign(state, { tab: "list", bar: "all", cat: "all", q: "", topCat: "all" });
    renderLogin();
  }

  // ── Derived data ───────────────────────────────────────────
  function byDrink() {
    const map = {};
    for (const r of state.ratings) (map[r.drink] ||= []).push(r);
    return map;
  }
  function summary(list) {
    if (!list || !list.length) return null;
    return { avg: list.reduce((s, r) => s + r.score, 0) / list.length, n: list.length };
  }
  function myRating(list) {
    const me = norm(state.session?.name);
    return (list || []).find((r) => norm(r.name) === me) || null;
  }

  // ── Login screen ───────────────────────────────────────────
  const login = { mode: "pick", name: "", error: "", busy: false, ready: false };
  const isRegistered = (name) => state.users.some((u) => norm(u) === norm(name));

  async function renderLogin() {
    if (!CFG.url || !CFG.key) {
      root.innerHTML = `<div class="wrap login">${brand()}<div class="panel"><h2>Nesten klar</h2>
        <p class="hint">Siden er ikke koblet til databasen ennå. Legg inn Supabase-adressen og nøkkelen i <b>config.js</b>.</p></div></div>`;
      return;
    }
    login.ready = false;
    drawLogin();
    try {
      state.users = await rpc("dr_list_users", {});
      login.ready = true;
      login.error = "";
    } catch {
      login.error = ERR.NETWORK;
    }
    if (!state.session) drawLogin();
  }

  function brand() {
    return `<div class="brand"><img class="brand-mark" src="icon-192.png" alt="">
      <h1>DrinkRate</h1><p>Familiens drinkguide fra ferien</p></div>`;
  }

  function pinField(name, label, autocomplete) {
    return `<label class="field"><span>${label}</span>
      <input class="input pin" name="${name}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${autocomplete}" required></label>`;
  }

  function drawLogin() {
    let body;
    const names = FAMILY.length ? FAMILY : state.users;
    if (login.mode === "pick") {
      body = `<h2>Hvem er du?</h2>
        <div class="people">
          ${names.map((n) => `<button class="person" data-pick="${esc(n)}" ${login.ready ? "" : "disabled"}>
            <span class="avatar sm" style="background:${colorFor(n)}">${initial(n)}</span>${esc(n)}</button>`).join("")}
        </div>
        <p class="error">${esc(login.error)}</p>
        ${!login.ready && login.error ? `<button class="btn" data-act="retry">Prøv igjen</button>` : ""}`;
    } else if (login.mode === "pin") {
      body = `<h2>Hei, ${esc(login.name)}!</h2>
        <form data-form="login">
          ${pinField("pin", "Din PIN-kode", "current-password")}
          <p class="error">${esc(login.error)}</p>
          <button class="btn" ${login.busy ? "disabled" : ""}>Logg inn</button>
        </form>
        <button class="link" data-act="back">Ikke deg? Velg et annet navn</button>`;
    } else {
      body = `<h2>Velkommen, ${esc(login.name)}!</h2>
        <p class="hint" style="margin-top:0">Velg en PIN-kode på 4 tall. Du bruker den når du logger inn på en ny telefon.</p>
        <form data-form="register">
          ${pinField("pin", "Velg PIN-kode", "new-password")}
          ${pinField("pin2", "Gjenta PIN-koden", "new-password")}
          <p class="error">${esc(login.error)}</p>
          <button class="btn coral" ${login.busy ? "disabled" : ""}>Kom i gang</button>
        </form>
        <button class="link" data-act="back">Ikke deg? Velg et annet navn</button>`;
    }
    root.innerHTML = `<div class="wrap login">${brand()}<div class="panel">${body}</div></div>`;
    root.querySelector("input[name=pin]")?.focus();
  }

  async function submitLogin(form, kind) {
    const pin = form.pin.value.trim();
    if (!/^\d{4}$/.test(pin)) { login.error = "PIN-koden må være 4 tall."; drawLogin(); return; }
    if (kind === "register" && form.pin2.value.trim() !== pin) { login.error = "PIN-kodene er ikke like."; drawLogin(); return; }
    login.busy = true; login.error = ""; drawLogin();
    try {
      const res = await rpc(kind === "register" ? "dr_register" : "dr_login", { p_name: login.name, p_pin: pin });
      login.busy = false;
      // Someone else set this person up meanwhile, or the list was stale.
      if (res.error === "NAME_TAKEN") { state.users.push(login.name); login.mode = "pin"; }
      if (res.error === "NO_USER") login.mode = "new";
      if (res.error) { login.error = ERR[res.error] || "Noe gikk galt. Prøv igjen."; drawLogin(); return; }
      saveSession({ token: res.token, name: res.name });
      Object.assign(login, { mode: "pick", name: "", error: "" });
      startApp();
    } catch {
      login.busy = false; login.error = ERR.NETWORK; drawLogin();
    }
  }

  // ── Main app ───────────────────────────────────────────────
  function startApp() {
    state.loaded = false;
    render();
    refresh();
  }

  function render() {
    if (!state.session) return renderLogin();
    const scrollY = window.scrollY;
    const sheetScroll = root.querySelector(".sheet")?.scrollTop || 0;
    let content;
    if (!state.loaded) content = `<div class="loading">Henter vurderinger …</div>`;
    else if (state.tab === "list") content = viewList();
    else if (state.tab === "top") content = viewTop();
    else content = viewMine();

    root.innerHTML = `
      <header class="top"><div class="wrap top-row">
        <h1>${state.tab === "list" ? "Drinker" : state.tab === "top" ? "Toppliste" : "Mine"}</h1>
        <button class="me" data-act="menu" aria-label="Meny" style="background:${colorFor(state.session.name)}">${initial(state.session.name)}</button>
      </div></header>
      <main class="wrap">${content}</main>
      <nav class="nav"><div class="nav-in">
        ${[["list", "Drinker"], ["top", "Toppliste"], ["mine", "Mine"]].map(([id, label]) =>
          `<button class="tab ${state.tab === id ? "on" : ""}" data-tab="${id}">${ICONS[id]}${label}</button>`).join("")}
      </div></nav>
      ${state.sheet ? sheetHtml() : ""}`;

    window.scrollTo(0, scrollY);
    const sheet = root.querySelector(".sheet");
    if (sheet) {
      if (state.sheetOpened) state.sheetOpened = false;
      else { sheet.classList.add("still"); root.querySelector(".backdrop").classList.add("still"); sheet.scrollTop = sheetScroll; }
    }
    onScroll();
  }

  function chips(items, active, attr) {
    return `<div class="chips">${items.map((it) =>
      `<button class="chip ${active === it.id ? "on" : ""}" data-${attr}="${it.id}">${esc(it.name)}</button>`).join("")}</div>`;
  }

  function drinkRow(d, map, lead = "") {
    const list = map[d.id];
    const s = summary(list);
    const mine = myRating(list);
    return `<button class="drink" data-drink="${d.id}">
      ${lead}
      <div class="drink-main">
        <div class="drink-name">${esc(d.name)}</div>
        <div class="drink-desc">${esc(d.desc)}</div>
        <div class="drink-meta">
          ${mine ? `<span class="pill mine">Du: ${mine.score}</span>` : `<span class="pill todo">Ikke smakt</span>`}
          <span class="where-small">${esc(barNames(d.bars))}</span>
        </div>
      </div>
      <div class="score ${s ? "" : "none"}">
        <b>${s ? fmt(s.avg) : "–"}</b>
        <span>${s ? `${s.n} ${s.n === 1 ? "stemme" : "stemmer"}` : "ingen ennå"}</span>
      </div>
    </button>`;
  }

  function viewList() {
    return `<div class="search">${ICONS.search}<input class="input" name="q" type="search" placeholder="Søk etter drink eller ingrediens" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search"></div>
      ${chips(CATS, state.cat, "cat")}
      ${chips([{ id: "all", name: "Alle barer" }, ...BARS], state.bar, "bar")}
      <div id="results">${listResults()}</div>`;
  }

  function listResults() {
    const map = byDrink();
    const q = norm(state.q);
    const hits = DRINKS.filter((d) =>
      (state.bar === "all" || d.bars.includes(state.bar)) &&
      (state.cat === "all" || d.cat === state.cat) &&
      (!q || norm(d.name + " " + d.desc).includes(q)));

    if (!hits.length) return `<div class="empty"><b>Ingen treff</b>Prøv et annet søk eller filter.</div>`;
    let html = "";
    for (const cat of ["cocktail", "free", "beerwine"]) {
      const rows = hits.filter((d) => d.cat === cat);
      if (!rows.length) continue;
      html += `<div class="section-title"><h2>${CAT_TITLE[cat]}</h2><small>${rows.length} stk</small></div>
        <div class="list">${rows.map((d) => drinkRow(d, map)).join("")}</div>`;
    }
    return html;
  }

  function viewTop() {
    const map = byDrink();
    const ranked = DRINKS
      .filter((d) => state.topCat === "all" || d.cat === state.topCat)
      .map((d) => ({ d, s: summary(map[d.id]) }))
      .filter((x) => x.s)
      .sort((a, b) => b.s.avg - a.s.avg || b.s.n - a.s.n || a.d.name.localeCompare(b.d.name));

    const people = new Set(state.ratings.map((r) => norm(r.name))).size;
    const tasted = new Set(state.ratings.map((r) => r.drink)).size;
    let html = `<div class="stats">
        <div class="stat"><b>${state.ratings.length}</b><span>vurderinger</span></div>
        <div class="stat"><b>${tasted}</b><span>drinker smakt</span></div>
        <div class="stat"><b>${people}</b><span>smakere</span></div>
      </div>
      <div style="height:12px"></div>
      ${chips(CATS, state.topCat, "topcat")}`;

    if (!ranked.length) {
      return html + `<div class="empty"><b>Ingen vurderinger ennå</b>Gå til «Drinker» og gi karakter til det du har smakt.</div>`;
    }
    const medals = ["🥇", "🥈", "🥉"];
    html += `<div class="list">${ranked.map((x, i) =>
      drinkRow(x.d, map, `<div class="rank ${i < 3 ? "medal" : ""}">${i < 3 ? medals[i] : i + 1}</div>`)).join("")}</div>`;
    return html;
  }

  function viewMine() {
    const map = byDrink();
    const me = norm(state.session.name);
    const mine = state.ratings
      .filter((r) => norm(r.name) === me)
      .sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)));

    let html = `<div class="stats">
        <div class="stat"><b>${mine.length}</b><span>smakt</span></div>
        <div class="stat"><b>${DRINKS.length - mine.length}</b><span>igjen</span></div>
        <div class="stat"><b>${mine.length ? fmt(mine.reduce((s, r) => s + r.score, 0) / mine.length) : "–"}</b><span>ditt snitt</span></div>
      </div>`;
    if (!mine.length) {
      return html + `<div class="empty"><b>Du har ikke vurdert noe ennå</b>Trykk på en drink under «Drinker» for å gi karakter.</div>`;
    }
    html += `<div class="section-title"><h2>Dine favoritter</h2></div>
      <div class="list">${mine.map((r) => drinkRow(DRINK[r.drink], map)).join("")}</div>`;
    return html;
  }

  // ── Sheet ──────────────────────────────────────────────────
  function openDrink(id) {
    const mine = myRating(byDrink()[id]);
    const d = DRINK[id];
    state.sheet = id;
    state.sheetOpened = true;
    state.draft = {
      score: mine?.score || 0,
      bar: mine ? mine.bar || "" : (state.bar !== "all" && d.bars.includes(state.bar) ? state.bar : ""),
      comment: mine?.comment || "",
    };
    lastTaps = [];
    had67.comment = has67(state.draft.comment);
    document.body.style.overflow = "hidden";
    render();
  }
  function closeSheet() {
    state.sheet = null;
    state.draft = null;
    document.body.style.overflow = "";
    render();
  }

  function sheetHtml() {
    if (state.sheet === "menu") {
      return `<div class="backdrop" data-act="close"></div>
        <div class="sheet menu-sheet" role="dialog" aria-modal="true"><div class="wrap">
          <div class="grab"></div>
          <div class="sheet-head"><h2>${esc(state.session.name)}</h2><button class="close" data-act="close" aria-label="Lukk">${ICONS.close}</button></div>
          <p class="hint">Tips: Legg siden til på hjemskjermen (Del → «Legg til på Hjem-skjerm»), så åpner den som en app.</p>
          <button class="btn" data-act="refresh">Oppdater</button>
          <button class="btn ghost" style="width:100%" data-act="logout">Logg ut</button>
        </div></div>`;
    }
    const d = DRINK[state.sheet];
    const list = (byDrink()[d.id] || []).slice().sort((a, b) => b.score - a.score);
    const s = summary(list);
    const mine = myRating(list);
    const sc = state.draft.score;
    const barOpts = [{ id: "", name: "Ikke valgt" }, ...d.bars.map((id) => BAR[id])];
    return `<div class="backdrop" data-act="close"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.name)}"><div class="wrap">
        <div class="grab"></div>
        <div class="sheet-head">
          <div><h2>${esc(d.name)}</h2><div class="where">${esc(barNames(d.bars))}</div></div>
          <button class="close" data-act="close" aria-label="Lukk">${ICONS.close}</button>
        </div>
        <p class="desc">${esc(d.desc)}</p>
        ${d.flav ? `<p class="flav">Smaker: ${esc(d.flav)}</p>` : ""}

        <div class="rate-box">
          <h3>${mine ? "Din karakter" : "Hva syns du?"}</h3>
          <div class="scores" role="radiogroup" aria-label="Karakter fra 1 til 10">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
              `<button class="sc ${n === sc ? "on" : ""} ${n < sc ? "fill" : ""}" data-score="${n}" role="radio" aria-checked="${n === sc}">${n}</button>`).join("")}
          </div>
          <div class="star-label">${sc ? `${sc}/10 · ${SCORE_WORDS[sc]}` : "&nbsp;"}</div>
          ${d.bars.length > 1 ? `<div class="bar-pick"><span>Hvor smakte du den? <em>(valgfritt)</em></span>
            <div class="chips tight">${barOpts.map((b) =>
              `<button class="chip ${state.draft.bar === b.id ? "on" : ""}" data-pickbar="${b.id}">${esc(b.name)}</button>`).join("")}</div></div>` : ""}
          <textarea class="input" name="comment" maxlength="300" placeholder="Kommentar (valgfritt)">${esc(state.draft.comment)}</textarea>
          <div class="row">
            ${mine ? `<button class="btn ghost" data-act="remove" ${state.saving ? "disabled" : ""}>Fjern</button>` : ""}
            <button class="btn coral" data-act="save" ${!sc || state.saving ? "disabled" : ""}>${state.saving ? "Lagrer …" : mine ? "Oppdater" : "Lagre"}</button>
          </div>
        </div>

        <div class="family">
          <h3>Familien ${s ? `· snitt ${fmt(s.avg)}` : ""}</h3>
          ${list.length ? list.map((r) => `<div class="review">
              <div class="avatar" style="background:${colorFor(r.name)}">${initial(r.name)}</div>
              <div class="review-body">
                <div class="review-top"><span>${esc(r.name)}${r.bar && BAR[r.bar] && d.bars.length > 1 ? ` <small>på ${esc(BAR[r.bar].name)}</small>` : ""}</span><span class="badge">${r.score}/10</span></div>
                ${r.comment ? `<p>${esc(r.comment)}</p>` : ""}
              </div></div>`).join("")
            : `<p class="hint">Ingen har vurdert denne ennå. Bli den første!</p>`}
        </div>
      </div></div>`;
  }

  async function saveRating(remove) {
    const id = state.sheet;
    const d = DRINK[id];
    const score = remove ? null : state.draft.score;
    const bar = remove ? null : state.draft.bar || (d.bars.length === 1 ? d.bars[0] : null);
    const comment = remove ? null : state.draft.comment.trim();
    state.saving = true; render();
    try {
      const res = await rpc("dr_rate", { p_token: state.session.token, p_drink: id, p_score: score, p_bar: bar, p_comment: comment });
      state.saving = false;
      if (res.error === "BAD_TOKEN") { logout(); return; }
      if (res.error) { render(); toast("Kunne ikke lagre. Prøv igjen."); return; }
      const me = norm(state.session.name);
      state.ratings = state.ratings.filter((r) => !(r.drink === id && norm(r.name) === me));
      if (!remove) state.ratings.unshift({ drink: id, name: state.session.name, score, bar, comment: comment || null, at: new Date().toISOString() });
      closeSheet();
      toast(remove ? "Vurdering fjernet" : `Lagret: ${score}/10 for ${d.name}`);
      refresh();
    } catch {
      state.saving = false; render(); toast(ERR.NETWORK);
    }
  }

  // ── Events ─────────────────────────────────────────────────
  let lastTaps = []; // score taps, to catch a quick 6 → 7

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, .backdrop");
    if (!t) return;
    const ds = t.dataset;
    if (ds.pick) {
      Object.assign(login, { mode: isRegistered(ds.pick) ? "pin" : "new", name: ds.pick, error: "" });
      drawLogin();
      return;
    }
    if (ds.tab) { state.tab = ds.tab; render(); window.scrollTo(0, 0); return; }
    if (ds.bar) { state.bar = ds.bar; render(); return; }
    if (ds.cat) { state.cat = ds.cat; render(); return; }
    if (ds.topcat) { state.topCat = ds.topcat; render(); return; }
    if (ds.drink) { openDrink(ds.drink); return; }
    if (ds.score) {
      const n = Number(ds.score);
      state.draft.score = n;
      render();
      const now = Date.now();
      lastTaps = [...lastTaps.filter((x) => now - x.t < 2000), { n, t: now }].slice(-2);
      if (lastTaps.length === 2 && lastTaps[0].n === 6 && lastTaps[1].n === 7) { lastTaps = []; sixSeven(); }
      return;
    }
    if (ds.pickbar !== undefined) { state.draft.bar = ds.pickbar; render(); return; }
    switch (ds.act) {
      case "retry": login.error = ""; renderLogin(); break;
      case "back": Object.assign(login, { mode: "pick", error: "" }); drawLogin(); break;
      case "menu": state.sheet = "menu"; state.sheetOpened = true; document.body.style.overflow = "hidden"; render(); break;
      case "close": closeSheet(); break;
      case "save": saveRating(false); break;
      case "remove": saveRating(true); break;
      case "refresh": closeSheet(); refresh(); toast("Oppdatert"); break;
      case "logout": document.body.style.overflow = ""; logout(); break;
    }
  });

  root.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    submitLogin(form, form.dataset.form);
  });

  // "67" typed into the search or a comment → 6-7 animation (once per time it appears).
  let had67 = { q: false, comment: false };
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.name === "pin" || el.name === "pin2") { el.value = el.value.replace(/\D/g, "").slice(0, 4); return; }
    if (el.name === "q") { state.q = el.value; updateResults(); }
    else if (el.name === "comment" && state.draft) state.draft.comment = el.value;
    else return;
    const now = has67(el.value);
    if (now && !had67[el.name]) sixSeven();
    had67[el.name] = now;
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.sheet) closeSheet(); });

  function updateResults() {
    const el = document.getElementById("results");
    if (el) el.innerHTML = listResults();
  }

  function onScroll() {
    root.querySelector(".top")?.classList.toggle("scrolled", window.scrollY > 4);
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // Keep everyone's ratings fresh without a manual reload.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.sheet) refresh(); });
  setInterval(() => { if (!document.hidden && !state.sheet && state.session) refresh(); }, 60000);

  if (state.session && CFG.url && CFG.key) startApp();
  else renderLogin();
})();
