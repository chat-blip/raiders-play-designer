/* Cache the designer so a dead Wi-Fi link cannot freeze or blank the page. */
const CACHE = "raiders-offline-v3";
const SHELL = [
  "./",
  "./index.html",
  "./play.html",
  "./go.html",
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

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(bare(req)).then(function (hit) {
        const refresh = fetch(req)
          .then(function (res) {
            put(cache, req, res);
            return res;
          })
          .catch(function () { return null; });
        if (hit) {
          event.waitUntil(refresh);
          return hit;
        }
        return refresh.then(function (res) {
          if (res) return res;
          if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) {
            return cache.match("./play.html").then(function (page) {
              return page || cache.match("./index.html") || cache.match("./go.html");
            });
          }
          return Response.error();
        });
      });
    })
  );
});
