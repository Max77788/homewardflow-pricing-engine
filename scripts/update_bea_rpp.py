#!/usr/bin/env python3
"""Refresh the bundled BEA statewide all-items RPP snapshot from BEA's public ZIP."""
import csv
import io
import json
import urllib.request
import zipfile
from pathlib import Path

URL = 'https://apps.bea.gov/regional/zip/RPP.zip'
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data' / 'bea-rpp-states.json'
request = urllib.request.Request(URL, headers={'User-Agent': 'HomewardFlowPricingEngine/1.0'})
with urllib.request.urlopen(request, timeout=60) as response:
    archive = zipfile.ZipFile(io.BytesIO(response.read()))

matches = [name for name in archive.namelist() if name.startswith('SARPP_STATE_') and name.endswith('.csv')]
if len(matches) != 1:
    raise SystemExit(f'Expected one statewide RPP CSV; found {matches!r}.')
DATASET = matches[0]
with archive.open(DATASET) as stream:
    reader = csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))
    rows = list(reader)
    year_columns = [column for column in (reader.fieldnames or []) if column.isdigit()]
if not year_columns:
    raise SystemExit('BEA RPP archive did not contain year columns.')
year = max(year_columns, key=int)
state_rows = []
national = None
for row in rows:
    if row.get('LineCode') != '5' or not row.get(year):
        continue
    fips = (row.get('GeoFIPS') or '').strip().strip('"')
    value = float(row[year])
    if fips == '00000':
        national = value
    elif len(fips) == 5 and fips.endswith('000'):
        state_rows.append({'fips': fips, 'name': (row.get('GeoName') or '').strip().strip('"'), 'rppAllItems': value})
if len(state_rows) < 50 or national is None:
    raise SystemExit(f'Unexpected BEA data coverage: {len(state_rows)} state/DC rows, national={national!r}.')
result = {
    'source': 'BEA Regional Price Parities',
    'sourceUrl': URL,
    'datasetYear': int(year),
    'indicator': 'RPPs: All items',
    'nationalIndex': national,
    'states': sorted(state_rows, key=lambda item: item['fips']),
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Updated {OUTPUT.relative_to(ROOT)}: year={year}, state/DC rows={len(state_rows)}, national index={national}.')
