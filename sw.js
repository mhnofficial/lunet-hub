importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        clients.claim().then(() => {
            console.log('SW claimed all clients');
        })
    );
});

self.addEventListener("message", (event) => {
    if (event.data?.type === 'CLAIM') {
        clients.claim();
    }
});

self.addEventListener("fetch", (event) => {
    if (scramjet.route(event)) {
        event.respondWith(scramjet.fetch(event));
    }
});
