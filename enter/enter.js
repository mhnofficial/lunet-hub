
function openCloak() {
  const html = `
    <html>
      <head>
        <title>about:blank</title>
        <style>
          html, body { height: 100%; margin: 0; }
          iframe { width: 100%; height: 100%; border: 0; }
        </style>
      </head>
      <body>
        <iframe src="${location.href}"></iframe>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank");

  if (!w) {
    alert("Popup blocked — enable popups or try again.");
  } else {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); 
  }
}


const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let stars = [];
for (let i = 0; i < 270; i++) {
  stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 1.5 + 0.5,
    opacity: Math.random(),
    dx: (Math.random() - 0.5) * 2, 
    dy: (Math.random() - 0.5) * 2  
  });
}

function drawStars() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  stars.forEach(star => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${star.opacity})`;
    ctx.fill();


    star.opacity += (Math.random() - 0.5) * 0.02;
    if (star.opacity < 0.2) star.opacity = 0.2;
    if (star.opacity > 1) star.opacity = 1;


    star.x += star.dx;
    star.y += star.dy;


    if (star.x < 0) star.x = canvas.width;
    if (star.x > canvas.width) star.x = 0;
    if (star.y < 0) star.y = canvas.height;
    if (star.y > canvas.height) star.y = 0;
  });

  requestAnimationFrame(drawStars);
}
drawStars();


window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});





window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

    const iframeParentElement = document.getElementById("your_iframe_element"); // Get your iframe element

    const appEventCallbackFunction = (event) => {
        console.log(event.name); // Handle game-specific events
        console.log(event.data);
    };

    const sdkEventCallbackFunction = (event) => {
        console.log(event.name); // Handle SDK events
        console.log(event.msg);
    };

    // Initialize the module to embed the game
    NowIfp.init(iframeParentElement, appEventCallbackFunction, sdkEventCallbackFunction);
