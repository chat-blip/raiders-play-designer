/* Cache the designer so a dead Wi-Fi link cannot freeze or blank the page. */
const CACHE = "raiders-offline-v9";
const SHELL = [
  "./",
  "./index.html",
  "./play.html",
  "./go.html",
  "./coach.html",
  "./open.html",
  "./app.js",
  "./plays.js",
  "./cloud.js",
  "./cloud-config.js",
  "./playbook-data.js",
  "./pack-assets.js",
  "./version.json",
  "./manifest.json",
];

function bare(request) {
  const url = new URL(typeof request === "string" ? request : request.url, self.location);
  return new Request(url.origin + url.pathname);
}

function isVersion(url) {
  return /\/version\.json$/i.test(url.pathname);
}

function isShell(url) {
  return url.pathname.endsWith(".html") || url.pathname.endsWith("/") ||
    url.pathname.endsWith(".js") || isVersion(url);
}

async function put(cache, request, response) {
  if (!response || !response.ok) return;
  try {
    await cache.put(bare(request), response.clone());
  } catch (e) {}
}

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    SHELL.map(function (path) {
      return fetch(path, { cache: "reload" })
        .then(function (res) { return put(cache, path, res); })
        .catch(function () {});
    })
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE; }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      const cached = cache.match(bare(req)).then(function (hit) {
        return hit || (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")
          ? cache.match("./play.html").then(function (page) {
              return page || cache.match("./index.html") || cache.match("./go.html") || cache.match("./coach.html");
            })
          : Promise.resolve(null));
      });

      const live = fetch(isVersion(url) || isShell(url) ? new Request(req, { cache: "reload" }) : req)
        .then(function (res) {
          put(cache, req, res);
          return res;
        })
        .catch(function () { return null; });

      return live.then(function (res) {
        if (res && res.ok) return res;
        return cached;
      }).then(function (res) {
        return res || Response.error();
      });
    })
  );
});
