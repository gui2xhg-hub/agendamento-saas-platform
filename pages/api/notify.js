// Envia notificação push SOMENTE para os aparelhos da equipe do estabelecimento (tenant_id).
// Configure ONESIGNAL_REST_API_KEY nas variáveis de ambiente da Vercel (gere uma chave NOVA no OneSignal).
const APP_ID = process.env.ONESIGNAL_APP_ID || '4459285b-e81c-458e-a6dc-ebc5e1d9baef';
// Chave antiga mantida só como reserva para não parar as notificações antes de você configurar a nova.
// Depois de cadastrar a chave nova na Vercel e revogar esta no OneSignal, ela deixa de funcionar.
const LEGACY_KEY = 'os_v2_app_irmsqw7idrcy5jw45pc6dwn254imbbmmq64eru4w24kh4tgt572aqp54h2zmglggprsqmza23lg3u5mht2nj3lfysgo6ipq3bqoldla';
const API_KEY = process.env.ONESIGNAL_REST_API_KEY || LEGACY_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { title, message, url, tenant_id } = req.body || {};

  // Sem estabelecimento definido não envia para ninguém (antes ia para TODOS os aparelhos de TODAS as lojas)
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id obrigatório' });
  }

  const safeUrl = typeof url === 'string' && url.startsWith('https://') ? url : 'https://agendamento.sinergemkt.com';

  const payload = {
    app_id: APP_ID,
    headings: { pt: String(title || 'Agendamento').slice(0, 120), en: String(title || 'Agendamento').slice(0, 120) },
    contents: { pt: String(message || '').slice(0, 500), en: String(message || '').slice(0, 500) },
    url: safeUrl,
    include_aliases: { external_id: [`tenant_${tenant_id}`] },
    target_channel: 'push'
  };

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY.startsWith('os_v2_') ? `Key ${API_KEY}` : `Basic ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
