importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

let scramjet;

self.addEventListener("message", (event) => {
    if (event.data?.type === "init") {
        scramjet = new ScramjetServiceWorker(event.data.config);
    }
});

self.addEventListener("fetch", (event) => {
    if (scramjet?.route(event)) {
        event.respondWith(scramjet.fetch(event));
    }
});
