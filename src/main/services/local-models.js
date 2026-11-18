'use strict';
// Catalogue des modèles d'IA locale (données pures, sans dépendance).

// ---------- Mini IA locale (hors ligne) ----------

const MODEL_FILENAME = 'mini-ia-qwen2.5-1.5b-instruct-q4.gguf';
 // legacy, gardé pour compat
const DEFAULT_MODEL_URL = 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';
 // legacy

const LOCAL_MODEL_OPTIONS = [
  {
    id: 'fast',
    label: 'Rapide (1,5 Go)',
    description: 'Réponses quasi instantanées, correct pour des questions simples. Qualité limitée sur du code complexe.',
    fileName: 'mini-ia-qwen2.5-1.5b-instruct-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    contextSize: 8192
  },
  {
    id: 'balanced',
    label: 'Équilibré (recommandé, ~4,7 Go)',
    description: 'Bien meilleur pour comprendre et expliquer tes cours (management, éco, algo, etc.) et pour du code correct. Plus lent (10-40s/réponse sur CPU).',
    fileName: 'mini-ia-qwen2.5-7b-instruct-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    contextSize: 8192
  },
  {
    id: 'code',
    label: 'Expert Code (~4,7 Go)',
    description: 'Spécialisé Java/Python : meilleure qualité de code, debug, complétion. Moins bon sur les matières non techniques.',
    fileName: 'mini-ia-qwen2.5-coder-7b-instruct-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
    contextSize: 16384
  }
];

function getModelOption(modelId) {
  return LOCAL_MODEL_OPTIONS.find((m) => m.id === modelId) || LOCAL_MODEL_OPTIONS[0];
}

module.exports = { DEFAULT_MODEL_URL, LOCAL_MODEL_OPTIONS, getModelOption };
