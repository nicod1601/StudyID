// Mode IA : index des cours et recherche locale.

async function buildSearchIndex() {
  const statusEl = el('iaIndexStatus');
  statusEl.textContent = '⏳ Indexation de tes documents…';
  const docs = [];
  for (const course of db.courses) {
    const courseDocs = await window.studyide.listDocuments(course.code);
    docs.push(...courseDocs);
  }
  for (const doc of docs) {
    if (!doc.hasPages) {
      try {
        await window.Lazy.pdf();
        const res = await window.studyide.readPdf(doc.filePath);
        if (!res.ok) continue;
        const pdf = await pdfjsLib.getDocument({ data: res.data }).promise;
        const pages = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const lines = await extractPageLines(page);
          pages.push(lines.join('\n'));
          page.cleanup();
          await nextIdle();
        }
        pdf.destroy().catch(() => {}); // libère la mémoire du document
        await window.studyide.savePageText({ documentId: doc.id, pages });
      } catch (e) {
        console.error('Indexation impossible pour', doc.fileName, e);
      }
    }
  }
  iaCorpus = await window.studyide.getSearchCorpus();
  iaIndexed = true;
  statusEl.textContent = `✅ ${docs.length} document(s) indexé(s), ${iaCorpus.length} passages disponibles pour la recherche.`;
}
// Recherche locale par mots-clés (score = nb d'occurrences pondéré)
function localSearch(query, scope) {
  const stopwords = new Set(['le','la','les','de','des','du','un','une','et','ou','à','a','en','dans','pour','sur','est','qu','que','qui','avec','ce','se','son','sa','ses','au','aux','par','plus','comment','pourquoi','quel','quelle','quels','quelles']);
  const terms = query.toLowerCase()
    .replace(/[^\p{L}0-9\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopwords.has(t));
  if (!terms.length) return [];

  const pool = scope === 'current' && currentCourse
    ? iaCorpus.filter((c) => c.courseCode === currentCourse)
    : iaCorpus;

  const scored = pool.map((chunk) => {
    const lower = chunk.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const matches = lower.split(t).length - 1;
      score += matches * (t.length > 5 ? 2 : 1);
    }
    return { chunk, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.chunk);
}
function excerptAround(text, terms, maxLen = 260) {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    idx = lower.indexOf(t.toLowerCase());
    if (idx !== -1) break;
  }
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + maxLen - 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
