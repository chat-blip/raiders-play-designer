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
    const r = await fetch(
      api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path,
      { headers: headers, cache: "no-store" }
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
        const r = await fetch(urls[i], { cache: "no-store" });
        if (!r.ok) continue;
        const book = await r.json();
        if (book && Array.isArray(book.plays)) return book;
      } catch (e) {}
    }
    return null;
  }

  async function pull() {
    try {
      const fromApi = await pullFromApi();
      if (fromApi) return fromApi;
    } catch (e) {}
    try {
      return await pullFromRaw();
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
      let r = await fetch(api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify(payload),
      });
      if (r.status === 409 || r.status === 422) {
        const latest = await fetch(api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path, {
          headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + c.token },
        });
        if (latest.ok) {
          const meta = await latest.json();
          window.RaidersCloud.sha = meta.sha;
          payload.sha = meta.sha;
          r = await fetch(api + "/repos/" + c.owner + "/" + c.repo + "/contents/" + c.path, {
            method: "PUT",
            headers: headers,
            body: JSON.stringify(payload),
          });
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
    pull: pull,
    push: push,
  };
})();
