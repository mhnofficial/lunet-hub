importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
    console.log("SW fetch:", event.request.url);
    if (scramjet.route(event)) {
        console.log("SW routing:", event.request.url);
        event.respondWith(scramjet.fetch(event));
    }
});
