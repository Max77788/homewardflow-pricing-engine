export default function handler(_req, res) {
  return res.json({
    sources: [
      { id: 'bls-ppi', name: 'BLS Producer Price Index', status: 'live_api', note: 'Used for material escalation from the selected base month.' },
      { id: 'oews', name: 'BLS Occupational Employment and Wage Statistics', status: 'user_input_required', note: 'Enter a local labor rate until an authenticated/local occupation extract is configured.' },
      { id: 'craftsman', name: 'Craftsman', status: 'not_configured', note: 'Optional licensed market benchmark adapter. No benchmark values are fabricated when unavailable.' },
    ],
  });
}
