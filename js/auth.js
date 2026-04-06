// ════════════════════════════════════════════════════════════════
// SUPABASE — Auth e cliente global
// ════════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://qaopienbsmssjosttucn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhb3BpZW5ic21zc2pvc3R0dWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODUyOTIsImV4cCI6MjA4OTk2MTI5Mn0.jwFSbkYYOc-fwD_UitBEwfNfQvZdOypHlELx6reMvQs';

// Garante que window.supabase foi carregado pelo CDN
if (!window.supabase) {
  console.error('[SimFin] Supabase SDK não carregou. Verifique a conexão.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,  // necessário para links de confirmação e reset
  }
});

// URL de retorno para e-mails do Supabase (confirmação, reset de senha)
const AUTH_REDIRECT = window.location.origin + window.location.pathname;

// ─── Estado ──────────────────────────────────────────────────────────────────
let currentUser   = null;
let authMode      = 'login';   // 'login' | 'signup'
let appInitialized = false;    // garante que initApp() roda só uma vez

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Usa onAuthStateChange como única fonte de verdade.
// INITIAL_SESSION dispara uma vez no load (com ou sem sessão).
// Assim evitamos double-init (getSession + onAuthStateChange).
sb.auth.onAuthStateChange((event, session) => {
  switch (event) {
    case 'INITIAL_SESSION':
      if (session) {
        authOnLogin(session.user);
      } else {
        authShowOverlay();
      }
      break;

    case 'SIGNED_IN':
      // Só re-inicializa se não estava logado antes (evita re-init no TOKEN_REFRESHED)
      if (!currentUser) authOnLogin(session.user);
      break;

    case 'SIGNED_OUT':
      authOnLogout();
      break;

    case 'PASSWORD_RECOVERY':
      // Usuário clicou no link de "esqueci minha senha" — mostra formulário de nova senha
      authShowOverlay();
      authShowPasswordReset();
      break;

    // TOKEN_REFRESHED, USER_UPDATED etc. — ignora, não reinicializa o app
  }
});

// ─── Mostrar / esconder overlay ──────────────────────────────────────────────
function authShowOverlay() {
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('appRoot').style.display     = 'none';
}

function authHideOverlay() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('appRoot').style.display     = 'contents';
}

// ─── Loading state durante sincronização inicial ──────────────────────────────
function authShowSyncLoading(show) {
  let el = document.getElementById('authSyncLoading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'authSyncLoading';
    el.style.cssText = [
      'position:fixed','top:0','left:0','right:0','bottom:0',
      'background:var(--bg1,#0d1117)','display:flex','flex-direction:column',
      'align-items:center','justify-content:center','z-index:9999',
      'font-family:Sora,sans-serif','color:var(--t2,#8fa0b0)','gap:16px',
    ].join(';');
    el.innerHTML = `
      <div style="font-size:28px">⏳</div>
      <div style="font-size:14px;font-weight:500;color:var(--t1,#e8ead4)">Sincronizando seus dados…</div>
      <div style="font-size:12px;color:var(--t3,#4d6070)">Conectando ao Supabase</div>
      <div style="width:200px;height:3px;background:var(--bg6,#1e2a38);border-radius:3px;overflow:hidden;margin-top:8px">
        <div style="height:100%;background:var(--ac,#5dd4a0);animation:authPulse 1.2s ease-in-out infinite;border-radius:3px"></div>
      </div>
      <style>@keyframes authPulse{0%,100%{width:20%;margin-left:0}50%{width:60%;margin-left:40%}}</style>
    `;
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function authShowTab(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';

  document.getElementById('authTabLogin').classList.toggle('active', !isSignup);
  document.getElementById('authTabSignup').classList.toggle('active', isSignup);
  document.getElementById('authConfirmField').style.display  = isSignup ? 'block' : 'none';
  document.getElementById('authConfirm').required            = isSignup;
  document.getElementById('authSubmitBtn').textContent       = isSignup ? 'Criar conta' : 'Entrar';
  document.getElementById('authForgotBtn').style.display     = isSignup ? 'none' : 'block';
  document.getElementById('authResetSection').style.display  = 'none';
  document.getElementById('authError').style.display         = 'none';
  document.getElementById('authMsg').style.display           = 'none';
  document.getElementById('authForm').style.display          = 'block';
}

// ─── Formulário de nova senha (após link de reset) ───────────────────────────
function authShowPasswordReset() {
  document.getElementById('authForm').style.display         = 'none';
  document.getElementById('authResetSection').style.display = 'block';
  document.getElementById('authTabLogin').classList.remove('active');
  document.getElementById('authTabSignup').classList.remove('active');
  document.getElementById('authForgotBtn').style.display    = 'none';
}

async function authUpdatePassword() {
  const newPass  = document.getElementById('authNewPassword').value;
  const confirm  = document.getElementById('authNewConfirm').value;
  const btn      = document.getElementById('authUpdatePassBtn');

  if (newPass.length < 6)       { authSetError('A senha deve ter pelo menos 6 caracteres.'); return; }
  if (newPass !== confirm)      { authSetError('As senhas não coincidem.'); return; }

  btn.disabled = true;
  btn.textContent = 'Salvando...';
  const { error } = await sb.auth.updateUser({ password: newPass });
  btn.disabled = false;
  btn.textContent = 'Salvar nova senha';

  if (error) { authSetError(authTranslateError(error.message)); return; }
  authSetMsg('Senha atualizada! Redirecionando...');
  setTimeout(() => authShowTab('login'), 2000);
}

// ─── Submit principal ────────────────────────────────────────────────────────
async function authSubmit(e) {
  e.preventDefault();
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const confirm  = document.getElementById('authConfirm').value;
  const btn      = document.getElementById('authSubmitBtn');

  authSetError('');
  btn.disabled    = true;
  btn.textContent = 'Aguarde...';

  try {
    if (authMode === 'signup') {
      if (password !== confirm) { authSetError('As senhas não coincidem.'); return; }

      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { emailRedirectTo: AUTH_REDIRECT },
      });
      if (error) throw error;

      // Se o Supabase retornou uma sessão, confirmação de e-mail está desativada
      // e o usuário já está logado — onAuthStateChange cuida do resto
      if (!data.session) {
        authSetMsg('Cadastro realizado! Verifique seu e-mail para confirmar a conta.');
        authShowTab('login'); // já troca para aba de login
        document.getElementById('authEmail').value    = email; // mantém e-mail preenchido
        document.getElementById('authPassword').value = '';
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange SIGNED_IN vai cuidar do resto
    }
  } catch (err) {
    authSetError(authTranslateError(err.message));
  } finally {
    btn.disabled    = false;
    btn.textContent = authMode === 'signup' ? 'Criar conta' : 'Entrar';
  }
}

// ─── Esqueci a senha ─────────────────────────────────────────────────────────
async function authForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) { authSetError('Informe seu e-mail primeiro.'); return; }

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_REDIRECT,  // redireciona de volta para o SimFin
  });
  if (error) { authSetError(authTranslateError(error.message)); return; }
  authSetMsg('Link de redefinição enviado para ' + email + '. Verifique sua caixa de entrada.');
}

// ─── Logout ──────────────────────────────────────────────────────────────────
async function authLogout() {
  await sb.auth.signOut();
  // onAuthStateChange SIGNED_OUT cuida do resto
}

// ─── Callbacks de estado ─────────────────────────────────────────────────────
async function authOnLogin(user) {
  currentUser = user;
  authUpdateTopbar();

  if (!appInitialized) {
    appInitialized = true;

    // Step 1: Schema migration — must always complete before any render
    try { await dbMigrateIfNeeded(); } catch(e) { console.warn('[db] migrate:', e); }

    // Step 2: Detect localStorage cache
    const hasCache = !!localStorage.getItem('simfin_last_inputs');

    if (hasCache) {
      // Cache path: render immediately, sync in background
      authHideOverlay();

      try { autoRestoreInputs(); }               catch(e) { console.error('[init]', e); }
      try { updAno(); calc(); }                  catch(e) { console.error('[init]', e); }
      try { carteiraMigrar(); renderCarteira(); } catch(e) { console.error('[init]', e); }
      try { renderGoals(); }                     catch(e) { console.error('[init]', e); }
      try { renderTrack(); }                     catch(e) { console.error('[init]', e); }
      try { reminderUpdateUI(); reminderCheckDue(); } catch(e) { console.error('[init]', e); }

      // Background sync — NOT awaited; re-render affected modules when done
      dbPullAll()
        .then(() => {
          try { renderCarteira(); } catch(e) { console.error('[bg-sync] renderCarteira:', e); }
          try { renderGoals();    } catch(e) { console.error('[bg-sync] renderGoals:',    e); }
          try { renderTrack();    } catch(e) { console.error('[bg-sync] renderTrack:',    e); }
          try { calc();           } catch(e) { console.error('[bg-sync] calc:',           e); }
        })
        .catch(e => console.error('[bg-sync]', e));

    } else {
      // First-login path: no cache — await full sync before rendering
      authShowSyncLoading(true);
      try { await dbPullAll(); } catch(e) { console.warn('[db] pull:', e); }
      authShowSyncLoading(false);

      authHideOverlay();

      try { autoRestoreInputs(); }               catch(e) { console.error('[init]', e); }
      try { updAno(); calc(); }                  catch(e) { console.error('[init]', e); }
      try { carteiraMigrar(); renderCarteira(); } catch(e) { console.error('[init]', e); }
      try { renderGoals(); }                     catch(e) { console.error('[init]', e); }
      try { renderTrack(); }                     catch(e) { console.error('[init]', e); }
      try { reminderUpdateUI(); reminderCheckDue(); } catch(e) { console.error('[init]', e); }
    }
  }
}

function authOnLogout() {
  currentUser    = null;
  appInitialized = false;
  authShowTab('login');
  authShowOverlay();
  authUpdateTopbar();
}

// ─── Badge de usuário na topbar ───────────────────────────────────────────────
function authUpdateTopbar() {
  let el = document.getElementById('authUserBadge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'authUserBadge';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:4px';
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight) topbarRight.prepend(el);
  }

  if (currentUser) {
    const email    = currentUser.email || '';
    const initial  = (email.split('@')[0] || '?')[0].toUpperCase();
    el.innerHTML = `
      <div style="width:28px;height:28px;border-radius:50%;background:var(--acg);border:1px solid var(--bda);
                  display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;
                  color:var(--ac);cursor:default;flex-shrink:0" title="${email}">${initial}</div>
      <button onclick="authLogout()"
              style="background:none;border:1px solid var(--bd);border-radius:6px;
                     padding:4px 8px;font-size:11px;color:var(--t3);cursor:pointer"
              title="Sair">Sair</button>`;
  } else {
    el.innerHTML = '';
  }
}

// ─── Helpers de mensagem ──────────────────────────────────────────────────────
function authSetError(msg) {
  const el = document.getElementById('authError');
  el.style.display = msg ? 'block' : 'none';
  el.textContent   = msg;
  document.getElementById('authMsg').style.display = 'none';
}

function authSetMsg(msg) {
  const el = document.getElementById('authMsg');
  el.style.display = msg ? 'block' : 'none';
  el.textContent   = msg;
  document.getElementById('authError').style.display = 'none';
}

function authTranslateError(msg) {
  if (!msg) return 'Erro desconhecido.';
  if (msg.includes('Invalid login credentials'))   return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))          return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('User already registered'))      return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be at least'))  return 'A senha deve ter pelo menos 6 caracteres.';
  if (msg.includes('rate limit'))                   return 'Muitas tentativas. Aguarde alguns minutos.';
  if (msg.includes('Email link is invalid'))        return 'Link expirado ou inválido. Solicite um novo.';
  if (msg.includes('Token has expired'))            return 'Link expirado. Solicite um novo.';
  return msg;
}
