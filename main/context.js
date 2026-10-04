/**
 * Référence partagée vers la fenêtre principale.
 * Les modules IPC en ont besoin (dialogues, envoi d'événements) sans avoir à
 * se la passer en paramètre partout.
 */

let mainWindow = null;

function setMainWindow(win)
{
  mainWindow = win;
}

function getMainWindow()
{
  return mainWindow;
}

module.exports = { setMainWindow, getMainWindow };
