// Section Discord.

// =====================================================================
// DISCORD — affiche discord.com/app dans une webview dédiée
// =====================================================================

const DISCORD_URL = 'https://discord.com/app';
function bindDiscordEvents() {
  el('discordRefreshBtn').onclick = () => {
    const webview = el('discordWebview');
    if (webview.src) webview.reload();
  };

  el('discordOpenBrowserBtn').onclick = () => {
    window.studyide.openUrl(DISCORD_URL);
  };
}
