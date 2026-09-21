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
    if (/edit\.html$/i.test(p)) return "forms.html";
    return "edit.html";
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
    const go = function () {
      location.replace(appDir() + otherShell() + "?t=" + Date.now());
    };
    if (!("serviceWorker" in navigator)) {
      go();
      return;
    }
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
    }).then(go, go);
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
    try {
      localStorage.removeItem(UNLOCK);
    } catch (e) {}
    reloadFresh();
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

  async function pullFromApi() {
    const c = cfg();
    if (!c || !c.owner || !c.repo || !c.path) return null;
    const headers = { Accept: "application/vnd.github+json" };
    if (c.token) headers.Authorization = "Bearer " + c.token;
    const r = await fetchOk(
      api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path,
      { headers: headers, cache: "no-store" },
      5000
    );
    if (!r.ok) return null;
    const meta = await r.json();
    if (meta && meta.sha) window.RaidersCloud.sha = meta.sha;
    const book = JSON.parse(decodeB64(meta.content));
    if (!book || !Array.isArray(book.plays)) return null;
    return book;
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
        const r = await fetchOk(urls[i], { cache: "no-store" }, 4000);
        if (!r.ok) continue;
        const book = await r.json();
        if (book && Array.isArray(book.plays)) return book;
      } catch (e) {}
    }
    return null;
  }

  async function pull() {
    if (isOffline()) return null;
    try {
      return await withTimeout((async function () {
        try {
          const fromApi = await pullFromApi();
          if (fromApi) return fromApi;
        } catch (e) {}
        return await pullFromRaw();
      })(), 6000);
    } catch (e) {
      return null;
    }
  }

  async function push(book) {
    const c = cfg();
    if (!canPush() || !book) return { ok: false, reason: "offline" };
    const body = JSON.stringify(book);
    const content = btoa(unescape(encodeURIComponent(body)));
    const payload = {
      message: "Update playbook",
      content: content,
      sha: window.RaidersCloud.sha || undefined,
    };
    try {
      const headers = {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + c.token,
        "Content-Type": "application/json",
      };
      let r = await fetchOk(api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify(payload),
      }, 8000);
      if (r.status === 409 || r.status === 422) {
        const latest = await fetchOk(api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path, {
          headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + c.token },
        }, 5000);
        if (latest.ok) {
          const meta = await latest.json();
          window.RaidersCloud.sha = meta.sha;
          payload.sha = meta.sha;
          r = await fetchOk(api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path, {
            method: "PUT",
            headers: headers,
            body: JSON.stringify(payload),
          }, 8000);
        }
      }
      if (!r.ok) return { ok: false, reason: "http-" + r.status };
      const out = await r.json();
      if (out && out.content && out.content.sha) window.RaidersCloud.sha = out.content.sha;
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "network" };
    }
  }

  window.RaidersCloud = {
    sha: null,
    hasPin: hasPin,
    canPush: canPush,
    unlock: unlock,
    signOut: signOut,
    reloadFresh: reloadFresh,
    pull: pull,
    push: push,
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
