const STATE_CODES = {
  '01000': 'AL', '02000': 'AK', '04000': 'AZ', '05000': 'AR', '06000': 'CA',
  '08000': 'CO', '09000': 'CT', '10000': 'DE', '11000': 'DC', '12000': 'FL',
  '13000': 'GA', '15000': 'HI', '16000': 'ID', '17000': 'IL', '18000': 'IN',
  '19000': 'IA', '20000': 'KS', '21000': 'KY', '22000': 'LA', '23000': 'ME',
  '24000': 'MD', '25000': 'MA', '26000': 'MI', '27000': 'MN', '28000': 'MS',
  '29000': 'MO', '30000': 'MT', '31000': 'NE', '32000': 'NV', '33000': 'NH',
  '34000': 'NJ', '35000': 'NM', '36000': 'NY', '37000': 'NC', '38000': 'ND',
  '39000': 'OH', '40000': 'OK', '41000': 'OR', '42000': 'PA', '44000': 'RI',
  '45000': 'SC', '46000': 'SD', '47000': 'TN', '48000': 'TX', '49000': 'UT',
  '50000': 'VT', '51000': 'VA', '53000': 'WA', '54000': 'WV', '55000': 'WI',
  '56000': 'WY',
};

export function getStateFips(stateCode) {
  const normalized = String(stateCode || '').trim().toUpperCase();
  return Object.entries(STATE_CODES).find(([, code]) => code === normalized)?.[0] || null;
}

export function getStatePriceParity(stateCode, dataset) {
  const fips = getStateFips(stateCode);
  const row = dataset.states.find((entry) => entry.fips === fips);
  if (!row || !Number.isFinite(row.rppAllItems) || !Number.isFinite(dataset.nationalIndex) || dataset.nationalIndex <= 0) return null;
  return {
    source: dataset.source,
    sourceUrl: dataset.sourceUrl,
    datasetYear: dataset.datasetYear,
    indicator: dataset.indicator,
    state: row.name,
    index: row.rppAllItems,
    nationalIndex: dataset.nationalIndex,
    relativeToNational: Number((row.rppAllItems / dataset.nationalIndex).toFixed(4)),
  };
}
