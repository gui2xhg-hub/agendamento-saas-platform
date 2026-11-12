// Entrega os dados do estabelecimento para as páginas SEM senhas, tokens ou PINs.
import { serverSupabase, sanitizeTenant, sanitizeProfessional } from '../../lib/serverSupabase';
import { verifyToken } from '../../lib/authToken';

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase().trim();
  if (!slug) return res.status(400).json({ error: 'slug obrigatório' });

  // A equipe logada (agenda) também vê a comissão dos profissionais
  const auth = verifyToken(req.headers['x-sinerge-token'], slug);

  try {
    const { data: tData, error } = await serverSupabase.from('tenants').select('*').eq('slug', slug).maybeSingle();
    if (error) throw error;
    if (!tData) return res.status(404).json({ tenant: null, professionals: [] });

    const { data: pData } = await serverSupabase
      .from('professionals')
      .select('*')
      .eq('tenant_id', tData.id)
      .eq('active', true);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      tenant: sanitizeTenant(tData),
      professionals: (pData || []).map((p) => sanitizeProfessional(p, { keepCommission: !!auth }))
    });
  } catch (e) {
    console.error('public-tenant:', e);
    return res.status(500).json({ error: 'Erro ao carregar estabelecimento' });
  }
}
