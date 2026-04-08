// ════════════════════════════════════════════════════════════════
// CENTRAL DE NOTIFICAÇÕES — alertas automáticos baseados nos dados
// ════════════════════════════════════════════════════════════════

// REMINDER_KEY definido em storage.js

function reminderLoadConfig() {
  try { return JSON.parse(localStorage.getItem(REMINDER_KEY)) || {}; } catch { return {}; }
}

// ── Pedir permissão de notificação do browser ──
function reminderRequestPermission() {
  if (!('Notification' in window)) { showToast('Navegador não suporta notificações', '⚠️'); return; }
  Notification.requestPermission().then(p => {
    reminderUpdatePermStatus();
    if (p === 'granted') showToast('Notificações ativadas!', '🔔');
    else showToast('Permissão negada', '🔕');
  });
}

function reminderUpdatePermStatus() {
  const btn  = document.getElementById('notifPermBtn');
  const txt  = document.getElementById('notifPermStatus');
  if (!('Notification' in window)) {
    if (btn) btn.style.display = 'none';
    if (txt) txt.textContent = 'Navegador não suporta notificações';
    return;
  }
  const perm = Notification.permission;
  if (btn) btn.style.display = perm === 'granted' ? 'none' : '';
  if (txt) {
    const map = { granted: '✅ Permitido', denied: '❌ Bloqueado', default: '⏸ Não solicitado' };
    txt.textContent = map[perm] || '';
  }
}

// ── Envia notificação nativa ──
function reminderNotify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  }
}

// ── Gera cards de alerta a partir dos dados ──
function reminderBuildAlerts() {
  const alerts = [];
  const track  = JSON.parse(localStorage.getItem('simfin_track') || '[]');
  const goals  = JSON.parse(localStorage.getItem('simfin_goals') || '[]');
  const now    = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // 1) Lembrete de acompanhamento mensal
  const jaRegistrouMes = track.some(t => t.mes === mesAtual);
  if (!jaRegistrouMes) {
    alerts.push({
      id: 'track_mensal',
      icon: '📊',
      color: 'ac',
      title: 'Registrar acompanhamento',
      body: `Você ainda não registrou o mês de ${now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}. Mantenha seu histórico atualizado!`,
      action: () => { switchScreen('track'); },
      actionLabel: 'Ir para Acompanhamento'
    });
  }

  // 2) Metas próximas do prazo
  goals.forEach(g => {
    if (!g.dataLimite || g.concluida) return;
    const diff = Math.round((new Date(g.dataLimite) - now) / 86400000);
    if (diff >= 0 && diff <= 30) {
      alerts.push({
        id: 'meta_' + g.id,
        icon: '🎯',
        color: 'go',
        title: `Meta "${g.nome}" vence em ${diff} dia${diff !== 1 ? 's' : ''}`,
        body: `Valor: R$ ${(g.valor||0).toLocaleString('pt-BR')} · Prazo: ${new Date(g.dataLimite).toLocaleDateString('pt-BR')}`,
        action: () => { switchScreen('goals'); },
        actionLabel: 'Ver Metas'
      });
    }
  });

  // 3) Metas vencidas
  goals.forEach(g => {
    if (!g.dataLimite || g.concluida) return;
    const diff = Math.round((new Date(g.dataLimite) - now) / 86400000);
    if (diff < 0) {
      alerts.push({
        id: 'meta_vencida_' + g.id,
        icon: '⚠️',
        color: 're',
        title: `Meta "${g.nome}" venceu há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}`,
        body: `Considere atualizar o prazo ou marcar como concluída.`,
        action: () => { switchScreen('goals'); },
        actionLabel: 'Ver Metas'
      });
    }
  });

  // 4) Queda de patrimônio sem resgate
  if (track.length >= 2) {
    const sorted = [...track].sort((a, b) => a.mes.localeCompare(b.mes));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    if (last.patrimonio < prev.patrimonio && !last.resgate) {
      const queda = prev.patrimonio - last.patrimonio;
      alerts.push({
        id: 'queda_pat',
        icon: '📉',
        color: 're',
        title: 'Queda no patrimônio detectada',
        body: `De R$ ${prev.patrimonio.toLocaleString('pt-BR')} para R$ ${last.patrimonio.toLocaleString('pt-BR')} (−R$ ${queda.toLocaleString('pt-BR')}) sem resgate registrado.`,
        action: () => { switchScreen('track'); },
        actionLabel: 'Verificar'
      });
    }
  }

  // 5) Sem acompanhamento há 2+ meses
  if (track.length > 0) {
    const sorted = [...track].sort((a, b) => a.mes.localeCompare(b.mes));
    const lastMes = sorted[sorted.length - 1].mes;
    const [ly, lm] = lastMes.split('-').map(Number);
    const lastDate = new Date(ly, lm - 1);
    const diffMonths = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
    if (diffMonths >= 2) {
      alerts.push({
        id: 'track_atrasado',
        icon: '⏰',
        color: 'go',
        title: `${diffMonths} meses sem registrar acompanhamento`,
        body: 'A consistência é fundamental para acompanhar sua evolução patrimonial.',
        action: () => { switchScreen('track'); },
        actionLabel: 'Registrar agora'
      });
    }
  }

  // 6) Cenário sem salvar
  const sc = JSON.parse(localStorage.getItem(SCENARIO_KEY) || '{}');
  if (!sc.createdAt) {
    alerts.push({
      id: 'cenario_vazio',
      icon: '💾',
      color: 'pu',
      title: 'Cenário não salvo',
      body: 'Salve seu cenário para manter backup dos seus dados de simulação.',
      action: () => { document.getElementById('scenarioBtn')?.click(); },
      actionLabel: 'Salvar Cenário'
    });
  }

  // 7) Alertas de desvio vs Dia 0
  const desvioAlerts = JSON.parse(localStorage.getItem('simfin_desvio_alerts') || '[]');
  desvioAlerts.forEach(da => {
    const mesLabel = new Date(da.mes + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    alerts.push({
      id: `desvio_${da.mes}`,
      icon: '📌',
      color: 're',
      title: `Desvio do Dia 0 em ${mesLabel}`,
      body: `Patrimônio ${da.pct}% abaixo do esperado (${fmt(da.real)} vs ${fmt(da.esperado)} projetado).`,
      action: () => switchScreen('financas'),
      actionLabel: 'Ver Acompanhamento'
    });
  });

  return alerts;
}

// ── Renderiza os cards ──
function reminderRenderCards() {
  const container = document.getElementById('notifCardsList');
  if (!container) return;

  const alerts = reminderBuildAlerts();
  const dismissed = JSON.parse(localStorage.getItem('simfin_dismissed_alerts') || '[]');
  const active = alerts.filter(a => !dismissed.includes(a.id));

  // Atualiza status
  const dot = document.getElementById('reminderDot');
  const txt = document.getElementById('reminderStatusText');
  if (active.length > 0) {
    if (dot) dot.className = 'reminder-dot on';
    if (txt) { txt.textContent = `${active.length} alerta${active.length > 1 ? 's' : ''} ativo${active.length > 1 ? 's' : ''}`; txt.style.color = 'var(--ac)'; }
  } else {
    if (dot) dot.className = 'reminder-dot off';
    if (txt) { txt.textContent = 'Nenhum alerta no momento — tudo em dia!'; txt.style.color = 'var(--t2)'; }
  }

  if (active.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:var(--t3)">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <div style="font-size:14px;font-weight:600;color:var(--t2);margin-bottom:4px">Tudo em dia!</div>
        <div style="font-size:12px">Nenhuma ação pendente no momento.</div>
      </div>`;
    return;
  }

  container.innerHTML = active.map(a => `
    <div class="notif-card notif-${a.color}" data-alert-id="${a.id}">
      <div class="notif-card-icon">${a.icon}</div>
      <div class="notif-card-body">
        <div class="notif-card-title">${escHtml(a.title)}</div>
        <div class="notif-card-text">${escHtml(a.body)}</div>
        <div class="notif-card-actions">
          <button class="notif-action-btn" onclick="reminderAlertAction('${a.id}')">${a.actionLabel}</button>
          <button class="notif-dismiss-btn" onclick="reminderDismiss('${a.id}')">Dispensar</button>
        </div>
      </div>
    </div>
  `).join('');

  // Armazena callbacks para os botões de ação
  window._notifActions = {};
  active.forEach(a => { window._notifActions[a.id] = a.action; });
}

function reminderAlertAction(id) {
  if (window._notifActions && window._notifActions[id]) window._notifActions[id]();
}

function reminderDismiss(id) {
  const dismissed = JSON.parse(localStorage.getItem('simfin_dismissed_alerts') || '[]');
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem('simfin_dismissed_alerts', JSON.stringify(dismissed));
  }
  reminderRenderCards();
}

// ── Limpa dismissals antigos a cada dia ──
function reminderResetDismissals() {
  const key = 'simfin_dismissed_reset';
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(key) !== today) {
    localStorage.removeItem('simfin_dismissed_alerts');
    localStorage.setItem(key, today);
  }
}

// ── Verifica alertas e envia notificação browser se houver pendências ──
function reminderCheckDue() {
  reminderResetDismissals();
  const alerts = reminderBuildAlerts();
  const dismissed = JSON.parse(localStorage.getItem('simfin_dismissed_alerts') || '[]');
  const active = alerts.filter(a => !dismissed.includes(a.id));

  // Badge no tab
  const tab = document.getElementById('tabReminder');
  if (tab) {
    const existing = tab.querySelector('.notif-badge');
    if (existing) existing.remove();
    if (active.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'notif-badge';
      badge.textContent = active.length;
      tab.appendChild(badge);
    }
  }

  // Notificação browser (1x por sessão)
  if (active.length > 0 && !window._notifSent) {
    window._notifSent = true;
    reminderNotify('SimFin', `Você tem ${active.length} alerta${active.length > 1 ? 's' : ''} pendente${active.length > 1 ? 's' : ''}`);
  }
}

// ── UI update (chamado por auth.js) ──
function reminderUpdateUI() {
  reminderUpdatePermStatus();
  reminderRenderCards();
}
