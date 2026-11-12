import { supabase } from '../../lib/supabase';

// Gera o "manifest" do app instalável de cada estabelecimento.
//   ?slug=loja&app=catalogo -> app do CLIENTE FINAL: abre direto no catálogo /loja (sem login)
//   ?slug=loja&app=agenda   -> app da EQUIPE: abre direto na agenda /loja/agenda
//   sem slug                -> app de gestão (mesmo conteúdo do /manifest.json)
export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase().trim();
  const app = req.query.app === 'agenda' ? 'agenda' : 'catalogo';

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const icons = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ];

  if (!slug || /[\/?#\s]/.test(slug)) {
    return res.status(200).json({
      id: '/',
      name: 'Sinerge Gestão',
      short_name: 'Sinerge Gestão',
      description: 'Painel de gestão do seu estabelecimento',
      start_url: '/?source=pwa',
      scope: '/',
      display: 'standalone',
      background_color: '#090D16',
      theme_color: '#FF8C00',
      icons
    });
  }

  let tenantName = 'Agendamento Online';
  let themeColor = '#FF8C00';
  try {
    const { data } = await supabase.from('tenants').select('name, primary_color').eq('slug', slug).maybeSingle();
    if (data?.name) tenantName = data.name;
    if (data?.primary_color) themeColor = data.primary_color;
  } catch (e) {
    console.error('Erro ao buscar tenant para o manifest:', e);
  }

  const base = app === 'agenda' ? `/${slug}/agenda` : `/${slug}`;

  return res.status(200).json({
    // "id" diferente por loja e por app: permite ter o app do cliente e o da agenda instalados lado a lado
    id: base,
    name: app === 'agenda' ? `${tenantName} - Agenda` : tenantName,
    short_name: app === 'agenda' ? 'Agenda' : tenantName.slice(0, 24),
    description: app === 'agenda' ? `Agenda da equipe - ${tenantName}` : `Faça seu agendamento online em ${tenantName}`,
    start_url: `${base}?source=pwa`,
    // escopo sem barra no final para incluir o próprio endereço inicial
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#090D16',
    theme_color: themeColor,
    icons
  });
}
