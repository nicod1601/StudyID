/**
 * Accès aux réglages côté renderer.
 *
 * patchSettings ne fait modifier QUE les champs fournis (fusion côté process
 * principal), ce qui évite le read-modify-write et les écrasements accidentels
 * entre deux réglages modifiés coup sur coup.
 */

export const getSettings = () => window.studyide.getSettings();
export const patchSettings = (patch) => window.studyide.patchSettings(patch);
