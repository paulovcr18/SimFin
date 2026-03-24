// ════════════════════════════════════════════════════════════════
// LEMBRETES — Google Apps Script integration
// ════════════════════════════════════════════════════════════════

const REMINDER_KEY = 'simfin_reminder_config';

function reminderLoadConfig() {
  try { return JSON.parse(localStorage.getItem(REMINDER_KEY)) || {}; } catch { return {}; }
}
function reminderSaveConfig() {
  const cfg = reminderLoadConfig();
  cfg.scriptUrl  = document.getElementById('reminderScriptUrl')?.value?.trim()  || cfg.scriptUrl;
  cfg.secretKey  = document.getElementById('reminderSecretKey')?.value?.trim()  || cfg.secretKey;
  cfg.email      = document.getElementById('reminderEmail')?.value?.trim()      || cfg.email;
  cfg.dia        = parseInt(document.getElementById('reminderDia')?.value)      || cfg.dia;
  localStorage.setItem(REMINDER_KEY, JSON.stringify(cfg));
  dbPushConfig({ lembretes: cfg }).catch(() => {});
}

function reminderUpdateUI() {
  const cfg = reminderLoadConfig();

  // Preenche campos com config salva
  const urlEl = document.getElementById('reminderScriptUrl');
  const keyEl = document.getElementById('reminderSecretKey');
  const emEl  = document.getElementById('reminderEmail');
  const diaEl = document.getElementById('reminderDia');
  if (urlEl && cfg.scriptUrl) urlEl.value = cfg.scriptUrl;
  if (keyEl && cfg.secretKey) keyEl.value = cfg.secretKey;
  if (emEl  && cfg.email)     emEl.value  = cfg.email;
  if (diaEl && cfg.dia)       diaEl.value = cfg.dia;

  // Status
  const dot     = document.getElementById('reminderDot');
  const txt     = document.getElementById('reminderStatusText');
  const cancelB = document.getElementById('reminderCancelBtn');

  if (cfg.ativo && cfg.email && cfg.dia) {
    dot.className = 'reminder-dot on';
    txt.innerHTML = `Ativo · e-mail para <strong style="color:var(--t1)">${cfg.email}</strong> todo dia <strong style="color:var(--ac)">${cfg.dia}</strong> do mês`;
    txt.style.color = 'var(--ac)';
    if (cancelB) cancelB.style.display = 'block';
  } else {
    dot.className = 'reminder-dot off';
    txt.textContent = 'Nenhum lembrete ativo';
    txt.style.color = 'var(--t2)';
    if (cancelB) cancelB.style.display = 'none';
  }
}

// ── Monta URL com parâmetros GET (evita CORS do navegador) ──
function reminderBuildUrl(baseUrl, params) {
  const u = new URL(baseUrl);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));
  return u.toString();
}

async function reminderFetch(url) {
  const res  = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Resposta inválida do script'); }
}

async function reminderSchedule() {
  const cfg   = reminderLoadConfig();
  const url   = document.getElementById('reminderScriptUrl')?.value?.trim();
  const email = document.getElementById('reminderEmail')?.value?.trim();
  const dia   = parseInt(document.getElementById('reminderDia')?.value);

  const secretKey = document.getElementById('reminderSecretKey')?.value?.trim();
  if (!url)       { showToast('Cole a URL do Google Apps Script', '⚠️'); return; }
  if (!email)     { showToast('Informe seu e-mail', '⚠️'); return; }
  if (!secretKey) { showToast('Informe a chave secreta', '⚠️'); return; }
  if (!url.includes('script.google.com')) { showToast('URL inválida', '❌'); return; }

  showToast('Configurando lembrete...', '⏳', 30000);

  try {
    const token = cfg.token || ('tk_' + Date.now().toString(36));
    const fullUrl = reminderBuildUrl(url, {
      action: 'schedule', email, dia, key: secretKey,
      appUrl: 'https://paulovcr18.github.io/SimFin/',
      nome: 'SimFin', token,
    });
    const data = await reminderFetch(fullUrl);
    if (!data.ok) throw new Error(data.error || 'Erro desconhecido');

    const newCfg = { scriptUrl: url, email, dia, token: data.token || token, secretKey, ativo: true };
    localStorage.setItem(REMINDER_KEY, JSON.stringify(newCfg));
    dbPushConfig({ lembretes: newCfg }).catch(() => {});
    reminderUpdateUI();
    showToast(`🔔 Lembrete ativo! E-mail todo dia ${dia} do mês.`, '🔔', 5000);
  } catch(e) {
    console.error('[Reminder]', e);
    showToast('Erro: ' + e.message, '❌', 6000);
  }
}

async function reminderTest() {
  const url   = document.getElementById('reminderScriptUrl')?.value?.trim();
  const email = document.getElementById('reminderEmail')?.value?.trim();

  const secretKeyT = document.getElementById('reminderSecretKey')?.value?.trim();
  if (!url)        { showToast('Cole a URL do Google Apps Script', '⚠️'); return; }
  if (!email)      { showToast('Informe seu e-mail', '⚠️'); return; }
  if (!secretKeyT) { showToast('Informe a chave secreta', '⚠️'); return; }

  showToast('Enviando e-mail de teste...', '📧', 15000);

  try {
    const fullUrl = reminderBuildUrl(url, {
      action: 'test', email, key: secretKeyT,
      appUrl: 'https://paulovcr18.github.io/SimFin/',
      nome: 'SimFin',
    });
    const data = await reminderFetch(fullUrl);
    if (!data.ok) throw new Error(data.error);
    showToast('E-mail de teste enviado! Verifique sua caixa.', '✅', 5000);
  } catch(e) {
    showToast('Erro: ' + e.message, '❌', 5000);
  }
}

async function reminderCancel() {
  const cfg = reminderLoadConfig();
  if (cfg.scriptUrl && cfg.token) {
    try {
      const fullUrl = reminderBuildUrl(cfg.scriptUrl, { action: 'cancel', token: cfg.token, key: cfg.secretKey || '' });
      await reminderFetch(fullUrl);
    } catch(e) { console.warn('[Reminder cancel]', e); }
  }
  cfg.ativo = false;
  localStorage.setItem(REMINDER_KEY, JSON.stringify(cfg));
  dbPushConfig({ lembretes: cfg }).catch(() => {});
  reminderUpdateUI();
  showToast('Lembrete cancelado', '🔕', 3000);
}


