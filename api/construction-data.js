export default function handler(_req, res) {
  return res.status(424).json({
    error: 'Census API key required in this deployment environment.',
    status: 'key_required',
    sources: [
      { name: 'American Community Survey', url: 'https://api.census.gov/data.html' },
      { name: 'Building Permits Survey', url: 'https://api.census.gov/data.html' },
    ],
  });
}
