export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { title, message, url, external_id } = req.body;

  // ⚠️ COLE A SUA REST API KEY DO ONESIGNAL AQUI:
  const API_KEY = "SUA_REST_API_KEY_AQUI"; 
  const APP_ID = "4459285b-e81c-458e-a6dc-ebc5e1d9baef";

  const payload = {
    app_id: APP_ID,
    headings: { pt: title, en: title },
    contents: { pt: message, en: message },
    url: url || 'https://agendamento.sinergemkt.com',
  };

  if (external_id) {
    payload.include_aliases = { external_id: [String(external_id)] };
    payload.target_channel = "push";
  } else {
    payload.included_segments = ["All"];
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
