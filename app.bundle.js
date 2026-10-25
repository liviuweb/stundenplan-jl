(() => {
  // js/api.js
  var API_URL = typeof window !== "undefined" && window.KG_API_URL || "";
  var PW_KEY = "kg.pw";
  var DEMO_KEY = "kg.demo";
  var demo = !API_URL;
  var ls = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {
      }
    }
  };
  var savedPassword = () => ls.get(PW_KEY);
  var forget = () => ls.del(PW_KEY);
  var uid = () => Math.random().toString(36).slice(2, 10);
  function demoDb() {
    try {
      return JSON.parse(ls.get(DEMO_KEY)) || { players: [], matches: [] };
    } catch {
      return { players: [], matches: [] };
    }
  }
  var demoSave = (db) => ls.set(DEMO_KEY, JSON.stringify(db));
  async function demoCall(action, data) {
    if (!data.pw) return { ok: false, code: "auth", error: "Passwort fehlt" };
    const db = demoDb();
    switch (action) {
      case "login":
        return { ok: true };
      case "load":
        return { ok: true, players: db.players, matches: db.matches };
      case "addPlayer": {
        const name = String(data.name || "").trim();
        if (!name) return { ok: false, error: "Name fehlt" };
        if (db.players.some((p2) => p2.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "Diesen Namen gibt es schon" };
        const p = { id: uid(), name, created: (/* @__PURE__ */ new Date()).toISOString(), looks: data.looks || {} };
        db.players.push(p);
        demoSave(db);
        return { ok: true, player: p };
      }
      case "updatePlayer": {
        const p = db.players.find((x) => x.id === data.player.id);
        if (!p) return { ok: false, error: "Spieler nicht gefunden" };
        if (data.player.name) p.name = data.player.name.trim();
        if (data.player.looks) p.looks = data.player.looks;
        demoSave(db);
        return { ok: true, player: p };
      }
      case "deletePlayer":
        if (!data.pw2) return { ok: false, code: "auth2", error: "L\xF6sch-Passwort fehlt" };
        db.players = db.players.filter((p) => p.id !== data.id);
        demoSave(db);
        return { ok: true };
      case "saveMatch": {
        const m = data.match;
        if (!m.id) {
          m.id = uid();
          m.created = (/* @__PURE__ */ new Date()).toISOString();
        }
        m.updated = (/* @__PURE__ */ new Date()).toISOString();
        const i = db.matches.findIndex((x) => x.id === m.id);
        if (i >= 0) db.matches[i] = m;
        else db.matches.push(m);
        demoSave(db);
        return { ok: true, match: m };
      }
      case "deleteMatch":
        db.matches = db.matches.filter((m) => m.id !== data.id);
        demoSave(db);
        return { ok: true };
    }
    return { ok: false, error: "Unbekannte Aktion" };
  }
  async function call(action, data = {}) {
    const pw = data.pw ?? savedPassword();
    const body = { action, pw, ...data };
    let res;
    if (demo) res = await demoCall(action, body);
    else {
      try {
        const r = await fetch(API_URL, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" } });
        res = await r.json();
      } catch (e) {
        res = { ok: false, error: "Keine Verbindung zur Tabelle. Bitte Internet pr\xFCfen.", code: "net" };
      }
    }
    if (!res.ok) {
      const err = new Error(res.error || "Fehler");
      err.code = res.code;
      throw err;
    }
    return res;
  }
  async function login(pw) {
    await call("login", { pw });
    ls.set(PW_KEY, pw);
  }

  // js/store.js
  var store = { players: [], matches: [], loaded: false };
  var listeners = /* @__PURE__ */ new Set();
  var onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
  var emit = () => listeners.forEach((f) => f());
  async function load() {
    const r = await call("load");
    store.players = r.players || [];
    store.matches = r.matches || [];
    store.loaded = true;
    emit();
  }
  async function addPlayer(name) {
    const r = await call("addPlayer", { name });
    store.players.push(r.player);
    emit();
    return r.player;
  }
  async function updatePlayer(player2) {
    await call("updatePlayer", { player: player2 });
    const p = store.players.find((x) => x.id === player2.id);
    if (p) Object.assign(p, player2);
    emit();
  }
  async function deletePlayer(id, pw2) {
    await call("deletePlayer", { id, pw2 });
    store.players = store.players.filter((p) => p.id !== id);
    emit();
  }
  async function saveMatch(match) {
    match.names = Object.fromEntries(match.players.map((id) => [id, playerName(id, match)]));
    const r = await call("saveMatch", { match });
    const i = store.matches.findIndex((m) => m.id === r.match.id);
    if (i >= 0) store.matches[i] = r.match;
    else store.matches.push(r.match);
    emit();
    return r.match;
  }
  async function deleteMatch(id) {
    await call("deleteMatch", { id });
    store.matches = store.matches.filter((m) => m.id !== id);
    emit();
  }
  var player = (id) => store.players.find((p) => p.id === id);
  var playerName = (id, m) => player(id)?.name || m?.names?.[id] || "\u2013";
  var playersByCreated = () => [...store.players].sort((a, b) => String(a.created).localeCompare(String(b.created)) || a.name.localeCompare(b.name));
  var matchesOf = (game, filter = () => true) => store.matches.filter((m) => m.game === game && filter(m)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created).localeCompare(String(b.created)));
  function perPlayer(matches, { total = (m, pid) => m.totals?.[pid], lowWins = false } = {}) {
    const map = /* @__PURE__ */ new Map();
    for (const m of matches) {
      for (const pid of m.players || []) {
        if (!map.has(pid)) map.set(pid, { id: pid, name: playerName(pid, m), games: 0, wins: 0, totals: [], dates: [], results: [] });
        const s = map.get(pid);
        s.games++;
        const won = (m.winners || []).includes(pid);
        if (won) s.wins++;
        const t = total(m, pid);
        if (t != null && t !== "") s.totals.push(+t);
        s.dates.push(m.date);
        s.results.push({ m, won, total: t != null ? +t : null });
      }
    }
    for (const s of map.values()) {
      s.rate = s.games ? s.wins / s.games : 0;
      s.avg = s.totals.length ? s.totals.reduce((a, b) => a + b, 0) / s.totals.length : null;
      s.best = s.totals.length ? lowWins ? Math.min(...s.totals) : Math.max(...s.totals) : null;
      s.worst = s.totals.length ? lowWins ? Math.max(...s.totals) : Math.min(...s.totals) : null;
      s.streak = longestStreak(s.results);
      s.current = currentStreak(s.results);
      s.last = s.dates[s.dates.length - 1];
    }
    return [...map.values()];
  }
  function longestStreak(results) {
    let best = 0, cur = 0;
    for (const r of results) {
      cur = r.won ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  }
  function currentStreak(results) {
    let cur = 0;
    for (let i = results.length - 1; i >= 0 && results[i].won; i--) cur++;
    return cur;
  }
  var top = (list2, key, { min = 1, low = false, filter = (s) => s.games >= min } = {}) => {
    const l = list2.filter((s) => filter(s) && s[key] != null);
    if (!l.length) return null;
    const v = low ? Math.min(...l.map((s) => s[key])) : Math.max(...l.map((s) => s[key]));
    return { value: v, who: l.filter((s) => s[key] === v) };
  };
  function places(totals, lowWins = false) {
    const ids = Object.keys(totals);
    const sorted = [...ids].sort((a, b) => lowWins ? totals[a] - totals[b] : totals[b] - totals[a]);
    const out = {};
    sorted.forEach((id, i) => {
      out[id] = i > 0 && totals[id] === totals[sorted[i - 1]] ? out[sorted[i - 1]] : i + 1;
    });
    return out;
  }
  var DKEY = (g2) => `kg.draft.${g2}`;
  var draft = {
    get(g2) {
      try {
        return JSON.parse(localStorage.getItem(DKEY(g2)));
      } catch {
        return null;
      }
    },
    set(g2, v) {
      try {
        localStorage.setItem(DKEY(g2), JSON.stringify(v));
      } catch {
      }
    },
    clear(g2) {
      try {
        localStorage.removeItem(DKEY(g2));
      } catch {
      }
    }
  };

  // js/ui.js
  var $ = (s, el = document) => el.querySelector(s);
  var $$ = (s, el = document) => [...el.querySelectorAll(s)];
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var today = () => {
    const d = /* @__PURE__ */ new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  var fmtDate = (iso, opts = { day: "2-digit", month: "2-digit", year: "numeric" }) => {
    if (!iso) return "\u2013";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("de-DE", opts);
  };
  var fmtNum = (n, d = 1) => n == null || Number.isNaN(n) ? "\u2013" : (+n).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  var fmtPct = (r) => r == null ? "\u2013" : `${Math.round(r * 100)} %`;
  var plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  var toastT;
  function toast(html, { icon = "", ms = 3600 } = {}) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.append(t);
    }
    t.innerHTML = `${icon}<div>${html}</div>`;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), ms);
  }
  function modal({ title = "", body = "", actions = [{ label: "OK", value: true, primary: true }], onMount, cls = "" } = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = `modal-wrap ${cls}`;
      wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${title ? `<h2 class="modal-title">${esc(title)}</h2>` : ""}
      <div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => `<button type="button" class="btn ${a.primary ? "btn-primary" : a.danger ? "btn-danger" : "btn-ghost"}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>
    </div>`;
      const close = (v) => {
        wrap.classList.remove("open");
        setTimeout(() => wrap.remove(), 200);
        document.removeEventListener("keydown", onKey);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(void 0);
      };
      wrap.addEventListener("click", async (e) => {
        if (e.target === wrap) return close(void 0);
        const b = e.target.closest(".modal-actions [data-i]");
        if (!b) return;
        const a = actions[+b.dataset.i];
        if (a.handler) {
          const r = await a.handler(wrap);
          if (r === false) return;
          close(r ?? a.value);
        } else close(a.value);
      });
      document.addEventListener("keydown", onKey);
      document.body.append(wrap);
      requestAnimationFrame(() => wrap.classList.add("open"));
      onMount?.(wrap);
      setTimeout(() => (wrap.querySelector("input,select,textarea") || wrap.querySelector(".btn-primary"))?.focus(), 60);
    });
  }
  var confirmBox = (text, { title = "Sicher?", ok = "Ja", danger = false } = {}) => modal({ title, body: `<p>${text}</p>`, actions: [{ label: "Abbrechen", value: false }, { label: ok, value: true, primary: !danger, danger }] });
  var seg = (name, options, value, cls = "") => `<div class="seg ${cls}" role="group" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === value}">${l}</button>`).join("")}</div>`;
  var details = (summary, inner, open = false) => `<details class="more" ${open ? "open" : ""}><summary><span>${summary}</span><i aria-hidden="true"></i></summary><div class="more-body">${inner}</div></details>`;
  var tipEl;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "chart-tip";
      document.body.append(tipEl);
      document.addEventListener("pointermove", (e) => {
        const t = e.target.closest?.("[data-tip]");
        if (!t) {
          tipEl.classList.remove("show");
          return;
        }
        tipEl.innerHTML = t.dataset.tip;
        const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 12), y = Math.max(8, e.clientY - tipEl.offsetHeight - 12);
        tipEl.style.transform = `translate(${x}px,${y}px)`;
        tipEl.classList.add("show");
      });
    }
  }
  function lineChart(series, { height = 200, yLabel = "", xLabels = [] } = {}) {
    tip();
    const W = 640, H = height, L = 36, R = 12, T = 12, B = 26;
    const all = series.flatMap((s) => s.points.map((p) => p.y));
    if (!all.length) return '<p class="empty">Noch keine Daten.</p>';
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.1;
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);
    const n = Math.max(2, ...series.map((s) => s.points.length));
    const X = (i) => L + (W - L - R) * i / (n - 1), Y = (v) => T + (H - T - B) * (hi - v) / (hi - lo);
    const ticks = niceTicks(lo, hi, 4);
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)}">`;
    svg += ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${fmtNum(t, 0)}</text>`).join("");
    const step = Math.ceil(n / 6);
    xLabels.forEach((l, i) => {
      if (i % step === 0 || i === xLabels.length - 1) svg += `<text class="ax" x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`;
    });
    for (const s of series) {
      if (!s.points.length) continue;
      const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.i ?? i).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
      svg += `<path class="line" d="${d}" stroke="${s.color}"/>`;
      svg += s.points.map((p, i) => `<circle class="dot" cx="${X(p.i ?? i)}" cy="${Y(p.y)}" r="4" fill="${s.color}"/><circle class="hit" cx="${X(p.i ?? i)}" cy="${Y(p.y)}" r="12" data-tip="<b>${esc(s.name)}</b><br>${esc(p.label ?? "")} ${fmtNum(p.y)}"/>`).join("");
    }
    svg += "</svg>";
    const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
    return `<div class="chart-wrap">${svg}${legend}</div>`;
  }
  function barChart(items, { max, unit = "", digits = 1 } = {}) {
    tip();
    if (!items.length) return '<p class="empty">Noch keine Daten.</p>';
    const m = max ?? Math.max(...items.map((i) => i.value), 1e-4);
    return `<div class="bars">${items.map((i) => `<div class="bar-row" data-tip="<b>${esc(i.label)}</b><br>${fmtNum(i.value, digits)}${unit}${i.note ? " \xB7 " + esc(i.note) : ""}">
      <span class="bar-label">${i.icon || ""}${esc(i.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, i.value / m * 100)}%;background:${i.color || "var(--accent)"}"></span></span>
      <span class="bar-val">${fmtNum(i.value, digits)}${unit}</span></div>`).join("")}</div>`;
  }
  function stackBar(parts, { label = "" } = {}) {
    tip();
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (!total) return "";
    return `<div class="stack" aria-label="${esc(label)}">${parts.filter((p) => p.value).map((p) => `<span style="flex:${p.value};background:${p.color}" data-tip="<b>${esc(p.label)}</b><br>${p.value}\xD7 (${Math.round(p.value / total * 100)} %)"></span>`).join("")}</div>`;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= step0) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  // js/games/common.js
  function playerPicker(el, { game, selected, min = 1, max = 8, single = false, label = "Wer hat mitgespielt?", onChange: onChange2 = () => {
  } }) {
    const draw = () => {
      const ps = playersByCreated();
      el.innerHTML = `<span class="field-label">${esc(label)}</span>
      <div class="chips">${ps.map((p) => `<button class="chip" type="button" data-id="${p.id}" aria-pressed="${selected.has(p.id)}">${game.avatar(p, "dot")}<span>${esc(p.name)}</span></button>`).join("")}
      <button class="chip add" type="button" data-add aria-expanded="false">+ Neuer Spieler</button></div>
      <form class="add-row hidden" data-form><input placeholder="Name" maxlength="24" autocomplete="off" aria-label="Name des neuen Spielers"><button class="btn btn-primary" type="submit">Hinzuf\xFCgen</button></form>
      ${!single && max < 99 ? `<p class="hint">${min === max ? `${min} Spieler` : `${min}\u2013${max} Spieler`}</p>` : ""}`;
    };
    draw();
    el.addEventListener("click", (e) => {
      const c = e.target.closest(".chip[data-id]");
      if (c) {
        const id = c.dataset.id;
        if (single) {
          selected.clear();
          selected.add(id);
        } else if (selected.has(id)) selected.delete(id);
        else if (selected.size < max) selected.add(id);
        else {
          toast(`H\xF6chstens ${max} Spieler.`);
          return;
        }
        draw();
        onChange2();
        return;
      }
      if (e.target.closest("[data-add]")) {
        const f = $("[data-form]", el);
        f.classList.toggle("hidden");
        e.target.closest("[data-add]").setAttribute("aria-expanded", !f.classList.contains("hidden"));
        if (!f.classList.contains("hidden")) $("input", f).focus();
      }
    });
    el.addEventListener("submit", async (e) => {
      e.preventDefault();
      const inp = $("[data-form] input", el), name = inp.value.trim();
      if (!name) return;
      try {
        const p = await addPlayer(name);
        if (single) selected.clear();
        if (single || selected.size < max) selected.add(p.id);
        draw();
        onChange2();
      } catch (err) {
        toast(esc(err.message));
      }
    });
    return { redraw: draw };
  }
  function statTile(title, value, who, note = "", cls = "") {
    return `<article class="stat ${cls}"><h3>${esc(title)}</h3><p class="stat-val">${value}</p>${who ? `<p class="stat-who">${who}</p>` : ""}${note ? `<p class="stat-note">${note}</p>` : ""}</article>`;
  }
  var whoList = (game, list2) => list2.map((s) => `<span class="who">${game.avatar(s.player || { id: s.id, name: s.name }, "mini")}${esc(s.name)}</span>`).join("");
  function leaderboard(game, stats2, cols, { sort = "wins" } = {}) {
    if (!stats2.length) return '<p class="empty">Noch keine Partien in dieser Auswahl.</p>';
    const sorted = [...stats2].sort((a, b) => (b[sort] ?? -1e9) - (a[sort] ?? -1e9) || b.rate - a.rate || (b.avg ?? 0) - (a.avg ?? 0));
    return `<div class="table-wrap"><table class="lb">
    <thead><tr><th class="l">Spieler</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${sorted.map((s, i) => `<tr><td class="l"><span class="rank">${i + 1}</span>${game.avatar({ id: s.id, name: s.name }, "mini")}<span class="nm">${esc(s.name)}</span></td>${cols.map((c) => `<td>${c.fmt ? c.fmt(s[c.key], s) : s[c.key] ?? "\u2013"}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
  }
  function historyList(el, ctx, { matches, line: line2, onEdit }) {
    const g2 = ctx.game;
    const list2 = [...matches].reverse();
    if (!list2.length) {
      el.innerHTML = `<div class="empty-state"><p>Noch keine Partie eingetragen.</p><button class="btn btn-primary" type="button" data-new>Erste Partie eintragen</button></div>`;
      $("[data-new]", el).onclick = () => ctx.go("neu");
      return;
    }
    el.innerHTML = `<ul class="hist">${list2.map((m) => `<li class="hist-item" data-id="${m.id}">
      <div class="hist-head"><span class="hist-date">${fmtDate(m.date)}</span><span class="hist-tags">${(m.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span></div>
      <div class="hist-body">${line2(m)}</div>
      <div class="hist-actions">${onEdit ? '<button class="btn btn-ghost sm" type="button" data-edit>Bearbeiten</button>' : ""}<button class="btn btn-ghost sm" type="button" data-del>L\xF6schen</button></div>
    </li>`).join("")}</ul>`;
    el.addEventListener("click", async (e) => {
      const li = e.target.closest(".hist-item");
      if (!li) return;
      const m = matches.find((x) => x.id === li.dataset.id);
      if (e.target.closest("[data-del]")) {
        if (!await confirmBox(`Partie vom ${fmtDate(m.date)} wirklich l\xF6schen?`, { ok: "L\xF6schen", danger: true })) return;
        try {
          await deleteMatch(m.id);
          toast("Partie gel\xF6scht.");
          ctx.rerender();
        } catch (err) {
          toast(esc(err.message));
        }
      }
      if (e.target.closest("[data-edit]")) onEdit(m);
    });
  }
  function rankedLine(game, m, { lowWins = false, unit = "" } = {}) {
    const ids = [...m.players].sort((a, b) => (m.places?.[a] ?? 9) - (m.places?.[b] ?? 9));
    return `<ol class="res">${ids.map((id) => `<li class="${(m.winners || []).includes(id) ? "win" : ""}">${game.avatar({ id, name: playerName(id, m) }, "mini")}<span class="nm">${esc(playerName(id, m))}</span>${m.totals?.[id] != null ? `<b>${fmtNum(m.totals[id])}${unit}</b>` : ""}</li>`).join("")}</ol>`;
  }
  function trendChart(game, matches, value, { colors, label = "" } = {}) {
    const ids = [...new Set(matches.flatMap((m) => m.players))];
    const series = ids.map((id, k) => {
      const pts = [];
      matches.forEach((m, i) => {
        if (m.players.includes(id)) {
          const v = value(m, id);
          if (v != null) pts.push({ i, y: v, label: fmtDate(m.date, { day: "2-digit", month: "2-digit" }) });
        }
      });
      return { name: playerName(id, matches.find((m) => m.players.includes(id))), color: colors(id, k), points: pts };
    }).filter((s) => s.points.length);
    return lineChart(series, { yLabel: label, xLabels: matches.map((m) => fmtDate(m.date, { day: "2-digit", month: "2-digit" })) });
  }
  function headToHead(game, matches, a, b, { lowWins = false } = {}) {
    const both = matches.filter((m) => m.players.includes(a) && m.players.includes(b));
    if (!both.length) return '<p class="empty">Die beiden haben noch nicht zusammen gespielt.</p>';
    let wa = 0, wb = 0;
    for (const m of both) {
      if (m.totals) {
        const x = m.totals[a], y = m.totals[b];
        if (x == null || y == null) continue;
        if (lowWins ? x < y : x > y) wa++;
        else if (x !== y) wb++;
      } else {
        if ((m.winners || []).includes(a)) wa++;
        if ((m.winners || []).includes(b)) wb++;
      }
    }
    const na = playerName(a, both[0]), nb = playerName(b, both[0]);
    return `<div class="h2h"><div>${game.avatar({ id: a, name: na }, "big")}<b>${esc(na)}</b><span class="h2h-n">${wa}</span></div><span class="h2h-vs">${plural(both.length, "gemeinsame Partie", "gemeinsame Partien")}</span><div>${game.avatar({ id: b, name: nb }, "big")}<b>${esc(nb)}</b><span class="h2h-n">${wb}</span></div></div>`;
  }
  function h2hBlock(el, game, matches, opts) {
    const ids = [...new Set(matches.flatMap((m) => m.players))];
    if (ids.length < 2) {
      el.innerHTML = '<p class="empty">Daf\xFCr braucht es mindestens zwei Spieler.</p>';
      return;
    }
    let a = ids[0], b = ids[1];
    const name = (id) => playerName(id, matches.find((m) => m.players.includes(id)));
    const draw = () => {
      el.innerHTML = `<div class="h2h-pick"><select data-a aria-label="Erster Spieler">${ids.map((i) => `<option value="${i}" ${i === a ? "selected" : ""}>${esc(name(i))}</option>`).join("")}</select>
      <span>gegen</span><select data-b aria-label="Zweiter Spieler">${ids.map((i) => `<option value="${i}" ${i === b ? "selected" : ""}>${esc(name(i))}</option>`).join("")}</select></div>${headToHead(game, matches, a, b, opts)}`;
      $("[data-a]", el).onchange = (e) => {
        a = e.target.value;
        draw();
      };
      $("[data-b]", el).onchange = (e) => {
        b = e.target.value;
        draw();
      };
    };
    draw();
  }
  function roundsGame(cfg) {
    function totalsOf(rounds, players) {
      const t = Object.fromEntries(players.map((p) => [p, 0]));
      for (const r of rounds) for (const p of players) t[p] += +(r.final?.[p] ?? r.scores[p] ?? 0);
      return t;
    }
    function finalize(round, players) {
      const final = { ...round.scores };
      if (cfg.extra === "closer" && round.closer) {
        const c = round.closer, v = +final[c];
        const others = players.filter((p) => p !== c).map((p) => +final[p]);
        if (v > 0 && others.some((o) => o <= v)) {
          final[c] = v * 2;
          round.doubled = true;
        } else round.doubled = false;
      }
      if (cfg.extra === "roundWinner" && round.winner) final[round.winner] = 0;
      round.final = final;
      return round;
    }
    const maxR = (n) => cfg.maxRounds ? cfg.maxRounds(n) : null;
    function ended(totals, dd) {
      return cfg.target != null && Object.values(totals).some((v) => v >= cfg.target) || dd && maxR(dd.players.length) != null && dd.rounds.length >= maxR(dd.players.length);
    }
    function newTab(el, ctx) {
      const g2 = ctx.game;
      let d = draft.get(cfg.id);
      if (!d) return setup();
      live();
      function setup() {
        const sel = /* @__PURE__ */ new Set();
        el.innerHTML = `<section class="panel">
          <div class="row"><label class="field"><span>Gespielt am</span><input type="date" id="rDate" value="${today()}"></label></div>
          <div id="rPick"></div>
          <button class="btn btn-primary wide" type="button" id="rStart" disabled>Spiel starten</button>
          <p class="hint">${cfg.labels.startHint}</p>
        </section>`;
        const btn = $("#rStart", el);
        playerPicker($("#rPick", el), { game: g2, selected: sel, min: cfg.min, max: cfg.max, onChange: () => btn.disabled = sel.size < cfg.min });
        btn.onclick = () => {
          d = { date: $("#rDate", el).value || today(), players: [...sel], rounds: [] };
          draft.set(cfg.id, d);
          live();
        };
      }
      function live() {
        const P = d.players, totals = totalsOf(d.rounds, P), pl = places(totals, cfg.lowWins);
        const isEnd = ended(totals, d), mr = maxR(P.length);
        const order = [...P].sort((a, b) => pl[a] - pl[b]);
        el.innerHTML = `
        <section class="panel score-head">
          <div class="sh-top"><span>${fmtDate(d.date)}</span><span>${mr ? `Runde ${Math.min(d.rounds.length, mr)} von ${mr}` : plural(d.rounds.length, "Runde", "Runden")}${cfg.target ? ` \xB7 Ziel ${cfg.target}` : ""}</span></div>
          <ol class="standings">${order.map((p) => `<li class="${pl[p] === 1 && d.rounds.length ? "lead" : ""}">
            <span class="st-place">${pl[p]}.</span>${g2.avatar({ id: p, name: playerName(p) }, "dot")}<span class="nm">${esc(playerName(p))}</span><b>${fmtNum(totals[p], 0)}</b>
            ${cfg.target ? `<span class="prog"><i style="width:${Math.min(100, Math.max(0, totals[p] / cfg.target * 100))}%"></i></span>` : ""}</li>`).join("")}</ol>
        </section>
        ${isEnd ? `<section class="panel end-note"><p><b>${esc(order.filter((p) => pl[p] === 1).map((p) => playerName(p)).join(" & "))}</b> ${cfg.target != null && !mr ? `hat ${cfg.target} Punkte geknackt` : "liegt vorne \u2013 alle Runden sind gespielt"}. Jetzt speichern!</p></section>` : roundForm()}
        ${d.rounds.length ? roundTable(P) : ""}
        <div class="live-actions">
          ${d.rounds.length ? '<button class="btn btn-ghost" type="button" data-undo>Letzte Runde l\xF6schen</button>' : ""}
          <button class="btn btn-ghost" type="button" data-cancel>Abbrechen</button>
          <button class="btn btn-primary" type="button" data-finish ${d.rounds.length ? "" : "disabled"}>Spiel beenden & speichern</button>
        </div>`;
        bindRound(P);
        $("[data-undo]", el)?.addEventListener("click", () => {
          d.rounds.pop();
          draft.set(cfg.id, d);
          live();
        });
        $("[data-cancel]", el).onclick = async () => {
          if (await confirmBox("Laufendes Spiel verwerfen? Die Runden gehen verloren.", { ok: "Verwerfen", danger: true })) {
            draft.clear(cfg.id);
            d = null;
            setup();
          }
        };
        $("[data-finish]", el).onclick = () => finish(totals, pl);
      }
      function roundForm() {
        const P = d.players, n = d.rounds.length + 1;
        return `<section class="panel round-form">
        <h2 class="panel-title">Runde ${n}${cfg.extra === "wizard" ? ` <small class="muted">\xB7 ${plural(n, "Karte", "Karten")} je Spieler</small>` : ""}</h2>
        ${cfg.extra === "roundWinner" ? `<span class="field-label">Wer hat die Runde gewonnen?</span><div class="chips" data-rw>${P.map((p) => `<button class="chip" type="button" data-id="${p}" aria-pressed="false">${g2.avatar({ id: p, name: playerName(p) }, "dot")}<span>${esc(playerName(p))}</span></button>`).join("")}</div>` : ""}
        <div class="rinputs">${P.map((p) => `<div class="rin" data-p="${p}">
            <span class="rin-name">${g2.avatar({ id: p, name: playerName(p) }, "dot")}${esc(playerName(p))}</span>
            ${cfg.extra === "wizard" ? `<span class="rin-wz"><label><small>Ansage</small><input type="number" inputmode="numeric" min="0" max="${n}" data-bid="${p}" placeholder="0" aria-label="Ansage ${esc(playerName(p))}"></label><label><small>Stiche</small><input type="number" inputmode="numeric" min="0" max="${n}" data-tricks="${p}" placeholder="0" aria-label="Stiche ${esc(playerName(p))}"></label></span>` : `<span class="rin-num">${cfg.negative ? `<button type="button" class="pm" data-pm="${p}" aria-label="Vorzeichen umdrehen">\xB1</button>` : ""}<input type="${cfg.negative ? "text" : "number"}" inputmode="numeric" pattern="-?[0-9]*" step="1" data-score="${p}" placeholder="0" aria-label="Punkte ${esc(playerName(p))}"></span>`}
            ${cfg.extra === "closer" ? `<label class="tick"><input type="radio" name="closer" value="${p}"><span>hat beendet</span></label>` : ""}
            ${cfg.extra === "flip7" ? `<label class="tick"><input type="checkbox" data-f7="${p}"><span>Flip 7!</span></label>` : ""}
          </div>`).join("")}</div>
        ${cfg.labels.roundHint ? `<p class="hint">${cfg.labels.roundHint}</p>` : ""}
        <button class="btn btn-primary wide" type="button" data-add-round>Runde ${n} eintragen</button>
      </section>`;
      }
      function bindRound(P) {
        let winner = null;
        $("[data-rw]", el)?.addEventListener("click", (e) => {
          const c = e.target.closest(".chip");
          if (!c) return;
          winner = c.dataset.id;
          $$("[data-rw] .chip", el).forEach((x) => x.setAttribute("aria-pressed", x === c));
          $$(".rin", el).forEach((r) => {
            const inp = $("input[data-score]", r);
            const w = r.dataset.p === winner;
            r.classList.toggle("is-winner", w);
            inp.disabled = w;
            if (w) inp.value = 0;
          });
        });
        $$("[data-pm]", el).forEach((b) => b.addEventListener("click", () => {
          const inp = $(`[data-score="${b.dataset.pm}"]`, el);
          const v = parseInt(inp.value || "0", 10) || 0;
          inp.value = v === 0 ? inp.value.startsWith("-") ? "" : "-" : -v;
          inp.focus();
        }));
        $("[data-add-round]", el)?.addEventListener("click", () => {
          const scores = {}, n = d.rounds.length + 1;
          let bids, tricks;
          if (cfg.extra === "wizard") {
            bids = {};
            tricks = {};
            for (const p of P) {
              bids[p] = parseInt($(`[data-bid="${p}"]`, el).value, 10) || 0;
              tricks[p] = parseInt($(`[data-tricks="${p}"]`, el).value, 10) || 0;
            }
            const sum = Object.values(tricks).reduce((a, b) => a + b, 0);
            if (sum !== n) return toast(`In Runde ${n} gibt es ${plural(n, "Stich", "Stiche")} \u2013 eingetragen sind ${sum}.`);
            for (const p of P) scores[p] = bids[p] === tricks[p] ? 20 + 10 * tricks[p] : -10 * Math.abs(bids[p] - tricks[p]);
          } else for (const p of P) {
            const v = $(`[data-score="${p}"]`, el).value.trim();
            scores[p] = v === "" ? 0 : parseInt(v, 10) || 0;
          }
          if (cfg.extra === "roundWinner" && !winner) return toast("W\xE4hle zuerst, wer die Runde gewonnen hat.");
          const round = { scores };
          if (bids) {
            round.bids = bids;
            round.tricks = tricks;
          }
          if (cfg.extra === "closer") round.closer = $('input[name="closer"]:checked', el)?.value || null;
          if (cfg.extra === "flip7") round.flip7 = P.filter((p) => $(`[data-f7="${p}"]`, el).checked);
          if (cfg.extra === "roundWinner") round.winner = winner;
          finalize(round, P);
          d.rounds.push(round);
          draft.set(cfg.id, d);
          if (round.doubled) toast(`Verdoppelt: ${esc(playerName(round.closer))} hatte nicht die wenigsten Punkte.`);
          live();
          const totals = totalsOf(d.rounds, P);
          if (ended(totals, d)) toast("Spiel vorbei \u2013 jetzt beenden & speichern.");
        });
      }
      function roundTable(P) {
        return `<section class="panel"><h2 class="panel-title">Runden</h2><div class="table-wrap"><table class="rt">
        <thead><tr><th>#</th>${P.map((p) => `<th>${esc(playerName(p))}</th>`).join("")}</tr></thead>
        <tbody>${d.rounds.map((r, i) => `<tr><td>${i + 1}</td>${P.map((p) => {
          const v = r.final?.[p] ?? r.scores[p];
          const mark = (cfg.extra === "closer" && r.closer === p ? r.doubled ? ' <span class="mk" title="verdoppelt">\xD72</span>' : ' <span class="mk" title="hat beendet">\u25CF</span>' : "") + (cfg.extra === "flip7" && r.flip7?.includes(p) ? ' <span class="mk" title="Flip 7">7</span>' : "") + (cfg.extra === "roundWinner" && r.winner === p ? ' <span class="mk" title="Rundensieg">\u2605</span>' : "") + (r.bids ? ` <span class="mk wz ${r.bids[p] === r.tricks[p] ? "hit" : ""}" title="Ansage / Stiche">${r.bids[p]}/${r.tricks[p]}</span>` : "");
          return `<td>${fmtNum(v, 0)}${mark}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr><td>\u03A3</td>${P.map((p) => `<td><b>${fmtNum(totalsOf(d.rounds, P)[p], 0)}</b></td>`).join("")}</tr></tfoot>
      </table></div></section>`;
      }
      async function finish(totals, pl) {
        const winners = d.players.filter((p) => pl[p] === 1);
        const m = { game: cfg.id, date: d.date, players: d.players, rounds: d.rounds, totals, places: pl, winners, tags: [plural(d.rounds.length, "Runde", "Runden")] };
        try {
          await saveMatch(m);
          draft.clear(cfg.id);
          toast(`<b>Gespeichert.</b> ${esc(winners.map((p) => playerName(p)).join(" & "))} ${winners.length > 1 ? "gewinnen" : "gewinnt"} mit ${fmtNum(totals[winners[0]], 0)} Punkten.`, { icon: g2.winIcon?.() || "" });
          ctx.go("verlauf");
        } catch (err) {
          toast(esc(err.message));
        }
      }
    }
    function stats2(matches) {
      const base = perPlayer(matches, { lowWins: cfg.lowWins });
      for (const s of base) {
        const rs = [];
        let doubled = 0, closes = 0, f7 = 0, busts = 0, rwins = 0, hits = 0, bidRounds = 0, bidSum = 0, hitRun = 0, hitBest = 0;
        for (const { m } of s.results) for (const r of m.rounds || []) {
          const v = +(r.final?.[s.id] ?? r.scores?.[s.id]);
          if (Number.isNaN(v)) continue;
          rs.push(v);
          if (r.closer === s.id) {
            closes++;
            if (r.doubled) doubled++;
          }
          if (r.flip7?.includes(s.id)) f7++;
          if (cfg.extra === "flip7" && v === 0) busts++;
          if (r.winner === s.id) rwins++;
          if (r.bids && r.bids[s.id] != null) {
            bidRounds++;
            bidSum += r.bids[s.id];
            if (r.bids[s.id] === r.tricks[s.id]) {
              hits++;
              hitRun++;
              hitBest = Math.max(hitBest, hitRun);
            } else hitRun = 0;
          }
        }
        Object.assign(s, {
          rounds: rs.length,
          avgRound: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
          bestRound: rs.length ? cfg.lowWins ? Math.min(...rs) : Math.max(...rs) : null,
          doubled,
          closes,
          f7,
          busts,
          rwins,
          rwRate: rs.length ? rwins / rs.length : 0,
          hits,
          hitRate: bidRounds ? hits / bidRounds : null,
          avgBid: bidRounds ? bidSum / bidRounds : null,
          hitBest
        });
      }
      return base;
    }
    return { newTab, stats: stats2, totalsOf };
  }

  // js/games/floriferous.js
  var BASE = typeof window !== "undefined" && window.KG_ASSETS != null ? window.KG_ASSETS : "assets/flori/";
  var A = (n) => `${BASE}${n}.webp`;
  if (typeof document !== "undefined") {
    const r = document.documentElement.style;
    const abs = (f) => `url("${new URL(BASE + f, document.baseURI).href}")`;
    r.setProperty("--fl-paper", abs("paper.jpg"));
    r.setProperty("--fl-washes", abs("washes.webp"));
    r.setProperty("--fl-tile", abs("bg_pink.webp"));
  }
  var img = (n, cls = "", alt = "") => `<img class="${cls}" src="${A(n)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  var CATS = [
    { key: "missionen", name: "Missionen", icon: "cat_mission" },
    { key: "steine", name: "Steine", icon: "cat_stone" },
    { key: "desires", name: "Desires", icon: "cat_desire" },
    { key: "kitsch", name: "Kitsch", icon: "cat_kitsch" },
    { key: "gesteck", name: "Blumengesteck", icon: "cat_bouquet" }
  ];
  var MOODS = ["Anxious", "Chill", "Cool as a Cucumber", "Really Relaxed", "Utter Zen", "Nirvana"];
  var MOOD_COL = ["#F3D3E0", "#EAB0C8", "#DE88AE", "#CC5F95", "#B03E7C", "#84205C"];
  var LIMITS = { standard: [21, 27, 33, 39, 45], extended: [49, 53, 57, 61, 65] };
  var moodOf = (pts, size) => {
    const l = LIMITS[size] || LIMITS.standard;
    let i = 0;
    while (i < l.length && pts >= l[i]) i++;
    return i;
  };
  var moodRange = (i, size) => {
    const l = LIMITS[size];
    return i === 0 ? `unter ${l[0]}` : i === 5 ? `ab ${l[4]}` : `${l[i - 1]}\u2013${l[i] - 1}`;
  };
  var FLOWERS = [["mum", "Chrysantheme"], ["daisy", "Margerite"], ["poppy", "Mohn"], ["tulip", "Tulpe"], ["lily", "Lilie"]];
  var COLORS = [["pink", "Pink", "#D2408A"], ["yellow", "Gelb", "#E3AC1E"], ["white", "Wei\xDF", "#8F889C"], ["purple", "Lila", "#6A51A5"], ["orange", "Orange", "#E4562C"]];
  var INSECTS = [["butterfly", "Schmetterling"], ["moth", "Falter"], ["bee", "Biene"], ["ladybug", "Marienk\xE4fer"], ["beetle", "K\xE4fer"]];
  function assignLooks() {
    const used = /* @__PURE__ */ new Set(), out = /* @__PURE__ */ new Map();
    const ps = playersByCreated();
    ps.forEach((p) => {
      const l = p.looks?.floriferous;
      if (l) {
        out.set(p.id, l);
        used.add(l.flower + l.color);
      }
    });
    let k = 0;
    ps.forEach((p, i) => {
      if (out.has(p.id)) return;
      let f, c, guard = 0;
      do {
        f = k % 5;
        c = (k + Math.floor(k / 5)) % 5;
        k++;
      } while (used.has(FLOWERS[f][0] + COLORS[c][0]) && guard++ < 30);
      used.add(FLOWERS[f][0] + COLORS[c][0]);
      out.set(p.id, { flower: FLOWERS[f][0], color: COLORS[c][0], insect: INSECTS[(i * 2 + Math.floor(i / 5)) % 5][0] });
    });
    return out;
  }
  var lookCache = { key: "", map: /* @__PURE__ */ new Map() };
  function lookOf(p) {
    const key = store.players.map((x) => x.id + JSON.stringify(x.looks?.floriferous || "")).join("|");
    if (key !== lookCache.key) lookCache = { key, map: assignLooks() };
    return lookCache.map.get(p.id) || { flower: "poppy", color: "white", insect: "ladybug" };
  }
  var colorHex = (c) => (COLORS.find((x) => x[0] === c) || COLORS[2])[2];
  function avatar(p, size = "dot") {
    const l = lookOf(p);
    return `<span class="av av-${size} fl-av" aria-hidden="true">${img(`head_${l.flower}_${l.color}`)}</span>`;
  }
  function lookEditor(el, p, looks, set) {
    let l = { ...looks.floriferous || lookOf(p) };
    const draw = () => {
      el.innerHTML = `<div class="look-prev">${cardArt(l)}</div>
      <span class="field-label">Blume</span><div class="look-opts">${FLOWERS.map(([k, n]) => `<button type="button" class="look-opt ${l.flower === k ? "on" : ""}" data-f="${k}" aria-label="${n}" title="${n}">${img(`head_${k}_${l.color}`)}</button>`).join("")}</div>
      <span class="field-label">Farbe</span><div class="look-opts">${COLORS.map(([k, n, hex2]) => `<button type="button" class="look-opt sw ${l.color === k ? "on" : ""}" data-c="${k}" aria-label="${n}" title="${n}"><i style="background:${hex2}"></i></button>`).join("")}</div>
      <span class="field-label">Insekt</span><div class="look-opts">${INSECTS.map(([k, n]) => `<button type="button" class="look-opt ${l.insect === k ? "on" : ""}" data-ins="${k}" aria-label="${n}" title="${n}">${img(`ins_${k}`)}</button>`).join("")}</div>`;
    };
    draw();
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".look-opt");
      if (!b) return;
      if (b.dataset.f) l.flower = b.dataset.f;
      if (b.dataset.c) l.color = b.dataset.c;
      if (b.dataset.ins) l.insect = b.dataset.ins;
      set({ ...looks, floriferous: { ...l } });
      draw();
    });
  }
  function cardArt(l) {
    return `<div class="card-art">${img(`bg_${l.color}`, "ca-bg")}${img(`fl_${l.flower}_${l.color}`, "ca-fl")}${img(`ins_${l.insect}`, `ca-ins ins-${l.insect}`)}</div>`;
  }
  var filt = (mode, size) => (m) => (m.mode || "multi") === mode && (size === "all" || (m.variant || "standard") === size);
  function floriStats(matches) {
    const st = perPlayer(matches);
    for (const s of st) {
      s.cat = {};
      s.catBest = {};
      for (const c of CATS) {
        const v = s.results.map((r) => +(r.m.scores?.[s.id]?.[c.key] ?? 0));
        s.cat[c.key] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
        s.catBest[c.key] = v.length ? Math.max(...v) : 0;
      }
      s.moods = [0, 0, 0, 0, 0, 0];
      s.results.forEach((r) => {
        if (r.total != null) s.moods[moodOf(r.total, r.m.variant || "standard")]++;
      });
      s.nirvana = s.moods[5];
      s.moodAvg = s.games ? s.moods.reduce((a, n, i) => a + n * i, 0) / s.games : null;
      s.strong = CATS.reduce((a, c) => s.cat[c.key] > s.cat[a.key] ? c : a, CATS[0]);
      const last5 = s.totals.slice(-5);
      s.form = last5.length ? last5.reduce((a, b) => a + b, 0) / last5.length : null;
      s.player = { id: s.id, name: s.name };
    }
    return st;
  }
  var moodLabel = (i) => `<span class="mood-chip m${i}">${MOODS[i]}</span>`;
  var view = { mode: "multi", size: "standard" };
  function filterBar() {
    return `<div class="filters">${seg("mode", [["multi", "Multiplayer"], ["solo", "Solo"]], view.mode, "seg-big")}${seg("size", [["standard", "Standard"], ["extended", "Extended"]], view.size)}</div>`;
  }
  function bindFilters(el, redraw) {
    $$("[data-seg]", el).forEach((s) => s.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      view[s.dataset.seg] = b.dataset.v;
      redraw();
    }));
  }
  function dashboard(el, ctx) {
    const g2 = ctx.game;
    const all = matchesOf("floriferous");
    const ms = all.filter(filt(view.mode, view.size));
    const st = floriStats(ms);
    const solo = view.mode === "solo";
    const tiles = [];
    const t = (title, key, fmt, opts) => {
      const r = top(st, key, opts);
      tiles.push(statTile(title, r ? fmt(r.value) : "\u2013", r ? whoList(g2, r.who) : '<span class="muted">noch niemand</span>', opts?.note || ""));
    };
    t(solo ? "Meiste Solo-Partien" : "Meiste Partien", "games", (v) => v);
    if (!solo) {
      t("Meiste Siege", "wins", (v) => v);
      t("Beste Siegquote", "rate", fmtPct, { min: 3, note: "ab 3 Partien" });
    }
    t("Bester Schnitt", "avg", (v) => fmtNum(v), { min: 1 });
    t("Rekord", "best", (v) => fmtNum(v, 0));
    t("Nirvana erreicht", "nirvana", (v) => `${v}\xD7`, { filter: (s) => s.nirvana > 0 });
    if (!solo) t("L\xE4ngste Siegesserie", "streak", (v) => plural(v, "Sieg", "Siege"), { filter: (s) => s.streak > 0 });
    const kings = CATS.map((c) => {
      const l = st.filter((s) => s.games);
      if (!l.length) return "";
      const best = l.reduce((a, b) => b.cat[c.key] > a.cat[c.key] ? b : a);
      return `<li>${img(c.icon, "ci")}<span class="k-cat">${c.name}</span><span class="who">${avatar(best.player, "mini")}${esc(best.name)}</span><b>\xD8 ${fmtNum(best.cat[c.key])}</b></li>`;
    }).join("");
    const recent = [...ms].reverse().slice(0, 3);
    el.innerHTML = `${filterBar()}
    ${ms.length ? `
    <div class="stats-grid">${tiles.join("")}</div>
    <section class="panel"><h2 class="ribbon">Kategorie-K\xF6nige</h2><ul class="kings">${kings}</ul></section>
    <section class="panel"><h2 class="ribbon">Zuletzt gespielt</h2>${recent.map((m) => histLine(g2, m, true)).join("")}
      <button class="btn btn-ghost wide" type="button" data-all>Alle Partien</button></section>` : `<div class="empty-state panel"><p>Noch keine ${solo ? "Solo-" : ""}Partie im ${view.size === "extended" ? "Extended" : "Standard"}-Spiel.</p><button class="btn btn-primary" type="button" data-new>Partie eintragen</button></div>`}`;
    bindFilters(el, () => dashboard(el, ctx));
    $("[data-new]", el)?.addEventListener("click", () => ctx.go("neu"));
    $("[data-all]", el)?.addEventListener("click", () => ctx.go("verlauf"));
  }
  var editing = null;
  function newGame(el, ctx) {
    const g2 = ctx.game;
    const e = editing;
    editing = null;
    const S = {
      id: e?.id,
      created: e?.created,
      date: e?.date || today(),
      mode: e?.mode || view.mode || "multi",
      size: e?.variant || view.size || "standard",
      selected: new Set(e?.players || []),
      scores: JSON.parse(JSON.stringify(e?.scores || {}))
    };
    const sc = (id) => {
      var _a;
      return (_a = S.scores)[id] || (_a[id] = Object.fromEntries(CATS.map((c) => [c.key, 0])));
    };
    const total = (id) => CATS.reduce((a, c) => a + (+sc(id)[c.key] || 0), 0);
    el.innerHTML = `
    <section class="panel" aria-label="Spiel einrichten">
      ${img("splash_orange", "deco", "")}
      <div class="setup-grid">
        <label class="field"><span>Gespielt am</span><input type="date" id="fDate" value="${S.date}"></label>
        <div><span class="field-label">Spielart</span>
          <div class="modes">
            <button class="mode" type="button" data-mode="solo" aria-pressed="${S.mode === "solo"}">${img("mode_solo", "ico")}<span>Solo<small>allein gespielt</small></span></button>
            <button class="mode" type="button" data-mode="multi" aria-pressed="${S.mode === "multi"}">${img("mode_multi", "ico")}<span>Multiplayer<small>2\u20134 Spieler</small></span></button>
          </div></div>
        <div><span class="field-label">Umfang</span>${seg("size", [["standard", "Standard"], ["extended", "Extended"]], S.size)}</div>
      </div>
    </section>
    <section class="panel" id="fPick">${img("splash_green", "deco deco-bl", "")}<div></div></section>
    <div class="cards" id="fCards"></div>
    <div class="save-wrap">${img("splash_blue", "deco deco-save", "")}<button class="save" type="button" id="fSave">${img("bee")}${S.id ? "\xC4nderungen speichern" : "Spiel speichern"}</button></div>`;
    const picker = playerPicker($("#fPick > div", el), { game: g2, selected: S.selected, min: S.mode === "solo" ? 1 : 2, max: S.mode === "solo" ? 1 : 4, single: S.mode === "solo", label: S.mode === "solo" ? "Wer hat gespielt?" : "Wer hat mitgespielt?", onChange: () => cards() });
    function cards() {
      const list2 = playersByCreated().filter((p) => S.selected.has(p.id));
      [...S.selected].filter((id) => !list2.some((p) => p.id === id)).forEach((id) => list2.push({ id, name: playerName(id, e) }));
      $("#fCards", el).innerHTML = list2.map((p) => {
        const l = lookOf(p), s = sc(p.id);
        return `<article class="pcard" data-id="${p.id}">
        <div class="pcard-art">${cardArt(l)}
          <div class="crown">${img("butterfly")}</div>
          <div class="pcard-label ribbon">${img(`pb_${l.flower}_${l.color}`, "badge")}${esc(p.name)}</div>
          <div class="total" aria-label="Summe">${img("total")}<span>0</span></div>
        </div>
        <ul class="cats">${CATS.map((c) => `<li class="cat">${img(c.icon, "ci")}<span class="cat-name" id="${p.id}-${c.key}">${c.name}</span>
          <span class="step"><button type="button" data-d="-1" data-k="${c.key}" aria-label="${c.name} minus 1">\u2212</button>
          <input type="number" inputmode="numeric" min="0" max="99" value="${s[c.key] || ""}" placeholder="0" data-k="${c.key}" aria-labelledby="${p.id}-${c.key}">
          <button type="button" data-d="1" data-k="${c.key}" aria-label="${c.name} plus 1">+</button></span></li>`).join("")}</ul>
        <div class="mood"><div class="mood-txt"><small>Stimmung</small><span class="mt">\u2013</span></div><div class="mood-scale">${MOODS.map(() => "<i></i>").join("")}</div></div>
      </article>`;
      }).join("") || '<p class="empty">W\xE4hle oben, wer gespielt hat.</p>';
      list2.forEach((p) => update(p.id, false));
      leader();
    }
    function update(id, bump = true) {
      const card3 = $(`.pcard[data-id="${id}"]`, el);
      if (!card3) return;
      const t = total(id), m = moodOf(t, S.size), span = $(".total span", card3);
      if (span.textContent != t) {
        span.textContent = t;
        if (bump) {
          const tt = $(".total", card3);
          tt.classList.remove("bump");
          void tt.offsetWidth;
          tt.classList.add("bump");
        }
      }
      $(".mt", card3).textContent = MOODS[m];
      $$(".mood-scale i", card3).forEach((x, i) => {
        x.classList.toggle("on", i <= m);
        x.style.background = i <= m ? MOOD_COL[m] : "";
      });
    }
    function leader() {
      const cs = $$(".pcard", el);
      let best = -1, who = [];
      cs.forEach((c) => {
        const t = total(c.dataset.id);
        if (t > best) {
          best = t;
          who = [c];
        } else if (t === best) who.push(c);
      });
      cs.forEach((c) => c.classList.toggle("leader", S.mode === "multi" && best > 0 && who.includes(c)));
    }
    el.addEventListener("click", (ev) => {
      const mode = ev.target.closest("[data-mode]");
      if (mode) {
        S.mode = mode.dataset.mode;
        $$("[data-mode]", el).forEach((b) => b.setAttribute("aria-pressed", b === mode));
        if (S.mode === "solo" && S.selected.size > 1) {
          const first = [...S.selected][0];
          S.selected.clear();
          S.selected.add(first);
        }
        const holder = $("#fPick > div", el);
        const fresh = holder.cloneNode(false);
        holder.replaceWith(fresh);
        playerPicker(fresh, { game: g2, selected: S.selected, min: S.mode === "solo" ? 1 : 2, max: S.mode === "solo" ? 1 : 4, single: S.mode === "solo", label: S.mode === "solo" ? "Wer hat gespielt?" : "Wer hat mitgespielt?", onChange: () => cards() });
        cards();
        return;
      }
      const sz = ev.target.closest('[data-seg="size"] button');
      if (sz) {
        S.size = sz.dataset.v;
        $$('[data-seg="size"] button', el).forEach((b) => b.setAttribute("aria-pressed", b === sz));
        $$(".pcard", el).forEach((c) => update(c.dataset.id, false));
        return;
      }
      const st = ev.target.closest(".step button");
      if (st) {
        const id = st.closest(".pcard").dataset.id, k = st.dataset.k, s = sc(id);
        s[k] = Math.max(0, Math.min(99, (+s[k] || 0) + +st.dataset.d));
        st.parentElement.querySelector("input").value = s[k] || "";
        update(id);
        leader();
        return;
      }
      if (ev.target.closest("#fSave")) save();
    });
    el.addEventListener("input", (ev) => {
      const inp = ev.target.closest(".step input");
      if (!inp) return;
      const id = inp.closest(".pcard").dataset.id;
      sc(id)[inp.dataset.k] = Math.max(0, Math.min(99, parseInt(inp.value, 10) || 0));
      update(id);
      leader();
    });
    async function save() {
      const ids = [...S.selected];
      if (S.mode === "multi" && ids.length < 2) return toast("W\xE4hle mindestens zwei Spieler.", { icon: img("ladybug") });
      if (!ids.length) return toast("W\xE4hle einen Spieler.", { icon: img("ladybug") });
      const totals = Object.fromEntries(ids.map((id) => [id, total(id)]));
      if (Object.values(totals).every((v) => v === 0)) return toast("Es sind noch keine Punkte eingetragen.", { icon: img("ladybug") });
      const pl = places(totals);
      const winners = S.mode === "multi" ? ids.filter((id) => pl[id] === 1) : [];
      const scores = Object.fromEntries(ids.map((id) => [id, sc(id)]));
      const m = {
        id: S.id,
        created: S.created,
        game: "floriferous",
        date: $("#fDate", el).value || today(),
        mode: S.mode,
        variant: S.size,
        players: ids,
        scores,
        totals,
        places: pl,
        winners,
        tags: [S.mode === "solo" ? "Solo" : "Multiplayer", S.size === "extended" ? "Extended" : "Standard"]
      };
      const btn = $("#fSave", el);
      btn.disabled = true;
      try {
        await saveMatch(m);
        fly();
        const lead = ids.filter((id) => pl[id] === 1);
        const best = totals[lead[0]];
        toast(`<b>Spiel gespeichert</b>${S.mode === "solo" ? `${esc(playerName(lead[0]))}: ${best} Punkte \u2013 ${MOODS[moodOf(best, S.size)]}` : `${esc(lead.map((id) => playerName(id)).join(" & "))} ${lead.length > 1 ? "gewinnen" : "gewinnt"} mit ${best} Punkten \u2013 ${MOODS[moodOf(best, S.size)]}`}`, { icon: img("butterfly") });
        view.mode = S.mode;
        view.size = S.size;
        setTimeout(() => ctx.go("dashboard"), 900);
      } catch (err) {
        toast(esc(err.message));
        btn.disabled = false;
      }
    }
    cards();
  }
  function fly() {
    const f = document.createElement("div");
    f.className = "flight go";
    f.innerHTML = img("bee");
    document.body.append(f);
    setTimeout(() => f.remove(), 2400);
  }
  function statistik(el, ctx) {
    const g2 = ctx.game;
    const ms = matchesOf("floriferous").filter(filt(view.mode, view.size));
    const st = floriStats(ms).sort((a, b) => (b.moodAvg ?? 0) - (a.moodAvg ?? 0));
    const solo = view.mode === "solo";
    if (!ms.length) {
      el.innerHTML = `${filterBar()}<div class="empty-state panel"><p>F\xFCr diese Auswahl gibt es noch keine Partien.</p></div>`;
      bindFilters(el, () => statistik(el, ctx));
      return;
    }
    const moodRows = st.map((s) => `<li><span class="who">${avatar(s.player, "mini")}${esc(s.name)}</span>
      ${stackBar(s.moods.map((n, i) => ({ label: MOODS[i], value: n, color: MOOD_COL[i] })), { label: `Stimmungen ${s.name}` })}
      ${moodLabel(Math.round(s.moodAvg))}</li>`).join("");
    const cols = solo ? [{ key: "games", label: "Partien" }, { key: "avg", label: "\xD8 Punkte", fmt: (v) => fmtNum(v) }, { key: "best", label: "Rekord" }, { key: "worst", label: "Tiefster" }] : [{ key: "games", label: "Partien" }, { key: "wins", label: "Siege" }, { key: "rate", label: "Quote", fmt: fmtPct }, { key: "avg", label: "\xD8 Punkte", fmt: (v) => fmtNum(v) }, { key: "best", label: "Rekord" }];
    const catMax = Object.fromEntries(CATS.map((c) => [c.key, Math.max(...st.map((s) => s.cat[c.key]))]));
    const catBlocks = `<div class="table-wrap"><table class="lb cat-t"><thead><tr><th class="l">Spieler</th>${CATS.map((c) => `<th title="${c.name}">${img(c.icon, "ci")}<span class="sr">${c.name}</span></th>`).join("")}</tr></thead>
    <tbody>${st.map((s) => `<tr><td class="l">${avatar(s.player, "mini")}<span class="nm">${esc(s.name)}</span></td>${CATS.map((c) => `<td class="${s.cat[c.key] === catMax[c.key] ? "best" : ""}">${fmtNum(s.cat[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="hint">Durchschnitt pro Partie. Fett = bester Wert der Kategorie.</p>`;
    const more = `
    <h3 class="sub-h">Punkte-Verlauf</h3>${trendChart(g2, ms, (m, id) => m.totals?.[id], { colors: (id) => colorHex(lookOf({ id }).color), label: "Punkte je Partie" })}
    <h3 class="sub-h">St\xE4rkste Kategorie</h3><ul class="kings">${st.map((s) => `<li>${img(s.strong.icon, "ci")}<span class="who">${avatar(s.player, "mini")}${esc(s.name)}</span><span class="k-cat">${s.strong.name}</span><b>\xD8 ${fmtNum(s.cat[s.strong.key])}</b></li>`).join("")}</ul>
    <h3 class="sub-h">Kategorie-Rekorde</h3><ul class="kings">${CATS.map((c) => {
      const b = st.reduce((a, x) => x.catBest[c.key] > a.catBest[c.key] ? x : a);
      return `<li>${img(c.icon, "ci")}<span class="k-cat">${c.name}</span><span class="who">${avatar(b.player, "mini")}${esc(b.name)}</span><b>${b.catBest[c.key]}</b></li>`;
    }).join("")}</ul>
    <h3 class="sub-h">Form (\xD8 der letzten 5 Partien)</h3>${barChart(st.filter((s) => s.form != null).map((s) => ({ label: s.name, value: s.form, icon: avatar(s.player, "mini"), note: `gesamt \xD8 ${fmtNum(s.avg)}` })).sort((a, b) => b.value - a.value))}
    ${solo ? "" : `<h3 class="sub-h">L\xE4ngste Siegesserie</h3>${barChart(st.filter((s) => s.streak).map((s) => ({ label: s.name, value: s.streak, icon: avatar(s.player, "mini"), note: s.current ? `aktuell ${s.current}` : "" })).sort((a, b) => b.value - a.value), { digits: 0 })}
    <h3 class="sub-h">\xD8 Punkte nach Spielerzahl</h3>${byCount(ms)}
    <h3 class="sub-h">Kopf an Kopf</h3><div id="h2h"></div>`}
    <h3 class="sub-h">Stimmungs-Tabelle</h3>${moodTable()}`;
    el.innerHTML = `${filterBar()}
    <section class="panel"><h2 class="ribbon">Stimmungen</h2><p class="hint">Wie entspannt war der Garten? Verteilung je Spieler, rechts die typische Stimmung.</p><ul class="moods">${moodRows}</ul>
      <div class="legend">${MOODS.map((m, i) => `<span><i style="background:${MOOD_COL[i]}"></i>${m}</span>`).join("")}</div></section>
    <section class="panel"><h2 class="ribbon">Rangliste</h2>${leaderboard(g2, st, cols, { sort: solo ? "avg" : "wins" })}</section>
    <section class="panel"><h2 class="ribbon">\xD8 je Kategorie</h2>${catBlocks}</section>
    <section class="panel">${details("Mehr Statistiken", more)}</section>`;
    bindFilters(el, () => statistik(el, ctx));
    const h = $("#h2h", el);
    if (h) h2hBlock(h, g2, ms);
  }
  function byCount(ms) {
    const groups = {};
    ms.forEach((m) => {
      const n = m.players.length;
      (groups[n] || (groups[n] = [])).push(...Object.values(m.totals || {}));
    });
    return barChart(Object.entries(groups).sort().map(([n, v]) => ({ label: `${n} Spieler`, value: v.reduce((a, b) => a + b, 0) / v.length, note: plural(v.length / +n, "Partie", "Partien") })));
  }
  function moodTable() {
    return `<div class="table-wrap"><table class="lb mood-t"><thead><tr><th class="l">Your Mood</th><th>Standard</th><th>Extended</th></tr></thead><tbody>
    ${MOODS.map((m, i) => `<tr><td class="l">${moodLabel(i)}</td><td>${moodRange(i, "standard")}</td><td>${moodRange(i, "extended")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function histLine(g2, m, compact = false) {
    const ids = [...m.players].sort((a, b) => (m.places?.[a] ?? 9) - (m.places?.[b] ?? 9));
    const size = m.variant || "standard";
    return `<div class="fh ${compact ? "compact" : ""}">${compact ? `<div class="fh-date">${fmtDate(m.date)} \xB7 ${m.mode === "solo" ? "Solo" : "Multiplayer"} \xB7 ${size === "extended" ? "Extended" : "Standard"}</div>` : ""}
    <ol class="res">${ids.map((id) => `<li class="${(m.winners || []).includes(id) ? "win" : ""}">${avatar({ id, name: playerName(id, m) }, "mini")}<span class="nm">${esc(playerName(id, m))}</span>${moodLabel(moodOf(m.totals?.[id] ?? 0, size))}<b>${m.totals?.[id] ?? "\u2013"}</b></li>`).join("")}</ol></div>`;
  }
  function verlauf(el, ctx) {
    const ms = matchesOf("floriferous");
    historyList(el, ctx, { matches: ms, line: (m) => histLine(ctx.game, m), onEdit: (m) => {
      editing = m;
      ctx.go("neu");
    } });
  }
  var floriferous_default = {
    id: "floriferous",
    name: "Floriferous",
    theme: "theme-flori",
    themeColor: "#F6E3EA",
    dot: "#D2408A",
    logo: () => `<div class="lg-flori">${img("head_mum_pink", "lg-f1")}${img("head_daisy_yellow", "lg-f2")}${img("ins_bee", "lg-bee")}<span>Floriferous</span></div>`,
    header: () => `<div class="fl-hero">${img("hero", "fl-hero-art")}${img("bee", "fl-hero-bee")}</div>
    ${img("splash_pink", "fl-title-splash")}<h1 class="fl-title">Floriferous</h1><div class="ribbon fl-sub">Punkte vom Spielabend</div>`,
    decor: () => `<div class="fl-bg" aria-hidden="true"></div><div class="fl-side l" aria-hidden="true">${img("side_l")}</div><div class="fl-side r" aria-hidden="true">${img("side_r")}</div>`,
    tabIcon: (t) => img({ dashboard: "head_daisy_yellow", neu: "head_mum_pink", statistik: "head_tulip_purple", verlauf: "head_poppy_white" }[t]),
    avatar,
    lookEditor,
    winIcon: () => img("butterfly"),
    tabs: { dashboard, neu: newGame, statistik, verlauf }
  };

  // js/games/rounds.js
  function makeRoundsGame(def) {
    const engine = roundsGame(def);
    const low = def.lowWins;
    const g2 = { ...def };
    const unitBest = low ? "niedrigste" : "h\xF6chste";
    function dashboard3(el, ctx) {
      const ms = matchesOf(def.id), st = engine.stats(ms);
      if (!ms.length) {
        el.innerHTML = `<div class="empty-state panel"><p>Noch keine Partie gespielt.</p><button class="btn btn-primary" type="button" data-new>Spiel starten</button></div>`;
        $("[data-new]", el).onclick = () => ctx.go("neu");
        return;
      }
      const T = (title, key, fmt, opts = {}) => {
        const r = top(st, key, opts);
        return statTile(title, r ? fmt(r.value) : "\u2013", r ? whoList(g2, r.who) : '<span class="muted">noch niemand</span>', opts.note || "");
      };
      const tiles = [
        T("Meiste Siege", "wins", (v) => v),
        T("Beste Siegquote", "rate", fmtPct, { min: 3, note: "ab 3 Partien" }),
        T(low ? "Bester \xD8-Endstand" : "Bester \xD8-Endstand", "avg", (v) => fmtNum(v), { low }),
        T(low ? "Niedrigster Endstand" : "H\xF6chster Endstand", "best", (v) => fmtNum(v, 0), { low }),
        T(low ? "Beste Runde" : "St\xE4rkste Runde", "bestRound", (v) => fmtNum(v, 0), { low }),
        T("Meiste Partien", "games", (v) => v),
        ...def.extraTiles ? def.extraTiles(st, T) : []
      ];
      const recent = [...ms].reverse().slice(0, 3);
      el.innerHTML = `<div class="stats-grid">${tiles.join("")}</div>
      <section class="panel"><h2 class="panel-title">Zuletzt gespielt</h2>${recent.map((m) => `<div class="mini-hist"><span class="hist-date">${new Date(m.date).toLocaleDateString("de-DE")}</span>${rankedLine(g2, m)}</div>`).join("")}
      <button class="btn btn-ghost wide" type="button" data-all>Alle Partien</button></section>`;
      $("[data-all]", el).onclick = () => ctx.go("verlauf");
    }
    function statistik3(el, ctx) {
      const ms = matchesOf(def.id), st = engine.stats(ms);
      if (!ms.length) {
        el.innerHTML = '<div class="empty-state panel"><p>Noch keine Partien \u2013 hier erscheinen bald Ranglisten.</p></div>';
        return;
      }
      const cols = [
        { key: "games", label: "Partien" },
        { key: "wins", label: "Siege" },
        { key: "rate", label: "Quote", fmt: fmtPct },
        { key: "avg", label: "\xD8 Endstand", fmt: (v) => fmtNum(v) },
        { key: "avgRound", label: "\xD8 / Runde", fmt: (v) => fmtNum(v) },
        ...def.extraCols || []
      ];
      const sorted = (key, dir = low ? 1 : -1) => [...st].filter((s) => s[key] != null).sort((a, b) => (a[key] - b[key]) * dir);
      const more = `
      <h3 class="sub-h">Endst\xE4nde im Verlauf</h3>${trendChart(g2, ms, (m, id) => m.totals?.[id], { colors: (id) => def.colorOf(id), label: "Endstand" })}
      <h3 class="sub-h">\xD8 Punkte pro Runde</h3>${barChart(sorted("avgRound").map((s) => ({ label: s.name, value: s.avgRound, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id), note: plural(s.rounds, "Runde", "Runden") })))}
      <h3 class="sub-h">${low ? "Beste (niedrigste)" : "H\xF6chste"} Runde</h3>${barChart(sorted("bestRound").map((s) => ({ label: s.name, value: s.bestRound, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id) })), { digits: 0 })}
      <h3 class="sub-h">L\xE4ngste Siegesserie</h3>${barChart([...st].filter((s) => s.streak).sort((a, b) => b.streak - a.streak).map((s) => ({ label: s.name, value: s.streak, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id), note: s.current ? `aktuell ${s.current}` : "" })), { digits: 0 })}
      ${def.moreStats ? def.moreStats(st, ms) : ""}
      <h3 class="sub-h">Kopf an Kopf</h3><div id="h2h"></div>`;
      el.innerHTML = `<section class="panel"><h2 class="panel-title">Rangliste</h2>${leaderboard(g2, st, cols)}<p class="hint">Sortiert nach Siegen. ${low ? "Weniger Punkte sind besser." : "Mehr Punkte sind besser."}</p></section>
      <section class="panel">${details("Mehr Statistiken", more)}</section>`;
      h2hBlock($("#h2h", el), g2, ms, { lowWins: low });
    }
    function verlauf3(el, ctx) {
      historyList(el, ctx, { matches: matchesOf(def.id), line: (m) => rankedLine(g2, m) });
    }
    g2.tabs = { dashboard: dashboard3, neu: engine.newTab, statistik: statistik3, verlauf: verlauf3 };
    g2.unitBest = unitBest;
    return g2;
  }

  // js/games/palette.js
  function idx(id) {
    const ps = playersByCreated();
    const i = ps.findIndex((p) => p.id === id);
    return i >= 0 ? i : Math.abs([...String(id)].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7));
  }
  var cache = {};
  function pickFor(game, pal, id) {
    const key = pal.length + "|" + store.players.map((p) => `${p.id}:${p.looks?.[game]?.i ?? ""}`).join(",");
    let c = cache[game];
    if (!c || c.key !== key) {
      const map = /* @__PURE__ */ new Map(), used = /* @__PURE__ */ new Set(), ps = playersByCreated();
      ps.forEach((p) => {
        const i2 = p.looks?.[game]?.i;
        if (i2 != null && i2 < pal.length) {
          map.set(p.id, i2);
          used.add(i2);
        }
      });
      let k = 0;
      ps.forEach((p) => {
        if (map.has(p.id)) return;
        if (used.size >= pal.length) used.clear();
        while (used.has(k % pal.length)) k++;
        map.set(p.id, k % pal.length);
        used.add(k % pal.length);
        k++;
      });
      c = cache[game] = { key, map };
    }
    const i = c.map.get(id);
    return pal[i != null ? i : idx(id) % pal.length];
  }

  // js/games/skyjo.js
  var PAL = [
    { n: -2, c: "#2E3F94" },
    { n: 0, c: "#45A9DD" },
    { n: 3, c: "#3FA34D" },
    { n: 6, c: "#E8B90F" },
    { n: 11, c: "#D93A3A" },
    { n: -1, c: "#2E3F94" },
    { n: 2, c: "#3FA34D" },
    { n: 7, c: "#E8B90F" },
    { n: 9, c: "#D93A3A" },
    { n: 0, c: "#45A9DD" }
  ];
  var card = (n, c, extra = "") => `<span class="sk-card ${extra}" style="--c:${c}"><b>${n}</b></span>`;
  var skyjo_default = makeRoundsGame({
    id: "skyjo",
    name: "Skyjo",
    theme: "theme-skyjo",
    themeColor: "#DDEFF8",
    dot: "#45A9DD",
    lowWins: true,
    target: null,
    extra: "closer",
    negative: true,
    min: 2,
    max: 8,
    labels: { startHint: "Ihr spielt so viele Runden, wie ihr wollt \u2013 beendet das Spiel, wenn ihr fertig seid. Wenig Punkte gewinnen.", roundHint: "Wer die Runde beendet hat und nicht die wenigsten Punkte hat, bekommt seine Punkte verdoppelt (nur bei positiven Punkten)." },
    avatar: (p, size = "dot") => {
      const x = pickFor("skyjo", PAL, p.id);
      return `<span class="av av-${size}" aria-hidden="true">${card(x.n, x.c)}</span>`;
    },
    icons: { pal: PAL, current: (p) => pickFor("skyjo", PAL, p.id), render: (x) => card(x.n, x.c) },
    colorOf: (id) => pickFor("skyjo", PAL, id).c,
    logo: () => `<div class="lg-skyjo">${card(-2, "#2E3F94", "f1")}${card(5, "#E8B90F", "f2")}${card(12, "#D93A3A", "f3")}<span>Skyjo</span></div>`,
    header: () => `<div class="sk-fan" aria-hidden="true">${card(-2, "#2E3F94", "f1")}${card(0, "#45A9DD", "f2")}${card(4, "#3FA34D", "f3")}${card(8, "#E8B90F", "f4")}${card(12, "#D93A3A", "f5")}</div><h1 class="g-title">Skyjo</h1><p class="g-sub">Wenig Punkte, viel Freude</p>`,
    extraTiles: (st, T) => [T("Pechvogel", "doubled", (v) => `${v}\xD7 verdoppelt`, { filter: (s) => s.doubled > 0 })],
    extraCols: [{ key: "bestRound", label: "Beste Runde" }],
    moreStats: (st) => `<h3 class="sub-h">Runden beendet & verdoppelt</h3>${barChart(st.filter((s) => s.closes).sort((a, b) => b.closes - a.closes).map((s) => ({ label: s.name, value: s.closes, note: `${plural(s.doubled, "Mal", "Mal")} verdoppelt`, color: pickFor("skyjo", PAL, s.id).c })), { digits: 0 })}`
  });

  // js/games/flip7.js
  var PAL2 = [
    { n: 7, c: "#E63946" },
    { n: 12, c: "#1F8A70" },
    { n: 3, c: "#F28C28" },
    { n: 9, c: "#5E4AE3" },
    { n: 5, c: "#1C7ED6" },
    { n: 10, c: "#C2A100" },
    { n: 1, c: "#2B2D42" },
    { n: 8, c: "#D6336C" }
  ];
  var tk = (n, c, cls = "") => `<span class="f7-card ${cls}" style="--c:${c}"><b>${n}</b></span>`;
  var flip7_default = makeRoundsGame({
    id: "flip7",
    name: "Flip 7",
    theme: "theme-flip7",
    themeColor: "#FFF1D6",
    dot: "#E63946",
    lowWins: false,
    target: 200,
    extra: "flip7",
    min: 2,
    max: 12,
    labels: { startHint: "Das Spiel endet nach der Runde, in der jemand 200 Punkte erreicht. Viele Punkte gewinnen.", roundHint: "Ausgeschieden (Doppelte gezogen)? Einfach 0 eintragen. \u201EFlip 7!\u201C ankreuzen, wenn jemand sieben verschiedene Zahlen hatte \u2013 die 15 Bonuspunkte gleich mit eintragen." },
    avatar: (p, size = "dot") => {
      const x = pickFor("flip7", PAL2, p.id);
      return `<span class="av av-${size}" aria-hidden="true">${tk(x.n, x.c)}</span>`;
    },
    icons: { pal: PAL2, current: (p) => pickFor("flip7", PAL2, p.id), render: (x) => tk(x.n, x.c) },
    colorOf: (id) => pickFor("flip7", PAL2, id).c,
    logo: () => `<div class="lg-flip7">${tk(7, "#E63946", "big")}<span>Flip&nbsp;7</span></div>`,
    header: () => `<div class="f7-hero" aria-hidden="true">${tk(1, "#2B2D42", "h1")}${tk(4, "#1C7ED6", "h2")}${tk(7, "#E63946", "h3")}${tk(10, "#C2A100", "h4")}${tk(12, "#1F8A70", "h5")}</div><h1 class="g-title">Flip 7</h1><p class="g-sub">Wer zuerst 200 Punkte hat, beendet das Spiel</p>`,
    extraTiles: (st, T) => [T("Meiste \u201EFlip 7!\u201C", "f7", (v) => `${v}\xD7`, { filter: (s) => s.f7 > 0 }), T("Meiste Nullrunden", "busts", (v) => `${v}\xD7`, { filter: (s) => s.busts > 0, note: "Runden mit 0 Punkten" })],
    extraCols: [{ key: "f7", label: "Flip 7!" }],
    moreStats: (st) => `<h3 class="sub-h">Nullrunden (ausgeschieden)</h3>${barChart(st.filter((s) => s.rounds).sort((a, b) => b.busts / b.rounds - a.busts / a.rounds).map((s) => ({ label: s.name, value: s.busts / s.rounds * 100, note: `${s.busts} von ${s.rounds} Runden`, color: pickFor("flip7", PAL2, s.id).c })), { unit: " %", digits: 0 })}`
  });

  // js/games/feuilles.js
  var PAL3 = [
    { n: 1, c: "#4F7A3A" },
    { n: 13, c: "#C4572A" },
    { n: 7, c: "#C89416" },
    { n: 4, c: "#8C2F39" },
    { n: 10, c: "#2F6D6A" },
    { n: 2, c: "#7A5C99" },
    { n: 9, c: "#6B8E23" },
    { n: 5, c: "#A0522D" }
  ];
  var leaf = (n, c, cls = "") => `<span class="lf ${cls}" style="--c:${c}"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3C9 10 6 22 12 32c3 4 8 6 8 6s5-2 8-6c6-10 3-22-8-29z" fill="var(--c)"/><path d="M20 8v30" stroke="rgba(255,255,255,.5)" stroke-width="1.4"/></svg><b>${n}</b></span>`;
  var feuilles_default = makeRoundsGame({
    id: "feuilles",
    name: "13 Feuilles",
    theme: "theme-feuilles",
    themeColor: "#F1EBDD",
    dot: "#C4572A",
    lowWins: true,
    target: null,
    extra: "roundWinner",
    min: 3,
    max: 6,
    labels: { startHint: "Pro Runde: Wer alle Karten los ist, gewinnt die Runde. Die anderen z\xE4hlen die Zahlen auf ihren Restkarten. Am Ende gewinnt die niedrigste Summe.", roundHint: "Der Rundensieger bekommt automatisch 0 Punkte." },
    avatar: (p, size = "dot") => {
      const x = pickFor("feuilles", PAL3, p.id);
      return `<span class="av av-${size}" aria-hidden="true">${leaf(x.n, x.c)}</span>`;
    },
    icons: { pal: PAL3, current: (p) => pickFor("feuilles", PAL3, p.id), render: (x) => leaf(x.n, x.c) },
    colorOf: (id) => pickFor("feuilles", PAL3, id).c,
    logo: () => `<div class="lg-feuilles"><span class="n13">13</span>${leaf("", "#4F7A3A", "l1")}${leaf("", "#C4572A", "l2")}<span class="nm">Feuilles</span></div>`,
    header: () => `<div class="fe-leaves" aria-hidden="true">${[1, 4, 7, 10, 13].map((n, i) => leaf(n, PAL3[i].c, `fl${i}`)).join("")}</div><h1 class="g-title"><span>13</span> Feuilles</h1><p class="g-sub">Werde deine Karten los</p>`,
    extraTiles: (st, T) => [T("Meiste Rundensiege", "rwins", (v) => v, { filter: (s) => s.rwins > 0 }), T("Beste Rundensieg-Quote", "rwRate", fmtPct, { filter: (s) => s.rounds >= 5, note: "ab 5 Runden" })],
    extraCols: [{ key: "rwins", label: "Rundensiege" }],
    moreStats: (st) => `<h3 class="sub-h">Rundensieg-Quote</h3>${barChart(st.filter((s) => s.rounds).sort((a, b) => b.rwRate - a.rwRate).map((s) => ({ label: s.name, value: s.rwRate * 100, note: `${s.rwins} von ${s.rounds} Runden`, color: pickFor("feuilles", PAL3, s.id).c })), { unit: " %", digits: 0 })}`
  });

  // js/games/wins.js
  function makeWinsGame(def) {
    const g2 = { ...def };
    const view3 = { variant: "all" };
    const vName = (k) => (def.variants || []).find(([v]) => v === k)?.[1] || "";
    const filterBar3 = () => def.variants ? `<div class="filters">${seg("variant", [["all", "Alle"], ...def.variants], view3.variant)}</div>` : "";
    const bind2 = (el, redraw) => $$('[data-seg="variant"]', el).forEach((s) => s.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) {
        view3.variant = b.dataset.v;
        redraw();
      }
    }));
    const list2 = () => matchesOf(def.id, (m) => view3.variant === "all" || m.variant === view3.variant);
    function stats2(ms) {
      var _a;
      const st = perPlayer(ms);
      for (const s of st) {
        s.teamWins = 0;
        s.soloWins = 0;
        s.teamGames = 0;
        s.partners = {};
        for (const { m, won } of s.results) {
          const team = (m.teams || []).find((t) => t.includes(s.id));
          if (m.mode === "teams" && team) {
            s.teamGames++;
            if (won) s.teamWins++;
            for (const mate of team) if (mate !== s.id) {
              const p = (_a = s.partners)[mate] || (_a[mate] = { id: mate, name: playerName(mate, m), games: 0, wins: 0 });
              p.games++;
              if (won) p.wins++;
            }
          } else if (won) s.soloWins++;
        }
        const pl = Object.values(s.partners).filter((p) => p.games);
        s.bestPartner = pl.length ? pl.sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0] : null;
      }
      return st;
    }
    function dashboard3(el, ctx) {
      const ms = list2(), st = stats2(ms);
      const T = (title, key, fmt, opts = {}) => {
        const r = top(st, key, opts);
        return statTile(title, r ? fmt(r.value) : "\u2013", r ? whoList(g2, r.who) : '<span class="muted">noch niemand</span>', opts.note || "");
      };
      if (!ms.length) {
        el.innerHTML = `${filterBar3()}<div class="empty-state panel"><p>Noch keine Partie${view3.variant !== "all" ? ` in ${esc(vName(view3.variant))}` : ""}.</p><button class="btn btn-primary" type="button" data-new>Sieg eintragen</button></div>`;
        $("[data-new]", el).onclick = () => ctx.go("neu");
        bind2(el, () => dashboard3(el, ctx));
        return;
      }
      const tiles = [
        T("Meiste Siege", "wins", (v) => v),
        T("Beste Siegquote", "rate", fmtPct, { min: 3, note: "ab 3 Partien" }),
        T("Meiste Partien", "games", (v) => v),
        T("L\xE4ngste Siegesserie", "streak", (v) => plural(v, "Sieg", "Siege"), { filter: (s) => s.streak > 0 }),
        ...def.teams ? [T("Meiste Teamsiege", "teamWins", (v) => v, { filter: (s) => s.teamWins > 0 }), T("Meiste Einzelsiege", "soloWins", (v) => v, { filter: (s) => s.soloWins > 0 })] : []
      ];
      const recent = [...ms].reverse().slice(0, 4);
      el.innerHTML = `${filterBar3()}<div class="stats-grid">${tiles.join("")}</div>
      <section class="panel"><h2 class="panel-title">Zuletzt gewonnen</h2>${recent.map(line2).join("")}<button class="btn btn-ghost wide" type="button" data-all>Alle Partien</button></section>`;
      $("[data-all]", el).onclick = () => ctx.go("verlauf");
      bind2(el, () => dashboard3(el, ctx));
    }
    function line2(m) {
      const w = m.winners || [];
      const teamTxt = m.mode === "teams" && m.teams?.length ? `<div class="teams-line">${m.teams.map((t) => `<span class="team ${t.every((p) => w.includes(p)) ? "win" : ""}">${t.map((p) => `${g2.avatar({ id: p, name: playerName(p, m) }, "mini")}${esc(playerName(p, m))}`).join(" + ")}</span>`).join('<span class="vs">vs</span>')}</div>` : "";
      return `<div class="mini-hist"><span class="hist-date">${fmtDate(m.date)}${m.variant ? ` \xB7 ${esc(vName(m.variant))}` : ""}</span>
      <p class="winline">${def.winIconSmall || "\u{1F3C6}"} <b>${esc(w.map((p) => playerName(p, m)).join(" & "))}</b> ${w.length > 1 ? "gewinnen" : "gewinnt"}</p>
      ${teamTxt || `<p class="others">${m.players.filter((p) => !w.includes(p)).map((p) => `${g2.avatar({ id: p, name: playerName(p, m) }, "mini")}${esc(playerName(p, m))}`).join(" \xB7 ")}</p>`}</div>`;
    }
    let editing3 = null;
    function neu2(el, ctx) {
      const e = editing3;
      editing3 = null;
      const S = {
        id: e?.id,
        created: e?.created,
        date: e?.date || today(),
        variant: e?.variant || (def.variants ? view3.variant !== "all" ? view3.variant : def.variants[0][0] : null),
        sel: new Set(e?.players || []),
        mode: e?.mode || "teams",
        team: {},
        winner: e?.winners?.length ? e.mode === "teams" ? `t${(e.teams || []).findIndex((t) => t.includes(e.winners[0]))}` : e.winners[0] : null
      };
      (e?.teams || []).forEach((t, i) => t.forEach((p) => S.team[p] = i));
      el.innerHTML = `<section class="panel">
        <div class="setup-grid">
          <label class="field"><span>Gespielt am</span><input type="date" id="wDate" value="${S.date}"></label>
          ${def.variants ? `<div><span class="field-label">Variante</span>${seg("wv", def.variants, S.variant)}</div>` : ""}
        </div>
      </section>
      <section class="panel" id="wPick"></section>
      ${def.teams ? '<section class="panel" id="wTeams"></section>' : ""}
      <section class="panel" id="wWin"></section>
      <div class="save-wrap"><button class="btn btn-primary big" type="button" id="wSave">${S.id ? "\xC4nderungen speichern" : "Sieg speichern"}</button></div>`;
      playerPicker($("#wPick", el), { game: g2, selected: S.sel, min: def.min, max: def.max, onChange: () => {
        autoTeams();
        drawTeams();
        drawWin();
      } });
      $('[data-seg="wv"]', el)?.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        S.variant = b.dataset.v;
        $$('[data-seg="wv"] button', el).forEach((x) => x.setAttribute("aria-pressed", x === b));
      });
      const ids = () => [...S.sel];
      const nTeams = () => Math.floor(ids().length / 2);
      const canTeams = () => def.teams && ids().length >= 4 && ids().length % 2 === 0;
      function autoTeams() {
        if (!canTeams()) return;
        const n = nTeams(), cnt = Array(n).fill(0);
        ids().forEach((p) => {
          if (S.team[p] != null && S.team[p] < n && cnt[S.team[p]] < 2) cnt[S.team[p]]++;
          else S.team[p] = null;
        });
        ids().forEach((p) => {
          if (S.team[p] == null) {
            const t = cnt.findIndex((c) => c < 2);
            S.team[p] = t;
            cnt[t]++;
          }
        });
        Object.keys(S.team).forEach((p) => {
          if (!S.sel.has(p)) delete S.team[p];
        });
      }
      const effMode = () => canTeams() ? S.mode : "ffa";
      const teamName = (i) => `Team ${"ABC"[i]}`;
      function drawTeams() {
        const box = $("#wTeams", el);
        if (!box) return;
        if (ids().length < 2) {
          box.innerHTML = '<span class="field-label">Spielmodus</span><p class="hint">Erst Spieler w\xE4hlen.</p>';
          return;
        }
        box.innerHTML = `<span class="field-label">Spielmodus</span>${seg("wm", [["teams", "Teams"], ["ffa", "Jeder gegen jeden"]], effMode())}
        ${!canTeams() ? `<p class="hint">${ids().length % 2 ? "Ungerade Spielerzahl \u2013 es spielt jeder gegen jeden." : "Teams gibt es ab 4 Spielern."}</p>` : ""}
        ${effMode() === "teams" ? `<div class="team-grid">${ids().map((p) => `<div class="team-row"><span class="who">${g2.avatar({ id: p, name: playerName(p) }, "dot")}${esc(playerName(p))}</span>
          <span class="team-btns">${Array.from({ length: nTeams() }, (_, i) => `<button type="button" class="tbtn t${i}" data-p="${p}" data-t="${i}" aria-pressed="${S.team[p] === i}">${"ABC"[i]}</button>`).join("")}</span></div>`).join("")}</div>` : ""}`;
        $('[data-seg="wm"]', box)?.addEventListener("click", (ev) => {
          const b = ev.target.closest("button");
          if (!b || !canTeams()) return;
          S.mode = b.dataset.v;
          S.winner = null;
          drawTeams();
          drawWin();
        });
        $$(".tbtn", box).forEach((b) => b.addEventListener("click", () => {
          S.team[b.dataset.p] = +b.dataset.t;
          S.winner = null;
          drawTeams();
          drawWin();
        }));
      }
      function teams() {
        const n = nTeams();
        return Array.from({ length: n }, (_, i) => ids().filter((p) => S.team[p] === i));
      }
      function drawWin() {
        const box = $("#wWin", el);
        if (ids().length < def.min) {
          box.innerHTML = '<span class="field-label">Wer hat gewonnen?</span><p class="hint">Erst Spieler w\xE4hlen.</p>';
          return;
        }
        if (effMode() === "teams") {
          box.innerHTML = `<span class="field-label">Welches Team hat gewonnen?</span><div class="win-teams">${teams().map((t, i) => `<button type="button" class="win-team t${i}" data-w="t${i}" aria-pressed="${S.winner === `t${i}`}"><span class="tn">${teamName(i)}</span>${t.map((p) => `<span class="who">${g2.avatar({ id: p, name: playerName(p) }, "dot")}${esc(playerName(p))}</span>`).join("")}</button>`).join("")}</div>`;
        } else {
          box.innerHTML = `<span class="field-label">Wer hat gewonnen?</span><div class="chips">${ids().map((p) => `<button type="button" class="chip" data-w="${p}" aria-pressed="${S.winner === p}">${g2.avatar({ id: p, name: playerName(p) }, "dot")}<span>${esc(playerName(p))}</span></button>`).join("")}</div>`;
        }
        $$("[data-w]", box).forEach((b) => b.addEventListener("click", () => {
          S.winner = b.dataset.w;
          drawWin();
        }));
      }
      autoTeams();
      drawTeams();
      drawWin();
      $("#wSave", el).onclick = async () => {
        if (ids().length < def.min) return toast(`W\xE4hle mindestens ${def.min} Spieler.`);
        if (!S.winner) return toast("W\xE4hle, wer gewonnen hat.");
        const mode = effMode();
        if (mode === "teams" && teams().some((t) => t.length !== 2)) return toast("Jedes Team braucht genau zwei Spieler.");
        const winners = mode === "teams" ? teams()[+S.winner.slice(1)] : [S.winner];
        if (!winners?.length) return toast("W\xE4hle, wer gewonnen hat.");
        const m = {
          id: S.id,
          created: S.created,
          game: def.id,
          date: $("#wDate", el).value || today(),
          players: ids(),
          winners,
          ...def.variants ? { variant: S.variant } : {},
          ...def.teams ? { mode, teams: mode === "teams" ? teams() : [] } : {},
          tags: [...def.variants ? [vName(S.variant)] : [], ...def.teams ? [mode === "teams" ? "Teams" : "Jeder gegen jeden"] : [], plural(ids().length, "Spieler", "Spieler")]
        };
        try {
          await saveMatch(m);
          toast(`<b>Gespeichert.</b> Gl\xFCckwunsch, ${esc(winners.map((p) => playerName(p)).join(" & "))}!`, { icon: def.winIcon?.() || "" });
          ctx.go("dashboard");
        } catch (err) {
          toast(esc(err.message));
        }
      };
    }
    function statistik3(el, ctx) {
      const ms = list2(), st = stats2(ms);
      if (!ms.length) {
        el.innerHTML = `${filterBar3()}<div class="empty-state panel"><p>Noch keine Partien in dieser Auswahl.</p></div>`;
        bind2(el, () => statistik3(el, ctx));
        return;
      }
      const cols = [
        { key: "games", label: "Partien" },
        { key: "wins", label: "Siege" },
        { key: "rate", label: "Quote", fmt: fmtPct },
        { key: "streak", label: "Serie" },
        ...def.teams ? [{ key: "teamWins", label: "Team" }, { key: "soloWins", label: "Einzel" }] : []
      ];
      const ids = [...new Set(ms.flatMap((m) => m.players))];
      const series = ids.map((id) => {
        let c = 0;
        const pts = [];
        ms.forEach((m, i) => {
          if (m.players.includes(id)) {
            if (m.winners.includes(id)) c++;
            pts.push({ i, y: c, label: fmtDate(m.date, { day: "2-digit", month: "2-digit" }) + " \xB7 Siege:" });
          }
        });
        return { name: playerName(id, ms.find((m) => m.players.includes(id))), color: def.colorOf(id), points: pts };
      });
      const byN = {};
      ms.forEach((m) => m.players.forEach((p) => {
        var _a;
        const k = m.players.length;
        const o = (_a = byN[p] || (byN[p] = {}))[k] || (_a[k] = { g: 0, w: 0 });
        o.g++;
        if (m.winners.includes(p)) o.w++;
      }));
      const sizes = [...new Set(ms.map((m) => m.players.length))].sort();
      const more = `
      <h3 class="sub-h">Siege im Zeitverlauf</h3>${lineChart(series, { yLabel: "Siege gesamt", xLabels: ms.map((m) => fmtDate(m.date, { day: "2-digit", month: "2-digit" })) })}
      <h3 class="sub-h">Siegquote nach Spielerzahl</h3><div class="table-wrap"><table class="lb"><thead><tr><th class="l">Spieler</th>${sizes.map((n) => `<th>${n} Sp.</th>`).join("")}</tr></thead>
        <tbody>${st.map((s) => `<tr><td class="l">${g2.avatar(s, "mini")}<span class="nm">${esc(s.name)}</span></td>${sizes.map((n) => {
        const o = byN[s.id]?.[n];
        return `<td>${o ? `${fmtPct(o.w / o.g)}<small> (${o.g})</small>` : "\u2013"}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>
      ${def.teams ? `<h3 class="sub-h">Bester Partner</h3><ul class="kings">${st.filter((s) => s.bestPartner).map((s) => `<li><span class="who">${g2.avatar(s, "mini")}${esc(s.name)}</span><span class="k-cat">mit</span><span class="who">${g2.avatar(s.bestPartner, "mini")}${esc(s.bestPartner.name)}</span><b>${s.bestPartner.wins}/${s.bestPartner.games}</b></li>`).join("") || '<li class="muted">Noch keine Teamspiele.</li>'}</ul>` : ""}
      ${def.variants && view3.variant === "all" ? `<h3 class="sub-h">Siege je Variante</h3>${variantTable(ms, st)}` : ""}
      <h3 class="sub-h">Kopf an Kopf</h3><div id="h2h"></div>`;
      el.innerHTML = `${filterBar3()}
      <section class="panel"><h2 class="panel-title">Rangliste</h2>${leaderboard(g2, st, cols)}</section>
      <section class="panel"><h2 class="panel-title">Siegquote</h2>${barChart([...st].sort((a, b) => b.rate - a.rate).map((s) => ({ label: s.name, value: s.rate * 100, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id), note: `${s.wins} von ${s.games}` })), { unit: " %", digits: 0, max: 100 })}</section>
      <section class="panel">${details("Mehr Statistiken", more)}</section>`;
      bind2(el, () => statistik3(el, ctx));
      h2hBlock($("#h2h", el), g2, ms);
    }
    function variantTable(ms, st) {
      return `<div class="table-wrap"><table class="lb"><thead><tr><th class="l">Spieler</th>${def.variants.map(([, n]) => `<th>${esc(n)}</th>`).join("")}</tr></thead><tbody>
      ${st.map((s) => `<tr><td class="l">${g2.avatar(s, "mini")}<span class="nm">${esc(s.name)}</span></td>${def.variants.map(([v]) => {
        const mm = ms.filter((m) => m.variant === v && m.players.includes(s.id));
        return `<td>${mm.length ? `${mm.filter((m) => m.winners.includes(s.id)).length}<small> / ${mm.length}</small>` : "\u2013"}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function verlauf3(el, ctx) {
      historyList(el, ctx, { matches: matchesOf(def.id), line: line2, onEdit: (m) => {
        editing3 = m;
        ctx.go("neu");
      } });
    }
    g2.tabs = { dashboard: dashboard3, neu: neu2, statistik: statistik3, verlauf: verlauf3 };
    return g2;
  }

  // js/games/virus.js
  var PAL4 = [
    { c: "#E63946", e: "grin" },
    { c: "#2F7DF6", e: "wink" },
    { c: "#22A45D", e: "o" },
    { c: "#F5B700", e: "grin" },
    { c: "#8B3FD9", e: "wink" },
    { c: "#FF7A1A", e: "o" },
    { c: "#14B8A6", e: "grin" },
    { c: "#E64CA0", e: "wink" }
  ];
  function blob(c, e = "grin", cls = "") {
    const spikes = Array.from({ length: 9 }, (_, i) => {
      const a = i / 9 * Math.PI * 2, x1 = 20 + Math.cos(a) * 12, y1 = 21 + Math.sin(a) * 12, x2 = 20 + Math.cos(a) * 17.5, y2 = 21 + Math.sin(a) * 17.5;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="2.3"/>`;
    }).join("");
    const eyes = e === "wink" ? '<circle cx="15.5" cy="19" r="2.4" fill="#fff"/><circle cx="15.8" cy="19.3" r="1.2" fill="#1b1b1b"/><path d="M22 19h5" stroke="#1b1b1b" stroke-width="1.8" stroke-linecap="round"/>' : '<circle cx="15.5" cy="19" r="2.6" fill="#fff"/><circle cx="24.5" cy="19" r="2.6" fill="#fff"/><circle cx="16" cy="19.4" r="1.3" fill="#1b1b1b"/><circle cx="25" cy="19.4" r="1.3" fill="#1b1b1b"/>';
    const mouth = e === "o" ? '<ellipse cx="20" cy="26" rx="2.2" ry="2.6" fill="#1b1b1b"/>' : '<path d="M15.5 24.5q4.5 4 9 0" stroke="#1b1b1b" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    return `<svg class="vb ${cls}" viewBox="0 0 40 42" aria-hidden="true"><g stroke="${c}" stroke-width="2.2" fill="${c}">${spikes}</g><circle cx="20" cy="21" r="12.5" fill="${c}"/><ellipse cx="16" cy="15" rx="4" ry="2.2" fill="#fff" opacity=".35"/>${eyes}${mouth}</svg>`;
  }
  var virus_default = makeWinsGame({
    id: "virus",
    name: "Virus!",
    theme: "theme-virus",
    themeColor: "#F4F1FF",
    dot: "#8B3FD9",
    min: 2,
    max: 6,
    avatar: (p, size = "dot") => {
      const x = pickFor("virus", PAL4, p.id);
      return `<span class="av av-${size}" aria-hidden="true">${blob(x.c, x.e)}</span>`;
    },
    icons: { pal: PAL4, current: (p) => pickFor("virus", PAL4, p.id), render: (x) => blob(x.c, x.e) },
    colorOf: (id) => pickFor("virus", PAL4, id).c,
    winIconSmall: "\u{1F9A0}",
    winIcon: () => blob("#22A45D", "grin", "toast-ic"),
    logo: () => `<div class="lg-virus">${blob("#E63946", "grin", "b1")}${blob("#2F7DF6", "wink", "b2")}${blob("#22A45D", "o", "b3")}${blob("#F5B700", "grin", "b4")}<span>Virus!</span></div>`,
    header: () => `<div class="vi-hero" aria-hidden="true">${blob("#E63946", "grin", "h1")}${blob("#2F7DF6", "wink", "h2")}${blob("#22A45D", "o", "h3")}${blob("#F5B700", "grin", "h4")}${blob("#8B3FD9", "wink", "h5")}</div><h1 class="g-title">Virus!</h1><p class="g-sub">Wer zuerst vier gesunde Organe hat, gewinnt</p>`
  });

  // js/games/dog.js
  var PAL5 = [
    { c: "#D62828", n: "Rot" },
    { c: "#1D4ED8", n: "Blau" },
    { c: "#15803D", n: "Gr\xFCn" },
    { c: "#EAB308", n: "Gelb" },
    { c: "#F1EFEA", n: "Wei\xDF" },
    { c: "#27272A", n: "Schwarz" },
    { c: "#EA580C", n: "Orange" },
    { c: "#7C3AED", n: "Lila" }
  ];
  var marble = (c, cls = "") => `<span class="marble ${cls}" style="--c:${c}"></span>`;
  var paw = `<svg viewBox="0 0 32 32" aria-hidden="true" class="paw"><ellipse cx="16" cy="21" rx="7" ry="6"/><ellipse cx="8" cy="13" rx="3" ry="4"/><ellipse cx="13.5" cy="8.5" rx="3" ry="4"/><ellipse cx="18.5" cy="8.5" rx="3" ry="4"/><ellipse cx="24" cy="13" rx="3" ry="4"/></svg>`;
  var dog_default = makeWinsGame({
    id: "dog",
    name: "Dogs",
    theme: "theme-dog",
    themeColor: "#EBDCC3",
    dot: "#1D4ED8",
    min: 2,
    max: 6,
    teams: true,
    variants: [["royal", "Dog Royal"], ["backdog", "Backdog"], ["agent", "Agent Dog"]],
    avatar: (p, size = "dot") => `<span class="av av-${size}" aria-hidden="true">${marble(pickFor("dog", PAL5, p.id).c)}</span>`,
    icons: { pal: PAL5, current: (p) => pickFor("dog", PAL5, p.id), render: (x) => marble(x.c) },
    colorOf: (id) => {
      const c = pickFor("dog", PAL5, id).c;
      return c === "#F1EFEA" ? "#A8A29E" : c;
    },
    winIconSmall: "\u{1F43E}",
    winIcon: () => paw,
    logo: () => `<div class="lg-dog"><div class="track">${["#D62828", "#1D4ED8", "#15803D", "#EAB308"].map((c) => marble(c)).join("")}</div>${paw}<span>Dogs</span></div>`,
    header: () => `<div class="dg-board" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i class="hole ${i % 4 === 1 ? "on" : ""}" style="${i % 4 === 1 ? `--c:${PAL5[(i >> 2) % 4].c}` : ""}"></i>`).join("")}</div><h1 class="g-title">Dogs</h1><p class="g-sub">Dog Royal \xB7 Backdog \xB7 Agent Dog</p>`
  });

  // js/games/wizard.js
  var PAL6 = [
    { c: "#D7263D" },
    { c: "#2F7DE1" },
    { c: "#22A05A" },
    { c: "#E8B008" },
    { c: "#9B5DE5" },
    { c: "#F28C28" },
    { c: "#17B3B3" },
    { c: "#E05BA8" }
  ];
  var hat = (c, cls = "") => `<svg class="wz-hat ${cls}" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 C 24 12, 28 22, 31 30 L 9 30 C 13 22, 15 12, 20 3 Z" fill="${c}"/><path d="M20 3 C 22 9 25 12 30 13" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="31" rx="16" ry="4.5" fill="${c}"/><ellipse cx="20" cy="30" rx="16" ry="4" fill="rgba(0,0,0,.18)"/><path d="M18 16l1.2 2.6 2.8.3-2.1 1.9.6 2.8L18 22.2l-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="#FFE9A8"/><circle cx="24" cy="24" r="1.2" fill="#FFE9A8"/><circle cx="14" cy="11" r=".9" fill="#FFE9A8"/></svg>`;
  var card2 = (c, sym, cls = "") => `<span class="wz-card ${cls}" style="--c:${c}"><b>${sym}</b></span>`;
  var wizard_default = makeRoundsGame({
    id: "wizard",
    name: "Wizard",
    theme: "theme-wizard",
    themeColor: "#1E2140",
    dot: "#E8C46A",
    lowWins: false,
    target: null,
    extra: "wizard",
    min: 3,
    max: 6,
    maxRounds: (n) => Math.floor(60 / n),
    labels: { startHint: "Gespielt wird mit 60 Karten: bei 3 Spielern 20 Runden, bei 4 Spielern 15, bei 5 Spielern 12, bei 6 Spielern 10. Pro Runde Ansage und Stiche eintragen \u2013 die Punkte rechnet die App.", roundHint: "Richtig angesagt: 20 Punkte + 10 je Stich. Daneben: \u221210 je Stich Abweichung." },
    avatar: (p, size = "dot") => `<span class="av av-${size}" aria-hidden="true">${hat(pickFor("wizard", PAL6, p.id).c)}</span>`,
    icons: { pal: PAL6, current: (p) => pickFor("wizard", PAL6, p.id), render: (x) => hat(x.c) },
    colorOf: (id) => pickFor("wizard", PAL6, id).c,
    logo: () => `<div class="lg-wizard"><span class="moon"></span>${card2("#D7263D", "\u2605", "c1")}${card2("#2F7DE1", "Z", "c2")}${card2("#22A05A", "\u2605", "c3")}<span class="nm">Wizard</span></div>`,
    header: () => `<div class="wz-sky" aria-hidden="true"></div><div class="wz-fan" aria-hidden="true">${card2("#D7263D", "\u2605", "f1")}${card2("#2F7DE1", "Z", "f2")}${card2("#E8B008", "N", "f3")}${card2("#22A05A", "\u2605", "f4")}</div><h1 class="g-title">Wizard</h1><p class="g-sub">Sag an, wie viele Stiche du machst</p>`,
    winIcon: () => hat("#E8C46A", "toast-ic"),
    extraTiles: (st, T) => [T("Beste Trefferquote", "hitRate", fmtPct, { filter: (s) => s.rounds >= 10, note: "richtige Ansagen, ab 10 Runden" }), T("L\xE4ngste Trefferserie", "hitBest", (v) => `${v} Runden`, { filter: (s) => s.hitBest > 0 })],
    extraCols: [{ key: "hitRate", label: "Treffer", fmt: fmtPct }],
    moreStats: (st) => `<h3 class="sub-h">Trefferquote (richtige Ansagen)</h3>${barChart(st.filter((s) => s.hitRate != null).sort((a, b) => b.hitRate - a.hitRate).map((s) => ({ label: s.name, value: s.hitRate * 100, note: `${s.hits} von ${s.rounds} Runden`, color: pickFor("wizard", PAL6, s.id).c })), { unit: " %", digits: 0, max: 100 })}
    <h3 class="sub-h">\xD8 Ansage pro Runde</h3>${barChart(st.filter((s) => s.avgBid != null).sort((a, b) => b.avgBid - a.avgBid).map((s) => ({ label: s.name, value: s.avgBid, note: "wer mutig ansagt", color: pickFor("wizard", PAL6, s.id).c })))}`
  });

  // js/games/scores.js
  function makeScoreGame(def) {
    const g2 = { ...def };
    const view3 = { variant: "all" };
    const vName = (k) => (def.variants || []).find(([v]) => v === k)?.[1] || "";
    const awardsOf = (v) => def.awards?.[v] || [];
    const filterBar3 = () => def.variants ? `<div class="filters">${seg("variant", [["all", "Alle"], ...def.variants], view3.variant)}</div>` : "";
    const bind2 = (el, redraw) => $$('[data-seg="variant"]', el).forEach((s) => s.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) {
        view3.variant = b.dataset.v;
        redraw();
      }
    }));
    const list2 = () => matchesOf(def.id, (m) => view3.variant === "all" || m.variant === view3.variant);
    const unit = def.unit || "Punkte";
    const theme = (v) => {
      if (def.variantTheme) {
        if (v && v !== "all") document.body.dataset.variant = v;
        else delete document.body.dataset.variant;
      }
    };
    function stats2(ms) {
      const st = perPlayer(ms);
      for (const s of st) {
        s.awards = {};
        for (const { m } of s.results) for (const [k, who] of Object.entries(m.awards || {})) if (who === s.id) s.awards[k] = (s.awards[k] || 0) + 1;
        s.awardTotal = Object.values(s.awards).reduce((a, b) => a + b, 0);
        const gaps = s.results.filter((r) => r.total != null).map((r) => Math.max(...Object.values(r.m.totals)) - r.total);
        s.gap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
      }
      return st;
    }
    function dashboard3(el, ctx) {
      theme(view3.variant);
      const ms = list2(), st = stats2(ms);
      if (!ms.length) {
        el.innerHTML = `${filterBar3()}<div class="empty-state panel"><p>Noch keine Partie${view3.variant !== "all" ? ` in ${esc(vName(view3.variant))}` : ""}.</p><button class="btn btn-primary" type="button" data-new>Partie eintragen</button></div>`;
        $("[data-new]", el).onclick = () => ctx.go("neu");
        bind2(el, () => dashboard3(el, ctx));
        return;
      }
      const T = (title, key, fmt, opts = {}) => {
        const r = top(st, key, opts);
        return statTile(title, r ? fmt(r.value) : "\u2013", r ? whoList(g2, r.who) : '<span class="muted">noch niemand</span>', opts.note || "");
      };
      const tiles = [
        T("Meiste Siege", "wins", (v) => v),
        T("Beste Siegquote", "rate", fmtPct, { min: 3, note: "ab 3 Partien" }),
        T(`Bester \xD8`, "avg", (v) => fmtNum(v), { note: unit }),
        T("Rekord", "best", (v) => fmtNum(v, 0), { note: unit }),
        T("Meiste Partien", "games", (v) => v),
        T("L\xE4ngste Siegesserie", "streak", (v) => plural(v, "Sieg", "Siege"), { filter: (s) => s.streak > 0 })
      ];
      const recent = [...ms].reverse().slice(0, 3);
      el.innerHTML = `${filterBar3()}<div class="stats-grid">${tiles.join("")}</div>
      <section class="panel"><h2 class="panel-title">Zuletzt gespielt</h2>${recent.map((m) => `<div class="mini-hist"><span class="hist-date">${fmtDate(m.date)}${m.variant ? ` \xB7 ${esc(vName(m.variant))}` : ""}</span>${rankedLine(g2, m)}</div>`).join("")}
      <button class="btn btn-ghost wide" type="button" data-all>Alle Partien</button></section>`;
      $("[data-all]", el).onclick = () => ctx.go("verlauf");
      bind2(el, () => dashboard3(el, ctx));
    }
    let editing3 = null;
    function neu2(el, ctx) {
      const e = editing3;
      editing3 = null;
      const S = {
        id: e?.id,
        created: e?.created,
        date: e?.date || today(),
        variant: e?.variant || (def.variants ? view3.variant !== "all" ? view3.variant : def.variants[0][0] : null),
        sel: new Set(e?.players || []),
        pts: { ...e?.totals || {} },
        awards: { ...e?.awards || {} },
        tie: e?.winners?.length > 1 ? "shared" : e?.winners?.[0] || null
      };
      theme(S.variant);
      el.innerHTML = `<section class="panel"><div class="setup-grid">
        <label class="field"><span>Gespielt am</span><input type="date" id="sDate" value="${S.date}"></label>
        ${def.variants ? `<div><span class="field-label">Variante</span>${seg("sv", def.variants, S.variant)}</div>` : ""}
      </div></section>
      <section class="panel" id="sPick"></section>
      <section class="panel" id="sPts"></section>
      <div class="save-wrap"><button class="btn btn-primary big" type="button" id="sSave">${S.id ? "\xC4nderungen speichern" : "Partie speichern"}</button></div>`;
      playerPicker($("#sPick", el), { game: g2, selected: S.sel, min: def.min, max: def.max, onChange: () => draw() });
      $('[data-seg="sv"]', el)?.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        S.variant = b.dataset.v;
        theme(S.variant);
        $$('[data-seg="sv"] button', el).forEach((x) => x.setAttribute("aria-pressed", x === b));
        draw();
      });
      const ids = () => playersByCreated().filter((p) => S.sel.has(p.id)).map((p) => p.id).concat([...S.sel].filter((id) => !playersByCreated().some((p) => p.id === id)));
      function leaders() {
        const v = ids().map((p) => +S.pts[p] || 0);
        const mx = Math.max(...v);
        return ids().filter((p) => (+S.pts[p] || 0) === mx);
      }
      function draw() {
        const box = $("#sPts", el), P = ids();
        if (P.length < def.min) {
          box.innerHTML = `<span class="field-label">${esc(unit)}</span><p class="hint">W\xE4hle mindestens ${def.min} Spieler.</p>`;
          return;
        }
        const aw = awardsOf(S.variant);
        box.innerHTML = `<h2 class="panel-title">${esc(unit)}</h2><div class="rinputs">${P.map((p) => `<div class="rin" data-p="${p}">
          <span class="rin-name">${g2.avatar({ id: p, name: playerName(p, e) }, "dot")}${esc(playerName(p, e))}</span>
          <span class="rin-num">${def.negative ? `<button type="button" class="pm" data-pm="${p}" aria-label="Vorzeichen umdrehen">\xB1</button>` : ""}<input type="${def.negative ? "text" : "number"}" inputmode="numeric" pattern="-?[0-9]*" data-pts="${p}" value="${S.pts[p] ?? ""}" placeholder="0" aria-label="${esc(unit)} ${esc(playerName(p, e))}"></span>
        </div>`).join("")}</div>
        ${def.hint ? `<p class="hint">${def.hint(S.variant)}</p>` : ""}
        ${aw.map((a) => `<div class="award"><span class="field-label">${esc(a)}</span><div class="chips" data-award="${esc(a)}">${P.map((p) => `<button type="button" class="chip" data-id="${p}" aria-pressed="${S.awards[a] === p}">${g2.avatar({ id: p, name: playerName(p, e) }, "mini")}<span>${esc(playerName(p, e))}</span></button>`).join("")}</div></div>`).join("")}
        <div id="sTie"></div>`;
        $$("[data-pts]", box).forEach((i) => i.addEventListener("input", () => {
          S.pts[i.dataset.pts] = parseInt(i.value, 10);
          tie();
        }));
        $$("[data-pm]", box).forEach((b) => b.addEventListener("click", () => {
          const i = $(`[data-pts="${b.dataset.pm}"]`, box);
          const v = parseInt(i.value || "0", 10) || 0;
          i.value = v === 0 ? i.value.startsWith("-") ? "" : "-" : -v;
          S.pts[b.dataset.pm] = parseInt(i.value, 10);
          tie();
          i.focus();
        }));
        $$("[data-award]", box).forEach((c) => c.addEventListener("click", (ev) => {
          const b = ev.target.closest(".chip");
          if (!b) return;
          const a = c.dataset.award;
          S.awards[a] = S.awards[a] === b.dataset.id ? null : b.dataset.id;
          $$(".chip", c).forEach((x) => x.setAttribute("aria-pressed", S.awards[a] === x.dataset.id));
        }));
        tie();
      }
      function tie() {
        const box = $("#sTie", el);
        if (!box) return;
        const L = leaders(), any = ids().some((p) => S.pts[p]);
        if (L.length < 2 || !any) {
          box.innerHTML = "";
          S.tie = null;
          return;
        }
        box.innerHTML = `<div class="tie"><span class="field-label">Gleichstand an der Spitze \u2013 wer hat gewonnen?</span><div class="chips">${L.map((p) => `<button type="button" class="chip" data-tie="${p}" aria-pressed="${S.tie === p}">${g2.avatar({ id: p, name: playerName(p, e) }, "mini")}<span>${esc(playerName(p, e))}</span></button>`).join("")}<button type="button" class="chip" data-tie="shared" aria-pressed="${S.tie === "shared"}"><span>Geteilter Sieg</span></button></div>${def.tieHint ? `<p class="hint">${def.tieHint}</p>` : ""}</div>`;
        $$("[data-tie]", box).forEach((b) => b.addEventListener("click", () => {
          S.tie = b.dataset.tie;
          tie();
        }));
      }
      draw();
      $("#sSave", el).onclick = async () => {
        const P = ids();
        if (P.length < def.min) return toast(`W\xE4hle mindestens ${def.min} Spieler.`);
        const totals = Object.fromEntries(P.map((p) => [p, Number.isFinite(S.pts[p]) ? S.pts[p] : 0]));
        if (Object.values(totals).every((v) => v === 0)) return toast(`Es sind noch keine ${esc(unit)} eingetragen.`);
        const L = leaders();
        if (L.length > 1 && !S.tie) return toast("Gleichstand: W\xE4hle, wer gewonnen hat.");
        const winners = L.length > 1 ? S.tie === "shared" ? L : [S.tie] : L;
        const pl = places(totals);
        if (winners.length === 1 && L.length > 1) L.forEach((p) => {
          if (p !== winners[0]) pl[p] = 2;
        });
        const awards = Object.fromEntries(Object.entries(S.awards).filter(([k, v]) => v && P.includes(v) && awardsOf(S.variant).includes(k)));
        const m = {
          id: S.id,
          created: S.created,
          game: def.id,
          date: $("#sDate", el).value || today(),
          players: P,
          totals,
          places: pl,
          winners,
          ...def.variants ? { variant: S.variant } : {},
          ...Object.keys(awards).length ? { awards } : {},
          tags: [...def.variants ? [vName(S.variant)] : [], plural(P.length, "Spieler", "Spieler")]
        };
        try {
          await saveMatch(m);
          toast(`<b>Gespeichert.</b> ${esc(winners.map((p) => playerName(p)).join(" & "))} ${winners.length > 1 ? "gewinnen" : "gewinnt"} mit ${fmtNum(totals[winners[0]], 0)} ${esc(unit)}.`, { icon: def.winIcon?.() || "" });
          view3.variant = def.variants ? S.variant : "all";
          ctx.go("dashboard");
        } catch (err) {
          toast(esc(err.message));
        }
      };
    }
    function statistik3(el, ctx) {
      theme(view3.variant);
      const ms = list2(), st = stats2(ms);
      if (!ms.length) {
        el.innerHTML = `${filterBar3()}<div class="empty-state panel"><p>Noch keine Partien in dieser Auswahl.</p></div>`;
        bind2(el, () => statistik3(el, ctx));
        return;
      }
      const cols = [{ key: "games", label: "Partien" }, { key: "wins", label: "Siege" }, { key: "rate", label: "Quote", fmt: fmtPct }, { key: "avg", label: "\xD8", fmt: (v) => fmtNum(v) }, { key: "best", label: "Rekord" }];
      const groups = {};
      ms.forEach((m) => {
        var _a;
        (groups[_a = m.players.length] || (groups[_a] = [])).push(...Object.values(m.totals || {}));
      });
      const allAwards = [...new Set((def.variants || [[null]]).flatMap(([v]) => awardsOf(v)))];
      const more = `
      <h3 class="sub-h">${esc(unit)} im Verlauf</h3>${trendChart(g2, ms, (m, id) => m.totals?.[id], { colors: (id) => def.colorOf(id), label: unit })}
      <h3 class="sub-h">\xD8 Abstand zum Sieger</h3>${barChart([...st].filter((s) => s.gap != null).sort((a, b) => a.gap - b.gap).map((s) => ({ label: s.name, value: s.gap, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id), note: "kleiner ist besser" })))}
      <h3 class="sub-h">\xD8 ${esc(unit)} nach Spielerzahl</h3>${barChart(Object.entries(groups).sort().map(([n, v]) => ({ label: `${n} Spieler`, value: v.reduce((a, b) => a + b, 0) / v.length })))}
      <h3 class="sub-h">L\xE4ngste Siegesserie</h3>${barChart([...st].filter((s) => s.streak).sort((a, b) => b.streak - a.streak).map((s) => ({ label: s.name, value: s.streak, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id), note: s.current ? `aktuell ${s.current}` : "" })), { digits: 0 })}
      ${allAwards.map((a) => `<h3 class="sub-h">${esc(a)}</h3>${barChart(st.filter((s) => s.awards[a]).sort((x, y) => y.awards[a] - x.awards[a]).map((s) => ({ label: s.name, value: s.awards[a], icon: g2.avatar(s, "mini"), color: def.colorOf(s.id) })), { digits: 0 })}`).join("")}
      ${def.variants && view3.variant === "all" ? `<h3 class="sub-h">Siege je Variante</h3>${variantTable(ms, st)}` : ""}
      <h3 class="sub-h">Kopf an Kopf</h3><div id="h2h"></div>`;
      el.innerHTML = `${filterBar3()}
      <section class="panel"><h2 class="panel-title">Rangliste</h2>${leaderboard(g2, st, cols)}</section>
      <section class="panel"><h2 class="panel-title">\xD8 ${esc(unit)}</h2>${barChart([...st].sort((a, b) => b.avg - a.avg).map((s) => ({ label: s.name, value: s.avg, icon: g2.avatar(s, "mini"), color: def.colorOf(s.id), note: `Rekord ${s.best}` })))}</section>
      <section class="panel">${details("Mehr Statistiken", more)}</section>`;
      bind2(el, () => statistik3(el, ctx));
      h2hBlock($("#h2h", el), g2, ms);
    }
    function variantTable(ms, st) {
      return `<div class="table-wrap"><table class="lb"><thead><tr><th class="l">Spieler</th>${def.variants.map(([, n]) => `<th>${esc(n)}</th>`).join("")}</tr></thead><tbody>
      ${st.map((s) => `<tr><td class="l">${g2.avatar(s, "mini")}<span class="nm">${esc(s.name)}</span></td>${def.variants.map(([v]) => {
        const mm = ms.filter((m) => m.variant === v && m.players.includes(s.id));
        return `<td>${mm.length ? `${mm.filter((m) => m.winners.includes(s.id)).length}<small> / ${mm.length}</small>` : "\u2013"}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function verlauf3(el, ctx) {
      theme(view3.variant);
      historyList(el, ctx, { matches: matchesOf(def.id), line: (m) => rankedLine(g2, m) + (m.awards ? `<p class="others">${Object.entries(m.awards).map(([a, p]) => `${esc(a)}: <b>${esc(playerName(p, m))}</b>`).join(" \xB7 ")}</p>` : ""), onEdit: (m) => {
        editing3 = m;
        ctx.go("neu");
      } });
    }
    g2.tabs = { dashboard: dashboard3, neu: neu2, statistik: statistik3, verlauf: verlauf3 };
    return g2;
  }

  // js/games/dominion.js
  var PAL7 = [
    { c: "#B8733C", n: "Kupfer" },
    { c: "#8E9399", n: "Silber" },
    { c: "#C9A227", n: "Gold" },
    { c: "#5E8F32", n: "Anwesen" },
    { c: "#2F5D2B", n: "Provinz" },
    { c: "#6B3A8C", n: "Fluch" },
    { c: "#3A6BA8", n: "Trank" },
    { c: "#A23B3B", n: "Herzogtum" }
  ];
  var shield = (c, cls = "") => `<svg class="dm-shield ${cls}" viewBox="0 0 40 44" aria-hidden="true"><path d="M20 2 L36 8 V20 C36 31 28 38 20 42 C12 38 4 31 4 20 V8 Z" fill="${c}" stroke="#F3E6C8" stroke-width="2.5"/><path d="M12 25 L14 15 L18 20 L20 13 L22 20 L26 15 L28 25 Z" fill="#F3E6C8"/><rect x="12" y="26" width="16" height="3" rx="1" fill="#F3E6C8"/></svg>`;
  var coin = (c, v, cls = "") => `<span class="dm-coin ${cls}" style="--c:${c}"><b>${v}</b></span>`;
  var dominion_default = makeScoreGame({
    id: "dominion",
    name: "Dominion",
    theme: "theme-dominion",
    themeColor: "#EFE6D2",
    dot: "#C9A227",
    min: 2,
    max: 6,
    negative: true,
    unit: "Siegpunkte",
    hint: () => "Siegpunkte am Ende zusammenz\xE4hlen \u2013 Fl\xFCche als Minuspunkte (\xB1 dr\xFCcken).",
    tieHint: "Laut Regel gewinnt bei Gleichstand, wer weniger Z\xFCge hatte \u2013 sonst ist es ein geteilter Sieg.",
    avatar: (p, size = "dot") => `<span class="av av-${size}" aria-hidden="true">${shield(pickFor("dominion", PAL7, p.id).c)}</span>`,
    icons: { pal: PAL7, current: (p) => pickFor("dominion", PAL7, p.id), render: (x) => shield(x.c) },
    colorOf: (id) => pickFor("dominion", PAL7, id).c,
    winIcon: () => shield("#C9A227", "toast-ic"),
    logo: () => `<div class="lg-dominion">${coin("#B8733C", 1, "c1")}${coin("#8E9399", 2, "c2")}${coin("#C9A227", 3, "c3")}<span class="nm">Dominion</span></div>`,
    header: () => `<div class="dm-coins" aria-hidden="true">${coin("#B8733C", 1, "k1")}${coin("#8E9399", 2, "k2")}${coin("#C9A227", 3, "k3")}${shield("#2F5D2B", "k4")}</div><h1 class="g-title">Dominion</h1><p class="g-sub">Wer baut das gr\xF6\xDFte K\xF6nigreich?</p>`
  });

  // js/games/catan.js
  var PAL8 = [
    { c: "#C0392B", n: "Rot" },
    { c: "#2C64B5", n: "Blau" },
    { c: "#E67E22", n: "Orange" },
    { c: "#F4F1EA", n: "Wei\xDF" },
    { c: "#2E8B57", n: "Gr\xFCn" },
    { c: "#7B4A2A", n: "Braun" },
    { c: "#8E44AD", n: "Lila" },
    { c: "#16A085", n: "T\xFCrkis" }
  ];
  var house = (c, cls = "") => `<svg class="ct-house ${cls}" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 20 L20 8 L32 20 V34 H8 Z" fill="${c}" stroke="#3B2A1A" stroke-width="2.4" stroke-linejoin="round"/><rect x="17" y="24" width="6" height="10" fill="rgba(0,0,0,.25)"/></svg>`;
  var HEX = { wood: "#2F7D32", brick: "#C1440E", wheat: "#E9B824", sheep: "#8BC34A", ore: "#78909C", desert: "#E6CF97" };
  var EICON = { "wind": '<svg viewBox="0 0 40 40"><path d="M20 21 L19 38 H21 Z" fill="#fff"/><circle cx="20" cy="18" r="2.4" fill="#fff"/><path d="M20 18 L20 4 Q23 10 20.8 18Z M20 18 L32 25 Q26 25 19.6 18.8Z M20 18 L8 25 Q12 20 19.6 17.4Z" fill="#fff"/></svg>', "sun": '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="7" fill="#fff"/><g stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M20 5v5M20 30v5M5 20h5M30 20h5M9.5 9.5l3.5 3.5M27 27l3.5 3.5M9.5 30.5l3.5-3.5M27 13l3.5-3.5"/></g></svg>', "bolt": '<svg viewBox="0 0 40 40"><path d="M23 4 L10 23 H19 L16 36 L30 16 H21 Z" fill="#fff"/></svg>', "leaf": '<svg viewBox="0 0 40 40"><path d="M32 8 C14 8 8 18 9 31 C22 32 32 24 32 8Z" fill="#fff"/><path d="M10 30 L24 16" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>' };
  var ehex = (c, cls, ic) => `<span class="ct-hex ${cls}" style="--c:${c}"><i class="eic">${EICON[ic]}</i></span>`;
  var ROCKET = '<svg class="rocket" viewBox="0 0 60 60"><path d="M30 4 C40 12 42 26 38 40 H22 C18 26 20 12 30 4Z" fill="#E8EEFF"/><circle cx="30" cy="22" r="5" fill="#2C64B5" stroke="#9AA7CF" stroke-width="2"/><path d="M22 34 L13 44 L22 42Z M38 34 L47 44 L38 42Z" fill="#FF6B3D"/><path d="M25 40 Q30 56 35 40Z" fill="#FFB13D"/></svg>';
  var hex = (c, cls = "", n = "") => `<span class="ct-hex ${cls}" style="--c:${c}">${n ? `<b>${n}</b>` : ""}</span>`;
  var catan_default = makeScoreGame({
    id: "catan",
    name: "Catan",
    theme: "theme-catan",
    themeColor: "#BFDDEA",
    dot: "#C0392B",
    min: 2,
    max: 6,
    unit: "Siegpunkte",
    variants: [["normal", "Normal"], ["energie", "Catan Energie"], ["raumfahrer", "Raumfahrer"]],
    awards: { normal: ["L\xE4ngste Handelsstra\xDFe", "Gr\xF6\xDFte Rittermacht"] },
    hint: (v) => v === "normal" ? "Siegpunkte am Ende inkl. Siegpunktkarten. Unten optional: wer die Handelsstra\xDFe und die Rittermacht hatte." : "Siegpunkte am Spielende eintragen.",
    avatar: (p, size = "dot") => `<span class="av av-${size}" aria-hidden="true">${house(pickFor("catan", PAL8, p.id).c)}</span>`,
    icons: { pal: PAL8, current: (p) => pickFor("catan", PAL8, p.id), render: (x) => house(x.c) },
    colorOf: (id) => {
      const c = pickFor("catan", PAL8, id).c;
      return c === "#F4F1EA" ? "#A8A29E" : c;
    },
    winIcon: () => house("#C0392B", "toast-ic"),
    logo: () => `<div class="lg-catan">${hex(HEX.wood, "h1")}${hex(HEX.wheat, "h2", 8)}${hex(HEX.brick, "h3")}${hex(HEX.sheep, "h4", 6)}${hex(HEX.ore, "h5")}<span class="nm">Catan</span></div>`,
    variantTheme: true,
    header: () => `<div class="ct-board v-normal" aria-hidden="true">${hex(HEX.wood, "b1")}${hex(HEX.wheat, "b2", 9)}${hex(HEX.brick, "b3", 5)}${hex(HEX.sheep, "b4")}${hex(HEX.desert, "b5")}${hex(HEX.ore, "b6", 8)}${hex(HEX.wood, "b7", 4)}${house("#C0392B", "s1")}${house("#2C64B5", "s2")}</div>
    <div class="ct-board ct-energy v-energie" aria-hidden="true">${ehex("#0E8F6E", "b1", "wind")}${ehex("#F2B705", "b2", "sun")}${ehex("#2E7D32", "b3", "leaf")}${ehex("#1E88C8", "b4", "bolt")}${ehex("#7CB342", "b5", "wind")}${ehex("#F2B705", "b6", "sun")}${ehex("#0E8F6E", "b7", "bolt")}</div>
    <div class="ct-space v-raumfahrer" aria-hidden="true"><span class="planet p1"></span><span class="planet p2"></span><span class="planet p3"></span>${ROCKET}</div>
    <h1 class="g-title">Catan</h1><p class="g-sub"><span class="v-normal">Normal \xB7 Catan Energie \xB7 Raumfahrer</span><span class="v-energie">Catan Energie \u2013 Wind, Sonne, Strom</span><span class="v-raumfahrer">Raumfahrer \u2013 auf zu neuen Sternen</span></p>`
  });

  // js/games/schiffe.js
  var FLEETS = {
    klassisch: { name: "Klassisch", note: "5 Schiffe \xB7 17 Felder", ships: [
      { k: "traeger", n: "Flugzeugtr\xE4ger", len: 5, count: 1 },
      { k: "schlacht", n: "Schlachtschiff", len: 4, count: 1 },
      { k: "zerstoerer3", n: "Zerst\xF6rer", len: 3, count: 2 },
      { k: "patrouille", n: "Patrouillenboot", len: 2, count: 1 }
    ] }
  };
  var OLD = { kreuzer: "zerstoerer3", uboot: "zerstoerer3", zerstoerer: "patrouille" };
  var normSunk = (o = {}) => {
    const r = {};
    for (const [k, c] of Object.entries(o)) {
      const nk = OLD[k] || k;
      r[nk] = (r[nk] || 0) + c;
    }
    return r;
  };
  var VARIANTS = Object.entries(FLEETS).map(([k, f]) => [k, f.name]);
  var fleetOf = () => FLEETS.klassisch;
  var ONE = VARIANTS.length < 2;
  var fleetSize = (v) => fleetOf(v).ships.reduce((a, s) => a + s.count, 0);
  var shipLen = (v, k) => fleetOf(v).ships.find((s) => s.k === k)?.len || 0;
  function shipSvg(k, len, { sunk = false, cls = "" } = {}) {
    const W = len * 20, H = 16, hull = sunk ? "#5E6B78" : "#A9B6C2", deck = sunk ? "#4A5562" : "#7E8C99", line2 = "#2B3947";
    let body;
    if (k === "patrouille") body = `<path d="M3 5 H${W - 10} Q${W - 1} 8 ${W - 10} 11 H3 Q1 8 3 5Z" fill="${hull}" stroke="${line2}" stroke-width="1.2"/><rect x="10" y="6" width="9" height="4" rx="1.5" fill="${deck}"/><circle cx="27" cy="8" r="1.6" fill="${deck}"/>`;
    else if (k === "uboot") body = `<rect x="2" y="3" width="${W - 4}" height="10" rx="5" fill="${hull}" stroke="${line2}" stroke-width="1.2"/><rect x="${W / 2 - 6}" y="5" width="12" height="6" rx="2" fill="${deck}"/>`;
    else {
      body = `<path d="M3 4 H${W - 12} Q${W - 1} 8 ${W - 12} 12 H3 Q1 8 3 4Z" fill="${hull}" stroke="${line2}" stroke-width="1.2"/>`;
      if (k === "traeger") body += `<rect x="6" y="5.6" width="${W - 22}" height="4.8" fill="${deck}"/><path d="M10 8 H${W - 20}" stroke="#E8EEF3" stroke-width=".8" stroke-dasharray="4 3"/><rect x="${W - 34}" y="2.5" width="6" height="4" fill="${deck}" stroke="${line2}" stroke-width=".8"/>`;
      else for (let i = 0; i < len - 1; i++) body += `<rect x="${10 + i * 20}" y="6" width="${i === 1 ? 10 : 7}" height="4" rx="1" fill="${deck}"/>`;
    }
    const pegs = sunk ? Array.from({ length: len }, (_, i) => `<circle cx="${10 + i * 20}" cy="8" r="3.4" fill="#E63946" stroke="#7A1018" stroke-width=".8"/>`).join("") : "";
    return `<svg class="ship ${sunk ? "sunk" : ""} ${cls}" viewBox="0 0 ${W} ${H}" style="width:${len * 22}px" aria-hidden="true">${body}${pegs}</svg>`;
  }
  var FLAGS = [
    { n: "Flagge L", d: '<rect width="30" height="20" fill="#F6C90E"/><rect width="15" height="10" fill="#1B1B1B"/><rect x="15" y="10" width="15" height="10" fill="#1B1B1B"/>' },
    { n: "Flagge O", d: '<rect width="30" height="20" fill="#F6C90E"/><path d="M0 0 H30 V20Z" fill="#D7263D"/>' },
    { n: "Flagge U", d: '<rect width="30" height="20" fill="#fff"/><rect width="15" height="10" fill="#D7263D"/><rect x="15" y="10" width="15" height="10" fill="#D7263D"/>' },
    { n: "Flagge N", d: '<rect width="30" height="20" fill="#fff"/>' + [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => (r + c) % 2 ? "" : `<rect x="${c * 7.5}" y="${r * 5}" width="7.5" height="5" fill="#1D4E9E"/>`)).join("") },
    { n: "Flagge F", d: '<rect width="30" height="20" fill="#fff"/><path d="M15 2 L27 10 L15 18 L3 10Z" fill="#D7263D"/>' },
    { n: "Flagge K", d: '<rect width="15" height="20" fill="#F6C90E"/><rect x="15" width="15" height="20" fill="#1D4E9E"/>' },
    { n: "Flagge T", d: '<rect width="10" height="20" fill="#D7263D"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#1D4E9E"/>' },
    { n: "Flagge P", d: '<rect width="30" height="20" fill="#1D4E9E"/><rect x="9" y="6" width="12" height="8" fill="#fff"/>' },
    { n: "Flagge I", d: '<rect width="30" height="20" fill="#F6C90E"/><circle cx="15" cy="10" r="5.5" fill="#1B1B1B"/>' },
    { n: "Flagge X", d: '<rect width="30" height="20" fill="#fff"/><rect x="12" width="6" height="20" fill="#1D4E9E"/><rect y="7" width="30" height="6" fill="#1D4E9E"/>' },
    { n: "Flagge H", d: '<rect width="15" height="20" fill="#fff"/><rect x="15" width="15" height="20" fill="#D7263D"/>' },
    { n: "Flagge J", d: '<rect width="30" height="20" fill="#1D4E9E"/><rect y="7" width="30" height="6" fill="#fff"/>' }
  ];
  var FLAG_COLOR = ["#C9A40B", "#D7263D", "#B8323F", "#1D4E9E", "#E0525F", "#2F6FC4", "#7D3C98", "#3A6EA5", "#8C7A0A", "#4F7CC2", "#C2185B", "#14708C"];
  var flag = (x) => `<svg class="sflag" viewBox="0 0 34 24" aria-hidden="true"><g transform="translate(2 2)">${x.d}<rect width="30" height="20" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1" rx="1.5"/></g></svg>`;
  var sunkOf = (m, pid) => normSunk(m.sunk?.[pid]);
  var countSunk = (m, pid) => Object.values(sunkOf(m, pid)).reduce((a, b) => a + (+b || 0), 0);
  var hitsOf = (m, pid) => Object.entries(sunkOf(m, pid)).reduce((a, [k, c]) => a + shipLen(m.variant, k) * c, 0);
  var lostOf = (m, pid) => m.players.length === 2 ? countSunk(m, m.players.find((p) => p !== pid)) : null;
  function stats(ms) {
    const st = perPlayer(ms, { total: (m, pid) => countSunk(m, pid) });
    for (const s of st) {
      let sunk = 0, lost = 0, duels = 0, perfect = 0, close = 0, shots = 0, shotHits = 0, startG = 0, startW = 0, surv = [], winShots = [];
      const byType = {};
      for (const { m, won } of s.results) {
        const c = countSunk(m, s.id);
        sunk += c;
        for (const [k, n] of Object.entries(sunkOf(m, s.id))) byType[k] = (byType[k] || 0) + n;
        const l = lostOf(m, s.id);
        if (l != null) {
          duels++;
          lost += l;
          if (won) {
            const left = fleetSize(m.variant) - l;
            surv.push(left);
            if (l === 0) perfect++;
            if (left === 1) close++;
          }
        }
        const sh = +m.shots?.[s.id];
        if (sh > 0) {
          shots += sh;
          shotHits += hitsOf(m, s.id);
          if (won) winShots.push(sh);
        }
        if (m.starter === s.id) {
          startG++;
          if (won) startW++;
        }
      }
      const cnt = (k) => fleetOf().ships.find((x) => x.k === k)?.count || 1;
      const fav = Object.entries(byType).sort((a, b) => b[1] / cnt(b[0]) - a[1] / cnt(a[0]))[0];
      Object.assign(s, {
        sunk,
        lost: duels ? lost : null,
        balance: duels ? sunk - lost : null,
        avgSunk: s.games ? sunk / s.games : 0,
        perfect,
        close,
        survAvg: surv.length ? surv.reduce((a, b) => a + b, 0) / surv.length : null,
        accuracy: shots ? shotHits / shots : null,
        shots,
        fewestShots: winShots.length ? Math.min(...winShots) : null,
        startRate: startG ? startW / startG : null,
        startG,
        fav: fav ? fav[0] : null,
        favN: fav ? fav[1] : 0,
        player: { id: s.id, name: s.name }
      });
    }
    return st;
  }
  function shipSurvival(ms, v) {
    const out = fleetOf(v).ships.map((sh) => ({ ...sh, avail: 0, sunk: 0 }));
    for (const m of ms) if ((m.variant || "klassisch") === v) for (const pid of m.players) for (const o of out) o.sunk += +(sunkOf(m, pid)[o.k] || 0);
    for (const o of out) {
      o.avail = ms.filter((m) => (m.variant || "klassisch") === v).reduce((a, m) => a + o.count * m.players.length, 0);
      o.rate = o.avail ? o.sunk / o.avail : null;
    }
    return out;
  }
  var g = {
    id: "schiffe",
    name: "Schiffe versenken",
    theme: "theme-schiffe",
    themeColor: "#0F2A44",
    dot: "#E63946",
    avatar: (p, size = "dot") => `<span class="av av-${size}" aria-hidden="true">${flag(pickFor("schiffe", FLAGS, p.id))}</span>`,
    icons: { pal: FLAGS, current: (p) => pickFor("schiffe", FLAGS, p.id), render: (x) => flag(x) },
    colorOf: (id) => FLAG_COLOR[FLAGS.indexOf(pickFor("schiffe", FLAGS, id))] || "#4F7CC2",
    winIcon: () => shipSvg("traeger", 5, { cls: "toast-ship" }),
    logo: () => `<div class="lg-schiffe"><div class="sv-grid"></div>${shipSvg("schlacht", 4, { cls: "s1" })}${shipSvg("patrouille", 2, { sunk: true, cls: "s2" })}<i class="peg w p1"></i><i class="peg w p2"></i><i class="peg r p3"></i><span class="nm">Schiffe versenken</span></div>`,
    header: () => `<div class="sv-radar" aria-hidden="true"><i class="sweep"></i><i class="blip b1"></i><i class="blip b2"></i><i class="blip b3"></i></div><h1 class="g-title">Schiffe<br>versenken</h1><p class="g-sub">Treffer. Versenkt.</p>`
  };
  var view2 = { variant: "all" };
  var filterBar2 = () => ONE ? "" : `<div class="filters">${seg("variant", [["all", "Alle"], ...VARIANTS], view2.variant)}</div>`;
  var bind = (el, redraw) => $$('[data-seg="variant"]', el).forEach((s) => s.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) {
      view2.variant = b.dataset.v;
      redraw();
    }
  }));
  var list = () => matchesOf("schiffe", (m) => ONE || view2.variant === "all" || (m.variant || "klassisch") === view2.variant);
  var shipName = (k) => Object.values(FLEETS).flatMap((f) => f.ships).find((s) => s.k === k)?.n || k;
  function dashboard2(el, ctx) {
    const ms = list(), st = stats(ms);
    if (!ms.length) {
      el.innerHTML = `${filterBar2()}<div class="empty-state panel"><p>Noch keine Seeschlacht eingetragen.</p><button class="btn btn-primary" type="button" data-new>Partie eintragen</button></div>`;
      $("[data-new]", el).onclick = () => ctx.go("neu");
      bind(el, () => dashboard2(el, ctx));
      return;
    }
    const T = (title, key, fmt, opts = {}) => {
      const r = top(st, key, opts);
      return statTile(title, r ? fmt(r.value) : "\u2013", r ? whoList(g, r.who) : '<span class="muted">noch niemand</span>', opts.note || "");
    };
    const tiles = [
      T("Meiste Siege", "wins", (v) => v),
      T("Beste Siegquote", "rate", fmtPct, { min: 3, note: "ab 3 Partien" }),
      T("Meiste Schiffe versenkt", "sunk", (v) => v),
      T("Beste Flottenbilanz", "balance", (v) => v > 0 ? `+${v}` : v, { note: "versenkt minus verloren" }),
      T("Treffsicherste Hand", "accuracy", fmtPct, { filter: (s) => s.shots >= 30, note: "Treffer pro Schuss" }),
      T("Schnellster Sieg", "fewestShots", (v) => `${v} Sch\xFCsse`, { low: true }),
      T("Perfekte Siege", "perfect", (v) => `${v}\xD7`, { filter: (s) => s.perfect > 0, note: "ohne ein eigenes Schiff zu verlieren" }),
      T("L\xE4ngste Siegesserie", "streak", (v) => plural(v, "Sieg", "Siege"), { filter: (s) => s.streak > 0 })
    ];
    const starts = ms.filter((m) => m.starter && m.winners?.length);
    const startRate = starts.length ? starts.filter((m) => m.winners.includes(m.starter)).length / starts.length : null;
    const recent = [...ms].reverse().slice(0, 3);
    el.innerHTML = `${filterBar2()}<div class="stats-grid">${tiles.join("")}</div>
    ${startRate != null ? `<section class="panel first"><h2 class="panel-title">Lohnt sich der erste Schuss?</h2><p class="big-q"><b>${fmtPct(startRate)}</b> der Partien gewinnt, wer anf\xE4ngt <span class="muted">(${plural(starts.length, "Partie", "Partien")})</span></p></section>` : ""}
    <section class="panel"><h2 class="panel-title">Zuletzt</h2>${recent.map(line).join("")}<button class="btn btn-ghost wide" type="button" data-all>Alle Partien</button></section>`;
    $("[data-all]", el).onclick = () => ctx.go("verlauf");
    bind(el, () => dashboard2(el, ctx));
  }
  function line(m) {
    const v = m.variant || "klassisch", total = fleetSize(v) * (m.players.length - 1);
    return `<div class="mini-hist sv-line"><span class="hist-date">${fmtDate(m.date)} \xB7 ${esc(fleetOf(v).name)}</span>
    ${[...m.players].sort((a, b) => countSunk(m, b) - countSunk(m, a)).map((p) => `<div class="sv-row ${m.winners?.includes(p) ? "win" : ""}">
      <span class="who">${g.avatar({ id: p, name: playerName(p, m) }, "mini")}${esc(playerName(p, m))}</span>
      <span class="sv-mini">${fleetOf(v).ships.flatMap((sh) => Array.from({ length: sh.count * (m.players.length - 1) }, (_, i) => `<i class="${i < (sunkOf(m, p)[sh.k] || 0) ? "hit" : ""}" style="--l:${sh.len}" title="${esc(sh.n)}"></i>`)).join("")}</span>
      <b>${countSunk(m, p)}/${total}</b></div>`).join("")}
  </div>`;
  }
  var editing2 = null;
  function neu(el, ctx) {
    const e = editing2;
    editing2 = null;
    const S = {
      id: e?.id,
      created: e?.created,
      date: e?.date || today(),
      variant: e?.variant || (view2.variant !== "all" ? view2.variant : "klassisch"),
      sel: new Set(e?.players || []),
      sunk: Object.fromEntries(Object.entries(e?.sunk || {}).map(([p, o]) => [p, normSunk(o)])),
      shots: { ...e?.shots || {} },
      starter: e?.starter || null,
      winner: e ? e.winners?.length ? e.winners[0] : "none" : null,
      winnerTouched: !!e
    };
    el.innerHTML = `<section class="panel"><div class="setup-grid">
      <label class="field"><span>Gespielt am</span><input type="date" id="vDate" value="${S.date}"></label>
      <div><span class="field-label">Flotte</span>${ONE ? `<p class="fleet-line">${fleetOf().ships.map((sh) => `${sh.count > 1 ? `${sh.count}\xD7 ` : ""}${esc(sh.n)}`).join(" \xB7 ")}</p>` : seg("fleet", VARIANTS, S.variant)}<p class="hint" id="fleetNote"></p></div>
    </div></section>
    <section class="panel" id="vPick"></section>
    <div id="vBoards"></div>
    <section class="panel" id="vWin"></section>
    <div class="save-wrap"><button class="btn btn-primary big" type="button" id="vSave">${S.id ? "\xC4nderungen speichern" : "Seeschlacht speichern"}</button></div>`;
    playerPicker($("#vPick", el), { game: g, selected: S.sel, min: 2, max: 4, onChange: () => draw() });
    $('[data-seg="fleet"]', el)?.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      S.variant = b.dataset.v;
      S.sunk = {};
      $$('[data-seg="fleet"] button', el).forEach((x) => x.setAttribute("aria-pressed", x === b));
      draw();
    });
    const ids = () => {
      const ps = playersByCreated().map((p) => p.id);
      return [...S.sel].sort((a, b) => ps.indexOf(a) - ps.indexOf(b));
    };
    const nm = (p) => playerName(p, e);
    const maxOf = (sh) => sh.count * Math.max(1, ids().length - 1);
    const total = () => fleetSize(S.variant) * Math.max(1, ids().length - 1);
    function autoWinner() {
      if (S.winnerTouched) return;
      const done = ids().filter((p) => fleetOf(S.variant).ships.every((sh) => (S.sunk[p]?.[sh.k] || 0) >= maxOf(sh)));
      S.winner = done.length === 1 ? done[0] : null;
    }
    function draw() {
      $("#fleetNote", el).textContent = fleetOf(S.variant).note;
      const P = ids(), box = $("#vBoards", el);
      if (P.length < 2) {
        box.innerHTML = "";
        $("#vWin", el).innerHTML = '<span class="field-label">Wer hat gewonnen?</span><p class="hint">W\xE4hle mindestens zwei Spieler.</p>';
        return;
      }
      box.innerHTML = P.map((p) => {
        const opp = P.filter((x) => x !== p);
        return `<section class="panel sv-board" data-p="${p}">
        <div class="sv-head"><span class="who">${g.avatar({ id: p, name: nm(p) }, "dot")}<b>${esc(nm(p))}</b></span><span class="sv-count"><b data-cnt>0</b> / ${total()} versenkt</span></div>
        <p class="hint">Welche Schiffe ${P.length === 2 ? `von <b>${esc(nm(opp[0]))}</b>` : "der Gegner"} hat ${esc(nm(p))} versenkt? Antippen zum Versenken.</p>
        <div class="sv-ships">${fleetOf(S.variant).ships.flatMap((sh) => Array.from({ length: maxOf(sh) }, (_, i) => `<button type="button" class="sv-ship" data-k="${sh.k}" data-i="${i}" aria-pressed="false" aria-label="${esc(sh.n)} ${i + 1}">${shipSvg(sh.k, sh.len)}${shipSvg(sh.k, sh.len, { sunk: true })}<small>${esc(sh.n)}</small></button>`)).join("")}</div>
        <div class="sv-extra">
          <label class="sv-shots"><span>Sch\xFCsse <small>(optional)</small></span><input type="number" inputmode="numeric" min="0" data-shots="${p}" value="${S.shots[p] ?? ""}" placeholder="\u2013"></label>
          <label class="tick"><input type="radio" name="starter" value="${p}" ${S.starter === p ? "checked" : ""}><span>hat angefangen</span></label>
        </div>
      </section>`;
      }).join("");
      P.forEach(paint);
      $$(".sv-ship", box).forEach((b) => b.addEventListener("click", () => {
        var _a;
        const p = b.closest(".sv-board").dataset.p, k = b.dataset.k, i = +b.dataset.i;
        const cur = S.sunk[p]?.[k] || 0;
        ((_a = S.sunk)[p] || (_a[p] = {}))[k] = i < cur ? i : i + 1;
        paint(p);
        autoWinner();
        drawWin();
      }));
      $$("[data-shots]", box).forEach((i) => i.addEventListener("input", () => {
        S.shots[i.dataset.shots] = i.value === "" ? null : +i.value;
      }));
      $$('input[name="starter"]', box).forEach((r) => r.addEventListener("change", () => {
        S.starter = r.value;
      }));
      autoWinner();
      drawWin();
    }
    function paint(p) {
      const card3 = $(`.sv-board[data-p="${p}"]`, el);
      if (!card3) return;
      $$(".sv-ship", card3).forEach((b) => b.setAttribute("aria-pressed", +b.dataset.i < (S.sunk[p]?.[b.dataset.k] || 0)));
      $("[data-cnt]", card3).textContent = Object.values(S.sunk[p] || {}).reduce((a, b) => a + b, 0);
    }
    function drawWin() {
      const P = ids(), box = $("#vWin", el);
      if (P.length < 2) return;
      box.innerHTML = `<span class="field-label">Wer hat gewonnen?</span><div class="chips">${P.map((p) => `<button type="button" class="chip" data-w="${p}" aria-pressed="${S.winner === p}">${g.avatar({ id: p, name: nm(p) }, "dot")}<span>${esc(nm(p))}</span></button>`).join("")}
      <button type="button" class="chip" data-w="none" aria-pressed="${S.winner === "none"}"><span>Abgebrochen</span></button></div>
      <p class="hint">${S.winnerTouched ? "" : "Wer die ganze gegnerische Flotte versenkt, wird automatisch ausgew\xE4hlt."}</p>`;
      $$("[data-w]", box).forEach((b) => b.addEventListener("click", () => {
        S.winner = b.dataset.w;
        S.winnerTouched = true;
        drawWin();
      }));
    }
    draw();
    $("#vSave", el).onclick = async () => {
      const P = ids();
      if (P.length < 2) return toast("W\xE4hle mindestens zwei Spieler.");
      if (!S.winner) return toast("W\xE4hle, wer gewonnen hat \u2013 oder \u201EAbgebrochen\u201C.");
      const sunk = Object.fromEntries(P.map((p) => [p, Object.fromEntries(Object.entries(S.sunk[p] || {}).filter(([, c]) => c > 0))]));
      const totals = Object.fromEntries(P.map((p) => [p, Object.values(sunk[p]).reduce((a, b) => a + b, 0)]));
      const winners = S.winner === "none" ? [] : [S.winner];
      const pl = places(totals);
      if (winners.length) {
        P.forEach((p) => {
          if (p !== winners[0] && pl[p] === 1) pl[p] = 2;
        });
        pl[winners[0]] = 1;
      }
      const shots = Object.fromEntries(P.filter((p) => S.shots[p] > 0).map((p) => [p, S.shots[p]]));
      const m = {
        id: S.id,
        created: S.created,
        game: "schiffe",
        date: $("#vDate", el).value || today(),
        variant: S.variant,
        players: P,
        sunk,
        totals,
        places: pl,
        winners,
        ...Object.keys(shots).length ? { shots } : {},
        ...S.starter && P.includes(S.starter) ? { starter: S.starter } : {},
        tags: [fleetOf(S.variant).name, ...winners.length ? [] : ["abgebrochen"]]
      };
      try {
        await saveMatch(m);
        toast(winners.length ? `<b>Versenkt!</b> ${esc(nm(winners[0]))} gewinnt die Seeschlacht.` : "<b>Gespeichert.</b> Partie ohne Sieger.", { icon: g.winIcon() });
        view2.variant = S.variant;
        ctx.go("dashboard");
      } catch (err) {
        toast(esc(err.message));
      }
    };
  }
  function statistik2(el, ctx) {
    const ms = list(), st = stats(ms);
    if (!ms.length) {
      el.innerHTML = `${filterBar2()}<div class="empty-state panel"><p>Noch keine Partien in dieser Auswahl.</p></div>`;
      bind(el, () => statistik2(el, ctx));
      return;
    }
    const cols = [
      { key: "games", label: "Partien" },
      { key: "wins", label: "Siege" },
      { key: "rate", label: "Quote", fmt: fmtPct },
      { key: "sunk", label: "Versenkt" },
      { key: "balance", label: "Bilanz", fmt: (v) => v == null ? "\u2013" : v > 0 ? `+${v}` : v },
      { key: "accuracy", label: "Treffer", fmt: (v) => v == null ? "\u2013" : fmtPct(v) }
    ];
    const fleets = view2.variant === "all" ? Object.keys(FLEETS).filter((v) => ms.some((m) => (m.variant || "klassisch") === v)) : [view2.variant];
    const survival = fleets.map((v) => {
      const rows = shipSurvival(ms, v).filter((o) => o.avail);
      if (!rows.length) return "";
      const best = [...rows].sort((a, b) => a.rate - b.rate)[0];
      return `<div class="surv"><h3 class="sub-h">${ONE ? "" : `${esc(fleetOf(v).name)}: `}Wie oft geht welches Schiff unter?</h3>
      <ul class="surv-list">${rows.map((o) => `<li>${shipSvg(o.k, o.len)}<span class="sn">${esc(o.n)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, o.rate * 100)}%"></span></span><b>${fmtPct(o.rate)}</b></li>`).join("")}</ul>
      <p class="hint">Am besten versteckt: <b>${esc(best.n)}</b> \u2013 \xFCberlebt in ${fmtPct(1 - best.rate)} der F\xE4lle.</p></div>`;
    }).join("");
    const startRows = st.filter((s) => s.startG).map((s) => ({ label: s.name, value: s.startRate * 100, icon: g.avatar(s.player, "mini"), color: g.colorOf(s.id), note: `${s.startG}\xD7 angefangen` }));
    const more = `
    <h3 class="sub-h">\xD8 versenkte Schiffe pro Partie</h3>${barChart([...st].sort((a, b) => b.avgSunk - a.avgSunk).map((s) => ({ label: s.name, value: s.avgSunk, icon: g.avatar(s.player, "mini"), color: g.colorOf(s.id) })))}
    <h3 class="sub-h">Treffsicherheit (Treffer pro Schuss)</h3>${st.some((s) => s.accuracy != null) ? barChart(st.filter((s) => s.accuracy != null).sort((a, b) => b.accuracy - a.accuracy).map((s) => ({ label: s.name, value: s.accuracy * 100, icon: g.avatar(s.player, "mini"), color: g.colorOf(s.id), note: `${s.shots} Sch\xFCsse` })), { unit: " %", digits: 0, max: 100 }) : '<p class="empty">Wird angezeigt, sobald Sch\xFCsse eingetragen werden.</p>'}
    <h3 class="sub-h">Wenigste Sch\xFCsse bis zum Sieg</h3>${st.some((s) => s.fewestShots) ? barChart(st.filter((s) => s.fewestShots).sort((a, b) => a.fewestShots - b.fewestShots).map((s) => ({ label: s.name, value: s.fewestShots, icon: g.avatar(s.player, "mini"), color: g.colorOf(s.id) })), { digits: 0 }) : '<p class="empty">Noch keine Siege mit eingetragenen Sch\xFCssen.</p>'}
    <h3 class="sub-h">\xDCberlebende Schiffe beim Sieg (\xD8)</h3>${barChart(st.filter((s) => s.survAvg != null).sort((a, b) => b.survAvg - a.survAvg).map((s) => ({ label: s.name, value: s.survAvg, icon: g.avatar(s.player, "mini"), color: g.colorOf(s.id), note: `${s.close}\xD7 knapp mit nur einem Schiff` })))}
    <h3 class="sub-h">Siegquote, wenn man anf\xE4ngt</h3>${startRows.length ? barChart(startRows.sort((a, b) => b.value - a.value), { unit: " %", digits: 0, max: 100 }) : '<p class="empty">Wird angezeigt, sobald \u201Ehat angefangen\u201C eingetragen wird.</p>'}
    <h3 class="sub-h">Lieblingsziel</h3><ul class="kings">${st.filter((s) => s.fav).map((s) => `<li><span class="who">${g.avatar(s.player, "mini")}${esc(s.name)}</span><span class="k-cat">versenkt am h\xE4ufigsten</span><b>${esc(shipName(s.fav))} (${s.favN}\xD7)</b></li>`).join("")}</ul>
    <h3 class="sub-h">L\xE4ngste Siegesserie</h3>${barChart([...st].filter((s) => s.streak).sort((a, b) => b.streak - a.streak).map((s) => ({ label: s.name, value: s.streak, icon: g.avatar(s.player, "mini"), color: g.colorOf(s.id), note: s.current ? `aktuell ${s.current}` : "" })), { digits: 0 })}
    <h3 class="sub-h">Kopf an Kopf</h3><div id="h2h"></div>`;
    el.innerHTML = `${filterBar2()}
    <section class="panel"><h2 class="panel-title">Rangliste</h2>${leaderboard(g, st, cols)}<p class="hint">Bilanz = versenkte minus verlorene Schiffe (nur Duelle zu zweit). Treffer = Felder versenkter Schiffe pro Schuss.</p></section>
    <section class="panel"><h2 class="panel-title">Schiffe</h2>${survival}</section>
    <section class="panel">${details("Mehr Statistiken", more)}</section>`;
    bind(el, () => statistik2(el, ctx));
    h2hBlock($("#h2h", el), g, ms);
  }
  function verlauf2(el, ctx) {
    historyList(el, ctx, { matches: matchesOf("schiffe"), line: (m) => line(m) + (m.shots ? `<p class="others">Sch\xFCsse: ${Object.entries(m.shots).map(([p, n]) => `${esc(playerName(p, m))} ${n}`).join(" \xB7 ")}</p>` : ""), onEdit: (m) => {
      editing2 = m;
      ctx.go("neu");
    } });
  }
  g.tabs = { dashboard: dashboard2, neu, statistik: statistik2, verlauf: verlauf2 };
  var schiffe_default = g;

  // js/games/registry.js
  var GAMES = [floriferous_default, skyjo_default, flip7_default, feuilles_default, virus_default, dog_default, wizard_default, dominion_default, catan_default, schiffe_default];
  var gameById = (id) => GAMES.find((g2) => g2.id === id);

  // js/app.js
  var app;
  var TABS = [["dashboard", "Dashboard"], ["neu", "Neues Spiel"], ["statistik", "Statistik"], ["verlauf", "Verlauf"]];
  var current = null;
  function parse() {
    const h = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (h[0] === "g" && gameById(h[1])) return { view: "game", game: h[1], tab: h[2] === "einstellungen" || TABS.some(([t]) => t === h[2]) ? h[2] : "dashboard" };
    if (h[0] === "einstellungen") return { view: "settings" };
    return { view: "hub" };
  }
  var go = (hash) => {
    if (location.hash === hash) render();
    else location.hash = hash;
  };
  window.addEventListener("hashchange", () => render());
  async function start() {
    if (!savedPassword()) return renderLogin();
    try {
      app.innerHTML = loadingScreen();
      await load();
      render();
    } catch (e) {
      if (e.code === "auth") {
        forget();
        renderLogin("Das gespeicherte Passwort stimmt nicht mehr.");
      } else app.innerHTML = errorScreen(e.message);
    }
  }
  function render() {
    if (!store.loaded) return start();
    const r = parse();
    window.scrollTo(0, 0);
    if (r.view === "game") return renderGame(r.game, r.tab);
    setTheme(null);
    if (r.view === "settings") return renderSettings();
    renderHub();
  }
  function setTheme(game) {
    document.body.className = game ? `theme ${game.theme}` : "hub";
    delete document.body.dataset.variant;
    document.title = game ? `${game.name} \xB7 KahloGames` : "KahloGames";
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = game?.themeColor || "#ECE9E2";
  }
  function renderLogin(msg = "") {
    setTheme(null);
    app.innerHTML = `
  <main class="login">
    <h1 class="wordmark" aria-label="KahloGames">Kahlo<span>Games</span></h1>
    <div class="dots" aria-hidden="true">${GAMES.map((g2) => `<i style="background:${g2.dot}"></i>`).join("")}</div>
    <form class="login-form" id="loginForm">
      <label for="pw">Passwort</label>
      <div class="login-row">
        <input id="pw" type="password" autocomplete="current-password" required>
        <button class="btn btn-ink" type="submit">Weiter</button>
      </div>
      <p class="login-msg" id="loginMsg" role="alert">${esc(msg)}</p>
    </form>
    ${demo ? '<p class="demo-note">Demo-Modus: Daten bleiben nur auf diesem Ger\xE4t, bis die Google-Tabelle verbunden ist.</p>' : ""}
  </main>`;
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter;
      btn.disabled = true;
      try {
        await login($("#pw").value);
        await start();
      } catch (err) {
        $("#loginMsg").textContent = err.code === "auth" ? "Das Passwort stimmt nicht." : err.message;
        btn.disabled = false;
        $("#pw").select();
      }
    });
    setTimeout(() => $("#pw")?.focus(), 50);
  }
  var loadingScreen = () => `<main class="login"><h1 class="wordmark">Kahlo<span>Games</span></h1><p class="loading">Lade Daten \u2026</p></main>`;
  var errorScreen = (m) => `<main class="login"><h1 class="wordmark">Kahlo<span>Games</span></h1><p class="login-msg">${esc(m)}</p><button class="btn btn-ink" onclick="location.reload()">Erneut versuchen</button></main>`;
  function renderHub() {
    app.innerHTML = `
  <header class="hub-top">
    <h1 class="wordmark small">Kahlo<span>Games</span></h1>
    <a class="icon-btn" href="#/einstellungen" aria-label="Einstellungen">${gearIcon}</a>
  </header>
  <main class="hub-main">
    <h2 class="hub-q">Was habt ihr gespielt?</h2>
    <div class="tiles">
      ${GAMES.map((g2) => {
      const ms = matchesOf(g2.id);
      const last = ms[ms.length - 1];
      return `<a class="tile tile-${g2.id}" href="#/g/${g2.id}">
          <div class="tile-logo">${g2.logo()}</div>
          <div class="tile-meta"><b>${esc(g2.name)}</b><span>${ms.length ? `${plural(ms.length, "Partie", "Partien")} \xB7 zuletzt ${fmtDate(last.date, { day: "2-digit", month: "2-digit" })}` : "Noch keine Partie"}</span></div>
        </a>`;
    }).join("")}
    </div>
    ${demo ? '<p class="demo-note">Demo-Modus \u2013 noch nicht mit Google Sheets verbunden.</p>' : ""}
  </main>`;
  }
  var gearIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
  var backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
  function renderSettings() {
    const ps = playersByCreated();
    app.innerHTML = `
  <header class="hub-top">
    <a class="icon-btn" href="#/" aria-label="Zur\xFCck zur Spielauswahl">${backIcon}</a>
    <h1 class="hub-title">Einstellungen</h1>
    <span></span>
  </header>
  <main class="hub-main narrow">
    <section class="s-block">
      <h2>Spieler</h2>
      <form class="add-row" id="addP">
        <input id="newP" placeholder="Name" maxlength="24" autocomplete="off" aria-label="Name des neuen Spielers">
        <button class="btn btn-ink" type="submit">Hinzuf\xFCgen</button>
      </form>
      ${ps.length ? `<ul class="plist">${ps.map((p) => {
      const n = store.matches.filter((m) => (m.players || []).includes(p.id)).length;
      return `<li><button type="button" class="prow" data-id="${p.id}"><span class="pname">${esc(p.name)}</span><span class="pmeta">${plural(n, "Partie", "Partien")}</span><span class="chev">${backIcon}</span></button></li>`;
    }).join("")}</ul>` : '<p class="empty">Noch keine Spieler. Leg oben den ersten an.</p>'}
    </section>
    <section class="s-block">
      <p class="muted small">${demo ? "Demo-Modus: Die Daten liegen nur in diesem Browser." : "Verbunden mit Google Sheets."} Die Symbole der Spieler stellst du im jeweiligen Spiel \xFCber das Zahnrad ein.</p>
    </section>
  </main>`;
    $("#addP").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#newP").value.trim();
      if (!name) return;
      try {
        await addPlayer(name);
        toast(`<b>${esc(name)}</b> ist dabei.`);
        renderSettings();
      } catch (err) {
        toast(esc(err.message));
      }
    });
    $$(".prow").forEach((b) => b.addEventListener("click", () => editPlayer(b.dataset.id)));
  }
  async function editPlayer(id) {
    const p = store.players.find((x) => x.id === id);
    if (!p) return;
    await modal({
      title: p.name,
      body: `<label class="field"><span>Name</span><input id="pName" value="${esc(p.name)}" maxlength="24"></label>`,
      actions: [
        { label: "L\xF6schen", danger: true, handler: async () => {
          await removePlayer(p);
          return true;
        } },
        { label: "Abbrechen", value: false },
        { label: "Speichern", primary: true, handler: async (w) => {
          const name = $("#pName", w).value.trim();
          if (!name) return false;
          try {
            await updatePlayer({ id: p.id, name });
            toast("Gespeichert.");
          } catch (e) {
            toast(esc(e.message));
            return false;
          }
          return true;
        } }
      ]
    });
    renderSettings();
  }
  async function removePlayer(p) {
    const pw2 = await modal({
      title: `${p.name} l\xF6schen?`,
      body: `<p>Zum L\xF6schen brauchst du das L\xF6sch-Passwort. Wende dich an Livius.</p>
      <label class="field"><span>L\xF6sch-Passwort</span><input id="pw2" type="password" autocomplete="off"></label>
      <p class="muted small">Bisherige Partien bleiben im Verlauf erhalten.</p>`,
      actions: [{ label: "Abbrechen", value: null }, { label: "Endg\xFCltig l\xF6schen", danger: true, handler: (w) => $("#pw2", w).value || false }]
    });
    if (!pw2) return;
    try {
      await deletePlayer(p.id, pw2);
      toast(`${esc(p.name)} wurde gel\xF6scht.`);
    } catch (e) {
      toast(e.code === "auth2" ? "Falsches L\xF6sch-Passwort. Wende dich an Livius." : esc(e.message));
    }
  }
  function renderGame(id, tab) {
    const g2 = gameById(id);
    setTheme(g2);
    current = { game: g2, tab };
    app.innerHTML = `
  <div class="g-shell">
    ${g2.decor ? g2.decor() : ""}
    <header class="g-top">
      <div class="g-actions"><a class="g-back" href="#/" aria-label="Zur Spielauswahl">${gridIcon}<span>Spiele</span></a><a class="g-gear" href="#/g/${id}/einstellungen" aria-label="Einstellungen f\xFCr ${esc(g2.name)}" ${tab === "einstellungen" ? 'aria-current="page"' : ""}>${gearIcon}</a></div>
      ${g2.header()}
    </header>
    <nav class="g-tabs" aria-label="Bereiche">${TABS.map(([t, l]) => `<a class="g-tab" href="#/g/${id}/${t}" ${t === tab ? 'aria-current="page"' : ""}>${g2.tabIcon ? g2.tabIcon(t) : ""}<span>${l}</span></a>`).join("")}</nav>
    <main class="g-main" id="gMain"></main>
  </div>`;
    const ctx = { game: g2, go: (t) => go(`#/g/${id}/${t}`), rerender: () => {
      const o = $("#gMain"), n = o.cloneNode(false);
      o.replaceWith(n);
      g2.tabs[tab](n, ctx);
    } };
    if (tab === "einstellungen") return gameSettings($("#gMain"), g2);
    g2.tabs[tab]($("#gMain"), ctx);
  }
  function gameSettings(el, g2) {
    const ps = playersByCreated();
    el.innerHTML = `<section class="panel"><h2 class="panel-title">Spieler-Symbole in ${esc(g2.name)}</h2>
    <p class="hint">Tippe auf einen Spieler, um sein Symbol f\xFCr dieses Spiel zu \xE4ndern. Neue Spieler legst du \xFCber das Zahnrad auf der Startseite an.</p>
    ${ps.length ? `<ul class="icon-list">${ps.map((p) => `<li><button type="button" class="icon-row" data-id="${p.id}">${g2.avatar(p, "big")}<span class="pname">${esc(p.name)}</span><span class="chev">${backIcon}</span></button></li>`).join("")}</ul>` : '<p class="empty">Noch keine Spieler angelegt.</p>'}
  </section>`;
    $$(".icon-row", el).forEach((b) => b.addEventListener("click", () => pickIcon(g2, b.dataset.id, el)));
  }
  async function pickIcon(g2, id, el) {
    const p = store.players.find((x) => x.id === id);
    if (!p) return;
    let looks = JSON.parse(JSON.stringify(p.looks || {}));
    const others = store.players.filter((x) => x.id !== id);
    await modal({
      title: `${p.name} in ${g2.name}`,
      cls: "icon-modal",
      body: '<div class="look-ed"></div>',
      onMount: (w) => {
        const box = $(".look-ed", w);
        if (g2.lookEditor) return g2.lookEditor(box, p, looks, (l) => looks = l);
        const pal = g2.icons.pal;
        const draw = () => {
          const cur = looks[g2.id]?.i ?? pal.indexOf(g2.icons.current(p));
          box.innerHTML = `<div class="icon-grid">${pal.map((x, i) => {
            const taken = others.filter((o) => pal.indexOf(g2.icons.current(o)) === i).map((o) => o.name);
            return `<button type="button" class="icon-opt ${i === cur ? "on" : ""}" data-i="${i}" title="${esc(x.n != null && typeof x.n === "string" ? x.n : "")}"><span class="av av-big">${g2.icons.render(x)}</span>${taken.length ? `<small>${esc(taken.join(", "))}</small>` : "<small>&nbsp;</small>"}</button>`;
          }).join("")}</div><p class="hint">Unter einem Symbol steht, wer es gerade hat.</p>`;
        };
        draw();
        box.addEventListener("click", (e) => {
          const b = e.target.closest(".icon-opt");
          if (!b) return;
          looks = { ...looks, [g2.id]: { i: +b.dataset.i } };
          draw();
        });
      },
      actions: [{ label: "Abbrechen", value: false }, { label: "Speichern", primary: true, handler: async () => {
        try {
          await updatePlayer({ id: p.id, looks });
          toast("Symbol gespeichert.");
        } catch (e) {
          toast(esc(e.message));
          return false;
        }
        return true;
      } }]
    });
    gameSettings(el, g2);
  }
  var gridIcon = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="6" height="6" rx="1.5"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.5"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.5"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.5"/></svg>`;
  onChange(() => {
  });
  var boot = () => {
    app = $("#app");
    app.dataset.ok = "1";
    start();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
