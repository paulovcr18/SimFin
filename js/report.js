// ════════════════════════════════════════════════════════════════
// RELATÓRIO PDF — SimFin
// ════════════════════════════════════════════════════════════════

const REPORT_CFG_KEY = 'simfin_report_cfg';

const REPORT_SECTIONS = [
  { key: 'folha',          label: 'Folha de Pagamento',         icon: '🧾', desc: 'Detalhamento CLT/PJ, INSS, IR e benefícios' },
  { key: 'aportes',        label: 'Aportes por Pessoa',         icon: '👥', desc: 'Divisão de investimento, renda e extras por pessoa' },
  { key: 'orcamento',      label: 'Orçamento (Rateio)',         icon: '💰', desc: 'Distribuição da renda mensal por categoria' },
  { key: 'projecao',       label: 'Projeção Patrimonial',       icon: '📈', desc: 'Gráfico + tabela anual de evolução do patrimônio' },
  { key: 'acompanhamento', label: 'Acompanhamento Mensal',      icon: '📋', desc: 'Histórico real vs simulado, desvios e taxas' },
  { key: 'carteira',       label: 'Carteira de Investimentos',  icon: '💼', desc: 'Posições em renda variável e renda fixa' },
  { key: 'metas',          label: 'Metas Financeiras',          icon: '🎯', desc: 'Lista de metas com prazo e viabilidade' },
];

// ── Config persistence ──
function reportCfgLoad() {
  try { return JSON.parse(localStorage.getItem(REPORT_CFG_KEY)) || {}; } catch { return {}; }
}
function reportCfgSave(cfg) {
  localStorage.setItem(REPORT_CFG_KEY, JSON.stringify(cfg));
}
function reportCfgGet() {
  const s = reportCfgLoad();
  return {
    titulo:          s.titulo          ?? 'Relatório Financeiro Familiar',
    autor:           s.autor           ?? '',
    incluirGraficos: s.incluirGraficos ?? true,
    sections: REPORT_SECTIONS.reduce((acc, sec) => {
      acc[sec.key] = s.sections?.[sec.key] ?? true;
      return acc;
    }, {}),
  };
}

// ── Render config screen ──
function renderReportScreen() {
  const cfg = reportCfgGet();

  document.getElementById('rptTitulo').value = cfg.titulo;
  document.getElementById('rptAutor').value  = cfg.autor;
  document.getElementById('rptGraficos').checked = cfg.incluirGraficos;

  REPORT_SECTIONS.forEach(sec => {
    const el = document.getElementById(`rptSec_${sec.key}`);
    if (el) el.checked = cfg.sections[sec.key];
  });

  _updateReportPreview(cfg);
}

function onReportInput() {
  const cfg = _readCfgFromUI();
  reportCfgSave(cfg);
  _updateReportPreview(cfg);
}

function _readCfgFromUI() {
  const sections = {};
  REPORT_SECTIONS.forEach(s => {
    const el = document.getElementById(`rptSec_${s.key}`);
    sections[s.key] = el ? el.checked : true;
  });
  return {
    titulo:          document.getElementById('rptTitulo')?.value || 'Relatório Financeiro Familiar',
    autor:           document.getElementById('rptAutor')?.value  || '',
    incluirGraficos: document.getElementById('rptGraficos')?.checked ?? true,
    sections,
  };
}

function _updateReportPreview(cfg) {
  const area = document.getElementById('rptPreviewArea');
  if (!area) return;

  const track   = loadTrack ? loadTrack() : [];
  const goals   = typeof loadGoals  === 'function' ? loadGoals()  : [];
  const carteira = JSON.parse(localStorage.getItem('simfin_carteira') || '[]');
  const hasBaseline = typeof baselineLoad === 'function' && !!baselineLoad();

  let pages = 1; // capa sempre
  const items = [];
  items.push({ icon: '🏠', label: 'Capa & Resumo Executivo', sub: 'Métricas principais, renda, aporte e patrimônio projetado', ok: true });

  REPORT_SECTIONS.forEach(sec => {
    if (!cfg.sections[sec.key]) return;
    let sub = sec.desc;
    let warn = false;
    if (sec.key === 'projecao')       { pages += 1; sub = `${(snaps||[]).length} snapshots anuais${cfg.incluirGraficos ? ' + gráfico' : ''}`; }
    if (sec.key === 'orcamento')      { pages += 1; }
    if (sec.key === 'folha')          { pages += 1; }
    if (sec.key === 'acompanhamento') { pages += Math.ceil((track.length||1)/25); sub = `${track.length} meses registrados${hasBaseline ? ' · com Dia 0' : ''}`; warn = track.length === 0; }
    if (sec.key === 'metas')          { pages += 1; sub = `${goals.length} meta${goals.length !== 1 ? 's' : ''} cadastrada${goals.length !== 1 ? 's' : ''}`; warn = goals.length === 0; }
    if (sec.key === 'carteira')       { pages += 1; sub = `${carteira.length} ativo${carteira.length !== 1 ? 's' : ''}`; warn = carteira.length === 0; }
    items.push({ icon: sec.icon, label: sec.label, sub, ok: !warn, warn });
  });

  area.innerHTML = items.map(it => `
    <div class="rpt-preview-item ${it.warn ? 'rpt-pi-warn' : ''}">
      <span class="rpt-pi-icon">${it.icon}</span>
      <div>
        <div class="rpt-pi-label">${it.label}</div>
        <div class="rpt-pi-sub">${it.sub}</div>
      </div>
      <span class="rpt-pi-status">${it.warn ? '⚠️' : '✓'}</span>
    </div>`).join('') +
    `<div class="rpt-pages-est">~${pages} página${pages !== 1 ? 's' : ''}</div>`;
}

// ════════════════════════════════════════════════════════════════
// PDF GENERATION
// ════════════════════════════════════════════════════════════════

// ── PDF color palette ──
const _C = {
  green:  [93,  212, 160],
  blue:   [106, 172, 230],
  red:    [224, 108, 108],
  gold:   [230, 184, 106],
  purple: [167, 139, 250],
  dark:   [15,  20,  40 ],
  text:   [25,  35,  55 ],
  muted:  [100, 115, 135],
  light:  [160, 175, 190],
  bg:     [243, 246, 250],
  bgrow:  [248, 250, 253],
  white:  [255, 255, 255],
  border: [210, 220, 232],
};

// ── Helper formatters for PDF (avoid locale issues with fmt()) ──
function _pv(v) {
  if (v === null || v === undefined || isNaN(v)) return '-';
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pvs(v) {
  if (v === null || v === undefined || isNaN(v)) return '-';
  return (v >= 0 ? '+' : '-') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pvk(v) {
  if (!v && v !== 0) return '-';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(2).replace('.', ',') + 'M';
  if (a >= 1e3) return s + 'R$ ' + (a / 1e3).toFixed(1).replace('.', ',') + 'K';
  return s + 'R$ ' + a.toFixed(0);
}
function _pct(v) { return v == null || isNaN(v) ? '-' : v.toFixed(2) + '%'; }
function _mes(m) { try { return new Date(m + '-02').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }); } catch { return m; } }

// Remove emoji e caracteres fora do suporte helvetica (mantém Latin + acentuação PT-BR)
function _clean(str) {
  return (str || '').replace(/[^\u0000-\u024F\s\(\)\/\-\·\:\.\,\%\+\*\!\?\"\'&@#]/g, '').replace(/\s{2,}/g, ' ').trim();
}

// Captura chart em resolução 1.5× como JPEG (balanço: qualidade vs. tamanho)
// JPEG reduz ~90% vs PNG para gráficos de linhas/barras com fundo
function _chartImg(chart) {
  if (!chart) return null;
  try {
    const canvas = chart.canvas;
    const scale  = 1.5;
    const MAX_PX = 1800; // cap para evitar arquivos enormes
    const w = Math.min(canvas.width  * scale, MAX_PX);
    const h = Math.round(canvas.height * (w / (canvas.width * scale)) * scale);
    const offscreen = document.createElement('canvas');
    offscreen.width  = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    // fundo branco (JPEG não suporta transparência)
    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
    return offscreen.toDataURL('image/jpeg', 0.82);
  } catch (e) {
    try { return chart.toBase64Image('image/jpeg', 0.82); } catch { return null; }
  }
}

let _pNum = 0;
const W = 210, H = 297, ML = 14, MR = 14, MT = 22, MB = 15;
const CW = W - ML - MR;

function _header(doc, reportTitle) {
  _pNum++;
  doc.setFillColor(..._C.green);
  doc.rect(0, 0, W, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(..._C.green);
  doc.text('SimFin', ML, 11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(..._C.muted);
  doc.text(_clean(reportTitle), ML + 14, 11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(..._C.light);
  doc.text(String(_pNum), W - MR, 11, { align: 'right' });
  doc.setDrawColor(..._C.border);
  doc.setLineWidth(0.3);
  doc.line(ML, 14, W - MR, 14);
}

function _sectionTitle(doc, text, y) {
  const label = _clean(text);
  doc.setFillColor(..._C.green);
  doc.rect(ML, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(..._C.dark);
  doc.text(label, ML + 4, y + 5);
  return y + 11;
}

function _checkPage(doc, y, needed, cfg) {
  if (y + needed > H - MB) {
    doc.addPage();
    _header(doc, cfg._title);
    return MT + 2;
  }
  return y;
}

// ── AutoTable defaults ──
function _tbl(doc, head, body, startY, colStyles) {
  doc.autoTable({
    head,
    body,
    startY,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      font: 'helvetica',
      textColor: _C.text,
      lineColor: _C.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: _C.dark,
      textColor: _C.green,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: _C.bgrow },
    columnStyles: colStyles || {},
    margin: { left: ML, right: MR },
  });
  return (doc.lastAutoTable?.finalY || startY) + 6;
}

// ════════════════════════════════════════════════════════════════
// SECTIONS
// ════════════════════════════════════════════════════════════════

function _secCapa(doc, data, cfg) {
  // Full dark cover
  doc.setFillColor(..._C.dark);
  doc.rect(0, 0, W, H, 'F');

  // Top accent bar
  doc.setFillColor(..._C.green);
  doc.rect(0, 0, W, 8, 'F');

  // SimFin brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  doc.setTextColor(..._C.green);
  doc.text('SimFin', ML, 55);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(..._C.light);
  doc.text('Simulador Financeiro Familiar', ML, 65);

  // Divider
  doc.setDrawColor(..._C.green);
  doc.setLineWidth(0.5);
  doc.line(ML, 72, ML + 80, 72);

  // Report title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(..._C.white);
  const titleLines = doc.splitTextToSize(_clean(cfg.titulo), CW);
  doc.text(titleLines, ML, 84);

  // Author & date
  let ay = 84 + titleLines.length * 8;
  if (cfg.autor) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(..._C.muted);
    doc.text(_clean(cfg.autor), ML, ay + 6);
    ay += 6;
  }
  doc.setFontSize(9);
  doc.setTextColor(..._C.muted);
  const now = new Date();
  doc.text('Gerado em ' + now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), ML, ay + 8);

  // Scenario chip
  if (data.scenarioName) {
    doc.setFontSize(8);
    doc.setFillColor(30, 40, 70);
    doc.roundedRect(ML, ay + 16, 60, 8, 2, 2, 'F');
    doc.setTextColor(..._C.blue);
    doc.text('Cenário: ' + data.scenarioName, ML + 4, ay + 21.5);
  }

  // Key metric boxes
  const metrics = [
    { label: 'Renda Operacional', value: _pvk(data.rendaOp), color: _C.green },
    { label: 'Aporte Mensal',     value: _pvk(data.aporte),  color: _C.blue  },
    { label: 'Patrimônio Proj.',  value: _pvk(data.patFinal),color: _C.gold  },
    { label: `Taxa (a.a.)`,       value: (data.taxa || 0) + '%', color: _C.purple },
  ];

  const bW = (CW - 12) / 4;
  const bX = ML;
  const bY = 155;

  metrics.forEach((m, i) => {
    const x = bX + i * (bW + 4);
    doc.setFillColor(22, 30, 56);
    doc.roundedRect(x, bY, bW, 28, 3, 3, 'F');
    doc.setFillColor(...m.color);
    doc.rect(x, bY, bW, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...m.color);
    doc.text(m.value, x + bW / 2, bY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(..._C.muted);
    doc.text(m.label, x + bW / 2, bY + 23, { align: 'center' });
  });

  // Snapshot pills (projection milestones)
  const pills = (data.snaps || []).filter((_, i) => i % 5 === 0 || i === (data.snaps.length - 1));
  let px = ML, py = 200;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  pills.forEach(s => {
    const lbl = 'Ano ' + s.ano + ': ' + _pvk(s.pat);
    const tw = doc.getTextWidth(lbl) + 8;
    if (px + tw > W - MR) { px = ML; py += 9; }
    doc.setFillColor(22, 30, 56);
    doc.roundedRect(px, py, tw, 6.5, 1.5, 1.5, 'F');
    doc.setTextColor(..._C.light);
    doc.text(lbl, px + 4, py + 4.5);
    px += tw + 4;
  });

  // Per-person summary
  const pessoas = [
    { label: 'Pessoa 1', f: data.f1 },
    { label: 'Pessoa 2', f: data.f2 },
  ].filter(p => p.f && (p.f.bruto > 0 || (p.f.fat && p.f.fat > 0)));

  if (pessoas.length) {
    const summaryY = Math.max(py + 14, 228);
    const colW = (CW - 4) / pessoas.length;
    pessoas.forEach(({ label, f }, i) => {
      const x = ML + i * (colW + 4);
      doc.setFillColor(22, 30, 56);
      doc.roundedRect(x, summaryY, colW, 40, 3, 3, 'F');
      doc.setFillColor(..._C.blue);
      doc.rect(x, summaryY, colW, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(..._C.blue);
      const tipoLabel = f.tipo === 'PJ'
        ? label + ' - PJ (' + _clean(f.regimePJ === 'simples' ? 'Simples' : 'Lucro Presumido') + ')'
        : label + ' - CLT';
      doc.text(tipoLabel, x + colW / 2, summaryY + 7, { align: 'center' });

      const lines = [
        ['Bruto / Fatur.',  f.tipo === 'PJ' ? _pvk(f.fat) : _pvk(f.bruto)],
        ['Liq. Mensal',     _pvk(f.liq)],
        ['Renda Real',      _pvk(f.rendaReal)],
        ['INSS + IR',       '-' + _pvk((f.inss||0) + (f.irrf||0))],
      ];
      lines.forEach(([lbl, val], li) => {
        const ly = summaryY + 14 + li * 6.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(..._C.muted);
        doc.text(lbl, x + 4, ly);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(..._C.light);
        doc.text(val, x + colW - 4, ly, { align: 'right' });
      });
    });
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(..._C.muted);
  doc.text('Gerado pelo SimFin - Simulador Financeiro Familiar', W / 2, H - 10, { align: 'center' });
}

function _secProjecao(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, '📈  Projeção Patrimonial', y);

  // Summary line
  doc.setFontSize(8.5);
  doc.setTextColor(..._C.muted);
  doc.setFont('helvetica', 'normal');
  const anos = data.snaps.length - 1;
  doc.text(
    `Taxa: ${data.taxa}% a.a.  ·  Horizonte: ${anos} anos  ·  Aporte inicial: ${_pv(data.aporte)}/mês  ·  Patrimônio final: ${_pvk(data.patFinal)}`,
    ML, y
  );
  y += 6;

  // Chart image
  if (cfg.incluirGraficos && typeof myChart !== 'undefined' && myChart) {
    const img = _chartImg(myChart);
    if (img) {
      const imgH = 75;
      y = _checkPage(doc, y, imgH + 4, cfg);
      doc.addImage(img, 'PNG', ML, y, CW, imgH);
      y += imgH + 6;
    }
  }

  y = _checkPage(doc, y, 30, cfg);

  // Table
  const inflAnual = parseFloat(document.getElementById('taxaInflacao')?.value) || 4.5;
  const head = [['Ano', 'Patrimônio', 'Valor Hoje', 'Aportado', 'Rend. Anual', 'Aporte/mês']];
  const body = data.snaps.map(s => {
    const patReal = s.ano > 0 ? s.pat / Math.pow(1 + inflAnual / 100, s.ano) : null;
    return [
      s.ano === 0 ? 'Hoje' : 'Ano ' + s.ano,
      _pvk(s.pat),
      patReal !== null ? _pvk(patReal) : '-',
      _pvk(s.totAp),
      _pvk(s.rendAnual),
      _pvk(s.apN),
    ];
  });
  _tbl(doc, head, body, y, {
    0: { halign: 'center', cellWidth: 18 },
    1: { halign: 'right' },
    2: { halign: 'right' },
    3: { halign: 'right' },
    4: { halign: 'right' },
    5: { halign: 'right' },
  });
}

function _secAportes(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, 'Divisao de Aportes por Pessoa', y);

  const snap0  = data.snaps[0] || {};
  const f1     = snap0.f1 || data.f1;
  const f2     = snap0.f2 || data.f2;
  const pI     = typeof getRateioComputed === 'function' ? getRateioComputed().pctInvest : 30;
  const pIf    = pI / 100;

  const op1    = f1.rendaOp || f1.rendaReal || 0;
  const op2    = f2.rendaOp || f2.rendaReal || 0;
  const opTot  = op1 + op2;
  const ap1    = op1 * pIf;
  const ap2    = op2 * pIf;
  const apTot  = ap1 + ap2;

  const r1     = f1.rendaReal || 0;
  const r2     = f2.rendaReal || 0;
  const ext1   = f1.extrasAnuais || 0;
  const ext2   = f2.extrasAnuais || 0;

  const bW1    = opTot > 0 ? (op1 / opTot * 100).toFixed(1) : '50.0';
  const bW2    = opTot > 0 ? (op2 / opTot * 100).toFixed(1) : '50.0';

  // ── Summary bar ──
  doc.setFillColor(22, 30, 56);
  doc.roundedRect(ML, y, CW, 18, 3, 3, 'F');
  doc.setFillColor(..._C.green);
  doc.rect(ML, y, CW, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(..._C.white);
  doc.text('Aporte Total do Casal / Mes', ML + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(..._C.muted);
  doc.text(`${pI}% da renda operacional`, ML + 4, y + 13);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(..._C.green);
  doc.text(_pv(apTot), ML + CW - 4, y + 9, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(..._C.muted);
  doc.text(_pvk(apTot * 12) + '/ano', ML + CW - 4, y + 15, { align: 'right' });
  y += 22;

  // ── Proportion bar ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(..._C.muted);
  doc.text(`Pessoa 1 - ${bW1}% da renda operacional`, ML, y);
  doc.text(`Pessoa 2 - ${bW2}% da renda operacional`, ML + CW, y, { align: 'right' });
  y += 3.5;
  const bH = 5;
  const b1W = CW * (parseFloat(bW1) / 100);
  doc.setFillColor(..._C.green);
  doc.roundedRect(ML, y, b1W, bH, 1.5, 1.5, 'F');
  doc.setFillColor(..._C.gold);
  doc.roundedRect(ML + b1W, y, CW - b1W, bH, 1.5, 1.5, 'F');
  y += bH + 8;

  // ── Per-person cards ──
  const colW = (CW - 4) / 2;
  [[f1, op1, ap1, r1, ext1, _C.green, 'Pessoa 1'], [f2, op2, ap2, r2, ext2, _C.gold, 'Pessoa 2']].forEach(([f, op, ap, r, ext, color, lbl], i) => {
    const x = ML + i * (colW + 4);
    doc.setFillColor(22, 30, 56);
    doc.roundedRect(x, y, colW, 78, 3, 3, 'F');
    doc.setFillColor(...color);
    doc.rect(x, y, colW, 2, 'F');

    // Name + type badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...color);
    doc.text(lbl, x + 4, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setFillColor(...(f.tipo === 'PJ' ? _C.gold : _C.green));
    doc.roundedRect(x + colW - 22, y + 4, 18, 6, 1, 1, 'F');
    doc.setTextColor(..._C.dark);
    doc.text(f.tipo, x + colW - 13, y + 8.5, { align: 'center' });

    // Aporte value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...color);
    doc.text(_pv(ap), x + colW / 2, y + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(..._C.muted);
    doc.text(`por mes - ${_pvk(ap * 12)}/ano`, x + colW / 2, y + 27.5, { align: 'center' });

    // Rows
    const rows = [
      ['Renda operacional/mes', _pv(op)],
      [`Aporte (${pI}%)`,       _pv(ap)],
      ['Sobra p/ gastos',       _pv(op - ap)],
      ['Renda diluida',         _pv(r)],
      ['Extras anuais',         ext > 0 ? _pvk(ext) : 'N/A'],
      ['Aporte extra anual',    ext > 0 ? _pvk(ext * pIf) : 'N/A'],
    ];
    rows.forEach(([lkey, val], ri) => {
      const ry = y + 33 + ri * 7.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(..._C.muted);
      doc.text(lkey, x + 4, ry);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(..._C.light);
      doc.text(val, x + colW - 4, ry, { align: 'right' });
    });
  });
  y += 82;

  // ── FGTS ──
  const fgtsAnual = ((f1.fgts || 0) + (f2.fgts || 0)) * 12;
  if (fgtsAnual > 0) {
    y = _checkPage(doc, y, 10, cfg);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(..._C.muted);
    doc.text(`FGTS Anual do casal: `, ML, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(..._C.green);
    doc.text(_pvk(fgtsAnual), ML + 42, y);
    doc.setTextColor(..._C.muted);
    doc.setFont('helvetica', 'normal');
    doc.text('(patrimônio trabalhista, não investido automaticamente)', ML + 42 + doc.getTextWidth(_pvk(fgtsAnual)) + 3, y);
    y += 8;
  }

  // ── Snapshot table for selected years ──
  y = _checkPage(doc, y, 40, cfg);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(..._C.muted);
  doc.text('Evolucao do aporte ao longo dos anos (com reajuste salarial)', ML, y);
  y += 5;

  const milestones = data.snaps.filter((s, i) => i === 0 || i % 5 === 0 || i === data.snaps.length - 1);
  const head = [['Ano', 'Aporte P1/mes', 'Aporte P2/mes', 'Aporte Casal/mes', 'Extras Anuais', 'Renda Op. Casal']];
  const body = milestones.map(s => {
    const sf1 = s.f1 || {}; const sf2 = s.f2 || {};
    const sop1 = sf1.rendaOp || sf1.rendaReal || 0;
    const sop2 = sf2.rendaOp || sf2.rendaReal || 0;
    const sopT = sop1 + sop2;
    const sExt = (sf1.extrasAnuais || 0) + (sf2.extrasAnuais || 0);
    return [
      s.ano === 0 ? 'Hoje' : 'Ano ' + s.ano,
      _pvk(sop1 * pIf),
      _pvk(sop2 * pIf),
      _pvk(sopT * pIf),
      sExt > 0 ? _pvk(sExt * pIf) : 'N/A',
      _pvk(sopT),
    ];
  });
  _tbl(doc, head, body, y, {
    0: { halign: 'center', cellWidth: 16 },
    1: { halign: 'right' },
    2: { halign: 'right' },
    3: { halign: 'right' },
    4: { halign: 'right' },
    5: { halign: 'right' },
  });
}

function _secOrcamento(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, '💰  Orçamento Mensal (Rateio)', y);

  doc.setFontSize(8.5);
  doc.setTextColor(..._C.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(`Renda Operacional: ${_pv(data.rendaOp)}  ·  Renda Real (diluída): ${_pv(data.rendaReal)}`, ML, y);
  y += 8;

  const pcts   = data.pcts || {};
  const modes  = (typeof _getRateioMode === 'function') ? _getRateioMode() : {};
  const rOp    = data.rendaOp || 0;

  const head = [['Categoria', '% Renda', 'R$/mês', 'R$/ano']];
  let totalPct = 0, totalMes = 0;
  const body = BUDGET_CATEGORIES.map(cat => {
    const isBrl = modes[cat.key] === 'brl';
    let pct, brl;
    if (isBrl) {
      const raw = parseFloat(document.getElementById(cat.key)?.value) || 0;
      brl = raw;
      pct = rOp > 0 ? raw / rOp * 100 : 0;
    } else {
      pct = parseFloat(document.getElementById(cat.key)?.value) || 0;
      brl = rOp * pct / 100;
    }
    totalPct += pct;
    totalMes += brl;
    return [_clean(cat.label) || cat.key, _pct(pct), _pv(brl), _pv(brl * 12)];
  });
  body.push(['Total', _pct(totalPct), _pv(totalMes), _pv(totalMes * 12)]);

  y = _tbl(doc, head, body, y, {
    0: { halign: 'left'  },
    1: { halign: 'right' },
    2: { halign: 'right' },
    3: { halign: 'right' },
  });

  // Remaining
  const remaining = rOp - totalMes;
  y = _checkPage(doc, y, 16, cfg);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(remaining >= 0 ? _C.green[0] : _C.red[0], remaining >= 0 ? _C.green[1] : _C.red[1], remaining >= 0 ? _C.green[2] : _C.red[2]);
  doc.text(`Saldo não alocado: ${_pv(remaining)}/mês`, ML, y);
}

function _secFolha(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, '🧾  Folha de Pagamento', y);

  const pessoas = [
    { label: 'Pessoa 1', f: data.f1 },
    { label: 'Pessoa 2', f: data.f2 },
  ].filter(p => p.f && (p.f.bruto > 0 || p.f.fat > 0));

  pessoas.forEach(({ label, f }) => {
    y = _checkPage(doc, y, 50, cfg);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(..._C.blue);
    doc.text(_clean(`${label}  -  ${f.tipo}${f.tipo === 'PJ' ? ' (' + (f.regimePJ === 'simples' ? 'Simples Nacional' : 'Lucro Presumido') + ')' : ''}`), ML, y);
    y += 5;

    let rows;
    if (f.tipo === 'CLT') {
      rows = [
        ['Salário Bruto',    _pv(f.bruto),    'FGTS (8%)',    _pv(f.fgts)],
        ['INSS',            '-' + _pv(f.inss), '13° Líquido', _pv(f.liq13)],
        ['IRRF',            '-' + _pv(f.irrf), 'Férias Líq.', _pv(f.liqFer || f.fL)],
        ['Líquido Mensal',  _pv(f.liq),        'PLR Líquido', f.plr > 0 ? _pv(f.plrL) : '-'],
        ['VR / VA',         _pv(f.vr || 0),    'Renda Real',  _pv(f.rendaReal)],
        ['Renda Operacional', _pv(f.rendaOp),  'Extras Anuais', _pv(f.extrasAnuais)],
      ];
    } else {
      rows = [
        ['Faturamento',     _pv(f.fat),          'Imposto Empresa',   _pv(f.impostoEmpresa)],
        ['Pró-labore',      _pv(f.prolabore||f.bruto), 'INSS Pró-lab.', '-' + _pv(f.inss)],
        ['IR Pró-labore',  '-' + _pv(f.irrf),    'Dist. Lucros',      _pv(f.distribuicao)],
        ['Líquido Mensal', _pv(f.liq),            'Renda Real',        _pv(f.rendaReal)],
        ['Renda Operacional', _pv(f.rendaOp),     'Alíq. Imposto',     _pct((f.aliqImposto||0)*100)],
      ];
    }

    doc.autoTable({
      body: rows,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: _C.text, lineColor: _C.border, lineWidth: 0.2 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: _C.muted, cellWidth: 44 },
        1: { halign: 'right', cellWidth: 44 },
        2: { fontStyle: 'bold', textColor: _C.muted, cellWidth: 44 },
        3: { halign: 'right', cellWidth: 44 },
      },
      alternateRowStyles: { fillColor: _C.bgrow },
      margin: { left: ML, right: MR },
    });
    y = (doc.lastAutoTable?.finalY || y) + 10;
  });
}

function _secAcompanhamento(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, '📋  Acompanhamento Mensal', y);

  const entries = data.track;
  if (!entries.length) {
    doc.setFontSize(9); doc.setTextColor(..._C.muted);
    doc.text('Nenhum registro de acompanhamento encontrado.', ML, y + 4);
    return;
  }

  const bl = typeof baselineLoad === 'function' ? baselineLoad() : null;
  const [by, bm] = bl ? bl.definidoEm.split('-').map(Number) : [null, null];
  const anchorEntry = bl ? entries.find(e => { const [ey,em]=e.mes.split('-').map(Number); return (ey-by)*12+(em-bm)>=0; }) : null;
  const anchorReal  = anchorEntry ? anchorEntry.patrimonio : 0;
  const anchorProj  = bl ? (typeof baselinePatNoMes === 'function' ? baselinePatNoMes(0, bl) : 0) : 0;
  const blOffset    = anchorReal - (anchorProj || 0);

  const hasBaseline = !!bl;
  const head = hasBaseline
    ? [['Mês', 'Real', 'Simulado', 'Esperado (Dia 0)', 'Desvio (Dia 0)', 'Taxa/mês', 'Taxa a.a.']]
    : [['Mês', 'Patrimônio Real', 'Pat. Simulado', 'Aporte', 'Rendimento', 'Taxa/mês', 'Taxa a.a.']];

  const body = entries.map(e => {
    const label = _mes(e.mes);
    const simPat = (() => {
      if (!snaps || snaps.length < 2) return null;
      const firstMes = entries[0].mes;
      const [fy,fm] = firstMes.split('-').map(Number);
      const [ey,em] = e.mes.split('-').map(Number);
      const md = (ey-fy)*12+(em-fm);
      return typeof patNoMes === 'function' ? patNoMes(md) : null;
    })();

    if (hasBaseline) {
      const [ey,em] = e.mes.split('-').map(Number);
      const md = (ey-by)*12+(em-bm);
      const esperado = md >= 0 && typeof baselinePatNoMes === 'function'
        ? baselinePatNoMes(md, bl) + blOffset
        : null;
      const desvio = esperado !== null ? e.patrimonio - esperado : null;
      return [
        label,
        _pv(e.patrimonio),
        simPat !== null ? _pvk(simPat) : '-',
        esperado !== null ? _pvk(esperado) : 'Antes Dia 0',
        desvio !== null ? _pvs(desvio) : '-',
        e.taxaMensal != null ? _pct(e.taxaMensal) : '-',
        e.taxaAnual  != null ? _pct(e.taxaAnual)  : '-',
      ];
    } else {
      return [
        label,
        _pv(e.patrimonio),
        simPat !== null ? _pvk(simPat) : '-',
        _pv(e.aporte || 0),
        e.rendimento != null ? _pvs(e.rendimento) : '-',
        e.taxaMensal != null ? _pct(e.taxaMensal) : '-',
        e.taxaAnual  != null ? _pct(e.taxaAnual)  : '-',
      ];
    }
  });

  doc.autoTable({
    head, body,
    startY: y,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: _C.text, lineColor: _C.border, lineWidth: 0.2 },
    headStyles: { fillColor: _C.dark, textColor: _C.green, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: _C.bgrow },
    margin: { left: ML, right: MR },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === (hasBaseline ? 4 : 4)) {
        const v = d.cell.raw;
        if (v && v.startsWith('+')) d.cell.styles.textColor = _C.green;
        else if (v && v.startsWith('-')) d.cell.styles.textColor = _C.red;
      }
    },
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
  });

  y = (doc.lastAutoTable?.finalY || y) + 8;

  // Summary stats
  const comRend = entries.filter(e => e.rendimento !== null);
  const totalRend = comRend.reduce((s, e) => s + e.rendimento, 0);
  const totalAp   = entries.reduce((s, e) => s + (e.aporte || 0), 0);
  const best  = comRend.length ? comRend.reduce((a, b) => a.rendimento > b.rendimento ? a : b) : null;
  const worst = comRend.length ? comRend.reduce((a, b) => a.rendimento < b.rendimento ? a : b) : null;

  y = _checkPage(doc, y, 20, cfg);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(..._C.muted);
  doc.text('Resumo:', ML, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const summaryLines = [
    `Total aportado: ${_pv(totalAp)}  -  Total rendimentos: ${_pvs(totalRend)}`,
    best  ? `Melhor mes: ${_mes(best.mes)} (${_pvs(best.rendimento)})` : '',
    worst ? `Pior mes: ${_mes(worst.mes)} (${_pvs(worst.rendimento)})` : '',
  ].filter(Boolean);
  summaryLines.forEach(line => { doc.text(line, ML, y); y += 5; });

  // Comparison chart
  if (cfg.incluirGraficos && typeof compareChart !== 'undefined' && compareChart) {
    const img = _chartImg(compareChart);
    if (img) {
      y = _checkPage(doc, y, 80, cfg);
      doc.addImage(img, 'PNG', ML, y, CW, 75);
    }
  }
}

function _secMetas(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, '🎯  Metas Financeiras', y);

  const goals = data.goals;
  if (!goals.length) {
    doc.setFontSize(9); doc.setTextColor(..._C.muted);
    doc.text('Nenhuma meta cadastrada.', ML, y + 4);
    return;
  }

  const head = [['Meta', 'Categoria', 'Valor', 'Prazo', 'Pat. Esperado', 'Situação']];
  const body = goals.map(g => {
    const cat  = (typeof GOAL_CATS !== 'undefined' && GOAL_CATS[g.cat]) ? GOAL_CATS[g.cat].label : (g.cat || '-');
    const prazo = g.data || (g.meses ? g.meses + ' meses' : '-');
    const patEsp = typeof patNoMes === 'function' ? patNoMes(g.meses || 0) : null;
    const situacao = patEsp !== null
      ? (patEsp >= g.valor ? 'Viavel' : 'Faltam ' + _pvk(g.valor - patEsp))
      : '-';
    return [g.name || '-', cat, _pv(g.valor), prazo, patEsp !== null ? _pvk(patEsp) : '-', situacao];
  });

  y = _tbl(doc, head, body, y, {
    0: { halign: 'left', cellWidth: 45 },
    1: { halign: 'left', cellWidth: 32 },
    2: { halign: 'right' },
    3: { halign: 'center' },
    4: { halign: 'right' },
    5: { halign: 'left' },
  });

  // Goals chart
  if (cfg.incluirGraficos && typeof goalsChart !== 'undefined' && goalsChart) {
    const img = _chartImg(goalsChart);
    if (img) {
      y = _checkPage(doc, y, 80, cfg);
      doc.addImage(img, 'PNG', ML, y, CW, 75);
    }
  }
}

function _secCarteira(doc, data, cfg) {
  doc.addPage();
  _header(doc, cfg._title);
  let y = MT + 2;
  y = _sectionTitle(doc, '💼  Carteira de Investimentos', y);

  const cart = data.carteira;
  if (!cart.length) {
    doc.setFontSize(9); doc.setTextColor(..._C.muted);
    doc.text('Nenhuma posicao registrada na carteira.', ML, y + 4);
    return;
  }

  const head = [['Ticker / Ativo', 'Qtd.', 'PM (R$)', 'Custo Total', 'Cotacao', 'Valor Atual', 'Resultado', '%']];
  const body = cart.map(p => {
    const custo  = (p.qtd || 0) * (p.pm || 0);
    const atual  = p.valorAtual ?? ((p.qtd || 0) * (p.cotacao || p.pm || 0));
    const result = atual - custo;
    const pctR   = custo > 0 ? result / custo * 100 : 0;
    return [
      (p.ticker || p.nome || '-').toUpperCase(),
      p.qtd != null ? p.qtd.toLocaleString('pt-BR') : '-',
      p.pm   != null ? _pv(p.pm) : '-',
      _pv(custo),
      p.cotacao != null ? _pv(p.cotacao) : '-',
      atual ? _pvk(atual) : '-',
      _pvs(result),
      pctR ? _pct(pctR) : '-',
    ];
  });

  // Totals row
  const totalCusto  = cart.reduce((s, p) => s + (p.qtd||0)*(p.pm||0), 0);
  const totalAtual  = cart.reduce((s, p) => s + (p.valorAtual ?? (p.qtd||0)*(p.cotacao||p.pm||0)), 0);
  const totalResult = totalAtual - totalCusto;
  body.push(['TOTAL', '', '', _pv(totalCusto), '', _pvk(totalAtual), _pvs(totalResult), totalCusto>0 ? _pct(totalResult/totalCusto*100) : '-']);

  y = _tbl(doc, head, body, y, {
    0: { halign: 'left' },
    1: { halign: 'right' },
    2: { halign: 'right' },
    3: { halign: 'right' },
    4: { halign: 'right' },
    5: { halign: 'right' },
    6: { halign: 'right' },
    7: { halign: 'right' },
  });

  // Allocation chart
  if (cfg.incluirGraficos && window._cartAlocChart) {
    const img = _chartImg(window._cartAlocChart);
    if (img) {
      y = _checkPage(doc, y, 75, cfg);
      doc.addImage(img, 'PNG', ML + CW/2 - 35, y, 70, 70);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// MAIN GENERATE
// ════════════════════════════════════════════════════════════════

async function generatePDF() {
  if (!window.jspdf) {
    showToast('Biblioteca PDF não carregada. Verifique a conexão.', '❌', 3500);
    return;
  }

  const btn = document.getElementById('btnGerarPdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando...'; }

  try {
    const cfg = _readCfgFromUI();
    reportCfgSave(cfg);

    // ── Collect data ──
    const [p1b,p1v,p1p,p2b,p2v,p2p] = ['p1bruto','p1vr','p1plr','p2bruto','p2vr','p2plr'].map(id => typeof gP === 'function' ? gP(id) : 0);

    const f1 = calcFolha(p1b, p1v, p1p, 1);
    const f2 = calcFolha(p2b, p2v, p2p, 2);
    const rendaOp  = (f1.rendaOp  || f1.rendaReal)  + (f2.rendaOp  || f2.rendaReal);
    const rendaReal= f1.rendaReal + f2.rendaReal;
    const taxa     = parseFloat(document.getElementById('taxaAnual')?.value) || 10;
    const anos     = parseInt(document.getElementById('anos')?.value) || 20;
    const pcts     = typeof getPcts === 'function' ? getPcts() : {};
    const pI       = typeof getRateioComputed === 'function' ? getRateioComputed().pctInvest : (pcts.pctInvest || 35);
    const aporte   = rendaOp * pI / 100;
    const curSnaps = (typeof snaps !== 'undefined' && snaps.length) ? snaps : [];
    const patFinal = curSnaps.length ? curSnaps[curSnaps.length - 1].pat : 0;

    const scenarioName = (() => {
      try { return JSON.parse(localStorage.getItem('simfin_scenario'))?.name || ''; } catch { return ''; }
    })();

    const data = {
      f1, f2, rendaOp, rendaReal, taxa, anos, aporte, patFinal,
      snaps: curSnaps,
      pcts,
      track:    typeof loadTrack  === 'function' ? loadTrack().sort((a,b)=>a.mes.localeCompare(b.mes)) : [],
      goals:    typeof loadGoals  === 'function' ? loadGoals()  : [],
      carteira: JSON.parse(localStorage.getItem('simfin_carteira') || '[]'),
      scenarioName,
    };

    cfg._title = cfg.titulo;
    _pNum = 0;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Cover (no header)
    _secCapa(doc, data, cfg);

    // Ordem espelha navegação do app: Simulador → Finanças → Metas
    // Simulador: Folha → Aportes por Pessoa → Orçamento → Projeção
    if (cfg.sections.folha)                               _secFolha(doc, data, cfg);
    if (cfg.sections.aportes)                             _secAportes(doc, data, cfg);
    if (cfg.sections.orcamento)                           _secOrcamento(doc, data, cfg);
    if (cfg.sections.projecao && curSnaps.length)         _secProjecao(doc, data, cfg);
    // Finanças: Acompanhamento → Carteira
    if (cfg.sections.acompanhamento)                      _secAcompanhamento(doc, data, cfg);
    if (cfg.sections.carteira)                            _secCarteira(doc, data, cfg);
    // Metas
    if (cfg.sections.metas)                               _secMetas(doc, data, cfg);

    // Save
    const dateStr = new Date().toISOString().slice(0,10);
    const filename = `simfin-relatorio-${dateStr}.pdf`;
    doc.save(filename);
    showToast('PDF gerado com sucesso!', '📄', 3000);
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    showToast('Erro ao gerar PDF. Tente novamente.', '❌', 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Gerar PDF'; }
  }
}
