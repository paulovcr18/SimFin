#!/usr/bin/env python3
"""
Baixa CSV do CKAN Tesouro Transparente, extrai cotações mais recentes
por título e salva em data/tesouro-latest.json.

Fluxo:
  1. package_show → descobre URL do CSV
  2. Baixa CSV (encoding Latin-1, separador ;)
  3. Detecta colunas por heurística
  4. Agrupa por título, mantém linha com data mais recente
  5. Salva data/tesouro-latest.json
"""

import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

CKAN_BASE   = 'https://www.tesourotransparente.gov.br/ckan/api/3/action'
PKG_ID      = 'taxas-dos-titulos-ofertados-pelo-tesouro-direto'
OUT_PATH    = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'tesouro-latest.json')

# ── Descobre URL do CSV via package_show ───────────────────────────────────
def descobrir_url_csv():
    url = f'{CKAN_BASE}/package_show?id={PKG_ID}'
    print(f'[1] Consultando package_show: {url}')
    with urllib.request.urlopen(url, timeout=30) as r:
        pkg = json.loads(r.read().decode('utf-8'))
    resources = pkg.get('result', {}).get('resources', [])
    for res in resources:
        if res.get('format', '').upper() == 'CSV':
            csv_url = res['url']
            print(f'[1] CSV encontrado: {csv_url}')
            return csv_url
    raise RuntimeError('Recurso CSV não encontrado no pacote CKAN')

# ── Heurística de mapeamento de colunas ───────────────────────────────────
def detectar_colunas(headers):
    h = [
        c.lower().replace(' ', '').encode('ascii', 'ignore').decode()
        for c in headers
    ]
    def find(conds):
        for i, c in enumerate(h):
            if all(k in c for k in conds):
                return i
        return None

    cols = {
        'titulo':     find(['tipo']) or find(['titulo']),
        'data':       find(['datavenda']) or find(['data']),
        'taxaCompra': find(['taxa', 'compra']),
        'taxaVenda':  find(['taxa', 'venda']),
        'puCompra':   find(['pu', 'compra']) or find(['unit', 'compra']),
        'puVenda':    find(['pu', 'venda'])   or find(['unit', 'venda']),
    }
    print(f'[2] Mapeamento de colunas: { {k: (v, headers[v] if v is not None else None) for k,v in cols.items()} }')
    return cols

# ── Parse de data no formato DD/MM/AAAA ───────────────────────────────────
def parse_data(s):
    s = s.strip()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

# ── Converte string numérica (vírgula decimal, ponto milhar) ──────────────
def parse_num(s):
    if not s:
        return None
    s = s.strip().replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None

# ── Download e processamento do CSV ───────────────────────────────────────
def processar_csv(csv_url):
    print(f'[2] Baixando CSV: {csv_url}')
    req = urllib.request.Request(csv_url, headers={'User-Agent': 'SimFin/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()

    # Tenta Latin-1, fallback UTF-8
    for enc in ('latin-1', 'utf-8-sig', 'utf-8'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            pass
    else:
        raise RuntimeError('Não foi possível decodificar o CSV')

    reader = csv.reader(io.StringIO(text), delimiter=';')
    headers = next(reader)
    cols = detectar_colunas(headers)

    # Valida colunas obrigatórias
    missing = [k for k, v in cols.items() if v is None]
    if missing:
        raise RuntimeError(f'Colunas não encontradas: {missing}. Headers: {headers}')

    # Agrupa por título, mantém linha com data mais recente
    titulos = {}  # nome → {'data': datetime, dados...}
    total = 0
    for row in reader:
        if len(row) <= max(v for v in cols.values() if v is not None):
            continue
        titulo = row[cols['titulo']].strip()
        if not titulo:
            continue
        data = parse_data(row[cols['data']])
        if not data:
            continue
        total += 1

        atual = titulos.get(titulo)
        if atual and atual['_dataObj'] >= data:
            continue

        taxaCompra = parse_num(row[cols['taxaCompra']])
        taxaVenda  = parse_num(row[cols['taxaVenda']])
        puCompra   = parse_num(row[cols['puCompra']])
        puVenda    = parse_num(row[cols['puVenda']])

        titulos[titulo] = {
            '_dataObj':   data,
            'nome':       titulo,
            'taxaCompra': taxaCompra,
            'taxaVenda':  taxaVenda,
            'puCompra':   puCompra,
            'puVenda':    puVenda,
            'dataRef':    data.strftime('%d/%m/%Y'),
        }

    print(f'[2] Processadas {total} linhas, {len(titulos)} títulos únicos')

    # Remove campo auxiliar _dataObj
    resultado = {nome: {k: v for k, v in dados.items() if k != '_dataObj'}
                 for nome, dados in titulos.items()}
    return resultado

# ── Main ───────────────────────────────────────────────────────────────────
def main():
    try:
        csv_url  = descobrir_url_csv()
        titulos  = processar_csv(csv_url)
    except Exception as e:
        print(f'[ERRO] {e}', file=sys.stderr)
        sys.exit(1)

    agora = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    out = {
        '_source':      'ckan',
        '_generatedAt': agora,
        'titulos':      titulos,
    }

    out_path = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f'[3] Salvo em {out_path} ({len(titulos)} títulos, gerado em {agora})')

if __name__ == '__main__':
    main()
