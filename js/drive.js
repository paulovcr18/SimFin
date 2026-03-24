// ════════════════════════════════════════════════════════════════
// GOOGLE DRIVE SYNC
// Escopo: apenas arquivos criados pelo próprio app (drive.file)
// Arquivo: SimFin/simfin-dados.json na raiz do Drive do usuário
// ════════════════════════════════════════════════════════════════

const DRIVE_CLIENT_ID  = '54344013457-k0vv05efvkilau28aqmfmvml8o55dhs0.apps.googleusercontent.com';
const DRIVE_SCOPE      = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILE_NAME  = 'simfin-dados.json';
const DRIVE_FOLDER     = 'SimFin';

// Estado interno
const driveState = {
  connected:   false,
  syncing:     false,
  user:        null,       // { name, email, picture }
  accessToken: null,
  fileId:      null,       // ID do arquivo no Drive
  lastSync:    null,       // ISO string
  tokenClient: null,
};

// ── Init: tenta restaurar sessão silenciosamente ──
function driveInit() {
  if (typeof google === 'undefined') {
    setTimeout(driveInit, 500);
    return;
  }
  driveState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope:     DRIVE_SCOPE,
    callback:  onDriveToken,
  });

  // Tenta recuperar token salvo
  const saved = localStorage.getItem('simfin_drive_session');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      driveState.user      = s.user;
      driveState.fileId    = s.fileId;
      driveState.lastSync  = s.lastSync;
      driveState.connected = true;
      driveUpdateUI();
      // Solicita novo token silencioso (sem prompt)
      driveState.tokenClient.requestAccessToken({ prompt: '' });
    } catch(e) {
      localStorage.removeItem('simfin_drive_session');
    }
  } else {
    // SDK pronto mas sem sessão — atualiza UI para mostrar botão de login
    driveUpdateUI();
  }
}

// ── Callback quando recebe o token ──
async function onDriveToken(resp) {
  if (resp.error) {
    console.warn('[Drive] Token error:', resp.error);
    if (resp.error !== 'access_denied') driveUpdateUI();
    return;
  }
  driveState.accessToken = resp.access_token;
  driveState.connected   = true;

  // Se não tem info do usuário ainda, busca
  if (!driveState.user) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + driveState.accessToken }
      });
      const u = await r.json();
      driveState.user = { name: u.name, email: u.email, picture: u.picture };
    } catch(e) {}
  }

  driveUpdateUI();
  driveSessionSave();

  // Sincroniza automaticamente ao conectar
  await drivePull();
}

// ── Conectar (pede permissão ao usuário) ──
function driveConnect() {
  closeDriveMenu();
  if (!driveState.tokenClient) {
    // SDK ainda carregando — tenta iniciar e aguarda
    if (typeof google === 'undefined') {
      showToast('Aguardando SDK do Google... tente em 2 segundos', '⏳', 3000);
      setTimeout(() => { driveInit(); }, 500);
      return;
    }
    driveInit();
    setTimeout(driveConnect, 800);
    return;
  }
  driveState.tokenClient.requestAccessToken({ prompt: 'consent' });
}

// ── Desconectar ──
function driveDisconnect() {
  driveState.connected   = false;
  driveState.accessToken = null;
  driveState.user        = null;
  driveState.fileId      = null;
  driveState.lastSync    = null;
  localStorage.removeItem('simfin_drive_session');
  closeDriveMenu();
  driveUpdateUI();
  showToast('Drive desconectado', '☁️', 2500);
}

// ── Salva sessão no localStorage ──
function driveSessionSave() {
  localStorage.setItem('simfin_drive_session', JSON.stringify({
    user:     driveState.user,
    fileId:   driveState.fileId,
    lastSync: driveState.lastSync,
  }));
}

// ── Monta o payload completo para salvar ──
function driveGetPayload() {
  return {
    meta: {
      app: 'SimFin',
      versao: '3.0',
      savedAt: new Date().toISOString(),
      user: driveState.user?.email,
    },
    simulacoes:     JSON.parse(localStorage.getItem('simfin_saves')  || '[]'),
    acompanhamento: JSON.parse(localStorage.getItem('simfin_track')  || '[]'),
    metas:          JSON.parse(localStorage.getItem('simfin_goals')   || '[]'),
    carteira:       JSON.parse(localStorage.getItem('simfin_carteira') || '[]'),
    reminder:       JSON.parse(localStorage.getItem('simfin_reminder_config') || '{}'),
    inputs: (() => { try { return getInputs(); } catch(e) { return null; } })(),
  };
}

// ── Aplica payload recebido do Drive ──
function driveApplyPayload(data) {
  if (!data) return;
  let changes = [];

  if (data.simulacoes && Array.isArray(data.simulacoes)) {
    const local = JSON.parse(localStorage.getItem('simfin_saves') || '[]');
    // Merge: Drive ganha prioridade em conflito de mesmo nome+data
    const merged = [...local];
    data.simulacoes.forEach(ds => {
      const idx = merged.findIndex(l => l.name === ds.name && l.date === ds.date);
      if (idx < 0) merged.push(ds);
    });
    localStorage.setItem('simfin_saves', JSON.stringify(merged));
    if (merged.length > local.length) changes.push(`${merged.length - local.length} simulação(ões) novas`);
  }

  if (data.acompanhamento && Array.isArray(data.acompanhamento)) {
    const local = JSON.parse(localStorage.getItem('simfin_track') || '[]');
    const merged = [...local];
    data.acompanhamento.forEach(dr => {
      const idx = merged.findIndex(l => l.mes === dr.mes);
      if (idx < 0) merged.push(dr);
      else if (new Date(dr.registradoEm) > new Date(merged[idx].registradoEm || 0)) {
        merged[idx] = dr;
      }
    });
    merged.sort((a,b) => a.mes.localeCompare(b.mes));
    localStorage.setItem('simfin_track', JSON.stringify(merged));
    if (merged.length > local.length) changes.push(`${merged.length - local.length} mês(es) de acompanhamento`);
  }

  if (data.metas && Array.isArray(data.metas)) {
    const local  = JSON.parse(localStorage.getItem('simfin_goals') || '[]');
    const merged = [...local];
    data.metas.forEach(dm => {
      if (!merged.find(l => l.id === dm.id)) merged.push(dm);
    });
    localStorage.setItem('simfin_goals', JSON.stringify(merged));
    if (merged.length > local.length) changes.push(`${merged.length - local.length} meta(s)`);
  }
  if (changes.length) {
    renderSavedList();
    if (document.getElementById('screenAcompanhamento').style.display === 'flex') renderTrack();
    if (document.getElementById('screenMetas').style.display === 'flex') renderGoals();
    showToast(`Drive: ${changes.join(', ')} sincronizados`, '☁️');
  }
}

// ── Busca ou cria o arquivo no Drive ──
async function driveFindOrCreateFile() {
  if (!driveState.accessToken) return null;

  // Busca arquivo existente
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: 'Bearer ' + driveState.accessToken }
  });
  const data = await r.json();

  if (data.files && data.files.length > 0) {
    driveState.fileId = data.files[0].id;
    return driveState.fileId;
  }

  // Cria novo arquivo
  const meta = JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: 'application/json' });
  const body = JSON.stringify({ meta: { app: 'SimFin', createdAt: new Date().toISOString() }, simulacoes: [], acompanhamento: [] });
  const form = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file',     new Blob([body], { type: 'application/json' }));

  const cr = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + driveState.accessToken },
    body: form,
  });
  const created = await cr.json();
  driveState.fileId = created.id;
  return driveState.fileId;
}

// ── PUSH: salva dados locais no Drive ──
async function drivePush() {
  if (!driveState.connected || !driveState.accessToken) { driveConnect(); return; }
  driveSetSyncing(true);
  try {
    const fileId = await driveFindOrCreateFile();
    if (!fileId) throw new Error('Não foi possível acessar o arquivo no Drive');

    const payload = JSON.stringify(driveGetPayload(), null, 2);
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method:  'PATCH',
      headers: {
        Authorization:  'Bearer ' + driveState.accessToken,
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    driveState.lastSync = new Date().toISOString();
    driveSessionSave();
    driveUpdateUI();
    showToast('Dados salvos no Google Drive ✓', '☁️');
  } catch(e) {
    console.error('[Drive] Push error:', e);
    showToast('Erro ao salvar no Drive: ' + e.message, '❌', 4000);
  } finally {
    driveSetSyncing(false);
  }
}

// ── PULL: lê dados do Drive e merge com local ──
async function drivePull() {
  if (!driveState.connected || !driveState.accessToken) { driveConnect(); return; }
  driveSetSyncing(true);
  try {
    const fileId = await driveFindOrCreateFile();
    if (!fileId) throw new Error('Arquivo não encontrado');

    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: 'Bearer ' + driveState.accessToken }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    driveApplyPayload(data);

    driveState.lastSync = new Date().toISOString();
    driveSessionSave();
    driveUpdateUI();
  } catch(e) {
    // Arquivo novo/vazio — não é erro
    if (e.message && e.message.includes('JSON')) {
      driveState.lastSync = new Date().toISOString();
      driveSessionSave();
    } else {
      console.error('[Drive] Pull error:', e);
      showToast('Erro ao carregar do Drive', '❌', 3000);
    }
  } finally {
    driveSetSyncing(false);
  }
}

// ── UI helpers ──
function driveSetSyncing(val) {
  driveState.syncing = val;
  const btn = document.getElementById('driveBtn');
  const dot = document.getElementById('driveDot');
  if (val) {
    btn.classList.add('syncing');
    dot.className = 'drive-dot spin';
    document.getElementById('driveBtnLabel').textContent = 'Sync...';
  } else {
    btn.classList.remove('syncing');
    driveUpdateUI();
  }
}

function driveUpdateUI() {
  const btn   = document.getElementById('driveBtn');
  const dot   = document.getElementById('driveDot');
  const label = document.getElementById('driveBtnLabel');
  if (!btn) return; // ainda não renderizou

  if (driveState.connected) {
    btn.classList.add('connected');
    btn.classList.remove('error');
    dot.className = 'drive-dot on';
    label.textContent = 'Drive';
  } else {
    btn.classList.remove('connected', 'error');
    dot.className = 'drive-dot off';
    label.textContent = 'Drive';
  }

  // Atualiza conteúdo do menu
  const content = document.getElementById('driveMenuContent');
  if (!driveState.connected) {
    content.innerHTML = `
      <div style="padding:16px;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">☁️</div>
        <div style="font-size:13px;font-weight:600;color:var(--t1);margin-bottom:6px">Sincronizar com Google Drive</div>
        <div style="font-size:11px;color:var(--t3);margin-bottom:14px;line-height:1.5">Seus dados ficam salvos na sua conta do Google Drive e sincronizam entre todos os seus dispositivos.</div>
        <button class="saves-new-btn" onclick="driveConnect()" style="width:100%">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:16px;height:16px;vertical-align:middle;margin-right:6px">
          Entrar com Google
        </button>
      </div>`;
  } else {
    const lastSyncStr = driveState.lastSync
      ? new Date(driveState.lastSync).toLocaleString('pt-BR', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})
      : 'nunca';
    const avatar = driveState.user?.picture
      ? `<img src="${driveState.user.picture}" class="drive-menu-avatar" referrerpolicy="no-referrer">`
      : `<div class="drive-menu-avatar" style="background:var(--bg5);display:flex;align-items:center;justify-content:center;font-size:13px">👤</div>`;
    content.innerHTML = `
      <div class="drive-menu-header">
        ${avatar}
        <div>
          <div class="drive-menu-name">${driveState.user?.name || 'Conectado'}</div>
          <div class="drive-menu-email">${driveState.user?.email || ''}</div>
        </div>
      </div>
      <div class="drive-menu-body">
        <button class="drive-menu-item" onclick="drivePush();closeDriveMenu()">
          <span>⬆️</span> Salvar agora no Drive
        </button>
        <button class="drive-menu-item" onclick="drivePull();closeDriveMenu()">
          <span>⬇️</span> Carregar do Drive
        </button>
        <button class="drive-menu-item danger" onclick="driveDisconnect()">
          <span>🔌</span> Desconectar
        </button>
      </div>
      <div class="drive-sync-status">
        <span>🕐</span> Última sync: ${lastSyncStr}
      </div>`;
  }
}

// ── Drive menu toggle ──
function toggleDriveMenu(e) {
  e.stopPropagation();
  closeMoreMenu();
  const menu = document.getElementById('driveMenu');
  if (!menu.classList.contains('open')) driveUpdateUI();
  menu.classList.toggle('open');
}
function closeDriveMenu() {
  document.getElementById('driveMenu').classList.remove('open');
}

// ── More menu toggle ──
function toggleMoreMenu(e) {
  e.stopPropagation();
  closeDriveMenu();
  closeSavesDrop();
  document.getElementById('moreDrop').classList.toggle('open');
}
function closeMoreMenu() {
  document.getElementById('moreDrop')?.classList.remove('open');
}

document.addEventListener('click', e => {
  if (!document.getElementById('driveWrap')?.contains(e.target)) closeDriveMenu();
  if (!document.getElementById('moreWrap')?.contains(e.target)) closeMoreMenu();
  if (!document.getElementById('savesWrap')?.contains(e.target)) closeSavesDrop();
});

// ── Auto-push quando salva simulação ou registra mês ──
function driveAutoPush() {
  if (driveState.connected && driveState.accessToken && !driveState.syncing) {
    setTimeout(drivePush, 800); // pequeno delay para não sobrecarregar
  }
}

// ── Init quando a página carrega ──
window.addEventListener('load', () => setTimeout(driveInit, 300));


