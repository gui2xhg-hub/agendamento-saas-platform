import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  // Trava de segurança simples para evitar chamadas não autorizadas
  const { secret } = req.query;
  if (secret !== 'sinerge2026') {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Calcula a janela de tempo de daqui a 30 minutos (com variação de 15 min)
    const futureTime = new Date(now.getTime() + 30 * 60000);
    const targetHour = String(futureTime.getHours()).padStart(2, '0');
    const targetMin = String(futureTime.getMinutes()).padStart(2, '0');
    const targetTimeStr = `${targetHour}:${targetMin}`;

    // Busca agendamentos do dia que estejam próximos do horário e não tenham recebido lembrete
    const { data: apps, error } = await supabase
      .from('appointments')
      .select('*, tenants(name, whatsapp)')
      .eq('appointment_date', todayStr)
      .eq('status', 'agendado')
      .or('reminder_sent.is.null,reminder_sent.eq.false');

    if (error) throw error;

    const remindersToProcess = (apps || []).filter(app => {
      const [appH, appM] = app.start_time.split(':').map(Number);
      const appMinTotal = appH * 60 + appM;

      const [currH, currM] = [now.getHours(), now.getMinutes()];
      const currMinTotal = currH * 60 + currM;

      const diff = appMinTotal - currMinTotal;
      // Dispara se faltarem entre 15 e 35 minutos para o atendimento
      return diff >= 15 && diff <= 35;
    });

    const updatedIds = [];

    for (const app of remindersToProcess) {
      // Marca como enviado no banco de dados
      await supabase
        .from('appointments')
        .update({ reminder_sent: true })
        .eq('id', app.id);

      updatedIds.push(app.id);

      // NOTA DE INTEGRAÇÃO COM DISPARADOR DE WHATSAPP:
      // Se você utiliza uma API de WhatsApp (Evolution API, Z-API, Z-WhatsApp, etc.),
      // o disparo HTTP POST para a API de envio de mensagem entra aqui.
    }

    return res.status(200).json({
      success: true,
      processed: updatedIds.length,
      appointment_ids: updatedIds
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
