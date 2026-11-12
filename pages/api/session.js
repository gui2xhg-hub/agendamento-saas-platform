import { verifyToken } from '../../lib/authToken';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { slug, token } = req.body || {};
  const data = verifyToken(token, slug);
  return res.status(200).json(data ? { ok: true, level: data.level } : { ok: false });
}
