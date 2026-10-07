/* Cloud playbook: PIN gate + GitHub Contents API auto-save */
(function () {
  const UNLOCK = "raiders-cloud-unlock";
  const api = "https://api.github.com";

  function cfg() {
    return window.RAIDERS_CLOUD || null;
  }

  function hasPin() {
    const c = cfg();
    return !!(c && c.pin);
  }

  function canPush() {
    if (isOffline()) return false;
    const c = cfg();
    return !!(c && c.token && c.owner && c.repo && c.path);
  }

  function rememberOk(pin) {
    try {
      localStorage.setItem(UNLOCK, pin);
    } catch (e) {}
  }

  function remembered() {
    const c = cfg();
    if (!c || !c.pin) return true;
    try {
      return localStorage.getItem(UNLOCK) === c.pin;
    } catch (e) {
      return false;
    }
  }

  function appDir() {
    var p = location.pathname || "/";
    if (/\.html$/i.test(p)) return p.replace(/\/[^/]+$/, "/");
    if (p.slice(-1) !== "/") p += "/";
    return p;
  }

  function otherShell() {
    var p = location.pathname || "";
    if (/all\.html$/i.test(p)) return "got.html";
    return "all.html";
  }

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("timeout"));
      }, ms);
      promise.then(
        function (value) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function fetchOk(url, opts, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, ms || 5000);
    return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

  function reloadFresh() {
    if (isOffline()) return;
    const go = function (preferCloud) {
      try {
        if (preferCloud) sessionStorage.setItem("raiders-prefer-cloud", "1");
        else sessionStorage.removeItem("raiders-prefer-cloud");
      } catch (e) {}
      location.replace(appDir() + otherShell() + "?t=" + Date.now());
    };
    const afterFlush = function (res) {
      const saved = !!(res && res.ok);
      if (!("serviceWorker" in navigator)) {
        go(saved);
        return;
      }
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
      }).then(function () { go(saved); }, function () { go(saved); });
    };
    const flush = window.RaidersFlushCloud;
    if (typeof flush === "function") {
      Promise.resolve(flush()).then(afterFlush, function () { afterFlush({ ok: false }); });
      return;
    }
    afterFlush({ ok: false });
  }

  function checkBuild() {
    if (isOffline()) return;
    const local = document.documentElement.getAttribute("data-build") || "";
    if (!local) return;
    fetchOk("version.json?t=" + Date.now(), { cache: "no-store" }, 4000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.build || v.build === local) return;
        if (/[?&](t|fresh)=/.test(location.search || "")) return;
        if (isOffline()) return;
        reloadFresh();
      })
      .catch(function () {});
  }

  function registerOffline() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    const build = document.documentElement.getAttribute("data-build") || "dev";
    navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(build)).catch(function () {});
  }

  function signOut() {
    const done = function () {
      try {
        localStorage.removeItem(UNLOCK);
      } catch (e) {}
      try {
        sessionStorage.removeItem("raiders-prefer-cloud");
      } catch (e) {}
      location.replace(location.pathname + "?t=" + Date.now());
    };
    const flush = window.RaidersFlushCloud;
    if (typeof flush === "function") {
      Promise.resolve(flush()).then(done, done);
      return;
    }
    done();
  }

  function showGate() {
    const gate = document.getElementById("pinGate");
    const app = document.querySelector(".app");
    if (gate) gate.hidden = false;
    document.body.classList.add("locked");
    if (app) app.setAttribute("aria-hidden", "true");
    const input = document.getElementById("pinInput");
    if (input) setTimeout(function () { input.focus(); }, 50);
  }

  function hideGate() {
    const gate = document.getElementById("pinGate");
    const app = document.querySelector(".app");
    if (gate) gate.hidden = true;
    document.body.classList.remove("locked");
    if (app) app.removeAttribute("aria-hidden");
  }

  function unlock() {
    return new Promise(function (resolve) {
      if (!hasPin() || remembered()) {
        hideGate();
        resolve(true);
        return;
      }
      showGate();
      const form = document.getElementById("pinForm");
      const input = document.getElementById("pinInput");
      const err = document.getElementById("pinErr");
      if (!form || !input) {
        resolve(true);
        return;
      }
      form.onsubmit = function (e) {
        e.preventDefault();
        const pin = String(input.value || "");
        if (pin === cfg().pin) {
          rememberOk(pin);
          if (err) err.textContent = "";
          hideGate();
          resolve(true);
          return;
        }
        if (err) err.textContent = "Wrong PIN";
        input.select();
      };
    });
  }

  function decodeB64(s) {
    const bin = atob(String(s || "").replace(/\n/g, ""));
    try {
      return decodeURIComponent(escape(bin));
    } catch (e) {
      return bin;
    }
  }

  function contentsUrl() {
    const c = cfg();
    return api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path;
  }

  function extrasPath() {
    const c = cfg();
    return (c && c.extras) || "play-extras.json";
  }

  function extrasUrl() {
    const c = cfg();
    return api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + extrasPath();
  }

  function authHeaders(extra) {
    const c = cfg();
    const headers = { Accept: "application/vnd.github+json" };
    if (c && c.token) headers.Authorization = "Bearer " + c.token;
    return Object.assign(headers, extra || {});
  }

  function toB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  async function latestSha() {
    const r = await fetchOk(contentsUrl(), { headers: authHeaders(), cache: "no-store" }, 15000);
    if (!r.ok) return null;
    const meta = await r.json();
    if (meta && meta.sha) window.RaidersCloud.sha = meta.sha;
    return (meta && meta.sha) || null;
  }

  function parseBook(b64) {
    if (!b64) return null;
    try {
      const book = JSON.parse(decodeB64(b64));
      return book && Array.isArray(book.plays) ? book : null;
    } catch (e) {
      return null;
    }
  }

  async function pullFromApi() {
    const c = cfg();
    if (!c || !c.owner || !c.repo || !c.path) return null;
    const r = await fetchOk(contentsUrl(), { headers: authHeaders(), cache: "no-store" }, 15000);
    if (!r.ok) return null;
    const meta = await r.json();
    if (meta && meta.sha) window.RaidersCloud.sha = meta.sha;
    let book = parseBook(meta && meta.content);
    if (book) return book;
    const raw = await fetchOk(contentsUrl(), {
      headers: authHeaders({ Accept: "application/vnd.github.raw" }),
      cache: "no-store",
    }, 25000);
    if (raw.ok) {
      try {
        book = await raw.json();
        if (book && Array.isArray(book.plays)) return book;
      } catch (e) {}
    }
    if (meta && meta.sha) {
      const blob = await fetchOk(api + "/repos/" + c.owner + "/" + c.repo + "/git/blobs/" + meta.sha, {
        headers: authHeaders(),
        cache: "no-store",
      }, 25000);
      if (blob.ok) {
        const pack = await blob.json();
        book = parseBook(pack && pack.content);
        if (book) return book;
      }
    }
    return null;
  }

  async function pullFromRaw() {
    const c = cfg();
    const path = (c && c.path) || "playbook.json";
    const owner = (c && c.owner) || "chat-blip";
    const repo = (c && c.repo) || "raiders-play-designer";
    const urls = [
      "https://raw.githubusercontent.com/" + owner + "/" + repo + "/main/" + path + "?t=" + Date.now(),
      "playbook.json?t=" + Date.now(),
    ];
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await fetchOk(urls[i], { cache: "no-store" }, 20000);
        if (!r.ok) continue;
        const book = await r.json();
        if (book && Array.isArray(book.plays)) return book;
      } catch (e) {}
    }
    return null;
  }

  async function pullOnce() {
    try {
      return await withTimeout((async function () {
        try {
          const fromApi = await pullFromApi();
          if (fromApi) return fromApi;
        } catch (e) {}
        return await pullFromRaw();
      })(), 45000);
    } catch (e) {
      return null;
    }
  }

  function extrasFromBook(book) {
    const footballs = {};
    ((book && book.plays) || []).forEach(function (p) {
      if (p && p.football) {
        footballs[p.id] = { x: p.football.x, y: p.football.y, name: p.name || "" };
      }
    });
    return { exportedAt: (book && book.exportedAt) || Date.now(), footballs: footballs };
  }

  function applyExtras(book, extras) {
    if (!book || !extras || !extras.footballs) return book;
    Object.keys(extras.footballs).forEach(function (id) {
      const spot = extras.footballs[id];
      if (!spot) return;
      let p = (book.plays || []).find(function (x) { return x.id === id; });
      if (!p && spot.name) {
        p = (book.plays || []).find(function (x) { return x.name === spot.name && !x.football; });
      }
      if (p && !p.football) p.football = { x: spot.x, y: spot.y };
    });
    return book;
  }

  function parseExtras(b64) {
    if (!b64) return null;
    try {
      const extras = JSON.parse(decodeB64(b64));
      return extras && extras.footballs ? extras : null;
    } catch (e) {
      return null;
    }
  }

  async function pullExtras() {
    if (isOffline()) return null;
    const c = cfg();
    try {
      const r = await fetchOk(extrasUrl(), { headers: authHeaders(), cache: "no-store" }, 10000);
      if (r.ok) {
        const meta = await r.json();
        if (meta && meta.sha) window.RaidersCloud.extrasSha = meta.sha;
        const extras = parseExtras(meta && meta.content);
        if (extras) return extras;
      }
    } catch (e) {}
    const owner = (c && c.owner) || "chat-blip";
    const repo = (c && c.repo) || "raiders-play-designer";
    const path = extrasPath();
    const urls = [
      "https://raw.githubusercontent.com/" + owner + "/" + repo + "/main/" + path + "?t=" + Date.now(),
      path + "?t=" + Date.now(),
    ];
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await fetchOk(urls[i], { cache: "no-store" }, 8000);
        if (!r.ok) continue;
        const extras = await r.json();
        if (extras && extras.footballs) return extras;
      } catch (e) {}
    }
    return null;
  }

  async function pushExtras(book) {
    if (!canPush() || !book) return { ok: false };
    let extras = extrasFromBook(book);
    try {
      const theirs = await pullExtras();
      if (theirs && theirs.footballs) {
        Object.keys(theirs.footballs).forEach(function (id) {
          if (!extras.footballs[id]) extras.footballs[id] = theirs.footballs[id];
        });
      }
    } catch (e) {}
    const content = toB64(JSON.stringify(extras));
    const payload = {
      message: "Update play extras",
      content: content,
      sha: window.RaidersCloud.extrasSha || undefined,
    };
    try {
      let r = await fetchOk(extrasUrl(), {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }, 15000);
      if (r.status === 409 || r.status === 422) {
        const latest = await fetchOk(extrasUrl(), { headers: authHeaders(), cache: "no-store" }, 8000);
        if (latest.ok) {
          const meta = await latest.json();
          if (meta && meta.sha) {
            window.RaidersCloud.extrasSha = meta.sha;
            payload.sha = meta.sha;
            r = await fetchOk(extrasUrl(), {
              method: "PUT",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify(payload),
            }, 15000);
          }
        } else if (r.status === 422) {
          delete payload.sha;
          r = await fetchOk(extrasUrl(), {
            method: "PUT",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
          }, 15000);
        }
      }
      if (!r.ok) return { ok: false, reason: "http-" + r.status };
      const out = await r.json();
      if (out && out.content && out.content.sha) window.RaidersCloud.extrasSha = out.content.sha;
      return { ok: true, extras: extras };
    } catch (e) {
      return { ok: false, reason: "network" };
    }
  }

  async function pull() {
    if (isOffline()) return null;
    const extras = await pullExtras();
    for (let i = 0; i < 3; i++) {
      const book = await pullOnce();
      if (book) return applyExtras(book, extras);
    }
    return null;
  }

  async function push(book) {
    const c = cfg();
    if (!canPush() || !book) return { ok: false, reason: "offline" };
    const extrasRes = await pushExtras(book);
    const body = JSON.stringify(book);
    let content = "";
    try {
      content = toB64(body);
    } catch (e) {
      return extrasRes && extrasRes.ok ? { ok: true, extrasOnly: true } : { ok: false, reason: "encode" };
    }
    try {
      const sha = window.RaidersCloud.sha || (await latestSha());
      const payload = {
        message: "Update playbook",
        content: content,
        sha: sha || undefined,
      };
      const headers = authHeaders({ "Content-Type": "application/json" });
      let r = await fetchOk(contentsUrl(), {
        method: "PUT",
        headers: headers,
        body: JSON.stringify(payload),
      }, 45000);
      if (r.status === 409 || r.status === 422) {
        const fresh = await latestSha();
        if (fresh) {
          payload.sha = fresh;
          r = await fetchOk(contentsUrl(), {
            method: "PUT",
            headers: headers,
            body: JSON.stringify(payload),
          }, 45000);
        }
      }
      if (!r.ok) return extrasRes && extrasRes.ok ? { ok: true, extrasOnly: true } : { ok: false, reason: "http-" + r.status };
      const out = await r.json();
      if (out && out.content && out.content.sha) window.RaidersCloud.sha = out.content.sha;
      else if (out && out.commit) await latestSha();
      return { ok: true };
    } catch (e) {
      return extrasRes && extrasRes.ok ? { ok: true, extrasOnly: true } : { ok: false, reason: "network" };
    }
  }

  window.RaidersCloud = {
    sha: null,
    extrasSha: null,
    hasPin: hasPin,
    canPush: canPush,
    unlock: unlock,
    signOut: signOut,
    reloadFresh: reloadFresh,
    pull: pull,
    push: push,
    pullExtras: pullExtras,
    applyExtras: applyExtras,
    isOffline: isOffline,
  };

  function wireFresh() {
    const fresh = document.getElementById("btnFreshReload");
    if (fresh && !fresh.dataset.wired) {
      fresh.dataset.wired = "1";
      fresh.addEventListener("click", function (e) {
        e.preventDefault();
        reloadFresh();
      });
    }
    const out = document.getElementById("btnSignOut");
    if (out && !out.dataset.wired) {
      out.dataset.wired = "1";
      out.addEventListener("click", function (e) {
        e.preventDefault();
        signOut();
      });
    }
    const reload = document.getElementById("btnReloadFresh");
    if (reload && !reload.dataset.wired) {
      reload.dataset.wired = "1";
      reload.addEventListener("click", function (e) {
        e.preventDefault();
        reloadFresh();
      });
    }
    registerOffline();
    checkBuild();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireFresh);
  else wireFresh();
})();
