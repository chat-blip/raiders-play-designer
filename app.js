/* Raiders play designer — drag players, draw assignments, save locally */
(function () {
  const STORE = "raiders-playbook-v1";
  const UI_STORE = "raiders-ui-v1";
  const SIDE_MIN = 80;
  const SIDE_DEFAULT = 268;
  const TOOL_MIN = 80;
  const TOOL_DEFAULT = 220;
  const PLAY_MIN = 260;
  const VW = 1200;
  const VH = 720;
  const R = 20;
  const ROSTER_SPOTS = ["QB", "A", "B", "X", "Y", "Z", "LT", "LG", "C", "RG", "RT"];

  const state = {
    book: null,
    playId: null,
    tool: "select",
    selected: null, // { kind: 'player'|'assign', id }
    handle: null, // waypoint index
    drawing: null, // { from, type, points }
    hideDef: false,
    curve: true,
    snap: true,
    listDrag: null,
    listFocus: "book",
    presentFrom: null,
    colResize: null,
    present: false,
    favOnly: false,
    sketch: [],
    sketchStroke: null,
    drag: null,
    undo: [],
    redo: [],
    dirtyTimer: null,
    cloudTimer: null,
    needCloudPush: false,
    fieldEdit: null,
  };

  const $ = (id) => document.getElementById(id);

  function play() {
    return state.book.plays.find((p) => p.id === state.playId) || state.book.plays[0];
  }

  function commitPlayFields() {
    const p = play();
    if (!p) return false;
    const nameEl = $("nameInput");
    const numEl = $("numInput");
    const notesEl = $("notes");
    let changed = false;
    if (nameEl && p.name !== nameEl.value) {
      p.name = nameEl.value;
      changed = true;
    }
    if (numEl && p.number !== numEl.value) {
      p.number = numEl.value;
      changed = true;
    }
    if (notesEl && (p.notes || "") !== notesEl.value) {
      p.notes = notesEl.value;
      changed = true;
    }
    if (changed) save();
    return changed;
  }

  function syncPlayLabels() {
    const p = play();
    if (!p) return;
    $("printNum").textContent = p.number;
    $("printNum").className = "num " + p.type;
    $("printNumBig").textContent = p.number;
    $("printNumBig").className = "print-num " + p.type;
    $("printTitle").textContent = p.formation + "   " + p.name;
    $("printTitle2").textContent = p.formation + "   " + p.name;
    document.querySelectorAll('.play-item[data-id="' + p.id + '"]').forEach((li) => {
      const n = li.querySelector(".n");
      const meta = li.querySelector(".meta");
      if (n) {
        n.textContent = p.number;
        n.className = "n " + p.type;
      }
      if (meta) meta.innerHTML = "<b>" + escapeHtml(p.formation) + "</b> " + escapeHtml(p.name);
    });
    scheduleFitChrome();
  }

  function bindPlayField(id, apply) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (state.fieldEdit !== id) {
        state.fieldEdit = id;
        pushUndo();
      }
      apply(el.value);
      scheduleSave();
      syncPlayLabels();
    });
    el.addEventListener("blur", () => {
      if (state.fieldEdit === id) state.fieldEdit = null;
      commitPlayFields();
    });
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function pushUndo() {
    state.undo.push(clone(play()));
    if (state.undo.length > 80) state.undo.shift();
    state.redo = [];
    scheduleSave();
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(clone(play()));
    const prev = state.undo.pop();
    const i = state.book.plays.findIndex((p) => p.id === prev.id);
    if (i >= 0) state.book.plays[i] = prev;
    state.playId = prev.id;
    state.selected = null;
    render();
    scheduleSave();
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(clone(play()));
    const next = state.redo.pop();
    const i = state.book.plays.findIndex((p) => p.id === next.id);
    if (i >= 0) state.book.plays[i] = next;
    state.playId = next.id;
    render();
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(state.dirtyTimer);
    state.dirtyTimer = setTimeout(save, 180);
  }

  function save() {
    if (state.book) state.book.exportedAt = Date.now();
    try {
      localStorage.setItem(STORE, JSON.stringify(state.book));
    } catch (e) {
      toast("Could not save locally");
    }
    scheduleCloudSave();
  }

  function scheduleCloudSave() {
    clearTimeout(state.cloudTimer);
    state.cloudTimer = setTimeout(pushCloud, 2000);
  }

  function pushCloud() {
    if (!window.RaidersCloud || !window.RaidersCloud.canPush()) return;
    window.RaidersCloud.push(state.book).then(function (res) {
      if (res && res.ok) return;
      if (!res || res.reason === "offline") return;
      toast("Cloud save missed — will try again");
    });
  }

  function bookOk(b) {
    return !!(b && Array.isArray(b.plays) && b.plays.length);
  }

  function load() {
    let stored = null;
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) stored = JSON.parse(raw);
    } catch (e) {}
    const portable = window.RAIDERS_PORTABLE_BOOK;
    const portableOk = bookOk(portable);
    const storedOk = bookOk(stored);
    const pAt = portableOk ? portable.exportedAt || 0 : 0;
    const sAt = storedOk ? stored.exportedAt || 0 : 0;
    if (portableOk && (!storedOk || pAt > sAt)) {
      const book = clone(portable);
      ensureSets(book);
      return book;
    }
    if (storedOk) {
      ensureSets(stored);
      return stored;
    }
    const seed = RaidersPlays.buildSeedPlaybook();
    ensureSets(seed);
    return seed;
  }

  async function loadPreferred() {
    state.needCloudPush = false;
    const local = load();
    const cloud = window.RaidersCloud ? await window.RaidersCloud.pull() : null;
    if (bookOk(cloud)) {
      ensureSets(cloud);
      return cloud;
    }
    ensureSets(local);
    return local;
  }

  function ensureSets(book) {
    const b = book || state.book;
    if (!b) return;
    if (!Array.isArray(b.sets) || !b.sets.length) {
      b.sets = [{ id: "set-game", name: "Game list", playIds: [] }];
    }
    b.sets.forEach(function (s) {
      if (!Array.isArray(s.playIds)) s.playIds = [];
      if (!s.name) s.name = "Game list";
      if (!s.id) s.id = RaidersPlays.uid("set");
    });
    if (!b.activeSetId || !b.sets.some(function (s) { return s.id === b.activeSetId; })) {
      b.activeSetId = b.sets[0].id;
    }
    if (!b.roster || typeof b.roster !== "object") b.roster = {};
    (b.plays || []).forEach(playKids);
    if (!b.kidsSplit) {
      const roster = b.roster;
      const hasRoster = !!(roster && Object.keys(roster).some((k) => roster[k]));
      (b.plays || []).forEach((p) => {
        const kids = playKids(p);
        (p.players || []).forEach((pl) => {
          if (pl.who && !kids[pl.label]) kids[pl.label] = String(pl.who).trim().toUpperCase();
        });
        const hasKids = Object.keys(kids).some((k) => kids[k]);
        if (!hasKids && hasRoster) p.kids = Object.assign({}, roster);
      });
      b.kidsSplit = true;
    }
  }

  function playKids(p) {
    const playObj = p || play();
    if (!playObj.kids || typeof playObj.kids !== "object") playObj.kids = {};
    return playObj.kids;
  }

  function setKidName(playObj, label, raw) {
    const kids = playKids(playObj);
    const v = String(raw || "").trim().slice(0, 4).toUpperCase();
    if (v) kids[label] = v;
    else delete kids[label];
    (playObj.players || []).forEach((pl) => {
      if (pl.label !== label) return;
      if (v) pl.who = v;
      else delete pl.who;
    });
    return v;
  }

  function playerWho(pl, playObj) {
    if (!pl) return "";
    const kids = playKids(playObj || play());
    const fromKids = kids[pl.label];
    if (fromKids) return String(fromKids).trim().slice(0, 4).toUpperCase();
    const custom = pl.who != null ? String(pl.who).trim() : "";
    return custom ? custom.slice(0, 4).toUpperCase() : "";
  }

  function activeSet() {
    ensureSets();
    return state.book.sets.find(function (s) { return s.id === state.book.activeSetId; }) || state.book.sets[0];
  }

  function setPlays() {
    const set = activeSet();
    return (set.playIds || []).map(function (id) {
      return state.book.plays.find(function (p) { return p.id === id; });
    }).filter(Boolean);
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 900);
  }

  function svgPoint(evt) {
    const svg = $("field");
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    let x = loc.x;
    let y = loc.y;
    if (state.snap && !evt.altKey) {
      x = Math.round(x / 4) * 4;
      y = Math.round(y / 4) * 4;
    }
    return { x, y };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function motionTip(playObj, playerId) {
    const motions = (playObj.assignments || []).filter(function (a) {
      return a.from === playerId && a.type === "motion" && a.points && a.points.length;
    });
    if (!motions.length) return null;
    const m = motions[motions.length - 1];
    return m.points[m.points.length - 1];
  }

  function livePoints(a, playObj) {
    if (!a.points || !a.points.length) return [];
    const pts = a.points.map(function (pt) {
      return { x: pt.x, y: pt.y };
    });
    if (a.afterMotion) {
      const tip = motionTip(playObj, a.from);
      if (tip) pts[0] = { x: tip.x, y: tip.y };
    }
    return pts;
  }

  function useSmooth(a) {
    if (!a) return state.curve;
    if (a.smooth === true) return true;
    if (a.smooth === false) return false;
    return a.type === "ball" || a.type === "motion";
  }

  function midPoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function pathD(points, smooth) {
    if (!points.length) return "";
    if (points.length === 1) return "M " + points[0].x + " " + points[0].y;
    if (!smooth || points.length === 2) {
      return points
        .map((p, i) => (i ? "L " + p.x + " " + p.y : "M " + p.x + " " + p.y))
        .join(" ");
    }
    let d = "M " + points[0].x + " " + points[0].y;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C " + c1x + " " + c1y + " " + c2x + " " + c2y + " " + p2.x + " " + p2.y;
    }
    return d;
  }

  function lastSeg(points) {
    if (points.length < 2) return { x1: 0, y1: 0, x2: 1, y2: 0 };
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  function tBar(seg, w) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * w;
    const py = (dx / len) * w;
    return {
      x1: seg.x2 + px,
      y1: seg.y2 + py,
      x2: seg.x2 - px,
      y2: seg.y2 - py,
    };
  }

  function arrowPts(seg, size) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const bx = seg.x2 - ux * size;
    const by = seg.y2 - uy * size;
    return [
      [seg.x2, seg.y2],
      [bx - uy * size * 0.55, by + ux * size * 0.55],
      [bx + uy * size * 0.55, by - ux * size * 0.55],
    ];
  }

  function hitAssign(pt, assigns) {
    let best = null;
    let bestD = 10;
    const p = play();
    assigns.forEach((a) => {
      const pts = livePoints(a, p);
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSeg(pt, pts[i], pts[i + 1]);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
    });
    return best;
  }

  function distToSeg(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function hitPlayer(pt, players) {
    let best = null;
    let bestD = R + 6;
    players.forEach((p) => {
      if (state.hideDef && p.side === "def") return;
      const d = dist(pt, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  function movePlay(fromId, toId, placeAfter) {
    if (!fromId || !toId || fromId === toId) return;
    const plays = state.book.plays;
    const from = plays.findIndex((p) => p.id === fromId);
    if (from < 0) return;
    const [item] = plays.splice(from, 1);
    let insert = plays.findIndex((p) => p.id === toId);
    if (insert < 0) {
      plays.splice(from, 0, item);
      return;
    }
    if (placeAfter) insert += 1;
    plays.splice(insert, 0, item);
    scheduleSave();
    renderList();
  }

  function clearListDropMarks() {
    document.querySelectorAll(".play-item").forEach((el) => {
      el.classList.remove("drop-before", "drop-after", "dragging");
    });
    const setList = $("setList");
    if (setList) setList.classList.remove("drop-ready");
  }

  function hitListItem(items, e, skipId) {
    let hit = null;
    items.forEach((el) => {
      if (el.dataset.id === skipId) return;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right) hit = el;
    });
    items.forEach((el) => el.classList.remove("drop-before", "drop-after"));
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    hit.classList.add(after ? "drop-after" : "drop-before");
    return { id: hit.dataset.id, after: after };
  }

  function onListDragMove(e) {
    const d = state.listDrag;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.y) < 5 && Math.abs((e.clientX || 0) - (d.x || 0)) < 5) return;
    d.moved = true;
    e.preventDefault();
    document.querySelectorAll(".play-item").forEach((el) => {
      el.classList.toggle("dragging", el.dataset.id === d.id);
    });
    const setBox = $("setList");
    const setRect = setBox && setBox.getBoundingClientRect();
    const overSet = !!(setRect && e.clientY >= setRect.top && e.clientY <= setRect.bottom && e.clientX >= setRect.left && e.clientX <= setRect.right);
    if (overSet) {
      d.target = "set";
      setBox.classList.add("drop-ready");
      const setHit = hitListItem(Array.prototype.slice.call(document.querySelectorAll("#setList .play-item")), e, d.from === "set" ? d.id : null);
      if (setHit) {
        d.toId = setHit.id;
        d.after = setHit.after;
      } else {
        d.toId = null;
        d.after = true;
      }
      document.querySelectorAll("#playList .play-item").forEach((el) => el.classList.remove("drop-before", "drop-after"));
      return;
    }
    if (setBox) setBox.classList.remove("drop-ready");
    if (d.from === "book") {
      d.target = "book";
      const bookHit = hitListItem(Array.prototype.slice.call(document.querySelectorAll("#playList .play-item")), e, d.id);
      if (bookHit) {
        d.toId = bookHit.id;
        d.after = bookHit.after;
      } else {
        d.toId = null;
      }
    } else {
      d.target = null;
      d.toId = null;
    }
  }

  function onListDragUp() {
    const d = state.listDrag;
    if (!d) return;
    state.listDrag = null;
    clearListDropMarks();
    if (!d.moved) {
      selectPlay(d.id);
      return;
    }
    if (d.target === "set") {
      addToSet(d.id, d.toId, d.after);
      return;
    }
    if (d.from === "book" && d.target === "book" && d.toId) movePlay(d.id, d.toId, d.after);
  }

  function addToSet(playId, toId, after) {
    const set = activeSet();
    const known = {};
    state.book.plays.forEach(function (p) { known[p.id] = true; });
    const ids = set.playIds.filter(function (id) { return known[id]; });
    const wasIn = set.playIds.indexOf(playId) >= 0;
    const from = ids.indexOf(playId);
    if (from >= 0) ids.splice(from, 1);
    if (toId && toId !== playId && ids.indexOf(toId) >= 0) {
      let insert = ids.indexOf(toId);
      if (after) insert += 1;
      ids.splice(insert, 0, playId);
    } else {
      ids.push(playId);
    }
    set.playIds = ids;
    scheduleSave();
    renderSetList();
    if (!wasIn) toast("Added to " + (set.name || "game list"));
  }

  function removeFromSet(playId) {
    const set = activeSet();
    set.playIds = set.playIds.filter(function (id) { return id !== playId; });
    scheduleSave();
    renderSetList();
  }

  function newSet() {
    ensureSets();
    const set = { id: RaidersPlays.uid("set"), name: "Game list " + (state.book.sets.length + 1), playIds: [] };
    state.book.sets.push(set);
    state.book.activeSetId = set.id;
    scheduleSave();
    renderSetList();
    const name = $("setName");
    if (name) {
      name.focus();
      name.select();
    }
  }

  function clearSet() {
    const set = activeSet();
    if (!set.playIds.length) return;
    if (!window.confirm("Clear every play from \"" + (set.name || "this list") + "\"? The playbook stays the same.")) return;
    set.playIds = [];
    scheduleSave();
    renderSetList();
  }

  function syncFavButton() {
    const btn = $("btnFavOnly");
    if (!btn) return;
    btn.classList.toggle("on", !!state.favOnly);
    btn.setAttribute("aria-pressed", state.favOnly ? "true" : "false");
    btn.textContent = state.favOnly ? "Show all" : "Show favorites";
  }

  function toggleFavOnly() {
    state.favOnly = !state.favOnly;
    saveUi({ favOnly: state.favOnly });
    syncFavButton();
    renderList();
  }

  function visibleBookPlays() {
    const q = (($("playSearch") && $("playSearch").value) || "").toLowerCase();
    const filter = ($("playFilter") && $("playFilter").value) || "all";
    return state.book.plays.filter(function (p) {
      if (state.favOnly && !p.star) return false;
      if (filter === "run" && p.type !== "run") return false;
      if (filter === "pass" && p.type !== "pass") return false;
      const hay = (p.number + " " + p.formation + " " + p.name).toLowerCase();
      if (q && hay.indexOf(q) < 0) return false;
      return true;
    });
  }

  function stepThrough(plays, dir) {
    if (!plays || !plays.length) return;
    let i = plays.findIndex(function (p) { return p.id === state.playId; });
    if (i < 0) i = dir > 0 ? -1 : 0;
    i = (i + dir + plays.length) % plays.length;
    selectPlay(plays[i].id);
  }

  function setListFocus(which) {
    state.listFocus = which === "set" ? "set" : "book";
    const book = $("playList");
    const set = $("setList");
    if (book) book.classList.toggle("nav-on", state.listFocus === "book");
    if (set) set.classList.toggle("nav-on", state.listFocus === "set");
  }

  function stepSet(dir) {
    const plays = setPlays();
    if (!plays.length) {
      toast("Drag plays into the game list first");
      return;
    }
    setListFocus("set");
    stepThrough(plays, dir);
  }

  function stepPlays(dir) {
    if (state.present) {
      clearSketch();
      stepThrough(presentList(), dir);
      return;
    }
    if (state.listFocus === "set" && setPlays().length) {
      stepThrough(setPlays(), dir);
      return;
    }
    stepThrough(visibleBookPlays(), dir);
  }

  function updatePlayCount() {
    const el = $("playCount");
    if (!el || !state.book) return;
    const total = (state.book.plays || []).length;
    const shown = visibleBookPlays().length;
    el.textContent = shown === total ? String(total) : shown + " of " + total;
  }

  function renderList() {
    const ul = $("playList");
    ul.innerHTML = "";
    const plays = visibleBookPlays();
    updatePlayCount();
    if (!plays.length) {
      const empty = document.createElement("div");
      empty.className = "set-empty";
      empty.textContent = state.favOnly
        ? "No favorite plays. Star a play, or tap Show all."
        : "No plays match.";
      ul.appendChild(empty);
      return;
    }
    plays.forEach((p) => {
      const li = document.createElement("div");
      li.className = "play-item" + (p.id === state.playId ? " active" : "");
      li.dataset.id = p.id;
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.innerHTML =
        '<span class="grip" aria-hidden="true"></span><span class="n ' +
        p.type +
        '">' +
        escapeHtml(p.number) +
        '</span><span class="meta"><b>' +
        escapeHtml(p.formation) +
        "</b> " +
        escapeHtml(p.name) +
        '</span><button type="button" class="fav-btn' +
        (p.star ? " on" : "") +
        '" aria-label="' +
        (p.star ? "Unfavorite play" : "Favorite play") +
        '" title="Favorite">★</button>';
      const fav = li.querySelector(".fav-btn");
      fav.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      fav.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(p.id);
      });
      li.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest(".fav-btn")) return;
        e.preventDefault();
        setListFocus("book");
        state.listDrag = { id: p.id, y: e.clientY, x: e.clientX, moved: false, toId: null, after: false, from: "book", target: null };
        try {
          li.setPointerCapture(e.pointerId);
        } catch (err) {}
      });
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectPlay(p.id);
        }
      });
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toggleFavorite(id) {
    const p = state.book.plays.find((x) => x.id === id);
    if (!p) return;
    if (play() && play().id === id) pushUndo();
    p.star = !p.star;
    scheduleSave();
    render();
  }

  function selectPlay(id) {
    commitPlayFields();
    state.fieldEdit = null;
    finishDraw(false);
    state.playId = id;
    state.selected = null;
    state.undo = [];
    state.redo = [];
    render();
  }

  function render() {
    const p = play();
    if (!p) return;
    $("numInput").value = p.number;
    $("nameInput").value = p.name;
    $("formSelect").value = p.formation;
    $("defSelect").value = p.defense || "4-4 Base";
    $("typeSelect").value = p.type;
    $("notes").value = p.notes || "";
    $("printNum").textContent = p.number;
    $("printNum").className = "num " + p.type;
    $("printNumBig").textContent = p.number;
    $("printNumBig").className = "print-num " + p.type;
    $("printTitle").textContent = p.formation + "   " + p.name;
    $("printTitle2").textContent = p.formation + "   " + p.name;
    $("printType").textContent = p.type.toUpperCase();
    $("printType").className = "badge " + p.type;
    $("printType2").textContent = p.type.toUpperCase();
    $("printType2").className = "badge " + p.type;
    $("printStar").className = "sheet-star" + (p.star ? " on" : "");
    $("printStar2").className = "sheet-star" + (p.star ? " on" : "");
    $("printFamily").textContent = (p.family || "") + (p.defense ? " · " + p.defense : "");
    renderList();
    renderSetList();
    renderField();
    renderHint();
    syncCurveToggle();
    renderRoster();
    syncWhoRow();
    updatePresentBar();
    scheduleFitChrome();
  }

  function renderRoster() {
    const box = $("rosterGrid");
    if (!box) return;
    const kids = playKids(play());
    if (!box.dataset.ready) {
      box.dataset.ready = "1";
      ROSTER_SPOTS.forEach((spot) => {
        const lab = document.createElement("label");
        lab.textContent = spot;
        const inp = document.createElement("input");
        inp.maxLength = 3;
        inp.dataset.spot = spot;
        inp.setAttribute("aria-label", spot + " initials");
        inp.addEventListener("input", () => {
          setKidName(play(), spot, inp.value);
          scheduleSave();
          renderField();
        });
        box.appendChild(lab);
        box.appendChild(inp);
      });
    }
    box.querySelectorAll("input").forEach((inp) => {
      if (document.activeElement !== inp) inp.value = kids[inp.dataset.spot] || "";
    });
  }

  function syncWhoRow() {
    const row = $("whoRow");
    const input = $("whoInput");
    const spot = $("whoSpot");
    if (!row || !input) return;
    const p = play();
    const pl = state.selected && state.selected.kind === "player" ? currentPlayer(state.selected.id) : null;
    if (!pl) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    if (spot) spot.textContent = pl.label;
    if (document.activeElement !== input) input.value = playerWho(pl, p);
    input.placeholder = "This play only";
  }

  function applyKidsToAllPlays() {
    const cur = play();
    if (!cur) return;
    const box = $("rosterGrid");
    if (box) {
      box.querySelectorAll("input").forEach((inp) => {
        setKidName(cur, inp.dataset.spot, inp.value);
      });
    }
    const src = Object.assign({}, playKids(cur));
    const named = Object.keys(src).filter((k) => src[k]);
    if (!named.length) {
      toast("Type initials first, then Apply");
      return;
    }
    (state.book.plays || []).forEach((p) => {
      p.kids = Object.assign({}, src);
      (p.players || []).forEach((pl) => {
        if (src[pl.label]) pl.who = src[pl.label];
        else delete pl.who;
      });
    });
    state.book.roster = Object.assign({}, src);
    save();
    render();
    toast("Copied this play's names to all " + (state.book.plays || []).length + " plays");
  }

  function renderSetList() {
    ensureSets();
    const set = activeSet();
    const sel = $("setSelect");
    const name = $("setName");
    const ul = $("setList");
    if (!sel || !ul) return;
    sel.innerHTML = "";
    state.book.sets.forEach(function (s) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name + " (" + (s.playIds || []).length + ")";
      sel.appendChild(o);
    });
    sel.value = set.id;
    if (name && document.activeElement !== name) name.value = set.name || "";
    ul.innerHTML = "";
    const plays = setPlays();
    if (!plays.length) {
      const empty = document.createElement("div");
      empty.className = "set-empty";
      empty.textContent = "Drag plays here for the next game — like adding songs to an album.";
      ul.appendChild(empty);
    }
    plays.forEach(function (p, i) {
      const li = document.createElement("div");
      li.className = "play-item set-item" + (p.id === state.playId ? " active" : "");
      li.dataset.id = p.id;
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.innerHTML =
        '<span class="seq">' +
        (i + 1) +
        '</span><span class="n ' +
        p.type +
        '">' +
        escapeHtml(p.number) +
        '</span><span class="meta"><b>' +
        escapeHtml(p.formation) +
        "</b> " +
        escapeHtml(p.name) +
        '</span><button type="button" class="rm" aria-label="Remove from list" title="Remove">×</button>';
      const rm = li.querySelector(".rm");
      rm.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      rm.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeFromSet(p.id);
      });
      li.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        if (e.target.closest(".rm")) return;
        e.preventDefault();
        setListFocus("set");
        state.listDrag = { id: p.id, y: e.clientY, x: e.clientX, moved: false, toId: null, after: false, from: "set", target: "set" };
        try {
          li.setPointerCapture(e.pointerId);
        } catch (err) {}
      });
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectPlay(p.id);
        }
      });
      ul.appendChild(li);
    });
    const pos = $("setPos");
    if (pos) {
      if (!plays.length) pos.textContent = "Empty";
      else {
        const idx = plays.findIndex(function (p) { return p.id === state.playId; });
        pos.textContent = (idx >= 0 ? idx + 1 : "–") + " of " + plays.length;
      }
    }
  }

  function textVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }

  function fitTextWidth(el, maxPx, minPx) {
    if (!el) return minPx;
    const box = el.parentElement && el.parentElement.classList.contains("titles") ? el.parentElement : el;
    const width = box.clientWidth;
    el.style.fontSize = maxPx + "px";
    if (width < 8) return 0;
    if (el.scrollWidth <= width + 1) return maxPx;
    let lo = minPx;
    let hi = maxPx;
    let best = minPx;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      el.style.fontSize = mid + "px";
      if (el.scrollWidth <= width + 1) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    el.style.fontSize = best + "px";
    return best;
  }

  function fitBar(bar) {
    if (!bar) return;
    const h = bar.clientHeight;
    if (h < 20) return;
    const inner = Math.max(20, h - 22);
    const titles = bar.querySelector(".titles");
    const strong = titles && titles.querySelector("strong");
    const em = titles && titles.querySelector("em");
    const emOn = textVisible(em) && (em.textContent || "").trim();
    if (strong) {
      const max = emOn ? Math.floor(inner * 0.62) : Math.floor(inner * 0.7);
      fitTextWidth(strong, max, 18);
    }
    if (emOn) {
      fitTextWidth(em, Math.max(12, Math.floor(inner * 0.22)), 11);
    }
    const num = bar.querySelector(".num, .print-num");
    if (num) {
      if (num.classList.contains("print-num")) {
        num.style.padding = "6px 12px";
        num.style.fontSize = Math.floor(inner * 0.56) + "px";
      } else {
        num.style.fontSize = Math.floor(inner * 0.62) + "px";
      }
    }
    const star = bar.querySelector(".sheet-star.on");
    if (star) star.style.fontSize = Math.floor(inner * 0.64) + "px";
    const badge = bar.querySelector(".badge");
    if (badge) {
      badge.style.fontSize = Math.max(16, Math.floor(inner * 0.3)) + "px";
      badge.style.padding = Math.max(6, Math.floor(inner * 0.08)) + "px " + Math.max(10, Math.floor(inner * 0.12)) + "px";
    }
  }

  function fitSheetChrome(root) {
    const sheet = root || document.querySelector(".stage .sheet");
    if (!sheet) return;
    sheet.querySelectorAll(".sheet-head, .sheet-foot").forEach(fitBar);
  }

  function scheduleFitChrome() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fitSheetChrome();
        fitPresentField();
      });
    });
  }

  function syncCurveToggle() {
    const el = $("curveOn");
    if (!el) return;
    if (state.selected && state.selected.kind === "assign") {
      const a = play().assignments.find((x) => x.id === state.selected.id);
      if (a) {
        el.checked = useSmooth(a);
        return;
      }
    }
    el.checked = state.curve;
  }

  function applyCurveToggle() {
    const on = $("curveOn").checked;
    state.curve = on;
    if (state.selected && state.selected.kind === "assign") {
      const a = play().assignments.find((x) => x.id === state.selected.id);
      if (a) {
        pushUndo();
        a.smooth = on;
        if (on && a.points.length === 2) {
          const m = midPoint(a.points[0], a.points[1]);
          a.points.splice(1, 0, m);
        }
      }
    }
    if (state.drawing) state.drawing.smooth = on;
    renderField();
    scheduleSave();
  }

  function renderHint() {
    const hints = {
      select: "Drag players or lines. Double-click a circle to put initials under the position. Click a line, then drag the solid dots — or the hollow middle dot to curve it.",
      route: "Click a player, then click bend spots on the field. Enter to finish. Keep Curve on for a smooth arc.",
      block: "Click B to block. If he already has motion, the T-bar starts where the dashed line ends.",
      motion: "Click B, then click where he motions to. Enter to finish. Then switch to Block and click B again — the block starts at the motion spot.",
      ball: "Click the ball carrier, then click the ball path (blue arrow).",
      paintRed: "Click a player to mark the ball carrier (red).",
      paintGold: "Click a player to mark the primary (gold).",
      addOff: "Click the field to add an offensive player.",
      addDef: "Click the field to add a defender.",
    };
    $("hint").textContent = hints[state.tool] || "";
  }

  function assignmentClass(type) {
    if (type === "ball") return "ball";
    if (type === "motion") return "motion";
    if (type === "block") return "block";
    return "route";
  }

  function paintFieldMarks(g) {
    const NS = "http://www.w3.org/2000/svg";
    const los = (RaidersPlays.LOS || 338) - 22;
    const marks = document.createElementNS(NS, "g");
    marks.setAttribute("class", "field-marks");
    marks.setAttribute("pointer-events", "none");

    function line(x1, y1, x2, y2, cls) {
      const el = document.createElementNS(NS, "line");
      el.setAttribute("x1", x1);
      el.setAttribute("y1", y1);
      el.setAttribute("x2", x2);
      el.setAttribute("y2", y2);
      el.setAttribute("class", cls);
      marks.appendChild(el);
    }

    line(36, los, 1164, los, "los");
    g.appendChild(marks);
  }

  function paintPlay(p, g, opts) {
    const interactive = !!(opts && opts.interactive);
    paintFieldMarks(g);
    const assigns = p.assignments || [];
    assigns.forEach((a) => {
      const pts = livePoints(a, p);
      if (!pts || pts.length < 2) return;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", pathD(pts, useSmooth(a)));
      el.setAttribute("class", "assign " + assignmentClass(a.type) + (interactive && state.selected && state.selected.kind === "assign" && state.selected.id === a.id ? " sel" : ""));
      if (a.type === "ball") {
        el.setAttribute("stroke", "#1565d8");
        el.setAttribute("stroke-width", "3.2");
      }
      el.dataset.id = a.id;
      g.appendChild(el);

      const seg = lastSeg(pts);
      if (a.type === "block") {
        const t = tBar(seg, 13);
        const bar = document.createElementNS("http://www.w3.org/2000/svg", "line");
        bar.setAttribute("x1", t.x1);
        bar.setAttribute("y1", t.y1);
        bar.setAttribute("x2", t.x2);
        bar.setAttribute("y2", t.y2);
        bar.setAttribute("class", "assign-end block");
        g.appendChild(bar);
      } else {
        const tri = arrowPts(seg, a.type === "ball" ? 14 : 11);
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", tri.map((x) => x.join(",")).join(" "));
        poly.setAttribute("class", "arrow " + assignmentClass(a.type));
        if (a.type === "ball") poly.setAttribute("fill", "#1565d8");
        g.appendChild(poly);
      }
    });

    if (interactive && state.drawing && state.drawing.points.length) {
      const pts = state.drawing.points;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", pathD(pts, state.curve || state.drawing.type === "ball" || state.drawing.type === "motion"));
      el.setAttribute("class", "assign drawing " + assignmentClass(state.drawing.type));
      if (state.drawing.type === "ball") {
        el.setAttribute("stroke", "#1565d8");
        el.setAttribute("stroke-width", "3.2");
      }
      g.appendChild(el);
    }

    p.players.forEach(function (pl) {
      if (state.hideDef && pl.side === "def") return;
      const tip = motionTip(p, pl.id);
      if (tip && dist(tip, pl) > 18) {
        const mark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        mark.setAttribute("cx", tip.x);
        mark.setAttribute("cy", tip.y);
        mark.setAttribute("r", 7);
        mark.setAttribute("class", "motion-spot");
        g.appendChild(mark);
      }
    });

    p.players.forEach((pl) => {
      if (state.hideDef && pl.side === "def") return;
      const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const who = playerWho(pl, p);
      wrap.setAttribute("class", "player " + pl.side + " " + (pl.fill || "white") + (who ? " stacked" : "") + (interactive && state.selected && state.selected.kind === "player" && state.selected.id === pl.id ? " sel" : ""));
      wrap.dataset.id = pl.id;
      if (pl.side === "def") {
        const tri = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const s = 18;
        tri.setAttribute(
          "points",
          pl.x + "," + (pl.y - s) + " " + (pl.x - s * 1.05) + "," + (pl.y + s * 0.75) + " " + (pl.x + s * 1.05) + "," + (pl.y + s * 0.75)
        );
        wrap.appendChild(tri);
      } else {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", pl.x);
        c.setAttribute("cy", pl.y);
        c.setAttribute("r", R);
        wrap.appendChild(c);
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("class", "pos");
      t.setAttribute("x", pl.x);
      t.setAttribute("y", who ? (pl.side === "off" ? pl.y - 3 : pl.y - 2) : pl.y + 5);
      t.setAttribute("text-anchor", "middle");
      t.textContent = pl.label;
      wrap.appendChild(t);
      if (who) {
        const w = document.createElementNS("http://www.w3.org/2000/svg", "text");
        w.setAttribute("class", "who");
        w.setAttribute("x", pl.x);
        w.setAttribute("y", pl.y + 11);
        w.setAttribute("text-anchor", "middle");
        w.textContent = who;
        wrap.appendChild(w);
      }
      g.appendChild(wrap);
    });

    if (interactive && state.selected && state.selected.kind === "assign") {
      const a = assigns.find((x) => x.id === state.selected.id);
      if (a) {
        const pts = livePoints(a, p);
        for (let i = 0; i < pts.length - 1; i++) {
          const m = midPoint(pts[i], pts[i + 1]);
          const h = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          h.setAttribute("cx", m.x);
          h.setAttribute("cy", m.y);
          h.setAttribute("r", 6);
          h.setAttribute("class", "handle mid");
          g.appendChild(h);
        }
        pts.forEach((pt, i) => {
          if (a.afterMotion && i === 0) return;
          const h = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          h.setAttribute("cx", pt.x);
          h.setAttribute("cy", pt.y);
          h.setAttribute("r", 7);
          h.setAttribute("class", "handle" + (state.handle === i ? " active" : ""));
          g.appendChild(h);
        });
      }
    }
  }

  function playBounds(p) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    function add(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    (p.players || []).forEach(function (pl) {
      if (state.hideDef && pl.side === "def") return;
      add(pl.x, pl.y);
    });
    (p.assignments || []).forEach(function (a) {
      (livePoints(a, p) || []).forEach(function (pt) {
        add(pt.x, pt.y);
      });
    });
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: VW, maxY: VH };
    const pad = 48;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }

  function fitPresentField() {
    const svg = $("field");
    if (!svg) return;
    if (!state.present) {
      svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
      return;
    }
    const box = playBounds(play());
    const cw = Math.max(1, svg.clientWidth || VW);
    const ch = Math.max(1, svg.clientHeight || VH);
    const aspect = cw / ch;
    const contentW = Math.max(80, box.maxX - box.minX);
    const contentH = Math.max(80, box.maxY - box.minY);
    let vw;
    let vh;
    if (contentW / contentH > aspect) {
      vw = contentW;
      vh = contentW / aspect;
    } else {
      vw = contentH * aspect;
      vh = contentH;
    }
    const MAX_ZOOM = 1.48;
    const scale = Math.min(VW / vw, VH / vh);
    if (scale > MAX_ZOOM) {
      const grow = scale / MAX_ZOOM;
      vw *= grow;
      vh *= grow;
    }
    let vx = (box.minX + box.maxX) / 2 - vw / 2;
    let vy = (box.minY + box.maxY) / 2 - vh / 2;
    if (vw <= VW) vx = Math.min(Math.max(0, vx), VW - vw);
    if (vh <= VH) vy = Math.min(Math.max(0, vy), VH - vh);
    svg.setAttribute("viewBox", vx + " " + vy + " " + vw + " " + vh);
  }

  function renderField() {
    const p = play();
    const g = $("world");
    g.innerHTML = "";
    paintPlay(p, g, { interactive: true });
    syncCurveToggle();
    syncWhoRow();
    fitPresentField();
  }

  function bandSvg() {
    return '<svg class="band" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 52"><rect width="100" height="52" fill="#0b1f3a"/><rect y="48" width="100" height="4" fill="#cda425"/></svg>';
  }

  function bandSvgFoot() {
    return '<svg class="band" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 52"><rect width="100" height="52" fill="#0b1f3a"/><rect width="100" height="4" fill="#cda425"/></svg>';
  }

  function printAll() {
    printPlays(state.book.plays || []);
  }

  function printSet() {
    const plays = setPlays();
    if (!plays.length) {
      toast("Drag plays into the game list first");
      return;
    }
    printPlays(plays);
  }

  function printPlays(plays) {
    commitPlayFields();
    finishDraw(false);
    state.selected = null;
    state.drawing = null;
    renderField();
    const root = $("printBook");
    root.innerHTML = "";
    (plays || []).forEach((p) => {
      const family = (p.family || "") + (p.defense ? " · " + p.defense : "");
      const title = escapeHtml((p.formation || "") + "   " + (p.name || ""));
      const num = escapeHtml(p.number || "");
      const kind = p.type === "pass" ? "pass" : "run";
      const sheet = document.createElement("section");
      sheet.className = "sheet print-sheet";
      sheet.innerHTML =
        '<div class="sheet-head">' +
        bandSvg() +
        '<div class="num ' + kind + '">' + num + "</div>" +
        '<div class="titles"><strong>' + title + "</strong><em>" + escapeHtml(family) + "</em></div>" +
        '<span class="sheet-star' + (p.star ? " on" : "") + '">★</span>' +
        '<span class="badge ' + kind + '">' + kind.toUpperCase() + "</span></div>" +
        '<div class="sheet-body"><svg class="print-field" viewBox="0 0 1200 720" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="1200" height="720" fill="#fff"/><g class="world"></g></svg></div>' +
        '<div class="sheet-foot">' +
        bandSvgFoot() +
        '<div class="titles"><strong>' + title + "</strong><em>St. Regis Catholic · Birmingham</em></div>" +
        '<span class="sheet-star' + (p.star ? " on" : "") + '">★</span>' +
        '<span class="badge ' + kind + '">' + kind.toUpperCase() + "</span>" +
        '<div class="print-num ' + kind + '">' + num + "</div></div>";
      root.appendChild(sheet);
      paintPlay(p, sheet.querySelector("g.world"), { interactive: false });
    });
    document.documentElement.classList.add("print-book");
    document.body.classList.add("print-book");
    setTimeout(function () {
      document.querySelectorAll("#printBook .sheet").forEach(fitSheetChrome);
      window.print();
    }, 80);
  }

  function endPrintAll() {
    document.documentElement.classList.remove("print-book");
    document.body.classList.remove("print-book");
    const root = $("printBook");
    if (root) root.innerHTML = "";
  }

  function currentPlayer(id) {
    return play().players.find((p) => p.id === id);
  }

  function beginDraw(pl, type, pt, fromCircle) {
    let start = { x: pl.x, y: pl.y };
    let afterMotion = false;
    if (!fromCircle && type !== "motion") {
      const tip = motionTip(play(), pl.id);
      if (tip) {
        start = { x: tip.x, y: tip.y };
        afterMotion = true;
      }
    }
    state.drawing = {
      from: pl.id,
      type: type,
      afterMotion: afterMotion,
      points: [start, { x: pt.x, y: pt.y }],
    };
    state.selected = { kind: "player", id: pl.id };
    renderField();
  }

  function finishDraw(keep) {
    if (!state.drawing) return;
    if (keep && state.drawing.points.length >= 2) {
      const pts = state.drawing.points;
      if (pts.length >= 3 && dist(pts[pts.length - 1], pts[pts.length - 2]) < 10) pts.pop();
      pushUndo();
      const a = {
        id: RaidersPlays.uid("a"),
        from: state.drawing.from,
        type: state.drawing.type,
        points: state.drawing.points,
        smooth: state.curve,
        afterMotion: !!state.drawing.afterMotion,
      };
      play().assignments.push(a);
      state.selected = { kind: "assign", id: a.id };
    }
    state.drawing = null;
    render();
  }

  function onPointerDown(evt) {
    if (evt.button !== 0) return;
    evt.preventDefault();
    if (window.getSelection) window.getSelection().removeAllRanges();
    const pt = svgPoint(evt);
    const p = play();

    if (state.tool === "addOff" || state.tool === "addDef") {
      pushUndo();
      const side = state.tool === "addOff" ? "off" : "def";
      const label = window.prompt("Player label", side === "off" ? "X" : "LB");
      if (!label) return;
      p.players.push({
        id: RaidersPlays.uid(side === "off" ? "o" : "d"),
        label: label.slice(0, 3).toUpperCase(),
        side,
        x: pt.x,
        y: pt.y,
        fill: "white",
      });
      render();
      return;
    }

    if (state.drawing) {
      state.drawing.points.push({ x: pt.x, y: pt.y });
      renderField();
      return;
    }

    const plEarly = hitPlayer(pt, p.players);
    if (["route", "block", "motion", "ball"].indexOf(state.tool) >= 0) {
      if (plEarly) {
        beginDraw(plEarly, state.tool, pt, evt.altKey);
        return;
      }
    }

    if (state.selected && state.selected.kind === "assign") {
      const a = p.assignments.find((x) => x.id === state.selected.id);
      if (a) {
        const pts = livePoints(a, p);
        for (let i = 0; i < pts.length; i++) {
          if (a.afterMotion && i === 0) continue;
          if (dist(pt, pts[i]) <= 10) {
            pushUndo();
            state.drag = { kind: "handle", assignId: a.id, index: i };
            state.handle = i;
            try { $("field").setPointerCapture(evt.pointerId); } catch (err) {}
            return;
          }
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const m = midPoint(pts[i], pts[i + 1]);
          if (dist(pt, m) <= 11) {
            pushUndo();
            a.smooth = true;
            a.points.splice(i + 1, 0, { x: pt.x, y: pt.y });
            state.curve = true;
            state.drag = { kind: "handle", assignId: a.id, index: i + 1 };
            state.handle = i + 1;
            try { $("field").setPointerCapture(evt.pointerId); } catch (err) {}
            renderField();
            return;
          }
        }
      }
    }

    const pl = hitPlayer(pt, p.players);
    if (["route", "block", "motion", "ball"].indexOf(state.tool) >= 0) {
      if (pl) beginDraw(pl, state.tool, pt, evt.altKey);
      return;
    }

    if (state.tool === "paintRed" || state.tool === "paintGold") {
      if (!pl || pl.side !== "off") return;
      pushUndo();
      const fill = state.tool === "paintRed" ? "red" : "gold";
      p.players.forEach((x) => {
        if (x.side === "off" && x.fill === fill) x.fill = "white";
      });
      pl.fill = pl.fill === fill ? "white" : fill;
      render();
      return;
    }

    if (pl) {
      state.selected = { kind: "player", id: pl.id };
      pushUndo();
      state.drag = { kind: "player", id: pl.id, last: pt };
      try { $("field").setPointerCapture(evt.pointerId); } catch (err) {}
      renderField();
      return;
    }

    const visAssigns = p.assignments;
    const a = hitAssign(pt, visAssigns);
    if (a) {
      state.selected = { kind: "assign", id: a.id };
      renderField();
      return;
    }

    state.selected = null;
    renderField();
  }

  function onPointerMove(evt) {
    if (state.drawing || state.drag) evt.preventDefault();
    const pt = svgPoint(evt);
    if (state.drawing) {
      const pts = state.drawing.points;
      pts[pts.length - 1] = { x: pt.x, y: pt.y };
      renderField();
      return;
    }
    if (!state.drag) return;
    const p = play();
    if (state.drag.kind === "player") {
      const pl = currentPlayer(state.drag.id);
      if (!pl) return;
      const dx = pt.x - state.drag.last.x;
      const dy = pt.y - state.drag.last.y;
      pl.x += dx;
      pl.y += dy;
      p.assignments.forEach((a) => {
        if (a.from === pl.id) {
          a.points.forEach((q) => {
            q.x += dx;
            q.y += dy;
          });
        }
      });
      state.drag.last = pt;
      renderField();
    } else if (state.drag.kind === "handle") {
      const a = p.assignments.find((x) => x.id === state.drag.assignId);
      if (!a) return;
      if (a.afterMotion && state.drag.index === 0) {
        const tipAssign = (p.assignments || []).filter(function (x) {
          return x.from === a.from && x.type === "motion";
        }).pop();
        if (tipAssign) tipAssign.points[tipAssign.points.length - 1] = { x: pt.x, y: pt.y };
      } else {
        a.points[state.drag.index] = { x: pt.x, y: pt.y };
        const owner = currentPlayer(a.from);
        if (owner && state.drag.index === 0 && !a.afterMotion) {
          const dx = pt.x - owner.x;
          const dy = pt.y - owner.y;
          owner.x = pt.x;
          owner.y = pt.y;
          a.points.forEach((q, i) => {
            if (i !== 0) {
              q.x += dx;
              q.y += dy;
            }
          });
        }
      }
      renderField();
    }
  }

  function onPointerUp() {
    if (state.drag) {
      state.drag = null;
      scheduleSave();
      renderList();
    }
  }

  function onDblClick(evt) {
    evt.preventDefault();
    if (state.drawing) {
      finishDraw(true);
      return;
    }
    const pt = svgPoint(evt);
    const pl = hitPlayer(pt, play().players);
    if (pl) {
      const next = window.prompt("Kid initials under " + pl.label + " (this play only)", playerWho(pl) || "");
      if (next == null) return;
      pushUndo();
      setKidName(play(), pl.label, next);
      render();
    }
  }

  function deleteSelected() {
    const p = play();
    if (state.drawing) {
      finishDraw(false);
      return;
    }
    if (!state.selected) return;
    pushUndo();
    if (state.selected.kind === "assign") {
      p.assignments = p.assignments.filter((a) => a.id !== state.selected.id);
    } else if (state.selected.kind === "player") {
      const id = state.selected.id;
      p.players = p.players.filter((x) => x.id !== id);
      p.assignments = p.assignments.filter((a) => a.from !== id);
    }
    state.selected = null;
    render();
  }

  function setTool(tool) {
    finishDraw(false);
    state.tool = tool;
    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute("data-tool") === tool);
    });
    renderHint();
  }

  function newPlay() {
    const formation = $("formSelect").value || "I Right";
    const nums = state.book.plays.map((p) => parseInt(p.number, 10) || 0);
    const next = String(Math.max(0, ...nums) + 1).padStart(2, "0");
    const p = RaidersPlays.blankPlay(formation, next, "New Play", "run", $("defSelect").value || "4-4 Base");
    pushBookUndo();
    state.book.plays.push(p);
    selectPlay(p.id);
    scheduleSave();
  }

  function duplicatePlay() {
    commitPlayFields();
    const src = play();
    const copy = clone(src);
    copy.id = RaidersPlays.uid("play");
    const n = parseInt(src.number, 10);
    copy.number = String((n || 0) + 1).padStart(2, "0");
    copy.name = src.name + " copy";
    const i = state.book.plays.findIndex((p) => p.id === src.id);
    state.book.plays.splice(i + 1, 0, copy);
    selectPlay(copy.id);
    scheduleSave();
  }

  function deletePlay() {
    if (state.book.plays.length <= 1) return toast("Keep at least one play");
    if (!window.confirm("Delete this play from the book?")) return;
    const id = play().id;
    state.book.plays = state.book.plays.filter((p) => p.id !== id);
    if (state.book.sets) {
      state.book.sets.forEach(function (s) {
        s.playIds = (s.playIds || []).filter(function (pid) { return pid !== id; });
      });
    }
    state.playId = state.book.plays[0].id;
    render();
    scheduleSave();
  }

  function flipCurrent() {
    commitPlayFields();
    pushUndo();
    const flipped = RaidersPlays.flipPlay(play());
    flipped.id = play().id;
    flipped.number = play().number;
    const i = state.book.plays.findIndex((p) => p.id === play().id);
    state.book.plays[i] = flipped;
    state.playId = flipped.id;
    render();
  }

  function applyFormation() {
    commitPlayFields();
    const name = $("formSelect").value;
    const p = play();
    pushUndo();
    const defName = p.defense || "4-4 Base";
    const fresh = RaidersPlays.formationPlayers(name, defName);
    const oldBy = {};
    p.players.forEach((pl) => {
      oldBy[pl.id] = pl;
    });
    p.assignments.forEach((a) => {
      const old = oldBy[a.from];
      const neu = fresh.find((x) => x.id === a.from);
      if (old && neu) {
        const dx = neu.x - old.x;
        const dy = neu.y - old.y;
        a.points.forEach((pt) => {
          pt.x += dx;
          pt.y += dy;
        });
      }
    });
    p.players = fresh.map((pl) => {
      const old = oldBy[pl.id];
      return old ? Object.assign(pl, { fill: old.fill, who: old.who }) : pl;
    });
    p.formation = name;
    p.family = (RaidersPlays.FORMATIONS[name] || {}).family || "";
    render();
  }

  function applyDefense() {
    commitPlayFields();
    const name = $("defSelect").value;
    const p = play();
    pushUndo();
    const te = ((RaidersPlays.FORMATIONS[p.formation] || {}).te) || "right";
    const def = RaidersPlays.defensePlayers(name, te);
    const keep = p.players.filter((pl) => pl.side !== "def");
    const ids = {};
    keep.forEach((pl) => {
      ids[pl.id] = true;
    });
    def.forEach((pl) => {
      ids[pl.id] = true;
    });
    p.players = keep.concat(def);
    p.assignments = (p.assignments || []).filter((a) => ids[a.from]);
    p.defense = name;
    render();
  }

  function pushBookUndo() {
    /* play-level undo covers edits; list changes just save */
  }

  function exportJson() {
    commitPlayFields();
    const blob = new Blob([JSON.stringify(state.book, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "raiders-playbook.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Saved plays, names, and game lists");
  }

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u8concat(parts) {
    let n = 0;
    parts.forEach(function (p) { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    parts.forEach(function (p) {
      out.set(p, o);
      o += p.length;
    });
    return out;
  }

  function dosDate(d) {
    return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  }

  function dosTime(d) {
    return (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const time = dosTime(now);
    const date = dosDate(now);
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach(function (f) {
      const name = enc.encode(f.name);
      const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      locals.push(local, data);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    });
    const centralBlob = u8concat(centrals);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralBlob.length, true);
    ev.setUint32(16, offset, true);
    return u8concat(locals.concat([centralBlob, eocd]));
  }

  function downloadBytes(bytes, filename, type) {
    const blob = new Blob([bytes], { type: type || "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function packLaptop() {
    commitPlayFields();
    state.book.exportedAt = Date.now();
    save();
    const book = clone(state.book);
    const dataJs =
      "/* Bundled playbook — used if this copy is newer than what this browser already saved */\n" +
      "window.RAIDERS_PORTABLE_BOOK = " +
      JSON.stringify(book) +
      ";\n";
    if (!window.RAIDERS_PACK_ASSETS) {
      await new Promise(function (resolve) {
        const s = document.createElement("script");
        s.src = "pack-assets.js";
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    const assets = window.RAIDERS_PACK_ASSETS || {};
    async function asset(name) {
      try {
        const r = await fetch(name);
        if (r.ok) return await r.text();
      } catch (e) {}
      return assets[name] || "";
    }
    const indexHtml = await asset("index.html");
    const appJs = await asset("app.js");
    const playsJs = await asset("plays.js");
    let packJs = await asset("pack-assets.js");
    if (!packJs) packJs = "window.RAIDERS_PACK_ASSETS = " + JSON.stringify(assets) + ";\n";
    const bat = assets["Open Play Designer.bat"] || '@echo off\r\nstart "" "%~dp0index.html"\r\n';
    const openMe =
      "Raiders Play Designer — game day\r\n\r\n" +
      "1. Unzip. Keep the files in this folder.\r\n" +
      "2. Double-click Open Play Designer.bat  (or index.html)\r\n" +
      "3. No Wi-Fi needed after that.\r\n\r\n" +
      "This pack has the designer plus every play, kid name, and game list\r\n" +
      "from the computer that created it.\r\n";
    if (!indexHtml || !appJs || !playsJs) {
      toast("Could not pack the designer files — try again from this same folder");
      return;
    }
    const prefix = "Raiders-Play-Designer/";
    const zip = zipStore([
      { name: prefix + "index.html", data: indexHtml },
      { name: prefix + "app.js", data: appJs },
      { name: prefix + "plays.js", data: playsJs },
      { name: prefix + "playbook-data.js", data: dataJs },
      { name: prefix + "pack-assets.js", data: packJs || assets["pack-assets.js"] || "window.RAIDERS_PACK_ASSETS={};\n" },
      { name: prefix + "Open Play Designer.bat", data: bat },
      { name: prefix + "OPEN-ME.txt", data: openMe },
    ]);
    const day = new Date();
    const stamp =
      day.getFullYear() +
      "-" +
      String(day.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(day.getDate()).padStart(2, "0");
    downloadBytes(zip, "Raiders-Play-Designer-" + stamp + ".zip");
    const listed = (book.sets || []).reduce(function (n, s) { return n + (s.playIds || []).length; }, 0);
    toast("Laptop pack ready · " + book.plays.length + " plays · " + listed + " on game lists");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const book = JSON.parse(reader.result);
        if (!book.plays || !book.plays.length) throw new Error("no plays");
        state.book = book;
        ensureSets(state.book);
        state.playId = book.plays[0].id;
        render();
        save();
        const listed = (state.book.sets || []).reduce(function (n, s) { return n + (s.playIds || []).length; }, 0);
        toast("Loaded " + state.book.plays.length + " plays · " + listed + " on game lists");
      } catch (e) {
        toast("Could not read that file");
      }
    };
    reader.readAsText(file);
  }

  function resetSeed() {
    if (!window.confirm("Replace your saved book with the original Game 3 29 plays? Your edits will be overwritten.")) return;
    const keepRoster = state.book && state.book.roster;
    state.book = RaidersPlays.buildSeedPlaybook();
    ensureSets(state.book);
    if (keepRoster) state.book.roster = keepRoster;
    state.playId = state.book.plays[0].id;
    render();
    save();
  }

  function loadUi() {
    try {
      const raw = localStorage.getItem(UI_STORE);
      if (raw) return JSON.parse(raw) || {};
    } catch (e) {}
    return {};
  }

  function saveUi(patch) {
    const ui = Object.assign(loadUi(), patch);
    try {
      localStorage.setItem(UI_STORE, JSON.stringify(ui));
    } catch (e) {}
  }

  function otherPanelWidth(which) {
    const layout = document.querySelector(".layout");
    if (!layout) return which === "side" ? TOOL_DEFAULT : SIDE_DEFAULT;
    const prop = which === "side" ? "--tool-w" : "--side-w";
    const fallback = which === "side" ? TOOL_DEFAULT : SIDE_DEFAULT;
    return parseInt(getComputedStyle(layout).getPropertyValue(prop), 10) || fallback;
  }

  function panelMax(which) {
    return Math.max(SIDE_MIN, window.innerWidth - otherPanelWidth(which) - 14 - PLAY_MIN);
  }

  function applySideWidth(px) {
    const w = Math.max(SIDE_MIN, Math.min(panelMax("side"), Math.round(px)));
    document.querySelector(".layout").style.setProperty("--side-w", w + "px");
    return w;
  }

  function applyToolWidth(px) {
    const w = Math.max(TOOL_MIN, Math.min(panelMax("tool"), Math.round(px)));
    document.querySelector(".layout").style.setProperty("--tool-w", w + "px");
    return w;
  }

  function bindColResize(split, which) {
    if (!split) return;
    const apply = which === "tool" ? applyToolWidth : applySideWidth;
    const measure = which === "tool"
      ? () => document.querySelector(".tools").getBoundingClientRect().width
      : () => document.querySelector(".sidebar").getBoundingClientRect().width;
    const storeKey = which === "tool" ? "toolW" : "sideW";
    const reset = which === "tool" ? TOOL_DEFAULT : SIDE_DEFAULT;
    split.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || state.present) return;
      e.preventDefault();
      state.colResize = { x: e.clientX, w: measure(), which: which };
      split.classList.add("dragging");
      try {
        split.setPointerCapture(e.pointerId);
      } catch (err) {}
    });
    split.addEventListener("pointermove", (e) => {
      if (!state.colResize || state.colResize.which !== which) return;
      const delta = e.clientX - state.colResize.x;
      apply(state.colResize.w + (which === "tool" ? -delta : delta));
    });
    function endColResize() {
      if (!state.colResize || state.colResize.which !== which) return;
      state.colResize = null;
      split.classList.remove("dragging");
      const patch = {};
      patch[storeKey] = Math.round(measure());
      saveUi(patch);
      scheduleFitChrome();
    }
    split.addEventListener("pointerup", endColResize);
    split.addEventListener("pointercancel", endColResize);
    split.addEventListener("dblclick", () => {
      apply(reset);
      const patch = {};
      patch[storeKey] = reset;
      saveUi(patch);
      scheduleFitChrome();
    });
  }

  function presentSource() {
    if (state.presentFrom === "set" || state.presentFrom === "book") return state.presentFrom;
    return state.listFocus === "set" && setPlays().length ? "set" : "book";
  }

  function presentList() {
    if (presentSource() === "set") {
      const list = setPlays();
      if (list.length) return list;
    }
    return visibleBookPlays();
  }

  function clearSketch() {
    state.sketch = [];
    state.sketchStroke = null;
    renderSketch();
  }

  function undoSketch() {
    if (state.sketchStroke) {
      state.sketchStroke = null;
    } else if (state.sketch.length) {
      state.sketch.pop();
    }
    renderSketch();
  }

  function sketchPoint(e) {
    return { x: e.clientX, y: e.clientY };
  }

  function renderSketch() {
    const svg = $("presentSketch");
    if (!svg) return;
    svg.innerHTML = "";
    const strokes = state.sketchStroke ? state.sketch.concat([state.sketchStroke]) : state.sketch;
    strokes.forEach(function (pts) {
      if (!pts || !pts.length) return;
      if (pts.length === 1) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", pts[0].x);
        c.setAttribute("cy", pts[0].y);
        c.setAttribute("r", "5");
        svg.appendChild(c);
        return;
      }
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      let d = "M " + pts[0].x + " " + pts[0].y;
      for (let i = 1; i < pts.length; i++) d += " L " + pts[i].x + " " + pts[i].y;
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
  }

  function onSketchDown(e) {
    if (!state.present || e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    state.sketchStroke = [sketchPoint(e)];
    renderSketch();
  }

  function onSketchMove(e) {
    if (!state.sketchStroke) return;
    const last = state.sketchStroke[state.sketchStroke.length - 1];
    const pt = sketchPoint(e);
    if (Math.abs(pt.x - last.x) < 1.5 && Math.abs(pt.y - last.y) < 1.5) return;
    state.sketchStroke.push(pt);
    renderSketch();
  }

  function onSketchUp() {
    if (!state.sketchStroke) return;
    state.sketch.push(state.sketchStroke);
    state.sketchStroke = null;
    renderSketch();
  }

  function updatePresentBar() {
    const el = $("presentPos");
    if (!el) return;
    const list = presentList();
    const i = list.findIndex((p) => p.id === state.playId);
    const deck = presentSource() === "set" ? "Game list" : "Playbook";
    el.textContent = deck + "  " + (i >= 0 ? i + 1 : 1) + " / " + Math.max(1, list.length);
  }

  function enterPresent() {
    commitPlayFields();
    state.presentFrom = state.listFocus === "set" && setPlays().length ? "set" : "book";
    state.present = true;
    state.selected = null;
    state.drawing = null;
    document.body.classList.add("present");
    clearSketch();
    if ($("btnPresent")) $("btnPresent").textContent = "Exit full screen";
    render();
    const root = document.documentElement;
    if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
  }

  function exitPresent(fromFs) {
    if (!state.present) return;
    state.present = false;
    state.presentFrom = null;
    clearSketch();
    document.body.classList.remove("present");
    if ($("btnPresent")) $("btnPresent").textContent = "Full screen";
    scheduleFitChrome();
    if (!fromFs && document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }
  }

  function togglePresent() {
    if (state.present) exitPresent();
    else enterPresent();
  }

  function bind() {
    const svg = $("field");
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);
    svg.addEventListener("dblclick", onDblClick);
    svg.addEventListener("selectstart", (e) => e.preventDefault());
    svg.addEventListener("dragstart", (e) => e.preventDefault());
    document.addEventListener("pointermove", onListDragMove);
    document.addEventListener("pointerup", onListDragUp);
    document.addEventListener("pointercancel", onListDragUp);
    document.addEventListener("selectstart", (e) => {
      if (state.drag || state.drawing || state.colResize || state.listDrag) e.preventDefault();
    });
    bindColResize($("resizeSidebar"), "side");
    bindColResize($("resizeTools"), "tool");
    svg.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (state.drawing) finishDraw(true);
    });

    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => setTool(btn.getAttribute("data-tool")));
    });

    $("playSearch").addEventListener("input", renderList);
    $("playFilter").addEventListener("change", renderList);
    if ($("btnFavOnly")) $("btnFavOnly").addEventListener("click", toggleFavOnly);
    $("playList").addEventListener("pointerdown", () => setListFocus("book"));
    $("setList").addEventListener("pointerdown", () => setListFocus("set"));
    document.querySelector(".set-panel").addEventListener("pointerdown", () => setListFocus("set"));
    bindPlayField("numInput", (v) => { play().number = v; });
    bindPlayField("nameInput", (v) => { play().name = v; });
    bindPlayField("notes", (v) => { play().notes = v; });
    $("typeSelect").addEventListener("change", () => {
      commitPlayFields();
      pushUndo();
      play().type = $("typeSelect").value;
      render();
    });
    $("formSelect").addEventListener("change", applyFormation);
    $("defSelect").addEventListener("change", applyDefense);
    if ($("btnApplyKids")) $("btnApplyKids").addEventListener("click", applyKidsToAllPlays);
    $("hideDef").addEventListener("change", () => {
      state.hideDef = $("hideDef").checked;
      renderField();
    });
    const whoInput = $("whoInput");
    if (whoInput) {
      whoInput.addEventListener("input", () => {
        const pl = state.selected && state.selected.kind === "player" ? currentPlayer(state.selected.id) : null;
        if (!pl) return;
        if (state.fieldEdit !== "whoInput") {
          state.fieldEdit = "whoInput";
          pushUndo();
        }
        setKidName(play(), pl.label, whoInput.value);
        scheduleSave();
        renderField();
        renderRoster();
      });
      whoInput.addEventListener("blur", () => {
        if (state.fieldEdit === "whoInput") state.fieldEdit = null;
      });
    }
    $("curveOn").addEventListener("change", applyCurveToggle);
    $("btnNew").addEventListener("click", newPlay);
    $("btnDup").addEventListener("click", duplicatePlay);
    $("btnFlip").addEventListener("click", flipCurrent);
    $("btnDelPlay").addEventListener("click", deletePlay);
    $("btnPrint").addEventListener("click", () => {
      commitPlayFields();
      state.selected = null;
      state.drawing = null;
      renderField();
      window.print();
    });
    $("btnPrintAll").addEventListener("click", printAll);
    $("setSelect").addEventListener("change", () => {
      ensureSets();
      state.book.activeSetId = $("setSelect").value;
      scheduleSave();
      renderSetList();
    });
    $("setName").addEventListener("input", () => {
      activeSet().name = $("setName").value || "Game list";
      scheduleSave();
      const sel = $("setSelect");
      const opt = sel && sel.options[sel.selectedIndex];
      if (opt) opt.textContent = activeSet().name + " (" + setPlays().length + ")";
    });
    $("btnNewSet").addEventListener("click", newSet);
    $("btnPrintSet").addEventListener("click", printSet);
    $("btnClearSet").addEventListener("click", clearSet);
    $("btnSetPrev").addEventListener("click", () => stepSet(-1));
    $("btnSetNext").addEventListener("click", () => stepSet(1));
    window.addEventListener("beforeprint", () => {
      if (document.body.classList.contains("print-book")) {
        document.querySelectorAll("#printBook .sheet").forEach(fitSheetChrome);
        return;
      }
      state.selected = null;
      state.drawing = null;
      renderField();
      fitSheetChrome();
    });
    window.addEventListener("resize", () => {
      if (!state.present) {
        const layout = document.querySelector(".layout");
        if (layout) {
          applySideWidth(parseInt(getComputedStyle(layout).getPropertyValue("--side-w"), 10) || SIDE_DEFAULT);
          applyToolWidth(parseInt(getComputedStyle(layout).getPropertyValue("--tool-w"), 10) || TOOL_DEFAULT);
        }
      }
      scheduleFitChrome();
    });
    window.addEventListener("afterprint", endPrintAll);
    $("btnExport").addEventListener("click", exportJson);
    if ($("btnLaptop")) $("btnLaptop").addEventListener("click", function () {
      packLaptop().catch(function () { toast("Could not build the laptop pack"); });
    });
    $("btnImport").addEventListener("click", () => $("fileImport").click());
    $("fileImport").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f) importJson(f);
      e.target.value = "";
    });
    $("btnReset").addEventListener("click", resetSeed);
    $("btnDelete").addEventListener("click", deleteSelected);
    $("btnUndo").addEventListener("click", undo);
    $("btnRedo").addEventListener("click", redo);
    if ($("btnPresent")) $("btnPresent").addEventListener("click", togglePresent);
    if ($("btnPresentExit")) $("btnPresentExit").addEventListener("click", () => exitPresent());
    if ($("btnPresentPrev")) $("btnPresentPrev").addEventListener("click", () => stepPlays(-1));
    if ($("btnPresentNext")) $("btnPresentNext").addEventListener("click", () => stepPlays(1));
    const sketch = $("presentSketch");
    if (sketch) {
      sketch.addEventListener("pointerdown", onSketchDown);
      sketch.addEventListener("pointermove", onSketchMove);
      sketch.addEventListener("pointerup", onSketchUp);
      sketch.addEventListener("pointercancel", onSketchUp);
    }
    if ($("btnSketchUndo")) $("btnSketchUndo").addEventListener("click", undoSketch);
    if ($("btnSketchClear")) $("btnSketchClear").addEventListener("click", clearSketch);
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && state.present) exitPresent(true);
    });

    document.addEventListener("keydown", (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (state.present) {
          undoSketch();
          return;
        }
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        toast("Saved");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicatePlay();
        return;
      }
      if (e.key === "Enter" && state.drawing) {
        e.preventDefault();
        finishDraw(true);
        return;
      }
      if (e.key === "Escape") {
        if (state.present) {
          e.preventDefault();
          exitPresent();
          return;
        }
        finishDraw(false);
        state.selected = null;
        render();
        return;
      }
      if (typing) return;
      if (state.present) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          stepPlays(e.key === "ArrowDown" ? 1 : -1);
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        stepPlays(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "r" || e.key === "R") setTool("route");
      if (e.key === "b" || e.key === "B") setTool("block");
      if (e.key === "m" || e.key === "M") setTool("motion");
      if (e.key === "q" || e.key === "Q") setTool("ball");
      if (e.key === "c" || e.key === "C") {
        $("curveOn").checked = !$("curveOn").checked;
        applyCurveToggle();
      }
      if (e.key === "f" || e.key === "F") flipCurrent();
    });
  }

  function fillFormations() {
    const sel = $("formSelect");
    sel.innerHTML = "";
    Object.keys(RaidersPlays.FORMATIONS).forEach((name) => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    });
    const def = $("defSelect");
    def.innerHTML = "";
    (RaidersPlays.DEF_FORMATIONS || []).forEach((name) => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      def.appendChild(o);
    });
  }

  async function boot() {
    if (window.RaidersCloud) await window.RaidersCloud.unlock();
    fillFormations();
    state.book = await loadPreferred();
    state.playId = state.book.plays[0].id;
    bind();
    const ui = loadUi();
    state.favOnly = !!ui.favOnly;
    syncFavButton();
    applySideWidth(ui.sideW || SIDE_DEFAULT);
    applyToolWidth(ui.toolW || TOOL_DEFAULT);
    setTool("select");
    render();
    setListFocus("book");
    if (state.needCloudPush) scheduleCloudSave();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
