(() => {
  "use strict";

  const CFG = window.DR_CONFIG || {};
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
  const STAR_WORDS = ["", "Nei takk", "Grei nok", "God", "Veldig god", "Perfekt!"];
  const AVATAR_COLORS = ["#e2553f", "#0d6b86", "#e39b21", "#5b8c5a", "#8a5cb8", "#c2577f", "#3d7fd1", "#a0703c"];
  const LS_KEY = "drinkrate.session";

  const root = document.getElementById("root");
  const toastEl = document.getElementById("toast");

  // ── Helpers ────────────────────────────────────────────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const initial = (name) => esc((name || "?").trim().charAt(0).toUpperCase());
  const colorFor = (name) => {
    let h = 0;
    for (const ch of norm(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };
  const fmt = (n) => n.toFixed(1).replace(".", ",");
  const miniStars = (n) => "★".repeat(n) + `<i>${"★".repeat(5 - n)}</i>`;
  const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
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

  // ── API ────────────────────────────────────────────────────
  const ERR = {
    NAME_TAKEN: "Det navnet er allerede tatt. Velg det i lista over for å logge inn.",
    BAD_NAME: "Skriv et navn (maks 24 tegn).",
    BAD_PIN: "Feil PIN-kode. Prøv igjen.",
    NO_USER: "Fant ingen med det navnet.",
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
    ratings: [], // { drink, name, stars, comment, at }
    loaded: false,
    tab: "list",
    bar: "all",
    cat: "all",
    q: "",
    topCat: "all",
    sheet: null, // drink id | "menu"
    draft: null, // { stars, comment }
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
      state.ratings = data.ratings || [];
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
    return { avg: list.reduce((s, r) => s + r.stars, 0) / list.length, n: list.length };
  }
  function myRating(list) {
    const me = norm(state.session?.name);
    return (list || []).find((r) => norm(r.name) === me) || null;
  }

  // ── Login screen ───────────────────────────────────────────
  const login = { mode: "pick", name: "", error: "", busy: false };

  async function renderLogin() {
    if (!CFG.url || !CFG.key) {
      root.innerHTML = `<div class="wrap login">${brand()}<div class="panel"><h2>Nesten klar</h2>
        <p class="hint">Siden er ikke koblet til databasen ennå. Legg inn Supabase-adressen og nøkkelen i <b>config.js</b>.</p></div></div>`;
      return;
    }
    drawLogin();
    try {
      state.users = await rpc("dr_list_users", {});
      if (!state.users.length && login.mode === "pick") login.mode = "new";
    } catch {
      login.error = ERR.NETWORK;
    }
    if (!state.session) drawLogin();
  }

  function brand() {
    return `<div class="brand"><img class="brand-mark" src="icon-192.png" alt="">
      <h1>DrinkRate</h1><p>Familiens drinkguide fra ferien</p></div>`;
  }

  function drawLogin() {
    let body;
    if (login.mode === "pick") {
      body = `<h2>Hvem er du?</h2>
        <div class="people">
          ${state.users.map((n) => `<button class="person" data-pick="${esc(n)}">${esc(n)}</button>`).join("")}
          <button class="person new" data-act="new">+ Ny person</button>
        </div>`;
    } else if (login.mode === "pin") {
      body = `<h2>Hei, ${esc(login.name)}!</h2>
        <form data-form="login">
          <label class="field"><span>Din PIN-kode</span>
            <input class="input pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" required autofocus></label>
          <p class="error">${esc(login.error)}</p>
          <button class="btn" ${login.busy ? "disabled" : ""}>Logg inn</button>
        </form>
        <button class="link" data-act="back">Ikke deg? Velg et annet navn</button>`;
    } else {
      body = `<h2>Lag din bruker</h2>
        <form data-form="register">
          <label class="field"><span>Navn</span>
            <input class="input" name="name" maxlength="24" autocomplete="nickname" required value="${esc(login.name)}" placeholder="F.eks. Mamma"></label>
          <label class="field"><span>Velg en PIN-kode (4 tall)</span>
            <input class="input pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" required></label>
          <p class="hint">PIN-koden brukes når du logger inn på en ny telefon.</p>
          <p class="error">${esc(login.error)}</p>
          <button class="btn coral" ${login.busy ? "disabled" : ""}>Kom i gang</button>
        </form>
        ${state.users.length ? `<button class="link" data-act="back">Har allerede bruker</button>` : ""}`;
    }
    if (login.mode === "pick" && login.error) body += `<p class="error">${esc(login.error)}</p>`;
    root.innerHTML = `<div class="wrap login">${brand()}<div class="panel">${body}</div></div>`;
    const pin = root.querySelector("input[name=pin]");
    if (pin && login.mode === "pin") pin.focus();
  }

  async function submitLogin(form, kind) {
    const pin = form.pin.value.trim();
    const name = kind === "register" ? form.name.value.trim() : login.name;
    if (kind === "register") login.name = name;
    if (!/^\d{4}$/.test(pin)) { login.error = "PIN-koden må være 4 tall."; drawLogin(); return; }
    if (!name) { login.error = ERR.BAD_NAME; drawLogin(); return; }
    login.busy = true; login.error = ""; drawLogin();
    try {
      const res = await rpc(kind === "register" ? "dr_register" : "dr_login", { p_name: name, p_pin: pin });
      login.busy = false;
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
          ${state.bar === "all" || lead ? `<span class="pill">${esc(BAR[d.bar].name)}</span>` : ""}
          ${mine ? `<span class="pill mine">Du: ${mine.stars} ★</span>` : `<span class="pill todo">Ikke smakt</span>`}
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
      ${chips([{ id: "all", name: "Alle barer" }, ...BARS], state.bar, "bar")}
      ${chips(CATS, state.cat, "cat")}
      <div id="results">${listResults()}</div>`;
  }

  function listResults() {
    const map = byDrink();
    const q = norm(state.q);
    const hits = DRINKS.filter((d) =>
      (state.bar === "all" || d.bar === state.bar) &&
      (state.cat === "all" || d.cat === state.cat) &&
      (!q || norm(d.name + " " + d.desc).includes(q)));

    let html = "";
    if (!hits.length) return `<div class="empty"><b>Ingen treff</b>Prøv et annet søk eller filter.</div>`;

    for (const bar of BARS) {
      const rows = hits.filter((d) => d.bar === bar.id);
      if (!rows.length) continue;
      html += `<div class="section-title"><h2>${esc(bar.name)}</h2><small>${esc(bar.sub)}</small></div>
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
      return html + `<div class="empty"><b>Ingen vurderinger ennå</b>Gå til «Drinker» og gi stjerner til det du har smakt.</div>`;
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
      .filter((r) => norm(r.name) === me && DRINK[r.drink])
      .sort((a, b) => b.stars - a.stars || String(b.at).localeCompare(String(a.at)));

    let html = `<div class="stats">
        <div class="stat"><b>${mine.length}</b><span>smakt</span></div>
        <div class="stat"><b>${DRINKS.length - mine.length}</b><span>igjen</span></div>
        <div class="stat"><b>${mine.length ? fmt(mine.reduce((s, r) => s + r.stars, 0) / mine.length) : "–"}</b><span>ditt snitt</span></div>
      </div>`;
    if (!mine.length) {
      return html + `<div class="empty"><b>Du har ikke vurdert noe ennå</b>Trykk på en drink under «Drinker» for å gi stjerner.</div>`;
    }
    html += `<div class="section-title"><h2>Dine favoritter</h2></div>
      <div class="list">${mine.map((r) => drinkRow(DRINK[r.drink], map, "")).join("")}</div>`;
    return html;
  }

  // ── Sheet ──────────────────────────────────────────────────
  function openDrink(id) {
    const mine = myRating(byDrink()[id]);
    state.sheet = id;
    state.sheetOpened = true;
    state.draft = { stars: mine?.stars || 0, comment: mine?.comment || "" };
    render();
    document.body.style.overflow = "hidden";
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
          <p class="hint">Tips: Legg siden til på hjemskjermen (Del → «Legg til på Hjem-skjerm») så åpner den som en app.</p>
          <button class="btn" data-act="refresh">Oppdater</button>
          <button class="btn ghost" style="width:100%" data-act="logout">Logg ut</button>
        </div></div>`;
    }
    const d = DRINK[state.sheet];
    const list = (byDrink()[d.id] || []).slice().sort((a, b) => b.stars - a.stars);
    const s = summary(list);
    const mine = myRating(list);
    const st = state.draft.stars;
    return `<div class="backdrop" data-act="close"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.name)}"><div class="wrap">
        <div class="grab"></div>
        <div class="sheet-head">
          <div><h2>${esc(d.name)}</h2><div class="where">${esc(BAR[d.bar].name)}${d.tag ? ` · ${esc(d.tag)}` : ""}</div></div>
          <button class="close" data-act="close" aria-label="Lukk">${ICONS.close}</button>
        </div>
        <p class="desc">${esc(d.desc)}</p>
        ${d.flav ? `<p class="flav">Smaker: ${esc(d.flav)}</p>` : ""}

        <div class="rate-box">
          <h3>${mine ? "Din vurdering" : "Hva syns du?"}</h3>
          <div class="stars" role="radiogroup" aria-label="Stjerner">
            ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= st ? "on" : ""}" data-star="${n}" role="radio" aria-checked="${n === st}" aria-label="${n} stjerner">${STAR_SVG}</button>`).join("")}
          </div>
          <div class="star-label">${STAR_WORDS[st] || "&nbsp;"}</div>
          <textarea class="input" name="comment" maxlength="300" placeholder="Kommentar (valgfritt)">${esc(state.draft.comment)}</textarea>
          <div class="row">
            ${mine ? `<button class="btn ghost" data-act="remove" ${state.saving ? "disabled" : ""}>Fjern</button>` : ""}
            <button class="btn coral" data-act="save" ${!st || state.saving ? "disabled" : ""}>${state.saving ? "Lagrer …" : mine ? "Oppdater" : "Lagre"}</button>
          </div>
        </div>

        <div class="family">
          <h3>Familien ${s ? `· ${fmt(s.avg)} ★` : ""}</h3>
          ${list.length ? list.map((r) => `<div class="review">
              <div class="avatar" style="background:${colorFor(r.name)}">${initial(r.name)}</div>
              <div class="review-body">
                <div class="review-top"><span>${esc(r.name)}</span><span class="mini-stars">${miniStars(r.stars)}</span></div>
                ${r.comment ? `<p>${esc(r.comment)}</p>` : ""}
              </div></div>`).join("")
            : `<p class="hint">Ingen har vurdert denne ennå. Bli den første!</p>`}
        </div>
      </div></div>`;
  }

  async function saveRating(remove) {
    const id = state.sheet;
    const stars = remove ? null : state.draft.stars;
    const comment = remove ? null : state.draft.comment.trim();
    state.saving = true; render();
    try {
      const res = await rpc("dr_rate", { p_token: state.session.token, p_drink: id, p_stars: stars, p_comment: comment });
      state.saving = false;
      if (res.error === "BAD_TOKEN") { logout(); return; }
      if (res.error) { render(); toast("Kunne ikke lagre. Prøv igjen."); return; }
      const me = norm(state.session.name);
      state.ratings = state.ratings.filter((r) => !(r.drink === id && norm(r.name) === me));
      if (!remove) state.ratings.unshift({ drink: id, name: state.session.name, stars, comment: comment || null, at: new Date().toISOString() });
      closeSheet();
      toast(remove ? "Vurdering fjernet" : `Lagret: ${stars} ★ for ${DRINK[id].name}`);
      refresh();
    } catch {
      state.saving = false; render(); toast(ERR.NETWORK);
    }
  }

  // ── Events ─────────────────────────────────────────────────
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, .backdrop");
    if (!t) return;
    const ds = t.dataset;
    if (ds.pick) { Object.assign(login, { mode: "pin", name: ds.pick, error: "" }); drawLogin(); return; }
    if (ds.tab) { state.tab = ds.tab; render(); window.scrollTo(0, 0); return; }
    if (ds.bar) { state.bar = ds.bar; render(); return; }
    if (ds.cat) { state.cat = ds.cat; render(); return; }
    if (ds.topcat) { state.topCat = ds.topcat; render(); return; }
    if (ds.drink) { openDrink(ds.drink); return; }
    if (ds.star) {
      state.draft.comment = root.querySelector("textarea[name=comment]")?.value ?? state.draft.comment;
      state.draft.stars = Number(ds.star);
      render();
      return;
    }
    switch (ds.act) {
      case "new": Object.assign(login, { mode: "new", name: "", error: "" }); drawLogin(); break;
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

  root.addEventListener("input", (e) => {
    if (e.target.name === "q") { state.q = e.target.value; updateResults(); }
    else if (e.target.name === "comment" && state.draft) state.draft.comment = e.target.value;
    else if (e.target.name === "pin") e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
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
