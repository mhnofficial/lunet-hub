// Chat overlay script
(function() {
  // Create and append the dialog element
  const dialog = document.createElement('dialog');
  dialog.id = 'discord-invite-dialog';
  
  // Set dialog content
  dialog.innerHTML = `
    <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
      <h2 style="margin-top: 0; color: #5865F2;">Join Our Discord Community!</h2>
      <p>Stay updated on new games I'm developing and connect with other players.</p>
      <a href="https://discord.gg/gXhbyxvRFU" target="_blank" style="
        display: inline-block;
        background-color: #5865F2;
        color: white;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 5px;
        margin: 10px 0;
        font-weight: bold;">
        Join Discord Server
      </a>
      <div style="margin-top: 15px;">
        <button id="close-dialog" style="
          padding: 8px 16px;
          background-color: #f2f2f2;
          border: none;
          border-radius: 4px;
          cursor: pointer;">
          Maybe Later
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Show the dialog when the page is loaded
  setTimeout(() => {
    dialog.showModal();
  }, 2000); // Show after 2 seconds
  
  // Close dialog when the close button is clicked
  document.getElementById('close-dialog').addEventListener('click', () => {
    dialog.close();
  });
})(); 