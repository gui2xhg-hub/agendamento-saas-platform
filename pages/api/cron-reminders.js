import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const { secret } = req.query;
  if (secret !== 'sinerge2026') {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Busca agendamentos pendentes do dia com os dados da loja
    const { data: apps, error } = await supabase
      .from('appointments')
      .select('*, tenants(name, whatsapp, instance_id, api_key)')
      .eq('appointment_date', todayStr)
      .eq('status', 'agendado')
      .or('reminder_sent.is.null,reminder_sent.eq.false');

    if (error) throw error;

    const updatedIds = [];

    for (const app of apps || []) {
      const [appH, appM] = app.start_time.split(':').map(Number);
      const appMinTotal = appH * 60 + appM;
      const currMinTotal = now.getHours() * 60 + now.getMinutes();

      const diff = appMinTotal - currMinTotal;

      // Dispara se o agendamento estiver entre 15 e 35 minutos de distância
      if (diff >= 15 && diff <= 35) {
        const tenant = app.tenants;

        // Se o cliente tem a API de WhatsApp configurada, faz o disparo
        if (tenant?.instance_id && tenant?.api_key) {
          const message = `*LEMBRETE DE AGENDAMENTO — ${tenant.name.toUpperCase()}*\n\n` +
            `Olá *${app.customer_name}*, passando para lembrar que seu atendimento está marcado para daqui a pouco, às *${app.start_time}*.\n\n` +
            `Te aguardamos no local!`;

          // Exemplo de requisição para Evolution API (ajustar a URL da sua instância)
          await fetch(`https://sua-api-evolution.com/message/sendText/${tenant.instance_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': tenant.api_key
            },
            body: JSON.stringify({
              number: `55${app.customer_phone}`,
              text: message
            })
          });
        }

        // Marca como lembrete enviado para não repetir
        await supabase
          .from('appointments')
          .update({ reminder_sent: true })
          .eq('id', app.id);

        updatedIds.push(app.id);
      }
    }

    return res.status(200).json({ success: true, processed: updatedIds.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
