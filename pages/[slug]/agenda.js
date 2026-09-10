import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// FUNÇÃO AUXILIAR PARA FORMATAR MINUTOS EM HORAS E MINUTOS
const formatDuration = (minutes) => {
  const mins = Number(minutes) || 0;
  if (mins <= 0) return '30 min';
  if (mins < 60) return `${mins} min`;
  
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  
  if (remMins === 0) return `${hrs}h`;
  return `${hrs}h ${remMins}min`;
};

export default function AgendaTenant() {
  const router = useRouter();
  const { slug } = router.query;

  // Função auxiliar para obter a data local formatada YYYY-MM-DD
  const getTodayLocal = () => new Date().toLocaleDateString('sv-SE');

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [loading, setLoading] = useState(true);

  // FILTROS DE DATA E PROFISSIONAL
  const [selectedDate, setSelectedDate] = useState(getTodayLocal());
  const [selectedProf, setSelectedProf] = useState('');

  // NORMAS DE DIAS DA SEMANA (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
  const ALL_DAYS = [
    { id: 1, label: 'Seg' },
    { id: 2, label: 'Ter' },
    { id: 3, label: 'Qua' },
    { id: 4, label: 'Qui' },
    { id: 5, label: 'Sex' },
    { id: 6, label: 'Sáb' },
    { id: 0, label: 'Dom' }
  ];

  // MODAL DE BLOQUEIO DE HORÁRIO
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockProfId, setBlockProfId] = useState('');
  const [blockDate, setBlockDate] = useState(getTodayLocal());
  const [blockStartTime, setBlockStartTime] = useState('12:30');
  const [blockEndTime, setBlockEndTime] = useState('14:00');
  const [blockReason, setBlockReason] = useState('Almoço / Intervalo');
  const [isFullDayBlock, setIsFullDayBlock] = useState(false);
  
  // CONTROLE AVANÇADO DE RECORRÊNCIA
  const [isRecurringBlock, setIsRecurringBlock] = useState(false);
  const [blockRepeatDays, setBlockRepeatDays] = useState([1, 2, 3, 4, 5, 6]);
  const [isSavingBlock, setIsSavingBlock] = useState(false);

  // MODAL DE REAGENDAMENTO
  const [editingApp, setEditingApp] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleProfId, setRescheduleProfId] = useState('');
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);

  // MODAL DE AGENDAMENTO MANUAL PELO PROFISSIONAL
  const [showManualAppModal, setShowManualAppModal] = useState(false);
  const [manualProfId, setManualProfId] = useState('');
  const [manualDate, setManualDate] = useState(getTodayLocal());
  const [manualStartTime, setManualStartTime] = useState('09:00');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [manualSelectedServiceId, setManualSelectedServiceId] = useState('');
  const [manualPaymentMethod, setPaymentMethod] = useState('No Local');
  const [isSavingManualApp, setIsSavingManualApp] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantAndData();
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (tenant?.id && selectedDate) {
      fetchAppointmentsAndBlocks();
    }
  }, [tenant?.id, selectedDate]);

  const fetchTenantAndData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant(tData);
      const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tData.id).eq('active', true);
      const { data: sData } = await supabase.from('services').select('*').eq('tenant_id', tData.id).eq('active', true);
      
      if (pData && pData.length > 0) {
        setProfessionals(pData);
        setSelectedProf(pData[0].id);
        setBlockProfId(pData[0].id);
        setManualProfId(pData[0].id);
      }

      if (sData) {
        setServices(sData);
        if (sData.length > 0) setManualSelectedServiceId(sData[0].id);
      }
      
      await fetchAppointmentsAndBlocks(tData.id);
    }
    setLoading(false);
  };

  const fetchAppointmentsAndBlocks = async (tenantId = tenant?.id) => {
    if (!tenantId) return;

    const { data: apps } = await supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelado')
      .order('start_time', { ascending: true });

    const { data: blocks } = await supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenantId);

    if (apps) setAppointments(apps);

    if (blocks) {
      const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
      const filteredBlocks = blocks.filter(b => {
        if (b.block_date === selectedDate && !b.is_recurring) return true;
        if (b.is_recurring && b.recurring_day === selectedDayOfWeek) return true;
        if (b.reason && b.reason.includes('[RECORRENTE]') && b.recurring_day === selectedDayOfWeek) return true;
        return false;
      });
      setBlockedTimes(filteredBlocks);
    }
  };

  const getWeekDays = (baseDateStr) => {
    const baseDate = new Date(baseDateStr + 'T00:00:00');
    const dayOfWeek = baseDate.getDay();
    const distanceToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + distanceToMon);

    const week = [];
    const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isoDate = d.toLocaleDateString('sv-SE');
      const dayNum = String(d.getDate()).padStart(2, '0');
      
      week.push({
        name: dayNames[i],
        dayNum: dayNum,
        dateStr: isoDate
      });
    }
    return week;
  };

  const currentWeekDays = getWeekDays(selectedDate);

  const handleCreateManualApp = async (e) => {
    e.preventDefault();
    if (!manualCustomerName || !manualCustomerPhone) return alert("Preencha o Nome e WhatsApp do cliente!");
    if (!manualSelectedServiceId) return alert("Selecione o procedimento!");

    setIsSavingManualApp(true);

    const serviceObj = services.find(s => String(s.id) === String(manualSelectedServiceId));
    const duration = serviceObj?.duration_minutes || 30;
    const price = Number(serviceObj?.price || 0);

    const [h, m] = manualStartTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + duration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const chosenProfObj = professionals.find(p => String(p.id) === String(manualProfId));
    const cleanPhone = manualCustomerPhone.replace(/\D/g, '');

    const appointmentPayload = {
      tenant_id: tenant.id,
      professional_id: parseInt(manualProfId),
      customer_name: manualCustomerName.trim(),
      customer_phone: cleanPhone,
      services_json: serviceObj ? [serviceObj] : [],
      total_price: price,
      total_duration_minutes: duration,
      appointment_date: manualDate,
      start_time: manualStartTime,
      end_time: endTime,
      payment_method: manualPaymentMethod,
      status: 'agendado',
      is_paid: false
    };

    const { data: createdApp, error } = await supabase
      .from('appointments')
      .insert([appointmentPayload])
      .select()
      .single();

    setIsSavingManualApp(false);

    if (error) {
      alert("Erro ao criar agendamento: " + error.message);
    } else {
      const formattedDate = manualDate.split('-').reverse().join('/');
      
      if (cleanPhone) {
        const msg = `Olá *${manualCustomerName}*! 👋\n\n` +
          `Seu agendamento no *${tenant.name}* foi confirmado com sucesso!\n\n` +
          `📅 *Data:* ${formattedDate} às *${manualStartTime}*\n` +
          `👤 *Profissional:* ${chosenProfObj?.name || 'Equipe'}\n` +
          `✂️ *Procedimento:* ${serviceObj?.name || 'Atendimento'}\n` +
          `💰 *Valor:* R$ ${price.toFixed(2)}\n\n` +
          `Te aguardamos! Se precisar alterar, nos avise por aqui.`;

        window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
      }

      setShowManualAppModal(false);
      setManualCustomerName('');
      setManualCustomerPhone('');
      fetchAppointmentsAndBlocks();
    }
  };

  const toggleRepeatDay = (dayId) => {
    if (blockRepeatDays.includes(dayId)) {
      if (blockRepeatDays.length === 1) return alert("Selecione pelo menos um dia para a repetição!");
      setBlockRepeatDays(blockRepeatDays.filter(d => d !== dayId));
    } else {
      setBlockRepeatDays([...blockRepeatDays, dayId].sort());
    }
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!blockDate) return alert("Preencha a data!");

    setIsSavingBlock(true);

    const blockDayOfWeek = new Date(blockDate + 'T00:00:00').getDay();
    const currentProf = professionals.find(p => String(p.id) === String(blockProfId));

    let profWorkHours = currentProf?.work_hours || {};
    if (typeof profWorkHours === 'string') {
      try { profWorkHours = JSON.parse(profWorkHours); } catch (err) { profWorkHours = {}; }
    }
    const dayHours = profWorkHours[blockDayOfWeek] || { open: '08:00', close: '18:00' };

    const openTime = dayHours.open || '08:00';
    const closeTime = dayHours.close || '18:00';

    const finalStartTime = isFullDayBlock ? openTime : blockStartTime;
    const finalEndTime = isFullDayBlock ? closeTime : blockEndTime;

    let finalReason = blockReason || 'Horário Bloqueado';
    if (isRecurringBlock) finalReason += ' [RECORRENTE]';

    let payloads = [];

    if (isRecurringBlock) {
      payloads = blockRepeatDays.map(dayNum => ({
        tenant_id: tenant.id,
        professional_id: blockProfId ? parseInt(blockProfId) : null,
        block_date: blockDate,
        start_time: finalStartTime,
        end_time: finalEndTime,
        reason: finalReason,
        is_recurring: true,
        recurring_day: dayNum
      }));
    } else {
      payloads = [{
        tenant_id: tenant.id,
        professional_id: blockProfId ? parseInt(blockProfId) : null,
        block_date: blockDate,
        start_time: finalStartTime,
        end_time: finalEndTime,
        reason: finalReason,
        is_recurring: false,
        recurring_day: blockDayOfWeek
      }];
    }

    const { error } = await supabase.from('blocked_times').insert(payloads);
    setIsSavingBlock(false);

    if (error) {
      alert("Erro ao fechar horário: " + error.message);
    } else {
      setShowBlockModal(false);
      setIsFullDayBlock(false);
      setIsRecurringBlock(false);
      fetchAppointmentsAndBlocks();
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (!confirm("Deseja desmarcar este bloqueio e liberar o horário novamente?")) return;

    const { error } = await supabase.from('blocked_times').delete().eq('id', blockId);

    if (error) {
      alert("Erro ao remover bloqueio: " + error.message);
    } else {
      fetchAppointmentsAndBlocks();
    }
  };

  const handleOpenReschedule = (app) => {
    setEditingApp(app);
    setRescheduleDate(app.appointment_date);
    setRescheduleTime(app.start_time);
    setRescheduleProfId(app.professional_id);
  };

  const handleSaveReschedule = async (e) => {
    e.preventDefault();
    if (!rescheduleDate || !rescheduleTime) return alert("Selecione nova data e horário!");

    setIsSavingReschedule(true);

    const duration = editingApp.total_duration_minutes || 30;
    const [h, m] = rescheduleTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + duration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const { error } = await supabase
      .from('appointments')
      .update({
        appointment_date: rescheduleDate,
        start_time: rescheduleTime,
        end_time: endTime,
        professional_id: parseInt(rescheduleProfId),
        status: 'agendado'
      })
      .eq('id', editingApp.id);

    setIsSavingReschedule(false);

    if (error) {
      alert("Erro ao reagendar: " + error.message);
    } else {
      const formattedDate = rescheduleDate.split('-').reverse().join('/');

      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '🔄 Horário Reagendado!',
            message: `Olá ${editingApp.customer_name}, seu atendimento foi alterado para ${formattedDate} às ${rescheduleTime}.`,
            url: `https://agendamento.sinergemkt.com/${tenant.slug}`
          })
        });
      } catch (err) {
        console.error("Erro ao enviar push:", err);
      }

      const cleanPhone = (editingApp.customer_phone || '').replace(/\D/g, '');
      if (cleanPhone) {
        const msg = `Olá ${editingApp.customer_name}! 🔄 Seu agendamento no *${tenant.name}* foi reagendado para o dia *${formattedDate}* às *${rescheduleTime}*.`;
        window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
      }

      setEditingApp(null);
      fetchAppointmentsAndBlocks();
    }
  };

  const handleUpdateAppStatus = async (app, newStatus) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', app.id);
    
    if (error) {
      alert("Erro ao atualizar status: " + error.message);
    } else {
      try {
        let pushTitle = '';
        let pushMessage = '';
        const formattedDate = selectedDate.split('-').reverse().join('/');

        if (newStatus === 'concluido') {
          pushTitle = '✅ Atendimento Concluído!';
          pushMessage = `O atendimento de ${app.customer_name} (${app.start_time}) foi finalizado com sucesso.`;
        } else if (newStatus === 'cancelado') {
          pushTitle = '❌ Agendamento Cancelado';
          pushMessage = `O agendamento de ${app.customer_name} para ${formattedDate} às ${app.start_time} foi cancelado.`;
        }

        if (pushTitle) {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: pushTitle,
              message: pushMessage,
              url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
            })
          });
        }
      } catch (err) {
        console.error("Erro ao enviar push:", err);
      }

      fetchAppointmentsAndBlocks();
    }
  };

  const handleQuickManualAppSlot = (timeSlot) => {
    setManualProfId(selectedProf);
    setManualDate(selectedDate);
    setManualStartTime(timeSlot);
    setShowManualAppModal(true);
  };

  const handleQuickBlockSlot = (timeSlot) => {
    const [h, m] = timeSlot.split(':').map(Number);
    const endMin = h * 60 + m + 90;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    setBlockProfId(selectedProf);
    setBlockDate(selectedDate);
    setBlockStartTime(timeSlot);
    setBlockEndTime(endTimeStr);
    setBlockReason('Almoço / Intervalo');
    setIsFullDayBlock(false);
    setIsRecurringBlock(true);
    setShowBlockModal(true);
  };

  // GERAÇÃO DA LINHA DO TEMPO (PUXANDO DO PAINEL ADMIN DO PROFISSIONAL)
  const generateTimeline = () => {
    if (!selectedProf) return [];

    const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
    const currentProf = professionals.find(p => String(p.id) === String(selectedProf));

    // Sanitiza e valida os dias de trabalho do profissional
    let profWorkDays = currentProf?.work_days || [1, 2, 3, 4, 5, 6];
    if (typeof profWorkDays === 'string') {
      try { profWorkDays = JSON.parse(profWorkDays); } catch (e) { profWorkDays = [1, 2, 3, 4, 5, 6]; }
    }

    if (!profWorkDays.includes(selectedDayOfWeek)) {
      return [{ type: 'prof_off', reason: `${currentProf?.name || 'Profissional'} não atende neste dia da semana (Folga Recorrente).` }];
    }

    // Puxa as horas específicas configuradas na aba "Equipe" para o dia da semana atual
    let profWorkHours = currentProf?.work_hours || {};
    if (typeof profWorkHours === 'string') {
      try { profWorkHours = JSON.parse(profWorkHours); } catch (e) { profWorkHours = {}; }
    }

    const dayHours = profWorkHours[selectedDayOfWeek] || { open: '08:00', close: '18:00' };
    const [openH, openM] = (dayHours.open || '08:00').split(':').map(Number);
    const [closeH, closeM] = (dayHours.close || '18:00').split(':').map(Number);

    let currentMin = openH * 60 + (openM || 0);
    const endMin = closeH * 60 + (closeM || 0);

    const now = new Date();
    const todayStr = getTodayLocal();
    const isToday = selectedDate === todayStr;
    const nowInMinutes = now.getHours() * 60 + now.getMinutes();

    const timeline = [];

    const profApps = appointments.filter(a => String(a.professional_id) === String(selectedProf));
    const profBlocks = blockedTimes.filter(b => b.professional_id === null || String(b.professional_id) === String(selectedProf));

    while (currentMin < endMin) {
      const h = Math.floor(currentMin / 60);
      const m = currentMin % 60;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const isPast = isToday && currentMin < nowInMinutes;

      const appsStarting = profApps.filter(a => {
        const [aStartH, aStartM] = a.start_time.split(':').map(Number);
        return (aStartH * 60 + aStartM) === currentMin;
      });

      const blocksStarting = profBlocks.filter(b => {
        const [bStartH, bStartM] = b.start_time.split(':').map(Number);
        return (bStartH * 60 + bStartM) === currentMin;
      });

      if (appsStarting.length > 0) {
        appsStarting.forEach(app => {
          timeline.push({ time: timeStr, type: 'appointment', data: app, isPast });
        });
      } else if (blocksStarting.length > 0) {
        blocksStarting.forEach(block => {
          timeline.push({ time: timeStr, type: 'blocked', data: block, isPast });
        });
      } else {
        const isInsideApp = profApps.some(a => {
          const [aStartH, aStartM] = a.start_time.split(':').map(Number);
          const aStart = aStartH * 60 + aStartM;
          const aEnd = aStart + (a.total_duration_minutes || 30);
          return currentMin > aStart && currentMin < aEnd;
        });

        const isInsideBlock = profBlocks.some(b => {
          const [bStartH, bStartM] = b.start_time.split(':').map(Number);
          const [bEndH, bEndM] = b.end_time.split(':').map(Number);
          const bStart = bStartH * 60 + bStartM;
          const bEnd = bEndH * 60 + bEndM;
          return currentMin > bStart && currentMin < bEnd;
        });

        if (!isInsideApp && !isInsideBlock) {
          timeline.push({ time: timeStr, type: 'free', isPast });
        }
      }

      currentMin += 30;
    }

    return timeline;
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando Agenda...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  const currentProf = professionals.find(p => String(p.id) === String(selectedProf));
  const displayedAppointments = appointments.filter(a => String(a.professional_id) === String(selectedProf));
  const totalAmount = displayedAppointments.reduce((acc, app) => acc + Number(app.total_price || 0), 0);
  const completedCount = displayedAppointments.filter(app => app.status === 'concluido').length;
  const pendingCount = displayedAppointments.filter(app => app.status === 'agendado').length;

  const timelineItems = generateTimeline();
  const selectedDayOfWeekNum = new Date(blockDate + 'T00:00:00').getDay();
  const selectedDayLabel = ALL_DAYS.find(d => d.id === selectedDayOfWeekNum)?.label || '';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-5xl mx-auto font-sans pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-4 border-b border-gray-800 mb-4 gap-4">
        <div>
          <h1 className="font-bold text-xl text-orange-500">📅 Gestão da Agenda — {tenant.name}</h1>
          <p className="text-xs text-gray-400">Navegue pelos horários livres e compromissos marcados.</p>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto flex-wrap gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs font-bold text-white focus:outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
          />

          <button
            onClick={() => {
              setManualProfId(selectedProf);
              setManualDate(selectedDate);
              setShowManualAppModal(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center space-x-1 whitespace-nowrap">
            <span>➕ Agendar Cliente</span>
          </button>

          <button
            onClick={() => {
              setBlockProfId(selectedProf);
              setBlockDate(selectedDate);
              setIsFullDayBlock(false);
              setIsRecurringBlock(false);
              setShowBlockModal(true);
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center space-x-1 whitespace-nowrap">
            <span>🔒 Fechar Horário</span>
          </button>

          <button onClick={() => fetchAppointmentsAndBlocks()} className="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-2.5 rounded-xl text-xs font-bold transition">
            🔄
          </button>
        </div>
      </header>

      {/* DIAS DA SEMANA */}
      <div className="mb-6">
        <label className="text-[11px] font-bold text-gray-400 block uppercase tracking-wider mb-2">
          📆 Dias da Semana
        </label>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {currentWeekDays.map((item) => {
            const isSelected = item.dateStr === selectedDate;

            return (
              <button
                key={item.dateStr}
                onClick={() => setSelectedDate(item.dateStr)}
                className={`py-2.5 px-1 rounded-xl border flex flex-col items-center justify-center transition ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500 text-white font-bold shadow-lg shadow-orange-500/20'
                    : 'border-gray-800 bg-gray-900/80 hover:bg-gray-800 text-gray-300'
                }`}>
                <span className="text-[10px] uppercase">{item.name}</span>
                <span className="text-sm font-bold mt-0.5">{item.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SELEÇÃO DA EQUIPE */}
      <div className="mb-6">
        <label className="text-[11px] font-bold text-gray-400 block uppercase tracking-wider mb-2">
          💈 Selecione a Agenda do Profissional
        </label>

        <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-none">
          {professionals.map(prof => {
            const isSelected = String(selectedProf) === String(prof.id);
            const profAppsCount = appointments.filter(a => String(a.professional_id) === String(prof.id)).length;

            return (
              <button
                key={prof.id}
                onClick={() => {
                  setSelectedProf(prof.id);
                  setBlockProfId(prof.id);
                  setManualProfId(prof.id);
                }}
                className={`p-3 rounded-2xl border flex items-center space-x-3 min-w-[170px] transition text-left relative ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                    : 'border-gray-800 bg-gray-900/60 hover:bg-gray-900'
                }`}>
                <img
                  src={prof.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}
                  alt={prof.name}
                  className="w-10 h-10 rounded-full object-cover border border-gray-700 bg-gray-800"
                />
                <div className="truncate">
                  <span className="font-bold text-xs text-white block truncate">{prof.name}</span>
                  <span className="text-[10px] text-gray-400 truncate">{prof.specialty || 'Profissional'}</span>
                </div>
                {profAppsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    {profAppsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MÉTRICAS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Atendimentos</span>
          <span className="text-base font-bold text-white">{displayedAppointments.length}</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl">
          <span className="text-[10px] font-bold text-yellow-400 uppercase block">Pendentes</span>
          <span className="text-base font-bold text-yellow-400">{pendingCount}</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl">
          <span className="text-[10px] font-bold text-green-400 uppercase block">Concluídos</span>
          <span className="text-base font-bold text-green-400">{completedCount}</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Previsto</span>
          <span className="text-base font-bold text-green-400">R$ {totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* LINHA DO TEMPO */}
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            📋 Agenda do Dia — {currentProf?.name || 'Profissional'}
          </h2>
          <span className="text-[10px] text-gray-500">Horários organizados</span>
        </div>

        {timelineItems.map((item, idx) => {
          if (item.type === 'prof_off') {
            return (
              <div key={`off-${idx}`} className="bg-red-950/20 border border-red-500/40 p-6 rounded-3xl text-center space-y-2 my-4">
                <span className="text-2xl block">🛑</span>
                <h3 className="font-bold text-sm text-red-400">Agenda Indisponível neste dia</h3>
                <p className="text-xs text-gray-300">{item.reason}</p>
                <p className="text-[10px] text-gray-500">Você pode ajustar os dias de atendimento na aba Equipe do Admin.</p>
              </div>
            );
          }

          if (item.type === 'free') {
            return (
              <div key={`free-${selectedProf}-${item.time}`} className={`bg-gray-900/40 border border-dashed border-gray-800/80 p-3 rounded-2xl flex justify-between items-center transition hover:border-gray-700 ${item.isPast ? 'opacity-60' : ''}`}>
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-gray-400 bg-gray-800 px-2.5 py-1 rounded-lg">
                    ⏰ {item.time}
                  </span>
                  {item.isPast ? (
                    <span className="text-xs font-bold text-gray-500 flex items-center space-x-1">
                      <span>⏳ Horário Passado</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                      <span>🟢 Horário Livre / Disponível</span>
                    </span>
                  )}
                </div>

                <div className="flex space-x-1.5">
                  <button
                    onClick={() => handleQuickManualAppSlot(item.time)}
                    className="bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/30 px-3 py-1 rounded-xl text-[11px] font-bold transition">
                    ➕ Agendar
                  </button>
                  <button
                    onClick={() => handleQuickBlockSlot(item.time)}
                    className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-xl text-[11px] font-bold transition">
                    🔒 Bloquear
                  </button>
                </div>
              </div>
            );
          }

          if (item.type === 'appointment') {
            const app = item.data;
            const servicesList = Array.isArray(app.services_json) ? app.services_json : [];
            const cleanPhone = (app.customer_phone || '').replace(/\D/g, '');

            return (
              <div key={`app-${app.id}-${idx}`} className={`bg-gray-900 border border-gray-800 p-4 rounded-2xl space-y-3 shadow-lg border-l-4 border-l-orange-500 ${item.isPast ? 'opacity-80' : ''}`}>
                <div className="flex justify-between items-start border-b border-gray-800 pb-2.5">
                  <div className="flex items-center space-x-3">
                    <span className="bg-orange-500/10 border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded-xl font-bold text-xs">
                      ⏰ {app.start_time} - {app.end_time}
                    </span>
                    <div>
                      <h3 className="font-bold text-xs text-white flex items-center space-x-1">
                        <span>{app.customer_name}</span>
                        {cleanPhone && (
                          <a
                            href={`https://wa.me/55${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full ml-1">
                            💬 WhatsApp
                          </a>
                        )}
                      </h3>
                      <p className="text-[10px] text-gray-400">📱 {app.customer_phone}</p>
                    </div>
                  </div>

                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg ${
                    app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                    app.status === 'concluido' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-gray-950 p-3 rounded-xl border border-gray-800/80">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Serviço(s) Solicitado(s):</span>
                    <span className="font-bold text-orange-300">
                      {servicesList.map(s => s.name).join(', ') || 'Atendimento Geral'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-gray-400 block text-[10px]">Valor Total:</span>
                    <span className="font-bold text-green-400 text-sm">R$ {Number(app.total_price || 0).toFixed(2)} ({app.payment_method || 'No Local'})</span>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  {app.status === 'agendado' && (
                    <>
                      <button
                        onClick={() => handleOpenReschedule(app)}
                        className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-xl font-bold text-xs transition">
                        ✏️ Reagendar
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app, 'concluido')}
                        className="bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/30 px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
                        ✅ Concluir
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app, 'cancelado')}
                        className="bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
                        ❌ Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }

          if (item.type === 'blocked') {
            const block = item.data;
            const isRecurring = block.is_recurring || (block.reason && block.reason.includes('[RECORRENTE]'));

            return (
              <div key={`block-${block.id}-${idx}`} className="bg-red-950/20 border border-red-500/30 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-red-400 font-bold block">🔒 Horário Bloqueado</span>
                    {isRecurring && (
                      <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full">
                        🔁 Recorrente
                      </span>
                    )}
                  </div>
                  <span className="text-red-300 text-xs font-bold">⏰ {block.start_time} às {block.end_time}</span>
                  {block.reason && <span className="text-gray-400 text-[10px] block italic">{block.reason.replace(' [RECORRENTE]', '')}</span>}
                </div>
                <button
                  onClick={() => handleDeleteBlock(block.id)}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-xl font-bold text-[11px] transition">
                  🔓 Desbloquear
                </button>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* MODAL DE AGENDAMENTO MANUAL PELO PROFISSIONAL */}
      {showManualAppModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-green-400 flex items-center space-x-1">
                <span>➕ Agendar Atendimento Manual</span>
              </h3>
              <button onClick={() => setShowManualAppModal(false)} className="text-gray-400 font-bold text-xs hover:text-white">✕ Fechar</button>
            </div>

            <form onSubmit={handleCreateManualApp} className="space-y-3 text-xs">
              <div>
                <label className="text-gray-400 block mb-1">Profissional Atendente:</label>
                <select
                  value={manualProfId}
                  onChange={(e) => setManualProfId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none">
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Nome Completo do Cliente:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria Oliveira"
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">WhatsApp do Cliente (DDD + Número):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 47999999999"
                  value={manualCustomerPhone}
                  onChange={(e) => setManualCustomerPhone(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Procedimento / Serviço:</label>
                <select
                  value={manualSelectedServiceId}
                  onChange={(e) => setManualSelectedServiceId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none">
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — R$ {Number(s.price).toFixed(2)} ({formatDuration(s.duration_minutes)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-400 block mb-1">Data:</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none cursor-pointer"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>

                <div>
                  <label className="text-gray-400 block mb-1">Horário de Início:</label>
                  <input
                    type="time"
                    required
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualAppModal(false)}
                  className="w-1/2 bg-gray-800 text-gray-300 py-3 rounded-xl font-bold">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingManualApp}
                  className="w-1/2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold transition">
                  {isSavingManualApp ? 'Agendando...' : 'Confirmar & Notificar WhatsApp 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REAGENDAR ATENDIMENTO */}
      {editingApp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-purple-400">✏️ Reagendar Atendimento #{editingApp.id}</h3>
              <button onClick={() => setEditingApp(null)} className="text-gray-400 font-bold text-xs">✕ Fechar</button>
            </div>

            <form onSubmit={handleSaveReschedule} className="space-y-3 text-xs">
              <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800">
                <span className="text-gray-300 font-bold block">Cliente: {editingApp.customer_name}</span>
                <span className="text-gray-400 text-[10px]">Horário Atual: {editingApp.appointment_date.split('-').reverse().join('/')} às {editingApp.start_time}</span>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Profissional Atendente:</label>
                <select
                  value={rescheduleProfId}
                  onChange={(e) => setRescheduleProfId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none">
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Nova Data:</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Novo Horário de Início:</label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingApp(null)}
                  className="w-1/2 bg-gray-800 text-gray-300 py-3 rounded-xl font-bold">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingReschedule}
                  className="w-1/2 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold transition">
                  {isSavingReschedule ? 'Salvando...' : 'Confirmar Reagendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FECHAR AGENDA / BLOQUEAR HORÁRIO */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-purple-400 flex items-center space-x-1">
                <span>🔒 Fechar Agenda / Bloquear Horário</span>
              </h3>
              <button onClick={() => setShowBlockModal(false)} className="text-gray-400 font-bold text-xs hover:text-white">✕ Fechar</button>
            </div>

            <form onSubmit={handleCreateBlock} className="space-y-3 text-xs">
              <div>
                <label className="text-gray-400 block mb-1">Selecione o Profissional:</label>
                <select
                  value={blockProfId}
                  onChange={(e) => setBlockProfId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none">
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Data de Referência:</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="flex items-center justify-between bg-gray-950 p-3 rounded-xl border border-gray-800">
                <div>
                  <span className="font-bold text-white block">📅 Bloquear o Dia Inteiro</span>
                  <span className="text-[10px] text-gray-400">Bloqueia do horário de abertura ao fechamento</span>
                </div>
                <input
                  type="checkbox"
                  checked={isFullDayBlock}
                  onChange={(e) => setIsFullDayBlock(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
              </div>

              <div className="bg-purple-950/20 p-3 rounded-xl border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-purple-300 block">🔁 Repetir durante o mês todo (Recorrente)</span>
                    <span className="text-[10px] text-purple-200/70">Ideal para Almoço, Intervalos e Cursos fixos</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isRecurringBlock}
                    onChange={(e) => setIsRecurringBlock(e.target.checked)}
                    className="w-4 h-4 accent-purple-500 cursor-pointer"
                  />
                </div>

                {isRecurringBlock && (
                  <div className="pt-2 border-t border-purple-500/20 space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-300">
                      <span>Aplicar nos dias:</span>
                      <div className="flex space-x-1">
                        <button type="button" onClick={() => setBlockRepeatDays([1, 2, 3, 4, 5])} className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded font-bold">Seg-Sex</button>
                        <button type="button" onClick={() => setBlockRepeatDays([1, 2, 3, 4, 5, 6])} className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded font-bold">Seg-Sáb</button>
                        <button type="button" onClick={() => setBlockRepeatDays([0, 1, 2, 3, 4, 5, 6])} className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded font-bold">Todos</button>
                        <button type="button" onClick={() => setBlockRepeatDays([selectedDayOfWeekNum])} className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded font-bold">Toda {selectedDayLabel}</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {ALL_DAYS.map(day => {
                        const isSelected = blockRepeatDays.includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => toggleRepeatDay(day.id)}
                            className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${
                              isSelected 
                                ? 'bg-purple-600 text-white border-purple-400' 
                                : 'bg-gray-900 text-gray-500 border-gray-800'
                            }`}>
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {!isFullDayBlock && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400 block mb-1">Hora de Início:</label>
                    <input
                      type="time"
                      required={!isFullDayBlock}
                      value={blockStartTime}
                      onChange={(e) => setBlockStartTime(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-gray-400 block mb-1">Hora de Fim:</label>
                    <input
                      type="time"
                      required={!isFullDayBlock}
                      value={blockEndTime}
                      onChange={(e) => setBlockEndTime(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-gray-400 block mb-1">Motivo do Bloqueio:</label>
                <input
                  type="text"
                  placeholder="Ex: Almoço / Intervalo, Curso..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="w-1/2 bg-gray-800 text-gray-300 py-3 rounded-xl font-bold">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingBlock}
                  className="w-1/2 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold transition">
                  {isSavingBlock ? 'Salvando...' : 'Confirmar Bloqueio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
