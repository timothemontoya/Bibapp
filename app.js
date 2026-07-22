// ==========================================
// 🗝️ CONFIGURATION DES APIS
// ==========================================
const SUPABASE_URL = "https://oooveysvgzeumrzbjlyd.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vb3ZleXN2Z3pldW1yemJqbHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMDc4MjQsImV4cCI6MjA5OTY4MzgyNH0.VLQli39DvPiw3CxeDHirRQ6dC7rHRRq15A-IdhkCRe8";
const EMAILJS_PUBLIC_KEY = "TA_CLE_PUBLIQUE_EMAILJS";
const EMAILJS_SERVICE_ID = "TON_SERVICE_ID_EMAILJS";
const EMAILJS_TEMPLATE_ID = "TON_TEMPLATE_ID_EMAILJS";

let supabaseClient = null;

// Vérification de sécurité pour ne pas initialiser si on est sur la clé par défaut
if (SUPABASE_URL !== "https://TON_PROJET.supabase.co") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
emailjs.init(EMAILJS_PUBLIC_KEY);

// ==========================================
// 🗝️ VARIABLES GLOBALES
// ==========================================
let activeSubTab = 'hidden'; // 'hidden', 'todo', 'done'
let selectedCategories = [];
let cardsStateMap = {}; // État des cartes en temps réel
let tempCompletedCardId = null; 
let loadedPhotoBase64 = null; 
let motsDoux = [];
let datesData = [];
let bonsData = [];
let activeCardId = null;
let selectedRating = 0;
let pendingGridRefresh = false;

// ==========================================
// 🚀 INITIALISATION DE L'APPLICATION
// ==========================================
window.onload = async () => {
  setupRoulette();
  
  // Chargement des données locales
  await chargerPhrases();
  await chargerDates();
  await chargerBons();

  initAppEvents();
  initStarRatingWidget();
  initNightMode();

  // Connexion BDD
  if (supabaseClient) {
    await checkStreak();
  } else {
    console.warn("Supabase n'est pas configuré. Mode démo actif.");
    loadDemoData();
  }
};

// --- Système de Navigation des Onglets Principaux ---
function switchTab(viewId, element) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById(viewId).classList.add('active');
  element.classList.add('active');

  if (viewId === 'view-bons') {
    renderBonsTab();
  }
}

// --- Interactions de focus des cartes (Gestion dynamique) ---
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
  if (placeholder) placeholder.remove();
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
  if (overlay) {
    overlay.classList.remove('active');
  }

  if (refreshGrid && pendingGridRefresh) {
    pendingGridRefresh = false;
    genererCartesDates();
  }
}

function initAppEvents() {
  const grid = document.getElementById('dates-grid');
  const overlay = document.getElementById('overlay');
  if (!grid) return;

  grid.addEventListener('click', function(e) {
    const cardWrapper = e.target.closest('.card-wrapper');
    if (!cardWrapper) return;

    e.stopPropagation();

    // Si la carte est déjà grande (focused), un clic dessus la retourne !
    if (activeCardId === cardWrapper.id) {
      if (!cardWrapper.classList.contains('flipped')) {
        flipCard(e, cardWrapper.id);
      }
      return;
    }

    if (activeCardId) return;

    // Zoom et mise au centre de la carte
    createCardPlaceholder(cardWrapper);
    activeCardId = cardWrapper.id;
    cardWrapper.classList.add('focused');
    
    if (overlay) overlay.classList.add('active');
  });

  // Clic sur l'overlay d'arrière-plan ferme la carte
  if (overlay) {
    overlay.addEventListener('click', function() {
      if (activeCardId) closeActiveCard({ refreshGrid: true });
    });
  }

  // Sécurité supplémentaire si clic à côté de la grille
  document.addEventListener('click', function(e) {
    if (!activeCardId) return;
    if (e.target.closest('.card-wrapper')) return;
    closeActiveCard({ refreshGrid: true });
  });
}

// ==========================================
// 📖 CHARGEMENT DES DONNÉES JSON
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
    
    // Récupération des catégories uniques
    const cats = new Set();
    datesData.forEach(d => {
      if (Array.isArray(d.category)) {
        d.category.forEach(c => cats.add(c));
      } else if (d.category) {
        cats.add(d.category);
      }
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
    data.forEach(state => {
      cardsStateMap[state.card_id] = state;
    });
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

// ==========================================
// 🎛️ SOU-ONGLETS & FILTRES DE CATÉGORIES
// ==========================================
function switchSubTab(subTab, element) {
  document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  element.classList.add('active');
  activeSubTab = subTab;
  genererCartesDates();
}

function genererCategoriesFiltres(categories) {
  const container = document.getElementById('categories-checkboxes');
  if (!container) return;
  container.innerHTML = '';

  categories.forEach(cat => {
    const isChecked = selectedCategories.includes(cat);
    const html = `
      <label class="category-pill ${isChecked ? 'active' : ''}" id="pill-${cat}">
        <input type="checkbox" value="${cat}" onchange="toggleCategoryFilter(this, '${cat}')" ${isChecked ? 'checked' : ''}>
        ${cat}
      </label>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });

  updateSelectedCategoriesCount();
}

function toggleCategoryFilter(checkbox, category) {
  const pill = document.getElementById(`pill-${category}`);
  if (checkbox.checked) {
    if (!selectedCategories.includes(category)) selectedCategories.push(category);
    pill.classList.add('active');
  } else {
    selectedCategories = selectedCategories.filter(c => c !== category);
    pill.classList.remove('active');
  }
  updateSelectedCategoriesCount();
  genererCartesDates();
}

function updateSelectedCategoriesCount() {
  const badge = document.getElementById('selected-categories-count');
  if (!badge) return;
  badge.textContent = selectedCategories.length;
}

function showCategoriesOverlay() {
  const overlay = document.getElementById('categories-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideCategoriesOverlay() {
  const overlay = document.getElementById('categories-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
}

function clearCategoryFilters() {
  selectedCategories = [];
  genererCategoriesFiltres(Array.from(document.querySelectorAll('#categories-checkboxes input')).map(input => input.value));
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
    if (activeSubTab === 'hidden') { if (state && state.is_revealed) return false; }
    else if (activeSubTab === 'todo') { if (!state || !state.is_revealed || state.is_completed) return false; }
    else if (activeSubTab === 'done') { if (!state || !state.is_completed) return false; }

    if (selectedCategories.length > 0) {
      const itemCategories = Array.isArray(date.category) ? date.category : [date.category];
      if (!itemCategories.some(cat => selectedCategories.includes(cat))) return false;
    }
    return true;
  });

  filteredDates.forEach(date => {
    const state = cardsStateMap[date.id] || {};
    
    let buttonHtml = activeSubTab === 'todo' 
      ? `<button class="btn-validate" onclick="openCompleteModal(event, '${date.id}')">Marquer comme fait ! ✅</button>` 
      : `<button class="btn-validate" style="background:#5856d6;" onclick="openViewMemoryModal('${date.id}')">📸 Nos Souvenirs</button>`;

    const cardHtml = `
      <div class="card-wrapper ${state.is_revealed ? 'flipped' : ''}" id="${date.id}" data-id="${date.id}">
        <div class="card-inner">
          <div class="card-front">
            <div class="question-mark">?</div>
          </div>
          <div class="card-back ${date.theme || 'pink-theme'}">
            <h3>${date.title}</h3>
            <p>${date.description}</p>
            <div style="margin-top: auto;">${buttonHtml}</div>
          </div>
        </div>
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', cardHtml);
  });
}

// ==========================================
// 🔒 GESTION DU RETOURNEMENT UNIQUE PAR JOUR
// ==========================================
async function canRevealDate() {
  if (!supabaseClient) return true;
  const { data, error } = await supabaseClient.from('cards_state').select('revealed_at').eq('is_revealed', true);
  if (error || !data) return true;
  
  const todayStr = new Date().toDateString();
  const hasRevealedToday = data.some(row => new Date(row.revealed_at).toDateString() === todayStr);
  return !hasRevealedToday;
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
      console.error("Erreur d'enregistrement de la carte :", upsertError);
      showToast("⚠️ La carte n'a pas pu être enregistrée (" + upsertError.message + "). Elle réapparaîtra au prochain chargement.");
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
// 🎲 BOUTON RANDOM MAGIQUE (CŒUR + ?)
// ==========================================
async function triggerRandomDate() {
  const pool = datesData; 
  if (pool.length === 0) return;

  const randomDate = pool[Math.floor(Math.random() * pool.length)];
  
  const state = cardsStateMap[randomDate.id] || {};
  if (!state.is_revealed) switchSubTab('hidden', document.querySelector('.segment-btn:nth-child(1)'));
  else if (state.is_completed) switchSubTab('done', document.querySelector('.segment-btn:nth-child(3)'));
  else switchSubTab('todo', document.querySelector('.segment-btn:nth-child(2)'));

  setTimeout(() => {
    const element = document.getElementById(randomDate.id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('focused');
      document.getElementById('overlay').classList.add('active');
      activeCardId = randomDate.id;
    } else {
      showToast("Cette carte n'est pas dans la catégorie visible actuelle !");
    }
  }, 100);
}

// ==========================================
// 📸 GESTION PHOTO & COMPRESSION CANVAS
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

// ==========================================
// ⭐ WIDGET DE NOTE EN ÉTOILES
// ==========================================
function setStarRating(value) {
  selectedRating = value;
  const stars = document.querySelectorAll('#memory-rating .star');
  stars.forEach(star => {
    const starValue = parseInt(star.dataset.value, 10);
    star.classList.toggle('filled', starValue <= value);
  });
}

function initStarRatingWidget() {
  const container = document.getElementById('memory-rating');
  if (!container) return;
  container.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', () => {
      setStarRating(parseInt(star.dataset.value, 10));
    });
  });
}

function starsToText(rating) {
  const r = parseInt(rating, 10) || 0;
  if (r <= 0) return "Pas encore notée.";
  return "★".repeat(r) + "☆".repeat(5 - r);
}

// ==========================================
// 📝 SYSTÈME DE SOUVENIRS (JOURNAL DE BORD)
// ==========================================
function openCompleteModal(event, cardId) {
  if (event) event.stopPropagation();
  tempCompletedCardId = cardId;
  loadedPhotoBase64 = null;
  
  document.getElementById('memory-photo-input').value = '';
  document.getElementById('memory-photo-preview').style.display = 'none';
  document.getElementById('memory-comment').value = '';
  setStarRating(0);

  document.getElementById('complete-date-modal').classList.add('active');
}

function closeCompleteModal() {
  document.getElementById('complete-date-modal').classList.remove('active');
  tempCompletedCardId = null;
}

async function saveDateMemory() {
  if (!supabaseClient || !tempCompletedCardId) return;

  const comment = document.getElementById('memory-comment').value;

  const { error } = await supabaseClient.from('cards_state').upsert({
    card_id: tempCompletedCardId,
    is_revealed: true,
    is_completed: true,
    completed_at: new Date().toISOString(),
    note: selectedRating,
    comment: comment,
    photo_base64: loadedPhotoBase64
  }, { onConflict: 'card_id' });

  if (error) {
    console.error(error);
    showToast("Erreur lors de la sauvegarde du souvenir.");
    return;
  }

  showToast("Souvenir sauvegardé avec succès dans votre album ! 📸💖");
  closeCompleteModal();
  
  if (activeCardId) {
    const card = document.getElementById(activeCardId);
    if (card) card.classList.remove('focused');
    document.getElementById('overlay').classList.remove('active');
    activeCardId = null;
  }

  await syncCardsState();
  pendingGridRefresh = false;
  genererCartesDates();
}

function openViewMemoryModal(cardId) {
  const state = cardsStateMap[cardId];
  const dateObj = datesData.find(d => d.id === cardId);
  if (!state || !dateObj) return;

  document.getElementById('view-mem-title').textContent = dateObj.title;
  
  if (state.completed_at) {
    const d = new Date(state.completed_at);
    document.getElementById('view-mem-date').textContent = `Réalisé le ${d.toLocaleDateString('fr-FR')}`;
  } else {
    document.getElementById('view-mem-date').textContent = '';
  }

  const photoWrapper = document.getElementById('view-mem-photo-wrapper');
  const imgElement = document.getElementById('view-mem-photo');
  if (state.photo_base64) {
    imgElement.src = state.photo_base64;
    photoWrapper.style.display = 'block';
  } else {
    photoWrapper.style.display = 'none';
  }

  document.getElementById('view-mem-note').textContent = starsToText(state.note);
  document.getElementById('view-mem-comment').textContent = state.comment ? `« ${state.comment} »` : "Aucun ressenti enregistré.";

  document.getElementById('view-memory-modal').classList.add('active');
}

function closeViewMemoryModal() {
  document.getElementById('view-memory-modal').classList.remove('active');
}

// ==========================================
// 🎟️ MOTEUR DE GRATTAGE DE BONS SURPRISE
// ==========================================
let scratchPercentageChecked = false;
let selectedBon = null;

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
        <span style="font-size: 45px; display: block; margin-bottom: 10px; animation: bounceMini 2s infinite alternate;">🎁</span>
        <h3 style="color: #ff2d55; font-size: 18px; font-weight: bold;">Ton Ticket Surprise est prêt !</h3>
        <button class="btn-primary" onclick="openScratchModal()" style="background: #ff2d55; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(255, 45, 85, 0.3);">
          🎟️ Gratter le ticket 🎟️
        </button>
      </div>
    `;
  } else {
    dailyContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 30px 20px; border: 2px dashed var(--text-secondary); background: transparent; border-radius: 24px;">
        <span style="font-size: 40px;">🕒</span>
        <h3 style="margin-top: 10px; font-size: 16px;">Ticket du jour gratté !</h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">Reviens demain pour avoir un nouveau bon ✨</p>
      </div>
    `;
  }

  await renderInventory();
}

async function openScratchModal() {
  if (bonsData.length === 0) {
    showToast("Les bons ne sont pas encore chargés. Attends une seconde ! 🕒");
    return;
  }

  selectedBon = bonsData[Math.floor(Math.random() * bonsData.length)];
  document.getElementById('scratch-prize-icon').textContent = selectedBon.icon;
  document.getElementById('scratch-prize-title').textContent = selectedBon.title;
  document.getElementById('btn-close-scratch').style.display = 'none';

  const modal = document.getElementById('scratch-modal');
  modal.classList.add('active');

  scratchPercentageChecked = false;
  setTimeout(() => {
    initScratchCanvas();
  }, 150);
}

function initScratchCanvas() {
  const canvas = document.getElementById('scratch-canvas');
  const wrapper = canvas.parentElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.style.display = 'block';
  canvas.style.opacity = 1;
  canvas.width = wrapper.offsetWidth;
  canvas.height = wrapper.offsetHeight;

  ctx.fillStyle = '#cfd8dc'; 
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#78909c';
  ctx.textAlign = 'center';
  ctx.fillText('GRATTE ICI ! 🪙', canvas.width / 2, canvas.height / 2 + 5);

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
  }

  let checkTimeout;
  function checkScratchedPercentage() {
    if (scratchPercentageChecked || checkTimeout) return;
    
    checkTimeout = setTimeout(async () => {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparentPixels = 0;
      const totalPixels = pixels.length / 4;

      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentPixels++;
      }

      const percent = (transparentPixels / totalPixels) * 100;

      if (percent > 55) {
        scratchPercentageChecked = true;
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

async function closeScratchModal() {
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

  inventoryDiv.innerHTML = '';

  Object.keys(counts).forEach(bonId => {
    const bon = bonsData.find(b => b.id === bonId);
    if (!bon) return;

    const qty = counts[bonId];
    const html = `
      <div class="card token-card" id="owned-${bon.id}" style="border-radius: 18px; margin-bottom: 12px; padding: 15px;">
        <div class="token-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <span class="token-icon" style="font-size: 30px;">${bon.icon}</span>
            <div style="text-align: left;">
              <h3 style="font-size: 15px; font-weight: bold; margin: 0;">${bon.title}</h3>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 2px 0 0 0;">Quantité : <strong>x${qty}</strong></p>
            </div>
          </div>
          <button class="btn-primary" onclick="useInventoryToken('${bon.id}')" style="padding: 8px 16px; font-size: 13px; border-radius: 10px;">Utiliser ✨</button>
        </div>
      </div>
    `;
    inventoryDiv.insertAdjacentHTML('beforeend', html);
  });
}

async function useInventoryToken(bonId) {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('user_vouchers')
    .select('id')
    .eq('bon_id', bonId)
    .eq('status', 'owned')
    .order('scratched_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    showToast("Oups, ce bon n'est plus disponible.");
    return;
  }

  const recordId = data[0].id;

  const { error: updateError } = await supabaseClient
    .from('user_vouchers')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', recordId);

  if (updateError) {
    showToast("Impossible d'utiliser ce bon actuellement.");
    return;
  }

  const bon = bonsData.find(b => b.id === bonId);
  const bonTitle = bon ? bon.title : bonId;

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_name: "Amour",
    message: `Elle vient d'utiliser son super pouvoir : ${bonTitle} ! ❤️`
  });

  showToast(`✨ Pouvoir "${bonTitle}" validé ! Ton chéri a reçu un mail. 😉`);
  await renderBonsTab();
}

// ==========================================
// 🔥 GESTION DES FLAMMES (STREAK)
// ==========================================
async function checkStreak() {
  const { data, error } = await supabaseClient.from('progress_tracker').select('*').single();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (error || !data) {
    await supabaseClient.from('progress_tracker').insert({ current_streak: 1, last_connection: today.toISOString() });
    document.getElementById('streak-count').textContent = "1";
    return;
  }

  const lastConnection = new Date(data.last_connection);
  const lastConnectionMidnight = new Date(lastConnection.getFullYear(), lastConnection.getMonth(), lastConnection.getDate());

  const diffTime = todayMidnight - lastConnectionMidnight;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let streak = data.current_streak;

  if (diffDays === 1) {
    streak += 1;
    await supabaseClient.from('progress_tracker').update({
      current_streak: streak,
      last_connection: today.toISOString(),
      max_streak: Math.max(streak, data.max_streak || 0)
    }).eq('id', data.id);
  } else if (diffDays > 1) {
    streak = 1;
    await supabaseClient.from('progress_tracker').update({
      current_streak: streak,
      last_connection: today.toISOString()
    }).eq('id', data.id);
  }

  document.getElementById('streak-count').textContent = streak;
}

function openDailyBox() {
  if (motsDoux.length === 0) return;

  const modal = document.getElementById('daily-modal');
  const messageText = document.getElementById('daily-message-text');
  
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const phraseDuJour = motsDoux[dayOfYear % motsDoux.length];
  messageText.textContent = phraseDuJour;

  modal.classList.add('active');
}

function closeDailyModal() {
  document.getElementById('daily-modal').classList.remove('active');
  document.getElementById('box-status-text').textContent = "Reviens demain pour un nouveau mot doux ! ✨";
}

// ==========================================
// 🍕 LOGIQUE ROULETTE REPAS ÉVOLUTIVE
// ==========================================
const platsDeBase = ["Pizza 🍕", "Burger 🍔", "Sushis 🍣", "Pâtes 🍝", "Salade 🥗", "Tacos 🌮"];
let platsRoulette = platsDeBase.map(plat => ({ name: plat, isBase: true, active: true }));
let currentRotation = 0;
const paletteCouleurs = ['#ffb7b2', '#ffdac1', '#e2f0cb', '#b5ead7', '#c7ceea', '#ffc6ff'];

document.addEventListener("DOMContentLoaded", () => {
  updateRouletteSystem();
});

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
  let gradientParts = [];
  
  activePlats.forEach((platObj, index) => {
    const startAngle = angleStep * index;
    const endAngle = angleStep * (index + 1);
    const couleur = paletteCouleurs[index % paletteCouleurs.length];
    
    gradientParts.push(`${couleur} ${startAngle}deg ${endAngle}deg`);
    
    const label = document.createElement('div');
    label.className = 'segment-label';
    label.textContent = platObj.name;
    
    const middleAngle = startAngle + (angleStep / 2);
    label.style.transform = `translate(-50%, -50%) rotate(${middleAngle}deg) translateY(-85px) rotate(90deg)`;
    
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
  if (text === '') return;
  
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
  
  const angleAleatoire = Math.floor(Math.random() * 360);
  currentRotation += 1800 + angleAleatoire; 
  
  wheel.style.transform = `rotate(${currentRotation}deg)`;
  
  setTimeout(() => {
    const angleFinalSur360 = currentRotation % 360;
    const angleSousPointeur = (360 - angleFinalSur360) % 360;
    const tailleSegment = 360 / activePlats.length;
    
    const winningIndex = Math.floor(angleSousPointeur / tailleSegment);
    const platGagnant = activePlats[winningIndex].name;
    
    if (resultElement) {
      resultElement.textContent = `Ce soir on mange : ${platGagnant} !`;
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
  
  if (isOpen) {
    btnToggle.innerHTML = "❌";
    btnToggle.style.background = "#ff4a5a";
    btnToggle.style.color = "#ffffff";
    btnToggle.style.borderColor = "#ff4a5a";
    btnToggle.style.transform = "rotate(90deg)";
  } else {
    btnToggle.innerHTML = "🖌️";
    btnToggle.style.background = "";
    btnToggle.style.color = "";
    btnToggle.style.borderColor = "";
    btnToggle.style.transform = "";
  }
}

// ==========================================
// ⚙️ OUTILS ET UTILITAIRES GLOBES
// ==========================================
function initNightMode() {
  const storedTheme = localStorage.getItem('bibapp-night-mode');
  if (storedTheme === 'on') {
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
  const button = document.getElementById('night-mode-button');
  if (!button) return;
  const dot = button.querySelector('.theme-dot');
  if (!dot) return;
  dot.innerHTML = document.documentElement.classList.contains('dark-mode') ? '<i class="ph-fill ph-sun icon-emoji"></i>' : '<i class="ph-fill ph-moon icon-emoji"></i>';
}

function loadDemoData() {
  document.getElementById('streak-count').textContent = "5";
}


function showToast(message) {
  const container = document.getElementById('toast-container');
  
  // 1. On vide le conteneur pour supprimer tout message précédent
  container.innerHTML = '';
  
  // 2. Création du nouveau toast
  const toast = document.createElement('div');
  toast.className = 'toast active';
  toast.textContent = message;
  container.appendChild(toast);
  
  // 3. Suppression automatique après 3 secondes (ton code original)
  setTimeout(() => {
    // Vérification de sécurité : le toast existe-t-il encore ?
    // (au cas où il aurait été supprimé par une action utilisateur rapide)
    if (toast.parentNode) {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }
  }, 3000);
}

function melangerTableau(tableau) {
  let copie = [...tableau]; 
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}