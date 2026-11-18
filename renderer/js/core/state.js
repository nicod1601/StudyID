// État partagé de l'appli (matière, exercice, document ouverts…) et raccourci DOM.
let db = null;
let currentCourse = null;
let currentExercise = null;
let cm = null;
let dirty = false;
let currentMode = 'code';
// --- État mode Cours ---
let currentDoc = null;
let pdfDoc = null;
let pdfScale = 1.1;
let currentPdfExercises = [];
let activePdfExId = null;
const el = (id) => document.getElementById(id);
