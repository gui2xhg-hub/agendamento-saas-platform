import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  const { secret } = req.query;
  const authHeader = req.headers.authorization;
  const envSecret = process.env.CRON_SECRET;

  // Aceita tanto a chave fixa 'sinerge2026' quanto a variável CRON_SECRET da Vercel
  const isAuthorized = 
    secret === 'sinerge2026' || 
    (envSecret && (secret === envSecret || authHeader === `Bearer ${envSecret}`));

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  try {
    // 1. Calcula a data de AMANHÃ (Formato YYYY-MM-DD e DD/MM/YYYY)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const tomorrowFormatted = tomorrowStr.split('-').reverse().join('/');

    // 2. Busca agendamentos de amanhã trazendo os dados da LOJA e do PROFISSIONAL
    const { data: apps, error } = await supabase
      .from('appointments')
      .select('*, tenants(*), professionals(*)')
      .eq('appointment_date', tomorrowStr)
      .neq('status', 'cancelado')
      .or('reminder_sent.is.null,reminder_sent.eq.false');

    if (error) throw error;

    const updatedIds = [];
    const logs = [];

    for (const app of apps || []) {
      const tenant = app.tenants;
      const prof = app.professionals;

      // Se a loja não tem robô ativado nem credenciais de WhatsApp, ignora
      if (tenant?.bot_enabled === false) continue;

      const instanceId = tenant?.bot_whatsapp_instance || tenant?.instance_id;
      const apiKey = tenant?.bot_whatsapp_token || tenant?.api_key;

      if (!instanceId || !apiKey) continue;

      // Dados do cliente e atendimento
      const clientName = app.customer_name || app.client_name || 'Cliente';
      const rawPhone = app.customer_phone || app.client_phone || app.phone || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
      if (!cleanPhone) continue;

      const serviceName = app.service_name || 'Atendimento';
      const startTime = app.start_time || app.appointment_time || app.time || '';
      const profName = prof?.name || 'Nossa Equipe';

      // REGRA DE MENSAGEM
      let template = (prof?.bot_message_template && prof.bot_message_template.trim() !== '')
        ? prof.bot_message_template
        : (tenant?.bot_message_template || `Olá *{cliente}*! 👋 Passando para lembrar que seu atendimento de *{servico}* está marcado para amanhã ({data}) às *{horario}* no *{empresa}* com *{profissional}*.\n\nTe aguardamos!`);

      // Substituição automática das variáveis na mensagem
      const finalMessage = template
        .replace(/{cliente}/g, clientName)
        .replace(/{servico}/g, serviceName)
        .replace(/{data}/g, tomorrowFormatted)
        .replace(/{horario}/g, startTime)
        .replace(/{empresa}/g, tenant?.name || '')
        .replace(/{profissional}/g, profName);

      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      try {
        // Disparo para a API de WhatsApp
        await fetch(`https://api.seugateway.com/message/sendText/${instanceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: finalMessage
          })
        });

        // Marca como lembrete enviado
        await supabase
          .from('appointments')
          .update({ reminder_sent: true })
          .eq('id', app.id);

        updatedIds.push(app.id);
        logs.push(`✓ Lembrete enviado para ${clientName} (${formattedPhone}) - Prof: ${profName}`);
      } catch (sendErr) {
        logs.push(`❌ Erro ao enviar para ${clientName}: ${sendErr.message}`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      processed: updatedIds.length,
      logs 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
