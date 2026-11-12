import { serverSupabase as supabase } from '../../lib/serverSupabase';

// Endereço da sua API de WhatsApp (ex.: Evolution API). Configure WHATSAPP_API_URL na Vercel,
// por exemplo: https://sua-evolution.com  (o sistema chama {URL}/message/sendText/{instancia})
const WHATSAPP_API_URL = (process.env.WHATSAPP_API_URL || '').replace(/\/$/, '');

export default async function handler(req, res) {
  const { secret } = req.query;
  const authHeader = req.headers.authorization;
  const envSecret = process.env.CRON_SECRET;

  // Só aceita a variável CRON_SECRET configurada na Vercel (a chave fixa antiga era pública no código)
  const isAuthorized = !!envSecret && (secret === envSecret || authHeader === `Bearer ${envSecret}`);

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  if (!WHATSAPP_API_URL) {
    return res.status(200).json({ success: false, processed: 0, logs: ['Robô desligado: configure WHATSAPP_API_URL nas variáveis da Vercel.'] });
  }

  try {
    // 1. Calcula a data de AMANHÃ no horário de Brasília (Formato YYYY-MM-DD e DD/MM/YYYY)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
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

      let servicesList = app.services_json;
      if (typeof servicesList === 'string') {
        try { servicesList = JSON.parse(servicesList); } catch (e) { servicesList = []; }
      }
      const serviceName = (Array.isArray(servicesList) && servicesList.length > 0)
        ? servicesList.map(s => s?.name).filter(Boolean).join(', ')
        : (app.service_name || 'Atendimento');
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
        const sendResp = await fetch(`${WHATSAPP_API_URL}/message/sendText/${instanceId}`, {
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

        if (!sendResp.ok) {
          throw new Error(`API do WhatsApp respondeu ${sendResp.status}`);
        }

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
