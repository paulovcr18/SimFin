// ════════════════════════════════════════════════════════════════
// EXTRATO BANCÁRIO — Parser multi-banco (CSV + OFX)
//
// Bancos suportados: Nubank, Itaú, Bradesco, Inter, C6, Santander, BB
// Dados persistidos em localStorage: simfin_extrato
// ════════════════════════════════════════════════════════════════

const EXTRATO_KEY = 'simfin_extrato';

// ── Storage ──────────────────────────────────────────────────────
function extratoLoad() {
  try { return JSON.parse(localStorage.getItem(EXTRATO_KEY)) || []; } catch { return []; }
}
function extratoSave(txns) {
  localStorage.setItem(EXTRATO_KEY, JSON.stringify(txns));
}

// ── Detecta banco pelo conteúdo do arquivo ──────────────────────
function extratoDetectarBanco(text, fileName) {
  const fn = (fileName || '').toLowerCase();
  const t = text.substring(0, 2000).toLowerCase();

  // OFX — detectar pelo header
  if (t.includes('<ofx') || t.includes('ofxheader')) return 'ofx';

  // Nubank CSV — "Data","Valor","Identificador","Descrição" ou "date","title","amount"
  if (t.includes('nubank') || (t.includes('"data"') && t.includes('"identificador"'))
      || fn.includes('nubank') || (t.includes('"date"') && t.includes('"title"') && t.includes('"amount"')))
    return 'nubank';

  // Inter — "Data Lançamento";"Histórico";"Descrição";"Valor";"Saldo"
  if (t.includes('data lançamento') || t.includes('data lancamento') || fn.includes('inter'))
    return 'inter';

  // C6 — "Data";"Descrição";"Valor";"Saldo"
  if (fn.includes('c6') || (t.includes('"data"') && t.includes('"descrição"') && t.includes('"saldo"') && t.split('\n')[0].split(';').length >= 3))
    return 'c6';

  // Itaú — "data";"lançamento";"ag./origem";"valor (R$)"
  if (t.includes('lançamento') && t.includes('ag./origem') || fn.includes('itau') || fn.includes('itaú'))
    return 'itau';

  // Bradesco — "Data";"Histórico";"Docto.";"Crédito (R$)";"Débito (R$)";"Saldo (R$)"
  if ((t.includes('docto') || t.includes('crédito (r$)') || t.includes('débito (r$)')) || fn.includes('bradesco'))
    return 'bradesco';

  // Santander — "Data";"Dependência Origem";"Histórico";"Data do Balancete";"Número Documento";"Valor"
  if (t.includes('dependência origem') || t.includes('dependencia origem') || fn.includes('santander'))
    return 'santander';

  // BB — "Data";"Dependencia";"Historico";"Data do Balancete";"Numero do documento";"Valor"
  if ((t.includes('dependencia') && t.includes('historico') && t.includes('balancete')) || fn.includes('banco do brasil') || fn.includes('bb_'))
    return 'bb';

  return 'generico';
}

// ── Parser CSV genérico ─────────────────────────────────────────
function extratoParseCSV(text, sep) {
  if (!sep) sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = extratoSplitCSVLine(lines[0], sep);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = extratoSplitCSVLine(line, sep);
    if (cols.length >= 2) rows.push(cols);
  }
  return { headers, rows };
}

function extratoSplitCSVLine(line, sep) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Parse data brasileira ───────────────────────────────────────
function extratoParseData(s) {
  if (!s) return null;
  s = s.trim().replace(/"/g, '');
  // DD/MM/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  // DD-MM-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

// ── Parse valor monetário brasileiro ────────────────────────────
function extratoParseValor(s) {
  if (!s) return null;
  s = s.trim().replace(/"/g, '').replace(/R\$\s*/g, '').replace(/\s/g, '');
  // 1.234,56 → 1234.56
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

// ═══ PARSERS POR BANCO ═══════════════════════════════════════════

function extratoParseNubank(text) {
  const { headers, rows } = extratoParseCSV(text, ',');
  const h = headers.map(x => x.toLowerCase().replace(/"/g, ''));
  const iData = h.findIndex(c => c === 'data' || c === 'date');
  const iDesc = h.findIndex(c => c === 'descrição' || c === 'descricao' || c === 'title');
  const iValor = h.findIndex(c => c === 'valor' || c === 'amount');
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData]),
    descricao: (r[iDesc] || r[iData + 1] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'Nubank',
  })).filter(t => t.data && t.valor !== null);
}

function extratoParseInter(text) {
  const { headers, rows } = extratoParseCSV(text, ';');
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data'));
  const iDesc = h.findIndex(c => c.includes('descri') || c.includes('historico'));
  const iValor = h.findIndex(c => c.includes('valor'));
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData]),
    descricao: (r[iDesc >= 0 ? iDesc : iData + 1] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'Inter',
  })).filter(t => t.data && t.valor !== null);
}

function extratoParseC6(text) {
  const { headers, rows } = extratoParseCSV(text, ';');
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data'));
  const iDesc = h.findIndex(c => c.includes('descri'));
  const iValor = h.findIndex(c => c.includes('valor'));
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData]),
    descricao: (r[iDesc >= 0 ? iDesc : iData + 1] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'C6',
  })).filter(t => t.data && t.valor !== null);
}

function extratoParseItau(text) {
  const { headers, rows } = extratoParseCSV(text, ';');
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data'));
  const iDesc = h.findIndex(c => c.includes('lancamento') || c.includes('lançamento') || c.includes('historico'));
  const iValor = h.findIndex(c => c.includes('valor'));
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData]),
    descricao: (r[iDesc >= 0 ? iDesc : iData + 1] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'Itaú',
  })).filter(t => t.data && t.valor !== null);
}

function extratoParseBradesco(text) {
  const { headers, rows } = extratoParseCSV(text, ';');
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data'));
  const iDesc = h.findIndex(c => c.includes('historico') || c.includes('descri'));
  const iCredito = h.findIndex(c => c.includes('credito'));
  const iDebito = h.findIndex(c => c.includes('debito'));
  const iValor = h.findIndex(c => c === 'valor' || c.includes('valor'));
  if (iData < 0) return [];
  return rows.map(r => {
    let valor;
    if (iCredito >= 0 && iDebito >= 0) {
      const cred = extratoParseValor(r[iCredito]);
      const deb = extratoParseValor(r[iDebito]);
      valor = cred ? Math.abs(cred) : deb ? -Math.abs(deb) : null;
    } else {
      valor = extratoParseValor(r[iValor >= 0 ? iValor : 3]);
    }
    return {
      data: extratoParseData(r[iData]),
      descricao: (r[iDesc >= 0 ? iDesc : 1] || '').replace(/"/g, ''),
      valor,
      banco: 'Bradesco',
    };
  }).filter(t => t.data && t.valor !== null);
}

function extratoParseSantander(text) {
  const { headers, rows } = extratoParseCSV(text, ';');
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data') && !c.includes('balancete'));
  const iDesc = h.findIndex(c => c.includes('historico') || c.includes('descri'));
  const iValor = h.findIndex(c => c.includes('valor'));
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData >= 0 ? iData : 0]),
    descricao: (r[iDesc >= 0 ? iDesc : 2] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'Santander',
  })).filter(t => t.data && t.valor !== null);
}

function extratoParseBB(text) {
  const { headers, rows } = extratoParseCSV(text, ';');
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data') && !c.includes('balancete'));
  const iDesc = h.findIndex(c => c.includes('historico') || c.includes('descri'));
  const iValor = h.findIndex(c => c.includes('valor'));
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData >= 0 ? iData : 0]),
    descricao: (r[iDesc >= 0 ? iDesc : 2] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'BB',
  })).filter(t => t.data && t.valor !== null);
}

function extratoParseGenerico(text) {
  // Tenta separador ; depois ,
  let sep = text.includes(';') ? ';' : ',';
  const { headers, rows } = extratoParseCSV(text, sep);
  const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"/g, ''));
  const iData = h.findIndex(c => c.includes('data') || c.includes('date'));
  const iDesc = h.findIndex(c => c.includes('desc') || c.includes('hist') || c.includes('title') || c.includes('memo'));
  const iValor = h.findIndex(c => c.includes('valor') || c.includes('amount') || c.includes('value'));
  if (iData < 0 || iValor < 0) return [];
  return rows.map(r => ({
    data: extratoParseData(r[iData]),
    descricao: (r[iDesc >= 0 ? iDesc : 1] || '').replace(/"/g, ''),
    valor: extratoParseValor(r[iValor]),
    banco: 'Outro',
  })).filter(t => t.data && t.valor !== null);
}

// ═══ PARSER OFX ═══════════════════════════════════════════════════
function extratoParseOFX(text) {
  const txns = [];
  // Extrai banco do <ORG>
  const orgMatch = text.match(/<ORG>([^<\n]+)/i);
  const banco = orgMatch ? orgMatch[1].trim() : 'OFX';

  // Regex para cada STMTTRN
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = stmtRegex.exec(text)) !== null) {
    const block = match[1];
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const dtposted = get('DTPOSTED');
    let data = null;
    if (dtposted.length >= 8) {
      data = `${dtposted.substring(0,4)}-${dtposted.substring(4,6)}-${dtposted.substring(6,8)}`;
    }

    const valor = parseFloat(get('TRNAMT').replace(',', '.'));
    const desc = get('MEMO') || get('NAME') || get('FITID');

    if (data && !isNaN(valor)) {
      txns.push({ data, descricao: desc, valor, banco });
    }
  }
  return txns;
}

// ═══ FUNÇÃO PRINCIPAL DE IMPORTAÇÃO ═══════════════════════════════
function extratoImportar(text, fileName) {
  const banco = extratoDetectarBanco(text, fileName);
  let txns;

  switch (banco) {
    case 'ofx':       txns = extratoParseOFX(text); break;
    case 'nubank':    txns = extratoParseNubank(text); break;
    case 'inter':     txns = extratoParseInter(text); break;
    case 'c6':        txns = extratoParseC6(text); break;
    case 'itau':      txns = extratoParseItau(text); break;
    case 'bradesco':  txns = extratoParseBradesco(text); break;
    case 'santander': txns = extratoParseSantander(text); break;
    case 'bb':        txns = extratoParseBB(text); break;
    default:          txns = extratoParseGenerico(text); break;
  }

  if (!txns.length) return { banco, importadas: 0, duplicadas: 0 };

  // Categoriza cada transação
  txns.forEach(t => {
    t.categoria = categorizarTransacao(t.descricao, t.valor);
    t.id = `${t.data}_${t.valor}_${t.descricao.substring(0,30)}`;
  });

  // Merge com existentes (evita duplicatas)
  const existentes = extratoLoad();
  const idsExistentes = new Set(existentes.map(e => e.id));
  const novas = txns.filter(t => !idsExistentes.has(t.id));

  const merged = [...existentes, ...novas].sort((a, b) => b.data.localeCompare(a.data));
  extratoSave(merged);

  return { banco: txns[0]?.banco || banco, importadas: novas.length, duplicadas: txns.length - novas.length };
}

// ── Handler de upload de arquivo ─────────────────────────────────
function extratoHandleUpload(file) {
  if (!file) return;
  const statusEl = document.getElementById('extratoImportStatus');
  statusEl.textContent = 'Processando...';
  statusEl.style.color = 'var(--t2)';

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const result = extratoImportar(text, file.name);

    if (result.importadas === 0 && result.duplicadas === 0) {
      statusEl.innerHTML = `<span style="color:var(--re)">Nenhuma transação encontrada. Verifique se o formato é suportado.</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--ac)">✅ ${result.banco}: ${result.importadas} transações importadas</span>`
        + (result.duplicadas > 0 ? `<span style="color:var(--t3)"> (${result.duplicadas} já existiam)</span>` : '');
      renderExtrato();
      renderGastos();
      renderSaudeFinanceira();
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ── Limpar extrato ───────────────────────────────────────────────
function extratoLimpar() {
  if (!confirm('Tem certeza que deseja excluir todas as transações importadas?')) return;
  localStorage.removeItem(EXTRATO_KEY);
  renderExtrato();
  renderGastos();
  renderSaudeFinanceira();
  showToast('Extrato limpo', '🗑', 2000);
}

// ── Obter meses disponíveis ──────────────────────────────────────
function extratoMesesDisponiveis() {
  const txns = extratoLoad();
  const meses = new Set(txns.map(t => t.data.substring(0, 7)));
  return [...meses].sort().reverse();
}

// ── Obter transações de um mês ───────────────────────────────────
function extratoDoMes(mes) {
  return extratoLoad().filter(t => t.data.startsWith(mes));
}

// ── Resumo por categoria para um mês ─────────────────────────────
function extratoResumoMes(mes) {
  const txns = extratoDoMes(mes);
  const resumo = {};
  for (const t of txns) {
    if (t.valor >= 0) continue; // ignora receitas
    const cat = t.categoria || 'Outros';
    resumo[cat] = (resumo[cat] || 0) + Math.abs(t.valor);
  }
  return resumo;
}

// ── Receitas de um mês ───────────────────────────────────────────
function extratoReceitasMes(mes) {
  const txns = extratoDoMes(mes);
  return txns.filter(t => t.valor > 0).reduce((s, t) => s + t.valor, 0);
}

// ── Render lista de transações ───────────────────────────────────
function renderExtrato() {
  const area = document.getElementById('extratoListArea');
  const countEl = document.getElementById('extratoCount');
  const mesSelect = document.getElementById('extratoMesFilter');
  if (!area) return;

  const txns = extratoLoad();
  const meses = extratoMesesDisponiveis();

  // Popula select de meses
  const mesAtual = mesSelect.value || (meses[0] || '');
  mesSelect.innerHTML = meses.map(m => {
    const lbl = new Date(m + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === mesAtual ? 'selected' : ''}>${lbl}</option>`;
  }).join('');

  if (!meses.length) {
    countEl.textContent = '';
    area.innerHTML = `<div class="track-empty">
      <div class="track-empty-icon">🏦</div>
      <div class="track-empty-title">Nenhum extrato importado</div>
      <div class="track-empty-sub">Importe um CSV ou OFX do seu banco acima.</div>
    </div>`;
    return;
  }

  const mesSel = mesSelect.value || meses[0];
  const txnsMes = extratoDoMes(mesSel).sort((a, b) => b.data.localeCompare(a.data));
  countEl.textContent = `${txnsMes.length} transações`;

  const receitas = txnsMes.filter(t => t.valor > 0);
  const despesas = txnsMes.filter(t => t.valor < 0);
  const totalRec = receitas.reduce((s, t) => s + t.valor, 0);
  const totalDesp = despesas.reduce((s, t) => s + Math.abs(t.valor), 0);

  let html = `<div class="extrato-resumo-bar">
    <span style="color:var(--ac)">📥 Receitas: ${fmt(totalRec)}</span>
    <span style="color:var(--re)">📤 Despesas: ${fmt(totalDesp)}</span>
    <span style="color:${totalRec - totalDesp >= 0 ? 'var(--ac)' : 'var(--re)'}">📊 Saldo: ${fmt(totalRec - totalDesp)}</span>
  </div>`;

  html += `<div class="extrato-table-wrap"><table class="track-table extrato-table">
    <thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Descrição</th><th style="text-align:left">Categoria</th><th>Valor</th><th></th></tr></thead>
    <tbody>`;

  for (const t of txnsMes) {
    const cls = t.valor >= 0 ? 'pos' : 'neg';
    const catLabel = t.categoria || 'Outros';
    const catIcon = EXTRATO_CAT_ICONS[catLabel] || '📋';
    html += `<tr>
      <td style="white-space:nowrap;font-size:11px">${t.data.split('-').reverse().join('/')}</td>
      <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.descricao}">${t.descricao}</td>
      <td><select class="extrato-cat-select" onchange="extratoRecategorizar('${t.id}',this.value)" title="Alterar categoria">
        ${EXTRATO_CATEGORIAS.map(c => `<option value="${c}" ${c === catLabel ? 'selected' : ''}>${EXTRATO_CAT_ICONS[c] || ''} ${c}</option>`).join('')}
      </select></td>
      <td class="${cls}" style="font-family:var(--fm);white-space:nowrap">${t.valor >= 0 ? '+' : ''}${fmt(t.valor)}</td>
      <td><button class="del-btn" onclick="extratoRemover('${t.id}')" title="Remover">🗑</button></td>
    </tr>`;
  }

  html += `</tbody></table></div>`;
  area.innerHTML = html;
}

// ── Recategorizar transação ──────────────────────────────────────
function extratoRecategorizar(id, novaCat) {
  const txns = extratoLoad();
  const t = txns.find(x => x.id === id);
  if (t) {
    // Salva regra customizada baseada na descrição
    categoriaSalvarRegra(t.descricao, novaCat);
    t.categoria = novaCat;
    extratoSave(txns);
    renderGastos();
    renderSaudeFinanceira();
  }
}

// ── Remover transação ────────────────────────────────────────────
function extratoRemover(id) {
  const txns = extratoLoad().filter(x => x.id !== id);
  extratoSave(txns);
  renderExtrato();
  renderGastos();
  renderSaudeFinanceira();
}

// ── Constantes de categorias ─────────────────────────────────────
const EXTRATO_CATEGORIAS = ['Moradia', 'Alimentação', 'Transporte', 'Contas', 'Lazer', 'Investimento', 'Transferência', 'Outros'];
const EXTRATO_CAT_ICONS = {
  'Moradia': '🏠', 'Alimentação': '🍽', 'Transporte': '🚗',
  'Contas': '💡', 'Lazer': '🎉', 'Investimento': '📈',
  'Transferência': '🔄', 'Outros': '📋'
};
