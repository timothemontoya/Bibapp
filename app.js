// ==========================================
// 🗝️ CONFIGURATION DES APIS & GLOBALES
// ==========================================
const SUPABASE_URL = "https://oooveysvgzeumrzbjlyd.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vb3ZleXN2Z3pldW1yemJqbHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMDc4MjQsImV4cCI6MjA5OTY4MzgyNH0.VLQli39DvPiw3CxeDHirRQ6dC7rHRRq15A-IdhkCRe8";
const EMAILJS_PUBLIC_KEY = "ZM5p_wLlen1NYYEF-";
const EMAILJS_SERVICE_ID = "service_ms09a0l";
const EMAILJS_TEMPLATE_ID = "template_rla96gu";


const CATEGORY_GRADIENTS = {
  "Chill": "linear-gradient(135deg, #e66666, #f9e80040)",
  "Créatif": "linear-gradient(135deg, #FF6B00, #321f5833)",
  "Découverte": "linear-gradient(135deg, #FFD166, #fc470044)",
  "Détente": "linear-gradient(135deg, #2DD4BF, #6aff0044)",
  "Erotique": "linear-gradient(135deg, #f83636, #000000c2)",
  "Romantique": "linear-gradient(135deg, #ff758c, #ffb4d33f)",
  "Insolite": "linear-gradient(135deg, #4400ff, #ff8a0444)",
  "Aventure": "linear-gradient(135deg, #1e4e00, #70ff485a)",
  "Jeux": "linear-gradient(135deg, #4CC9F0, #0073ff6f)",
  "Maison": "linear-gradient(135deg, #8e99a7, #3e3e4c5a)",
};

// Couleur/Dégradé par défaut si la catégorie n'est pas dans le dictionnaire
const DEFAULT_GRADIENT = "linear-gradient(135deg, #0000ff77, #4169E1)"; // Bleu #0000FF

const platsDeBase = ["Pizza 🍕", "Burger 🍔", "Sushis 🍣", "Pâtes 🍝", "Salade 🥗", "Tacos 🌮"];
const paletteCouleurs = ['#ffb7b2', '#ffdac1', '#e2f0cb', '#b5ead7', '#c7ceea', '#ffc6ff'];

let supabaseClient = null;
let activeSubTab = 'hidden';
let selectedCategories = [];
let categoryMatchMode = 'any';
let cardsStateMap = {};
let tempCompletedCardId = null; 
let loadedPhotoBase64 = null; 
let motsDoux = [];
let datesData = [];
let bonsData = [];
let activeCardId = null;
let selectedRating = 0;
let pendingGridRefresh = false;
let allCategoriesList = [];
let scratchPercentageChecked = false;
let selectedBon = null;
let bonIdToUse = null;
let platsRoulette = platsDeBase.map(plat => ({ name: plat, isBase: true, active: true }));
let currentRotation = 0;
let bonFavoritesMap = {};

if (SUPABASE_URL !== "https://TON_PROJET.supabase.co") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,     // la session reste active après fermeture/rechargement du site
      autoRefreshToken: true,   // le jeton de connexion se renouvelle tout seul
      detectSessionInUrl: true
    }
  });
}
emailjs.init(EMAILJS_PUBLIC_KEY);

// ==========================================
// 🔐 AUTHENTIFICATION
// ==========================================
let appInitialized = false;
let currentUserId = null;
let currentUserEmail = null;

function showAuthScreen() {
  document.getElementById('auth-screen')?.classList.remove('is-hidden');
  document.querySelector('.app-container')?.classList.add('is-hidden');
}

function showApp() {
  document.getElementById('auth-screen')?.classList.add('is-hidden');
  document.querySelector('.app-container')?.classList.remove('is-hidden');
}

function hideAuthLoading() {
  document.getElementById('auth-loading')?.classList.add('is-hidden');
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('auth-error');
  const submitBtn = document.querySelector('#login-form .auth-submit');

  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Connexion...';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = "E-mail ou mot de passe incorrect.";
    submitBtn.disabled = false;
    submitBtn.textContent = 'Se connecter';
  }
  // En cas de succès, onAuthStateChange (ci-dessous) affiche l'app automatiquement.
}

async function handleLogout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  appInitialized = false;
  // On recharge pour repartir sur un état propre (données en mémoire vidées).
  window.location.reload();
}

function initAuth() {
  if (!supabaseClient) {
    // Pas de Supabase configuré : impossible de vérifier une session, on ouvre en mode démo.
    hideAuthLoading();
    showApp();
    if (!appInitialized) { appInitialized = true; initApp(); }
    return;
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    hideAuthLoading();
    if (session) {
      currentUserId = session.user.id;
      currentUserEmail = session.user.email;
      showApp();
      if (!appInitialized) {
        appInitialized = true;
        initApp();
      }
    } else {
      currentUserId = null;
      currentUserEmail = null;
      appInitialized = false;
      showAuthScreen();
      const submitBtn = document.querySelector('#login-form .auth-submit');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Se connecter'; }
    }
  });
}

// ==========================================
// 🔏 CHIFFREMENT CÔTÉ CLIENT (AES-GCM)
// ==========================================
// Les photos et messages sont chiffrés dans le navigateur AVANT d'être envoyés à Supabase.
// Personne ayant accès à la base (même Supabase) ne peut lire le contenu en clair sans
// la clé de chiffrement partagée, choisie librement par vous deux (différente du mot de passe de connexion).
const ENC_KEY_STORAGE = 'bibapp-enc-key-v1';
const ENC_SALT = 'bibapp-static-salt-v1'; // pas besoin d'être secret, juste constant
let encryptionKey = null; // CryptoKey gardée en mémoire pour la session
let encryptionKeyResolvers = [];

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKeyFromPassphrase(passphrase) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(ENC_SALT), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

function openEncryptionKeyModal() {
  document.getElementById('encryption-key-modal')?.classList.add('active');
}
function closeEncryptionKeyModal() {
  document.getElementById('encryption-key-modal')?.classList.remove('active');
}

// Renvoie la clé AES en mémoire, la relit depuis ce téléphone/navigateur si déjà entrée,
// ou demande de la saisir une seule fois (via la modale) sinon.
function ensureEncryptionKey() {
  if (encryptionKey) return Promise.resolve(encryptionKey);

  const cached = localStorage.getItem(ENC_KEY_STORAGE);
  if (cached) {
    return crypto.subtle.importKey('raw', base64ToBuffer(cached), 'AES-GCM', true, ['encrypt', 'decrypt'])
      .then(key => { encryptionKey = key; return key; });
  }

  return new Promise((resolve) => {
    encryptionKeyResolvers.push(resolve);
    openEncryptionKeyModal();
  });
}

async function confirmEncryptionKey() {
  const input = document.getElementById('encryption-passphrase-input');
  const errorEl = document.getElementById('encryption-key-error');
  const passphrase = input.value;

  if (!passphrase || passphrase.length < 4) {
    errorEl.textContent = "Choisis une clé d'au moins 4 caractères.";
    return;
  }

  const key = await deriveKeyFromPassphrase(passphrase);
  const rawKey = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(ENC_KEY_STORAGE, bufferToBase64(rawKey));
  encryptionKey = key;

  input.value = '';
  errorEl.textContent = '';
  closeEncryptionKeyModal();

  encryptionKeyResolvers.forEach(resolve => resolve(key));
  encryptionKeyResolvers = [];
}

async function encryptText(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return plainText;
  const key = await ensureEncryptionKey();

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText));

  return `enc:${bufferToBase64(iv)}:${bufferToBase64(ciphertext)}`;
}

async function decryptText(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('enc:')) return value;
  const key = await ensureEncryptionKey();

  try {
    const [, ivB64, dataB64] = value.split(':');
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(ivB64)) },
      key,
      base64ToBuffer(dataB64)
    );
    return new TextDecoder().decode(plainBuffer);
  } catch (e) {
    console.error("Erreur de déchiffrement (mauvaise clé ?) :", e);
    return "🔒 Impossible de déchiffrer (mauvaise clé de chiffrement).";
  }
}

// ==========================================
// 🚀 INITIALISATION DE L'APPLICATION
// ==========================================
async function initApp() {
  updateRouletteSystem();
  
  await Promise.all([
    chargerPhrases(),
    chargerDates(),
    chargerBons(),
    chargerBonFavorites()
  ]);

  initAppEvents();
  initStarRatingWidget();
  initNightMode();

  if (supabaseClient) {
    await checkStreak();
  } else {
    console.warn("Supabase n'est pas configuré. Mode démo actif.");
    loadDemoData();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  initAuth();
});

// --- Navigation ---
function switchTab(viewId, element) {
  document.querySelectorAll('.app-view, .nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  element.classList.add('active');

  if (viewId === 'view-bons') {
    renderBonsTab();
  }
}

function switchSubTab(subTab, element) {
  document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  element.classList.add('active');
  activeSubTab = subTab;
  genererCartesDates();
}

// --- Focus & Placeholders ---
function createCardPlaceholder(cardWrapper) {
  if (!cardWrapper || cardWrapper.dataset.hasPlaceholder === 'true') return;
  const placeholder = document.createElement('div');
  placeholder.className = 'card-placeholder';
  placeholder.dataset.placeholderFor = cardWrapper.id;
  cardWrapper.parentNode.insertBefore(placeholder, cardWrapper);
  cardWrapper.dataset.hasPlaceholder = 'true';
}

function removeCardPlaceholder(cardWrapper) {
  if (!cardWrapper || cardWrapper.dataset.hasPlaceholder !== 'true') return;
  const placeholder = document.querySelector(`.card-placeholder[data-placeholder-for="${cardWrapper.id}"]`);
  if (placeholder) placeholder.replaceWith(cardWrapper);
  delete cardWrapper.dataset.hasPlaceholder;
}

function closeActiveCard({ refreshGrid = false } = {}) {
  const card = activeCardId ? document.getElementById(activeCardId) : null;
  if (card) {
    card.classList.remove('focused'); 
    removeCardPlaceholder(card);
  }
  activeCardId = null;

  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.remove('active');

  if (refreshGrid && pendingGridRefresh) {
    pendingGridRefresh = false;
    genererCartesDates();
  }
}

function initAppEvents() {
  const overlay = document.getElementById('overlay');

  document.addEventListener('click', function(e) {
    const cardWrapper = e.target.closest('.card-wrapper');
    
    if (cardWrapper) {
      e.stopPropagation();
      if (activeCardId === cardWrapper.id) {
        if (!cardWrapper.classList.contains('flipped')) {
          flipCard(e, cardWrapper.id);
        }
        return;
      }
      if (activeCardId) return;

      createCardPlaceholder(cardWrapper);
      document.body.appendChild(cardWrapper);
      activeCardId = cardWrapper.id;
      cardWrapper.classList.add('focused');
      if (overlay) overlay.classList.add('active');
      return;
    }

    if (activeCardId) {
      closeActiveCard({ refreshGrid: true });
    }
  });
}

// ==========================================
// 📖 CHARGEMENT & SYNCHRONISATION
// ==========================================
async function chargerPhrases() {
  try {
    const response = await fetch('data/phrases.json');
    motsDoux = await response.json();
  } catch (error) {
    console.error("Erreur phrases:", error);
    motsDoux = ["Je t'aime plus que tout au monde ❤️"];
  }
}

async function chargerDates() {
  try {
    const response = await fetch('data/dates.json');
    const donneesBrutes = await response.json();
    
    datesData = melangerTableau(donneesBrutes);
    
    const cats = new Set();
    datesData.forEach(d => {
      if (Array.isArray(d.category)) d.category.forEach(c => cats.add(c));
      else if (d.category) cats.add(d.category);
    });
    
    genererCategoriesFiltres(Array.from(cats));
    await syncCardsState();
    genererCartesDates();
  } catch (error) {
    console.error("Erreur de chargement des dates:", error);
  }
}

async function syncCardsState() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('cards_state').select('*');
  if (error) {
    console.error("Erreur de synchronisation:", error);
    return;
  }
  cardsStateMap = {};
  if (data) {
    data.forEach(state => { cardsStateMap[state.card_id] = state; });
  }
}

async function chargerBons() {
  try {
    const response = await fetch('data/bons.json');
    bonsData = await response.json();
  } catch (error) {
    console.error("Erreur bons:", error);
  }
}

async function chargerBonFavorites() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('bon_favorites').select('*');
  if (error) {
    console.error("Erreur favoris des bons :", error);
    return;
  }
  bonFavoritesMap = {};
  if (data) {
    data.forEach(row => { bonFavoritesMap[row.bon_id] = row.is_favorite; });
  }
}

// ==========================================
// 🎛️ FILTRES DE CATÉGORIES
// ==========================================
function parseCategory(categoryString) {
  if (!categoryString) return { text: '', emoji: '' };

  const trimmed = categoryString.trim();

  // Découpe intelligemment en graphèmes (gère les émojis complexes, ZWJ, drapeaux, etc.)
  const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(trimmed), s => s.segment);

  if (segments.length === 0) return { text: '', emoji: '' };

  const emoji = segments.pop(); // Récupère le dernier émoji complet à 100%
  const text = segments.join('').trim(); // Récupère le reste du texte sans le casser

  return { text, emoji };
}

function genererCategoriesFiltres(categories) {
  allCategoriesList = categories;
  const container = document.getElementById('categories-checkboxes');
  if (!container) return;
  container.innerHTML = '';

  categories.forEach(cat => {
    const isChecked = selectedCategories.includes(cat);
    const { text, emoji } = parseCategory(cat);

    // Recherche dans le dictionnaire (sur le texte nettoyé ou la clé brute), sinon dégradé bleu par défaut
    const gradient = CATEGORY_GRADIENTS[text] || CATEGORY_GRADIENTS[cat] || DEFAULT_GRADIENT;

    const label = document.createElement('label');
    label.className = `category-pill ${isChecked ? 'active' : ''}`;
    label.style.setProperty('--btn-gradient', gradient);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = cat;
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', (e) => toggleCategoryFilter(e.target, cat));

    // Texte aligné à gauche (au-dessus du dégradé)
    const textSpan = document.createElement('span');
    textSpan.className = 'category-text';
    textSpan.textContent = text;

    // Émoji géant à droite (sous le dégradé)
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'category-emoji';
    emojiSpan.textContent = emoji;

    // Construction du bouton
    label.appendChild(checkbox);
    label.appendChild(textSpan);
    label.appendChild(emojiSpan);

    container.appendChild(label);
  });

  updateSelectedCategoriesCount();
}

function toggleCategoryFilter(checkbox, category) {
  const pill = checkbox.closest('.category-pill');
  if (checkbox.checked) {
    if (!selectedCategories.includes(category)) selectedCategories.push(category);
    if (pill) pill.classList.add('active');
  } else {
    selectedCategories = selectedCategories.filter(c => c !== category);
    if (pill) pill.classList.remove('active');
  }
  updateSelectedCategoriesCount();
  genererCartesDates();
}

function updateSelectedCategoriesCount() {
  const badge = document.getElementById('selected-categories-count');
  if (badge) badge.textContent = selectedCategories.length;
}

function showCategoriesOverlay() {
  const overlay = document.getElementById('categories-overlay');
  if (overlay) {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

function hideCategoriesOverlay() {
  const overlay = document.getElementById('categories-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function clearCategoryFilters() {
  selectedCategories = [];
  genererCategoriesFiltres(allCategoriesList);
  genererCartesDates();
}

// ==========================================
// 🎨 RENDU DE LA GRILLE DE CARTES
// ==========================================
function genererCartesDates() {
  const grid = document.getElementById('dates-grid');
  if (!grid) return;
  grid.innerHTML = ''; 

  const filteredDates = datesData.filter(date => {
    const state = cardsStateMap[date.id];
    if (activeSubTab === 'hidden' && state?.is_revealed) return false;
    if (activeSubTab === 'todo' && (!state?.is_revealed || state?.is_completed)) return false;
    if (activeSubTab === 'done' && !state?.is_completed) return false;

    return dateMatchesCategoryFilter(date);
  });

  // Le total dépend des catégories actives (mais pas de l'onglet cachés/à faire/faits)
  const totalInCategories = datesData.filter(date => dateMatchesCategoryFilter(date)).length;
  updateDatesCounter(filteredDates.length, totalInCategories);

  // Les favoris remontent en haut de la liste
  const sortedDates = [...filteredDates].sort((a, b) => {
    const favA = cardsStateMap[a.id]?.is_favorite ? 1 : 0;
    const favB = cardsStateMap[b.id]?.is_favorite ? 1 : 0;
    return favB - favA;
  });

  sortedDates.forEach(date => {
    const state = cardsStateMap[date.id] || {};
    const buttonHtml = activeSubTab === 'todo' 
      ? `<button class="btn-validate" onclick="openCompleteModal(event, '${date.id}')">Terminé ! <i class="ph-fill ph-check-fat"></i></button>` 
      : `<button class="btn-validate" style="background:#5856d6;" onclick="openViewMemoryModal(event, '${date.id}')">Souvenirs <i class="ph-fill ph-camera"></i></button>`;
    const favoriteHtml = state.is_revealed
      ? `<button class="favorite-btn ${state.is_favorite ? 'active' : ''}" onclick="toggleFavoriteDate(event, '${date.id}')" aria-label="Mettre en favori">
          <i class="${state.is_favorite ? 'ph-fill' : 'ph'} ph-star icon-emoji"></i>
        </button>`
      : '';

    const cardHtml = `
      <div class="card-wrapper ${state.is_revealed ? 'flipped' : ''}" id="${date.id}" data-id="${date.id}">
        <div class="card-inner">
          <div class="card-front">
            <div class="question-mark">?</div>
          </div>
          <div class="card-back ${date.theme || 'pink-theme'}">
            ${favoriteHtml}
            <div class="card-back-content">
              <h3>${date.title}</h3>
              <p>${date.description}</p>
            </div>
            <div class="card-back-action">${buttonHtml}</div>
          </div>
        </div>
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', cardHtml);
  });
}

function updateDatesCounter(count, total) {
  const counterEl = document.getElementById('dates-counter');
  if (!counterEl) return;

  if (activeSubTab === 'hidden') {
    counterEl.textContent = `Restant à révéler : ${count}/${total}`;
  } else if (activeSubTab === 'todo') {
    counterEl.textContent = `À faire : ${count}`;
  } else if (activeSubTab === 'done') {
    counterEl.textContent = `Terminés : ${count}/${total}`;
  }
}

async function toggleFavoriteDate(event, cardId) {
  if (event) { event.stopPropagation(); event.preventDefault(); }

  if (!cardsStateMap[cardId]) cardsStateMap[cardId] = { card_id: cardId };
  const newValue = !cardsStateMap[cardId].is_favorite;
  cardsStateMap[cardId].is_favorite = newValue;

  if (activeCardId) {
    // Une carte est ouverte en grand : on ne reconstruit pas toute la grille
    // (ça casserait la carte affichée), on met juste à jour l'étoile et on
    // reporte le tri à la fermeture de la carte.
    updateFavoriteButtonUI(cardId, newValue);
    pendingGridRefresh = true;
  } else {
    genererCartesDates();
  }

  if (!supabaseClient) return;

  const { error } = await supabaseClient.from('cards_state').upsert({
    card_id: cardId,
    is_favorite: newValue
  }, { onConflict: 'card_id' });

  if (error) {
    console.error("Erreur favori :", error);
    showToast("⚠️ Le favori n'a pas pu être enregistré.");
    cardsStateMap[cardId].is_favorite = !newValue;
    if (activeCardId) {
      updateFavoriteButtonUI(cardId, !newValue);
    } else {
      genererCartesDates();
    }
  }
}

function updateFavoriteButtonUI(cardId, isFavorite) {
  const cardElement = document.getElementById(cardId);
  if (!cardElement) return;
  const btn = cardElement.querySelector('.favorite-btn');
  if (!btn) return;
  btn.classList.toggle('active', isFavorite);
  const icon = btn.querySelector('i');
  if (icon) icon.className = `${isFavorite ? 'ph-fill' : 'ph'} ph-star icon-emoji`;
}

function setCategoryMatchMode(mode) {
  categoryMatchMode = mode;
  genererCartesDates();
}

function dateMatchesCategoryFilter(date) {
  if (selectedCategories.length === 0) return true;
  const itemCategories = Array.isArray(date.category) ? date.category : [date.category];
  return categoryMatchMode === 'all'
    ? selectedCategories.every(cat => itemCategories.includes(cat))
    : itemCategories.some(cat => selectedCategories.includes(cat));
}

// ==========================================
// 🔒 RETOURNEMENT DE CARTE
// ==========================================
async function canRevealDate() {
  if (!supabaseClient) return true;
  const { data, error } = await supabaseClient.from('cards_state').select('revealed_at').eq('is_revealed', true);
  if (error || !data) return true;
  
  const todayStr = new Date().toDateString();
  return !data.some(row => new Date(row.revealed_at).toDateString() === todayStr);
}

async function flipCard(event, cardId) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const cardElement = document.getElementById(cardId);
  const allowed = await canRevealDate();

  if (!allowed) {
    if (cardElement) cardElement.classList.add('shake-locked');
    setTimeout(() => {
      if (cardElement) cardElement.classList.remove('shake-locked');
      showToast("🔒 Tu as déjà découvert un date secret aujourd'hui ! Reviens demain 💗");
    }, 600);
    return;
  }

  if (cardElement) cardElement.classList.add('flipped');

  if (supabaseClient) {
    const { error: upsertError } = await supabaseClient.from('cards_state').upsert({
      card_id: cardId,
      is_revealed: true,
      revealed_at: new Date().toISOString(),
      is_completed: false
    }, { onConflict: 'card_id' });

    if (upsertError) {
      console.error("Erreur d'enregistrement :", upsertError);
      showToast(`⚠️ La carte n'a pas pu être enregistrée (${upsertError.message}).`);
      if (cardElement) cardElement.classList.remove('flipped');
      return;
    }
  }

  const cardObj = datesData.find(d => d.id === cardId);
  sendLoveEmail(cardObj ? cardObj.title : cardId);

  await syncCardsState();
  pendingGridRefresh = true;
}

function sendLoveEmail(dateName) {
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_name: "Amour",
    message: `Alerte Love ! Elle vient de retourner la carte : ${dateName}. Prépare le terrain ! 😉`
  }).then(() => console.log("Email envoyé !"), (err) => console.error("Erreur email:", err));
}

// ==========================================
// 🎲 RANDOM DATE
// ==========================================
let isTriggeringRandomDate = false;

function triggerRandomDate() {
  if (isTriggeringRandomDate) return;
  if (activeCardId) closeActiveCard();
  const pool = datesData.filter(dateMatchesCategoryFilter);
  if (pool.length === 0) return;

  isTriggeringRandomDate = true;

  const randomDate = pool[Math.floor(Math.random() * pool.length)];
  const state = cardsStateMap[randomDate.id] || {};

  if (!state.is_revealed) switchSubTab('hidden', document.querySelector('.segment-btn:nth-child(1)'));
  else if (state.is_completed) switchSubTab('done', document.querySelector('.segment-btn:nth-child(3)'));
  else switchSubTab('todo', document.querySelector('.segment-btn:nth-child(2)'));

  setTimeout(() => {
    const element = document.getElementById(randomDate.id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      createCardPlaceholder(element);
      document.body.appendChild(element);
      element.classList.add('focused');
      document.getElementById('overlay').classList.add('active');
      activeCardId = randomDate.id;
    } else {
      showToast("Cette carte n'est pas dans la catégorie visible actuelle !");
    }
    isTriggeringRandomDate = false;
  }, 100);
}

// ==========================================
// 📸 PHOTO COMPRESSION & SOUVENIRS
// ==========================================
function previewMemoryPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600; 
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      loadedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.75);
      const preview = document.getElementById('memory-photo-preview');
      preview.src = loadedPhotoBase64;
      preview.style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setStarRating(value) {
  selectedRating = value;
  document.querySelectorAll('#memory-rating .star').forEach(star => {
    const starValue = parseInt(star.dataset.value, 10);
    star.classList.toggle('filled', starValue <= value);
  });
}

function initStarRatingWidget() {
  const container = document.getElementById('memory-rating');
  if (!container) return;
  container.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', () => setStarRating(parseInt(star.dataset.value, 10)));
  });
}

function starsToText(rating) {
  const r = parseInt(rating, 10) || 0;
  return r <= 0 ? "Pas encore notée." : "★".repeat(r) + "☆".repeat(5 - r);
}

function openCompleteModal(event, cardId) {
  if (event) event.stopPropagation();
  tempCompletedCardId = cardId;
  loadedPhotoBase64 = null;
  
  document.getElementById('memory-photo-input').value = '';
  document.getElementById('memory-photo-preview').style.display = 'none';
  document.getElementById('memory-comment').value = '';
  setStarRating(0);

  if (activeCardId) closeActiveCard();

  document.getElementById('complete-date-modal').classList.add('active');
}

function closeCompleteModal() {
  document.getElementById('complete-date-modal').classList.remove('active');
  tempCompletedCardId = null;
}

async function saveDateMemory() {
  if (!supabaseClient || !tempCompletedCardId) return;

  const comment = document.getElementById('memory-comment').value;

  const encryptedComment = await encryptText(comment);
  const encryptedPhoto = await encryptText(loadedPhotoBase64);

  const { error } = await supabaseClient.from('cards_state').upsert({
    card_id: tempCompletedCardId,
    is_revealed: true,
    is_completed: true,
    completed_at: new Date().toISOString(),
    note: selectedRating,
    comment: encryptedComment,
    photo_base64: encryptedPhoto
  }, { onConflict: 'card_id' });

  if (error) {
    console.error(error);
    showToast("Erreur lors de la sauvegarde du souvenir.");
    return;
  }

  showToast("Souvenir sauvegardé avec succès dans votre album ! 📸💖");
  closeCompleteModal();
  if (activeCardId) closeActiveCard();

  await syncCardsState();
  pendingGridRefresh = false;
  genererCartesDates();
}

function openViewMemoryModal(event, cardId) {
  if (event) event.stopPropagation();

  const state = cardsStateMap[cardId];
  const dateObj = datesData.find(d => d.id === cardId);
  if (!state || !dateObj) return;

  if (activeCardId) closeActiveCard();

  document.getElementById('view-mem-title').textContent = dateObj.title;
  document.getElementById('view-mem-date').textContent = state.completed_at
    ? `Réalisé le ${new Date(state.completed_at).toLocaleDateString('fr-FR')}`
    : '';

  const photoWrapper = document.getElementById('view-mem-photo-wrapper');
  const imgElement = document.getElementById('view-mem-photo');
  const noteEl = document.getElementById('view-mem-note');
  const commentEl = document.getElementById('view-mem-comment');

  noteEl.textContent = starsToText(state.note);
  photoWrapper.style.display = 'none';
  commentEl.textContent = "Déchiffrement...";

  document.getElementById('view-memory-modal').classList.add('active');

  (async () => {
    const decryptedPhoto = await decryptText(state.photo_base64);
    if (decryptedPhoto) {
      imgElement.src = decryptedPhoto;
      photoWrapper.style.display = 'block';
    }

    const decryptedComment = await decryptText(state.comment);
    commentEl.textContent = decryptedComment ? `« ${decryptedComment} »` : "Aucun ressenti enregistré.";
  })();
}

function closeViewMemoryModal() {
  document.getElementById('view-memory-modal').classList.remove('active');
}

// ==========================================
// 🎟️ BONS SURPRISE & SCRATCH
// ==========================================
async function hasScratchedToday() {
  if (!supabaseClient) return false;
  const { data, error } = await supabaseClient.from('user_vouchers').select('scratched_at');
  if (error || !data) return false;
  const todayStr = new Date().toDateString();
  return data.some(row => new Date(row.scratched_at).toDateString() === todayStr);
}

async function renderBonsTab() {
  const container = document.getElementById('tokens-list');
  if (!container) return;

  container.innerHTML = `
    <div id="daily-scratch-container"></div>
    <h2 style="margin-top: 35px; margin-bottom: 15px; font-size: 22px; font-weight: 800;">🎒 Ma Boîte à Bons</h2>
    <div id="bons-inventory" class="tokens-list"></div>
  `;

  const scratched = await hasScratchedToday();
  const dailyContainer = document.getElementById('daily-scratch-container');

  if (!scratched) {
    dailyContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #ffe3e8 0%, #ffccd5 100%); border: 2px solid #ffb3c1; border-radius: 24px;">
        <span style="font-size: 45px; display: block; margin-bottom: 10px; animation: bounceMini 2s infinite alternate;"><img src="assets/gift.png" alt="🎁" style="width: 20%; height: 20%;"></span>
        <h3 style="color: #ff2d55; font-size: 18px; font-weight: bold;">Ton Ticket Surprise est prêt !</h3>
        <button class="btn-primary" onclick="openScratchModal()" style="background: #ff2d55; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(255, 45, 85, 0.3);">
          Gratter le ticket
        </button>
      </div>
    `;
  } else {
    dailyContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 30px 20px; border: 2px dashed var(--text-secondary); background: transparent; border-radius: 24px;">
        <span style="font-size: 40px;">🕒</span>
        <h3 style="margin-top: 10px; font-size: 16px;">Ticket du jour gratté !</h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">Reviens demain pour avoir un nouveau bon</p>
      </div>
    `;
  }
  // SUPPRIMER, c'est juste pour le démo, on veut que le ticket soit gratté tous les jours
  dailyContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #ffe3e8 0%, #ffccd5 100%); border: 2px solid #ffb3c1; border-radius: 24px;">
        <span style="font-size: 45px; display: block; margin-bottom: 10px; animation: bounceMini 2s infinite alternate;"><img src="assets/gift.gif" alt="🎁" style="width: 30%; height: 30%;"></span>
        <h3 style="color: #ff2d55; font-size: 18px; font-weight: bold;">Ton Ticket Surprise est prêt !</h3>
        <button class="btn-primary" onclick="openScratchModal()" style="background: #ff2d55; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(255, 45, 85, 0.3);">
          Gratter le ticket
        </button>
      </div>
    `;
  await renderInventory();
}

async function openScratchModal() {
  if (bonsData.length === 0) {
    showToast("Les bons ne sont pas encore chargés. Attends une seconde ! 🕒");
    return;
  }

  // Tirage au sort basé sur la rareté (1 à 10)
  selectedBon = tirerBonPondere(bonsData);

  document.getElementById('scratch-prize-icon').textContent = selectedBon.icon;
  document.getElementById('scratch-prize-title').textContent = selectedBon.title;
  document.getElementById('btn-close-scratch').style.display = 'none';
  document.querySelector('.scratch-prize-underlay')?.classList.remove('ready');

  document.getElementById('scratch-modal').classList.add('active');
  scratchPercentageChecked = false;
  setTimeout(initScratchCanvas, 150);
}

// 🖼️ Remplace ce fichier par ton image holographique (mets-la dans le dossier assets/ du site)
const SCRATCH_HOLO_IMAGE = 'assets/scratch-holo.png';
// 🔊 Remplace ce fichier par ton propre bruit de grattage (mets-le dans le dossier assets/ du site)
const SCRATCH_SOUND_FILE = 'assets/scratch-sound.mp3';
let scratchSoundAudio = null;

function getScratchSound() {
  if (!scratchSoundAudio) {
    scratchSoundAudio = new Audio(SCRATCH_SOUND_FILE);
    scratchSoundAudio.loop = true;
    scratchSoundAudio.volume = 0.5;
  }
  return scratchSoundAudio;
}

function playScratchSound() {
  const sound = getScratchSound();
  if (sound.paused) {
    sound.currentTime = 0;
    sound.play().catch(() => {}); // Ignore le blocage éventuel du navigateur
  }
}

function stopScratchSound() {
  if (!scratchSoundAudio) return;
  scratchSoundAudio.pause();
  scratchSoundAudio.currentTime = 0;
}

function drawImageCover(ctx, img, canvasWidth, canvasHeight) {
  const imgRatio = img.width / img.height;
  const canvasRatio = canvasWidth / canvasHeight;
  let drawWidth, drawHeight, offsetX, offsetY;

  if (imgRatio > canvasRatio) {
    drawHeight = canvasHeight;
    drawWidth = img.width * (canvasHeight / img.height);
    offsetX = (canvasWidth - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = canvasWidth;
    drawHeight = img.height * (canvasWidth / img.width);
    offsetX = 0;
    offsetY = (canvasHeight - drawHeight) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

function initScratchCanvas() {
  const canvas = document.getElementById('scratch-canvas');
  if (!canvas) return;
  const wrapper = canvas.parentElement;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.style.display = 'block';
  canvas.style.opacity = 1;
  canvas.width = wrapper.offsetWidth;
  canvas.height = wrapper.offsetHeight;

  const holoImg = new Image();
  holoImg.onload = () => {
    drawImageCover(ctx, holoImg, canvas.width, canvas.height);
    finishScratchLayer();
  };
  holoImg.onerror = () => {
    // Image introuvable : on retombe sur le gris par défaut, avec le texte
    // (puisque contrairement à l'image, ce gris n'a rien d'écrit dessus).
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#78909c';
    ctx.fillText('GRATTE ICI !', canvas.width / 2, canvas.height / 2 + 5);
    finishScratchLayer();
  };
  holoImg.src = SCRATCH_HOLO_IMAGE;

  function finishScratchLayer() {
    // Le texte "GRATTE ICI !" est déjà intégré dans l'image scratch-holo.png, pas besoin de le redessiner.

    // La couche du dessus est maintenant peinte : on peut révéler le prix en dessous sans risque de flash.
    document.querySelector('.scratch-prize-underlay')?.classList.add('ready');

    attachScratchListeners();
  }

  function attachScratchListeners() {
  let isDrawing = false;
  ctx.globalCompositeOperation = 'destination-out'; 
  ctx.lineWidth = 38; 
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDrawing(e) {
    isDrawing = true;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    playScratchSound();
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault(); 
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    checkScratchedPercentage();
  }

  function stopDrawing() {
    isDrawing = false;
    stopScratchSound();
  }

  let checkTimeout;
  function checkScratchedPercentage() {
    if (scratchPercentageChecked || checkTimeout) return;
    
    checkTimeout = setTimeout(async () => {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparentPixels = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentPixels++;
      }

      if ((transparentPixels / (pixels.length / 4)) * 100 > 60) {
        scratchPercentageChecked = true;
        stopScratchSound();
        canvas.style.transition = 'opacity 0.5s ease';
        canvas.style.opacity = 0;
        setTimeout(() => { canvas.style.display = 'none'; }, 500);

        document.getElementById('btn-close-scratch').style.display = 'inline-block';

        if (supabaseClient && selectedBon) {
          await supabaseClient.from('user_vouchers').insert({
            bon_id: selectedBon.id,
            status: 'owned',
            scratched_at: new Date().toISOString()
          });
        }
      }
      checkTimeout = null;
    }, 150);
  }

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
  }
}

async function closeScratchModal() {
  stopScratchSound();
  document.getElementById('scratch-modal').classList.remove('active');
  await renderBonsTab();
}

async function renderInventory() {
  const inventoryDiv = document.getElementById('bons-inventory');
  if (!inventoryDiv) return;

  if (!supabaseClient) {
    inventoryDiv.innerHTML = '<p class="empty-state">Liaison Supabase requise.</p>';
    return;
  }

  const { data, error } = await supabaseClient.from('user_vouchers').select('*').eq('status', 'owned');
  if (error) {
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    inventoryDiv.innerHTML = '<p class="empty-state">Ta Boîte à Bons est vide pour l\'instant. Gratte ton ticket quotidien ! 🎒</p>';
    return;
  }

  const counts = {};
  data.forEach(row => { counts[row.bon_id] = (counts[row.bon_id] || 0) + 1; });

  // Les favoris remontent en haut de la liste
  const sortedBonIds = Object.keys(counts).sort((a, b) => {
    const favA = bonFavoritesMap[a] ? 1 : 0;
    const favB = bonFavoritesMap[b] ? 1 : 0;
    return favB - favA;
  });

  inventoryDiv.innerHTML = '';
  sortedBonIds.forEach(bonId => {
    const bon = bonsData.find(b => b.id === bonId);
    if (!bon) return;

    const isFavorite = !!bonFavoritesMap[bonId];

    const html = `
      <div class="card token-card" id="owned-${bon.id}" style="border-radius: 18px; margin-bottom: 12px; padding: 15px;">
        <div class="token-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <span class="token-icon" style="font-size: 30px;">${bon.icon}</span>
            <div style="text-align: left;">
              <h3 style="font-size: 15px; font-weight: bold; margin: 0;">${bon.title}</h3>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 2px 0 0 0;">Quantité : <strong>x${counts[bonId]}</strong></p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="favorite-btn favorite-btn-inline ${isFavorite ? 'active' : ''}" onclick="toggleBonFavorite(event, '${bon.id}')" aria-label="Mettre en favori">
              <i class="${isFavorite ? 'ph-fill' : 'ph'} ph-star icon-emoji"></i>
            </button>
            <button class="btn-primary" onclick="openUseBonModal('${bon.id}')" style="padding: 8px 16px; font-size: 13px; border-radius: 10px; width: 8em;">Utiliser <i class="ph-fill ph-sparkle"></i></button>
          </div>
        </div>
      </div>
    `;
    inventoryDiv.insertAdjacentHTML('beforeend', html);
  });
}

async function toggleBonFavorite(event, bonId) {
  if (event) { event.stopPropagation(); event.preventDefault(); }

  const newValue = !bonFavoritesMap[bonId];
  bonFavoritesMap[bonId] = newValue;
  await renderInventory();

  if (!supabaseClient) return;

  const { error } = await supabaseClient.from('bon_favorites').upsert({
    bon_id: bonId,
    is_favorite: newValue
  }, { onConflict: 'bon_id' });

  if (error) {
    console.error("Erreur favori bon :", error);
    showToast("⚠️ Le favori n'a pas pu être enregistré.");
    bonFavoritesMap[bonId] = !newValue;
    await renderInventory();
  }
}

function openUseBonModal(bonId) {
  const bon = bonsData.find(b => b.id === bonId);
  if (!bon) return;

  bonIdToUse = bonId;

  document.getElementById('use-bon-icon').textContent = bon.icon;
  document.getElementById('use-bon-title').textContent = bon.title;
  document.getElementById('use-bon-desc').textContent = bon.desc || '';

  const messageInput = document.getElementById('use-bon-message');
  messageInput.value = '';
  messageInput.placeholder = 'Précise ta demande...';

  document.getElementById('use-bon-modal').classList.add('active');
}

function closeUseBonModal() {
  document.getElementById('use-bon-modal').classList.remove('active');
  bonIdToUse = null;
}

async function confirmUseBon() {
  if (!bonIdToUse || !supabaseClient) return;

  const bonId = bonIdToUse;
  const customMessage = document.getElementById('use-bon-message').value.trim();
  const encryptedMessage = await encryptText(customMessage);

  const { data, error } = await supabaseClient
    .from('user_vouchers')
    .select('id')
    .eq('bon_id', bonId)
    .eq('status', 'owned')
    .order('scratched_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    showToast("Oups, ce bon n'est plus disponible.");
    closeUseBonModal();
    return;
  }

  const { error: updateError } = await supabaseClient
    .from('user_vouchers')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
      detail_message: encryptedMessage || null
    })
    .eq('id', data[0].id);

  if (updateError) {
    showToast("Impossible d'utiliser ce bon actuellement.");
    closeUseBonModal();
    return;
  }

  const bon = bonsData.find(b => b.id === bonId);
  const bonTitle = bon ? bon.title : bonId;

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_name: "Amour",
    message: customMessage
      ? `Elle vient d'utiliser son super pouvoir : ${bonTitle} ! Détails : ${customMessage} ❤️`
      : `Elle vient d'utiliser son super pouvoir : ${bonTitle} ! ❤️`
  });

  showToast(`✨ Pouvoir "${bonTitle}" validé ! Ton chéri a reçu un mail. 😉`);
  closeUseBonModal();
  await renderBonsTab();
}

function tirerBonPondere(listeBons) {
  // 1. Attribuer un poids : Rareté 1 = Poids 10, Rareté 10 = Poids 1
  const bonsAvecPoids = listeBons.map(bon => ({
    ...bon,
    poids: Math.max(1, 11 - (bon.rarete || 1)) 
  }));

  // 2. Calculer le poids total de tous les bons réunis
  const poidsTotal = bonsAvecPoids.reduce((sum, bon) => sum + bon.poids, 0);

  // 3. Tirer un nombre aléatoire entre 0 et le poids total
  let nombreAleatoire = Math.random() * poidsTotal;

  // 4. Parcourir les bons pour trouver celui qui correspond au lancer
  for (const bon of bonsAvecPoids) {
    if (nombreAleatoire < bon.poids) {
      return bon; // Bon sélectionné !
    }
    nombreAleatoire -= bon.poids;
  }

  return bonsAvecPoids[0]; // Sécurité
}

// ==========================================
// 🔥 STREAK & DAILY BOX
// ==========================================
async function checkStreak() {
  if (!currentUserId) return;

  const { data, error } = await supabaseClient
    .from('progress_tracker')
    .select('*')
    .eq('user_id', currentUserId)
    .maybeSingle();

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let streak = 1;
  let isFirstLoginToday = false;
  let streakBroken = false; // Nouvelle variable pour détecter la casse

  if (error || !data) {
    // Toute première connexion de CET utilisateur
    await supabaseClient.from('progress_tracker').insert({
      user_id: currentUserId,
      current_streak: 1,
      last_connection: today.toISOString()
    });
    document.getElementById('streak-count').textContent = "1";
    handleStreakMilestones(1, false); 
    return;
  }

  const lastConnection = new Date(data.last_connection);
  const lastConnectionMidnight = new Date(lastConnection.getFullYear(), lastConnection.getMonth(), lastConnection.getDate());
  const diffDays = Math.round((todayMidnight - lastConnectionMidnight) / (1000 * 60 * 60 * 24));

  streak = data.current_streak;

  if (diffDays === 1) {
    // Connexion le jour suivant : on augmente le streak
    streak += 1;
    isFirstLoginToday = true;
    await supabaseClient.from('progress_tracker').update({
      current_streak: streak,
      last_connection: today.toISOString(),
      max_streak: Math.max(streak, data.max_streak || 0)
    }).eq('user_id', currentUserId);
  } else if (diffDays > 1) {
    // Si le streak précédent était > 1 et qu'il/elle a raté un jour, la chaîne est brisée
    if (streak > 1) {
      streakBroken = true;
    }
    streak = 1;
    isFirstLoginToday = true;
    await supabaseClient.from('progress_tracker').update({
      current_streak: streak,
      last_connection: today.toISOString()
    }).eq('user_id', currentUserId);
  }

  document.getElementById('streak-count').textContent = streak;

  // Si c'est sa première connexion de la journée, on affiche le pop-up en lui passant l'info de la casse
  if (isFirstLoginToday) {
    handleStreakMilestones(streak, streakBroken);
  }
}

function openDailyBox() {
  if (motsDoux.length === 0) return;

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24));

  document.getElementById('daily-message-text').textContent = motsDoux[dayOfYear % motsDoux.length];
  document.getElementById('daily-modal').classList.add('active');
}

function closeDailyModal() {
  document.getElementById('daily-modal').classList.remove('active');
  document.getElementById('box-status-text').textContent = "Reviens demain pour un nouveau mot doux ! ✨";
}
function handleStreakMilestones(streak, streakBroken) {
  // Vérifie si on est un multiple de 15 (jour 15, 30, 45...)
  const isMilestone = (streak > 0 && streak % 15 === 0);

  // Calcule le palier cible (ex: si streak = 16, cible = 30. Si streak = 15, cible = 15)
  let nextMilestone = Math.ceil(streak / 15) * 15;
  if (nextMilestone === 0) nextMilestone = 15; // Sécurité pour le tout début
  
  // Le palier précédent pour savoir combien de jours afficher dans le cycle actuel
  let prevMilestone = nextMilestone - 15;

  const totalCircles = 15; // Toujours 15 ronds par cycle
  let filledCircles = streak - prevMilestone;
  
  // Cas particulier : le jour de la victoire (ex: jour 15), on veut afficher les 15 ronds pleins
  if (filledCircles === 0 && isMilestone) {
    filledCircles = 15;
  }

  showStreakModal(streak, nextMilestone, totalCircles, filledCircles, isMilestone, streakBroken);

  if (isMilestone) {
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_name: "Admin Love (Moi)",
      message: `🔥 ALERTE RÉCOMPENSE ! ${currentUserEmail || 'Un compte'} vient d'atteindre le palier des ${streak} jours ! Prépare la surprise ! 🎁`
    }).then(() => console.log("Email palier envoyé !"), (err) => console.error("Erreur email:", err));
  }
}

function showStreakModal(streak, nextMilestone, totalCircles, filledCircles, isMilestone, streakBroken) {
  const container = document.getElementById('streak-circles-container');
  container.innerHTML = ''; // Nettoyer les anciens ronds

  const daysLeft = nextMilestone - streak;

  // Gestion des textes et de l'affichage selon le statut
  if (streakBroken) {
    document.getElementById('streak-modal-title').textContent = "Chaîne brisée 💔";
    document.getElementById('streak-modal-desc').textContent = "Oh non, tu as raté un jour... Ce n'est pas grave, on repart de plus belle !";
    document.getElementById('streak-reward-text').style.display = 'none';
  } else if (isMilestone) {
    document.getElementById('streak-modal-title').textContent = `🔥 ${streak} Jours d'affilée ! 🔥`;
    document.getElementById('streak-modal-desc').textContent = `Youpi mon ptit bébé !`;
    document.getElementById('streak-reward-text').style.display = 'block';

    if (typeof confetti === 'function') {
      const duration = 3000;
      const end = Date.now() + duration;
      (function frame() {
        confetti({ zIndex: 9999, particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ff2d55', '#ffb7b2', '#ffffff'] });
        confetti({ zIndex: 9999, particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ff2d55', '#ffb7b2', '#ffffff'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    }
  } else {
    document.getElementById('streak-modal-title').textContent = "Bravo pour ta régularité !";
    document.getElementById('streak-modal-desc').textContent = `Plus que ${daysLeft} jour${daysLeft > 1 ? 's' : ''} avant une surprise`;
    document.getElementById('streak-reward-text').style.display = 'none';
  }

  // Génération des 15 ronds
  for (let i = 1; i <= totalCircles; i++) {
    const circle = document.createElement('div');
    circle.className = 'streak-circle';
    
    if (i <= filledCircles) {
      circle.classList.add('filled');
      // Si le rond est rempli, on met la coche, SAUF si c'est le 15ème (on garde le cadeau)
      circle.innerHTML = (i === totalCircles) ? '<i class="ph ph-bold ph-gift"></i>' : '✓';
    } else {
      // Si le rond est vide, on n'affiche rien, SAUF si c'est le 15ème (on affiche le cadeau)
      if (i === totalCircles) {
        circle.innerHTML = '<i class="ph ph-bold ph-gift"></i>';
      }
    }
    
    container.appendChild(circle);
  }

  document.getElementById('streak-progress-modal').classList.add('active');
}
function closeStreakModal() {
  document.getElementById('streak-progress-modal').classList.remove('active');
}

// ==========================================
// 🍕 ROULETTE REPAS
// ==========================================
function updateRouletteSystem() {
  renderConfigList();
  setupRoulette();
}

function setupRoulette() {
  const wheel = document.getElementById('wheel');
  if (!wheel) return;
  wheel.innerHTML = '';
  
  const activePlats = platsRoulette.filter(p => p.active);
  
  if (activePlats.length === 0) {
    wheel.style.background = '#e5e5ea';
    wheel.innerHTML = '<div class="segment-label" style="transform: translate(-50%, -50%)">Tout est décoché ! 🫙</div>';
    return;
  }
  
  const angleStep = 360 / activePlats.length;
  const gradientParts = [];
  
  activePlats.forEach((platObj, index) => {
    const startAngle = angleStep * index;
    const endAngle = angleStep * (index + 1);
    gradientParts.push(`${paletteCouleurs[index % paletteCouleurs.length]} ${startAngle}deg ${endAngle}deg`);
    
    const label = document.createElement('div');
    label.className = 'segment-label';
    label.textContent = platObj.name;
    label.style.transform = `translate(-50%, -50%) rotate(${startAngle + (angleStep / 2)}deg) translateY(-85px) rotate(90deg)`;
    
    wheel.appendChild(label);
  });
  
  wheel.style.background = `conic-gradient(${gradientParts.join(', ')})`;
}

function renderConfigList() {
  const listContainer = document.getElementById('roulette-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';
  
  platsRoulette.forEach((platObj, index) => {
    const li = document.createElement('li');
    li.className = 'roulette-item';
    
    const label = document.createElement('label');
    label.innerHTML = `
      <input type="checkbox" ${platObj.active ? 'checked' : ''} onchange="togglePlat(${index})">
      <span>${platObj.name}</span>
    `;
    li.appendChild(label);
    
    if (!platObj.isBase) {
      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-delete';
      btnDelete.innerHTML = '🗑️';
      btnDelete.onclick = () => deleteCustomPlat(index);
      li.appendChild(btnDelete);
    }
    
    listContainer.appendChild(li);
  });
}

function togglePlat(index) {
  platsRoulette[index].active = !platsRoulette[index].active;
  setupRoulette(); 
}

function addCustomPlat() {
  const input = document.getElementById('input-new-plat');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  platsRoulette.push({ name: text, isBase: false, active: true });
  input.value = ''; 
  updateRouletteSystem();
}

function deleteCustomPlat(index) {
  if (platsRoulette[index].isBase) return;
  platsRoulette.splice(index, 1);
  updateRouletteSystem();
}

function spinWheel() {
  const wheel = document.getElementById('wheel');
  const btnSpin = document.getElementById('btn-spin');
  const resultElement = document.getElementById('roulette-result');
  const activePlats = platsRoulette.filter(p => p.active);
  
  if (activePlats.length === 0) {
    if (resultElement) resultElement.textContent = "Activez au moins un plat ! 🧐";
    return;
  }
  if (!wheel || !btnSpin) return;
  
  btnSpin.disabled = true;
  btnSpin.style.opacity = "0.6";
  if (resultElement) resultElement.textContent = "Choix en cours... 🍽️";
  
  currentRotation += 1800 + Math.floor(Math.random() * 360);
  wheel.style.transform = `rotate(${currentRotation}deg)`;
  
  setTimeout(() => {
    const winningIndex = Math.floor(((360 - (currentRotation % 360)) % 360) / (360 / activePlats.length));
    if (resultElement) {
      resultElement.textContent = `Ce soir on mange : ${activePlats[winningIndex].name} !`;
    }
    btnSpin.disabled = false;
    btnSpin.style.opacity = "1";
    btnSpin.innerHTML = "Relancer la roue !";
  }, 4000);
}

function toggleConfigPanel() {
  const configPanel = document.getElementById('roulette-config');
  const btnToggle = document.getElementById('btn-toggle-config');
  if (!configPanel || !btnToggle) return;
  
  const isOpen = configPanel.classList.toggle('open');
  btnToggle.innerHTML = isOpen ? "❌" : "🖌️";
  btnToggle.style.background = isOpen ? "#ff4a5a" : "";
  btnToggle.style.color = isOpen ? "#ffffff" : "";
  btnToggle.style.borderColor = isOpen ? "#ff4a5a" : "";
  btnToggle.style.transform = isOpen ? "rotate(90deg)" : "";
}

// ==========================================
// ⚙️ UTILITAIRES GLOBAUX
// ==========================================
function initNightMode() {
  if (localStorage.getItem('bibapp-night-mode') === 'on') {
    document.documentElement.classList.add('dark-mode');
  }
  updateNightModeIcon();
}

function toggleNightMode() {
  const isDark = document.documentElement.classList.toggle('dark-mode');
  localStorage.setItem('bibapp-night-mode', isDark ? 'on' : 'off');
  updateNightModeIcon();
}

function updateNightModeIcon() {
  const dot = document.getElementById('night-mode-icon');
  if (dot) {
    dot.innerHTML = document.documentElement.classList.contains('dark-mode')
      ? '<i class="ph-fill ph-sun icon-emoji"></i>'
      : '<i class="ph-fill ph-moon icon-emoji"></i>';
  }
}

// --- Volet de réglages ---
function toggleSettingsMenu() {
  document.getElementById('settings-menu')?.classList.toggle('is-hidden');
}

function closeSettingsMenu() {
  document.getElementById('settings-menu')?.classList.add('is-hidden');
}

document.addEventListener('click', function(e) {
  const menu = document.getElementById('settings-menu');
  const button = document.getElementById('settings-button');
  if (!menu || menu.classList.contains('is-hidden')) return;
  if (menu.contains(e.target) || (button && button.contains(e.target))) return;
  closeSettingsMenu();
});

function resetEncryptionKey() {
  const confirmed = window.confirm(
    "Supprimer la clé de chiffrement enregistrée sur cet appareil ?\n\nElle te sera redemandée à la prochaine photo ou message. Assure-toi de connaître la passphrase partagée avant de continuer, sinon tu ne pourras plus déchiffrer les anciens souvenirs sur cet appareil."
  );
  if (!confirmed) return;

  localStorage.removeItem(ENC_KEY_STORAGE);
  encryptionKey = null;
  closeSettingsMenu();
  showToast("🔑 Clé de chiffrement supprimée sur cet appareil.");
}

function loadDemoData() {
  document.getElementById('streak-count').textContent = "5";
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  container.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = 'toast active';
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3000);
}

function melangerTableau(tableau) {
  const copie = [...tableau]; 
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}