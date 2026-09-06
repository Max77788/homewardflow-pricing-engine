export default function handler(_req, res) {
  return res.json({
    sources: [
      { id: 'bls-ppi', name: 'BLS Producer Price Index', status: 'live_api', note: 'Used for material escalation from the selected base month.' },
      { id: 'bls-ces', name: 'BLS Construction Average Hourly Earnings', status: 'live_api', note: 'No-key nationwide construction wage baseline; local labor overrides remain available.' },
      { id: 'oews', name: 'BLS Occupational Employment and Wage Statistics', status: 'public_file', note: 'Official public annual OEWS files can be imported when a release is selected; no API key is required.' },
      { id: 'census-acs', name: 'U.S. Census American Community Survey', status: 'key_required', note: 'The Census API currently requires an API key in this deployment environment.' },
      { id: 'census-permits', name: 'U.S. Census Building Permits Survey', status: 'key_required', note: 'The Census API currently requires an API key in this deployment environment.' },
      { id: 'craftsman', name: 'Craftsman', status: 'not_configured', note: 'Optional licensed market benchmark adapter. No benchmark values are fabricated when unavailable.' },
    ],
  });
}
