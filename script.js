const fullscreenBtn = document.querySelector('.full');
let isFullscreen = false;

fullscreenBtn.addEventListener('click', () => {
  if (!isFullscreen) {
    // Enter fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) { // Safari
      document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) { // IE11
      document.documentElement.msRequestFullscreen();
    }
    isFullscreen = true;
    fullscreenBtn.querySelector('i').classList.replace('fa-expand', 'fa-compress');
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    isFullscreen = false;
    fullscreenBtn.querySelector('i').classList.replace('fa-compress', 'fa-expand');
  }
});
