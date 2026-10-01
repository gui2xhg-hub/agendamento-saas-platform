import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const { slug } = req.query;

  // Se houver um slug na URL, gera o PWA específico do Catálogo do Cliente Final
  if (slug) {
    let tenantName = 'Agendamento Online';
    let themeColor = '#FF8C00';

    try {
      const { data } = await supabase
        .from('tenants')
        .select('name')
        .eq('slug', String(slug).toLowerCase().trim())
        .maybeSingle();

      if (data?.name) {
        tenantName = data.name;
      }
    } catch (e) {
      console.error('Erro ao procurar dados do tenant para o manifest:', e);
    }

    return res.status(200).json({
      name: tenantName,
      short_name: tenantName,
      description: `Faça o seu agendamento online em ${tenantName}`,
      start_url: `/${slug}?utm_source=pwa`,
      scope: `/${slug}/`,
      display: 'standalone',
      background_color: '#090D16',
      theme_color: themeColor,
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    });
  }

  // Caso contrário, gera o PWA para o Utilizador do Sistema (Agenda / Admin)
  return res.status(200).json({
    name: 'SISTEMA DE AGENDAMENTO',
    short_name: 'Gestão Agenda',
    description: 'Painel de Gestão e Agenda',
    start_url: '/?utm_source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#090D16',
    theme_color: '#FF8C00',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  });
}
