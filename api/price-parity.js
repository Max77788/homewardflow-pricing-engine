import rppDataset from '../data/bea-rpp-states.json' with { type: 'json' };
import { getStatePriceParity } from '../src/price-parity.js';

export default function handler(req, res) {
  const stateCode = String(req.query?.stateCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) return res.status(400).json({ error: 'stateCode must be a 2-letter state or DC code.' });
  const parity = getStatePriceParity(stateCode, rppDataset);
  if (!parity) return res.status(404).json({ error: 'No BEA state price parity is available for that state code.' });
  return res.json({
    ...parity,
    status: 'public_dataset',
    note: 'Broad all-items regional price context only. Not a construction-specific index and not applied to the estimate.',
  });
}
