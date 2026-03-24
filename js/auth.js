// ════════════════════════════════════════════════════════════════
// SUPABASE — Auth e cliente global
// ════════════════════════════════════════════════════════════════
//
// SETUP (faça uma vez):
//   1. Crie um projeto em https://supabase.com
//   2. Vá em Project Settings > API
//   3. Substitua os valores abaixo pelo seu Project URL e anon key
//
const SUPABASE_URL  = 'COLE_SEU_PROJECT_URL_AQUI';
const SUPABASE_ANON = 'COLE_SUA_ANON_KEY_AQUI';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,   // sessao sobrevive ao refresh
    autoRefreshToken:  true,   // renova o JWT automaticamente
    detectSessionInUrl: true,  // necessario para magic link / OAuth
  }
});

// ─── Estado ──────────────────────────────────────────────────────────────────
let currentUser = null;
let authMode    = 'login'; // 'login' | 'signup'

// ─── Boot: verifica sessao ao carregar ───────────────────────────────────────
(async function authBoot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    authOnLogin(session.user);
  } else {
    authShowOverlay();
  }

  // Escuta mudancas de sessao (logout em outra aba, expiração, etc.)
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      authOnLogin(session.user);
    } else {
      authOnLogout();
    }
  });
})();

// ─── Mostrar / esconder overlay ──────────────────────────────────────────────
function authShowOverlay() {
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('appRoot').style.display     = 'none';
}

function authHideOverlay() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('appRoot').style.display     = 'contents';
}

// ─── Tabs (Entrar / Cadastrar) ───────────────────────────────────────────────
function authShowTab(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  document.getElementById('authTabLogin').classList.toggle('active', !isSignup);
  document.getElementById('authTabSignup').classList.toggle('active', isSignup);
  document.getElementById('authConfirmField').style.display = isSignup ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent      = isSignup ? 'Criar conta' : 'Entrar';
  document.getElementById('authForgotBtn').style.display    = isSignup ? 'none' : 'block';
  document.getElementById('authError').style.display        = 'none';
  document.getElementById('authMsg').style.display          = 'none';
}

// ─── Submit do formulário ─────────────────────────────────────────────────────
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
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      authSetMsg('Cadastro realizado! Verifique seu e-mail para confirmar a conta.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    authSetError(authTranslateError(err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'signup' ? 'Criar conta' : 'Entrar';
  }
}

// ─── Esqueci a senha ─────────────────────────────────────────────────────────
async function authForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) { authSetError('Informe seu e-mail primeiro.'); return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) { authSetError(authTranslateError(error.message)); return; }
  authSetMsg('Link de redefinição enviado para ' + email);
}

// ─── Logout ──────────────────────────────────────────────────────────────────
async function authLogout() {
  await supabase.auth.signOut();
}

// ─── Callbacks de estado ─────────────────────────────────────────────────────
function authOnLogin(user) {
  currentUser = user;
  authHideOverlay();
  authUpdateTopbar();
  // Inicializa o app normalmente (já estava pronto, so estava escondido)
  try { autoRestoreInputs(); } catch(e) {}
  try { updAno(); calc(); }    catch(e) {}
  try { driveInit(); }         catch(e) {}
  try { carteiraMigrar(); renderCarteira(); } catch(e) {}
  try { renderGoals(); }       catch(e) {}
  try { renderTrack(); }       catch(e) {}
  try { reminderUpdateUI(); }  catch(e) {}
}

function authOnLogout() {
  currentUser = null;
  authShowTab('login');
  authShowOverlay();
  authUpdateTopbar();
}

// ─── Topbar: badge de usuário + botão logout ──────────────────────────────────
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
    const email = currentUser.email || '';
    const initials = email.slice(0, 2).toUpperCase();
    el.innerHTML = `
      <div style="width:28px;height:28px;border-radius:50%;background:var(--acg);border:1px solid var(--bda);
                  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
                  color:var(--ac);cursor:default" title="${email}">${initials}</div>
      <button onclick="authLogout()" style="background:none;border:1px solid var(--bd);border-radius:6px;
              padding:4px 8px;font-size:11px;color:var(--t3);cursor:pointer" title="Sair">Sair</button>`;
  } else {
    el.innerHTML = '';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  if (msg.includes('Invalid login credentials'))  return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))         return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('User already registered'))     return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (msg.includes('rate limit'))                  return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
}
