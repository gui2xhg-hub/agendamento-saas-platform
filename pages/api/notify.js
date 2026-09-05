export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { title, message, url, external_id } = req.body;

  const API_KEY = "SUA_REST_API_KEY_DO_ONESIGNAL"; // Obtenha em Keys & IDs no painel do OneSignal
  const APP_ID = "SEU_ONESIGNAL_APP_ID_AQUI";

  const payload = {
    app_id: APP_ID,
    headings: { pt: title, en: title },
    contents: { pt: message, en: message },
    url: url || 'https://agendamento.sinergemkt.com',
  };

  // Se passar um ID específico (ex: ID do profissional), envia só para ele. Se não, envia para todos.
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
