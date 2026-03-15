importScripts("/scram/scramjet.bundle.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("fetch", (event) => {
    if (scramjet.route(event)) {
        event.respondWith(scramjet.fetch(event));
    }
});
