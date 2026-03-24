// ════════════════════════════════════════════════════════════════
// GITHUB PUBLISH — PIN PROTEGIDO
// • Botão 100% invisível para visitantes
// • Acesso: clicar no logo 5x ou Shift+G
// • PIN de 4 dígitos definido na primeira vez
// • Token salvo APENAS no localStorage
// • Auto-lock após 30 min
// ════════════════════════════════════════════════════════════════

const GH_TOKEN_KEY  = 'simfin_gh_token';
const GH_PIN_KEY    = 'simfin_gh_pin_hash';
const GH_UNLOCK_KEY = 'simfin_gh_unlocked_at';
const GH_REPO       = 'paulovcr18/SimFin';
const GH_FILE       = 'index.html';
const GH_BRANCH     = 'main';
const GH_LOCK_MS    = 30 * 60 * 1000;

function ghHashPin(pin) {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = (h * 33) ^ pin.charCodeAt(i);
  return 'p' + (h >>> 0).toString(36);
}

function ghIsUnlocked() {
  const at = parseInt(localStorage.getItem(GH_UNLOCK_KEY) || '0');
  if (!at || !localStorage.getItem(GH_PIN_KEY)) return false;
  if (Date.now() - at > GH_LOCK_MS) { localStorage.removeItem(GH_UNLOCK_KEY); return false; }
  return true;
}
function ghRenew() {
  if (ghIsUnlocked()) localStorage.setItem(GH_UNLOCK_KEY, Date.now().toString());
}
document.addEventListener('click', ghRenew);

// ── Logo: 5 cliques rápidos ──
let ghLogoClicks = [];
function ghLogoClick() {
  ghLogoClicks = [...ghLogoClicks.filter(t => Date.now() - t < 3000), Date.now()];
  if (ghLogoClicks.length >= 5) { ghLogoClicks = []; ghOpenPin(); }
}

// ── Shift+G no teclado ──
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.shiftKey && e.key === 'G') ghOpenPin();
});

// ── PIN modal ──
let ghPinBuffer = '';

function ghOpenPin() {
  ghPinBuffer = '';
  ghUpdateDots();
  document.getElementById('ghPinError').textContent = '';
  const hasPin = !!localStorage.getItem(GH_PIN_KEY);
  document.getElementById('ghPinTitle').textContent = hasPin ? '🔐 Digite seu PIN' : '🔐 Crie um PIN de 4 dígitos';
  document.getElementById('ghPinModal').classList.add('open');
}

function ghClosePinModal() {
  ghPinBuffer = '';
  ghUpdateDots();
  document.getElementById('ghPinModal').classList.remove('open');
}

function ghUpdateDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('ghDot' + i);
    if (!dot) return;
    dot.style.background  = i < ghPinBuffer.length ? 'var(--ac)' : 'var(--bg5)';
    dot.style.borderColor = i < ghPinBuffer.length ? 'var(--ac)' : 'var(--bd)';
  }
}

function ghPinPress(val) {
  if (val === '⌫') { ghPinBuffer = ghPinBuffer.slice(0,-1); ghUpdateDots(); return; }
  if (ghPinBuffer.length >= 4) return;
  ghPinBuffer += String(val);
  ghUpdateDots();
  if (ghPinBuffer.length === 4) setTimeout(ghPinSubmit, 150);
}

document.addEventListener('keydown', e => {
  const modal = document.getElementById('ghPinModal');
  if (!modal?.classList.contains('open')) return;
  if (e.key >= '0' && e.key <= '9') { e.preventDefault(); ghPinPress(e.key); }
  if (e.key === 'Backspace')         { e.preventDefault(); ghPinPress('⌫'); }
  if (e.key === 'Escape')             ghClosePinModal();
});

function ghPinSubmit() {
  const saved = localStorage.getItem(GH_PIN_KEY);
  const hash  = ghHashPin(ghPinBuffer);

  if (!saved) {
    // Primeira vez — define o PIN
    localStorage.setItem(GH_PIN_KEY, hash);
    localStorage.setItem(GH_UNLOCK_KEY, Date.now().toString());
    ghClosePinModal();
    ghUpdateUI();
    if (!localStorage.getItem(GH_TOKEN_KEY)) {
      setTimeout(() => {
        document.getElementById('ghTokenInput').value = '';
        document.getElementById('ghSetupModal').classList.add('open');
        setTimeout(() => document.getElementById('ghTokenInput').focus(), 200);
      }, 300);
    }
    showToast('PIN criado! Publicar disponível por 30 min.', '🔐');
  } else if (hash === saved) {
    localStorage.setItem(GH_UNLOCK_KEY, Date.now().toString());
    ghClosePinModal();
    ghUpdateUI();
    showToast('Desbloqueado! Publicar disponível por 30 min.', '🔓');
  } else {
    document.getElementById('ghPinError').textContent = 'PIN incorreto. Tente novamente.';
    const box = document.querySelector('#ghPinModal .gh-setup-box');
    if (box) { box.style.animation='none'; box.offsetHeight; box.style.animation='ghShake .4s ease'; }
    ghPinBuffer = '';
    setTimeout(() => { ghUpdateDots(); document.getElementById('ghPinError').textContent = ''; }, 800);
  }
}

function ghGetToken() { return localStorage.getItem(GH_TOKEN_KEY) || ''; }

function ghSaveToken() {
  const token = document.getElementById('ghTokenInput').value.trim();
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    showToast('Token inválido — deve começar com ghp_', '❌', 3000); return;
  }
  localStorage.setItem(GH_TOKEN_KEY, token);
  document.getElementById('ghSetupModal').classList.remove('open');
  ghUpdateUI();
  showToast('Token salvo! Clique em 🚀 Publicar.', '🐙');
}

function ghClearToken() {
  localStorage.removeItem(GH_TOKEN_KEY);
  ghUpdateUI();
  showToast('Token removido', '🗑', 2000);
}

function ghUpdateUI() {
  const wrap = document.getElementById('ghWrap');
  if (!wrap) return;
  const unlocked = ghIsUnlocked();
  const hasToken = !!ghGetToken();
  wrap.style.display = unlocked ? 'block' : 'none';
  const btn   = document.getElementById('ghBtn');
  const icon  = document.getElementById('ghBtnIcon');
  const label = document.getElementById('ghBtnLabel');
  if (!btn) return;
  btn.className     = 'gh-btn' + (hasToken ? ' ready' : '');
  icon.textContent  = hasToken ? '🚀' : '🐙';
  label.textContent = 'Publicar';
  btn.title         = hasToken ? 'Publicar no GitHub Pages' : 'Configurar token';
  btn.onclick       = hasToken ? ghPublish : () => {
    document.getElementById('ghTokenInput').value = '';
    document.getElementById('ghSetupModal').classList.add('open');
    setTimeout(() => document.getElementById('ghTokenInput').focus(), 200);
  };
}

async function ghPublish() {
  if (!ghIsUnlocked()) {
    showToast('Sessão expirada. Clique no logo 5x para reativar.', '🔐', 3000);
    ghUpdateUI(); return;
  }
  const token = ghGetToken();
  if (!token) {
    document.getElementById('ghTokenInput').value = '';
    document.getElementById('ghSetupModal').classList.add('open'); return;
  }

  const btn = document.getElementById('ghBtn');
  const icon = document.getElementById('ghBtnIcon');
  const label = document.getElementById('ghBtnLabel');
  btn.className = 'gh-btn ready publishing';
  icon.textContent = '⏳'; label.textContent = 'Publicando...';

  try {
    const metaRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}?ref=${GH_BRANCH}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    );
    if (metaRes.status === 401) {
      localStorage.removeItem(GH_TOKEN_KEY); ghUpdateUI();
      showToast('Token inválido ou expirado. Configure novamente.', '❌', 4000); return;
    }
    if (!metaRes.ok) throw new Error(`Erro ao buscar arquivo: ${metaRes.status}`);
    const { sha } = await metaRes.json();

    const html = document.documentElement.outerHTML;
    const b64  = btoa(unescape(encodeURIComponent(html)));
    const now  = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const upRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `SimFin update - ${now}`, content: b64, sha, branch: GH_BRANCH })
      }
    );
    if (!upRes.ok) { const e = await upRes.json(); throw new Error(e.message || `HTTP ${upRes.status}`); }

    icon.textContent = '✅'; label.textContent = 'Publicado!';
    showToast('Publicado no GitHub! Em ~2 min o site atualiza.', '🚀', 5000);
    ghRenew();
    setTimeout(() => { btn.className='gh-btn ready'; icon.textContent='🚀'; label.textContent='Publicar'; }, 3000);

  } catch(e) {
    console.error('[GitHub]', e);
    btn.className='gh-btn error'; icon.textContent='❌'; label.textContent='Erro';
    showToast('Erro: ' + e.message, '❌', 5000);
    setTimeout(() => { btn.className='gh-btn ready'; icon.textContent='🚀'; label.textContent='Publicar'; }, 4000);
  }
}

// Verifica expiração a cada minuto
setInterval(() => { if (!ghIsUnlocked()) ghUpdateUI(); }, 60000);

// Inicializa UI ao carregar
window.addEventListener('load', () => setTimeout(ghUpdateUI, 200));


