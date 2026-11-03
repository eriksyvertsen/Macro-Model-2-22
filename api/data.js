import { fetchAll } from '../shared/fred.js';

export default async function handler(req, res) {
  try {
    const data = await fetchAll();
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
