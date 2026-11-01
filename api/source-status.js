import rppDataset from '../data/bea-rpp-states.json' with { type: 'json' };

export function buildSourceStatus(env = process.env) {
  return {
    sources: [
      { id: 'bls-ppi', name: 'BLS Producer Price Index', status: 'live_api', note: 'Live source. Applies an index adjustment to user-entered material costs; it is not a local unit-price catalog.' },
      { id: 'bls-ces', name: 'BLS Construction Average Hourly Earnings', status: 'live_api', note: 'Live nationwide construction wage baseline; not a local trade-specific contractor rate.' },
      { id: 'oews', name: 'BLS Occupational Employment and Wage Statistics', status: 'not_configured', sourceUrl: 'https://www.bls.gov/oes/', note: 'Free annual occupation-by-area files are available, but no OEWS release is imported into this app yet.' },
      { id: 'bea-rpp', name: 'BEA Regional Price Parities', status: 'public_dataset', sourceUrl: rppDataset.sourceUrl, datasetYear: rppDataset.datasetYear, note: `Bundled ${rppDataset.datasetYear} state-level all-items index; context only, not applied as a construction-cost factor.` },
      { id: 'census-acs', name: 'U.S. Census American Community Survey', status: env.CENSUS_API_KEY ? 'live_api' : 'key_required', note: env.CENSUS_API_KEY ? 'Configured for state-specific housing-unit context from the 2023 ACS 5-year API.' : 'Needs a free Census API key in CENSUS_API_KEY to load state-level housing-unit context.' },
      { id: 'census-permits', name: 'U.S. Census Building Permits Survey', status: 'not_configured', sourceUrl: 'https://www.census.gov/construction/bps/', note: 'Not connected. Requires endpoint/dataset configuration and a free Census API key.' },
      { id: 'census-construction', name: 'U.S. Census Construction Spending', status: 'not_configured', sourceUrl: 'https://www.census.gov/constructionspending', note: 'Not connected. Aggregate market context only; requires dataset configuration and a free Census API key.' },
      { id: 'craftsman', name: 'Craftsman', status: env.CRAFTSMAN_API_URL ? 'configured' : 'not_configured', note: 'Optional licensed market benchmark adapter. No benchmark values are fabricated when unavailable.' },
    ],
  };
}

export default function handler(_req, res) {
  return res.json(buildSourceStatus());
}
