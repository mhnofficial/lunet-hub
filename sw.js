importScripts("https://cdn.jsdelivr.net/npm/@mercuryworkshop/scramjet@2.0.0-alpha/dist/scramjet.worker.js");

const scramjet = new ScramjetServiceWorker();

self.addEventListener("fetch", (event) => {
    if (scramjet.route(event)) {
        event.respondWith(scramjet.fetch(event));
    }
});
