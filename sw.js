importScripts("/scram/scramjet.all.js");
importScripts("/scram/index.js");

const { BareMuxConnection } = bareModule;
const connection = new BareMuxConnection("/scram/worker.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker({
    prefix: "/scram/service/",
});

self.addEventListener("install", (event) => {
    event.waitUntil(
        connection.setTransport("/scram/epoxy.js", [{ wisp: "wss://wisp.mercuryworkshop.workers.dev/" }])
        .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
    if (scramjet.route(event)) {
        event.respondWith(scramjet.fetch(event));
    }
});
