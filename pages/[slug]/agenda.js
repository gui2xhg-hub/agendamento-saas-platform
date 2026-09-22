import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// PRESETS DE CORES EXCLUSIVOS E PREDEFINIDOS PARA A AGENDA
const THEME_PRESETS = {
  dark: {
    name: 'Dark 🌙',
    primary: '#FF8C00',
    secondary: '#090D16',
    cardBg: '#111827',
    text: '#FFFFFF',
    border: 'rgba(255, 255, 255, 0.1)'
  },
  rosa: {
    name: 'Rosa 🌸',
    primary: '#EC4899',
    secondary: '#1A0B13',
    cardBg: '#2A1220',
    text: '#FDF2F8',
    border: 'rgba(236, 72, 153, 0.2)'
  },
  roxo: {
    name: 'Roxo 🔮',
    primary: '#A855F7',
    secondary: '#0F091A',
    cardBg: '#1D1230',
    text: '#F3E8FF',
    border: 'rgba(168, 85, 247, 0.2)'
  },
  azul: {
    name: 'Azul 💎',
    primary: '#3B82F6',
    secondary: '#0B132B',
    cardBg: '#1C2541',
    text: '#EFF6FF',
    border: 'rgba(59, 130, 246, 0.2)'
  },
  claro: {
    name: 'Claro ☀️',
    primary: '#2563EB',
    secondary: '#F3F4F6',
    cardBg: '#FFFFFF',
    text: '#111827',
    border: 'rgba(0, 0, 0, 0.1)'
  }
};

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
  const [tomorrowApps, setTomorrowApps] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [loading, setLoading] = useState(true);

  // SELETOR DE TEMA PRÓPRIO DA AGENDA (INICIA EM 'dark')
  const [agendaTheme, setAgendaTheme] = useState('dark');

  // FILTROS DE DATA E PROFISSIONAL
  const [selectedDate, setSelectedDate] = useState(getTodayLocal());
  const [selectedProf, setSelectedProf] = useState('');
  const [showTomorrowSummary, setShowTomorrowSummary] = useState(false);

  // FILTRO DE CLIENTES NO MODAL ('prof' = Apenas da Profissional, 'all' = Todos os Clientes)
  const [customerFilterMode, setCustomerFilterMode] = useState('prof');

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
      const savedTheme = localStorage.getItem(`agenda_custom_theme_${slug}`);
      if (savedTheme && THEME_PRESETS[savedTheme]) {
        setAgendaTheme(savedTheme);
      } else {
        setAgendaTheme('dark');
      }

      fetchTenantAndData();
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (tenant?.id && selectedDate) {
      fetchAppointmentsAndBlocks();
      fetchTomorrowAppointments();
      fetchCustomersDirectory();
    }
  }, [tenant?.id, selectedDate, selectedProf]);

  const handleThemeChange = (newThemeKey) => {
    setAgendaTheme(newThemeKey);
    if (slug) {
      localStorage.setItem(`agenda_custom_theme_${slug}`, newThemeKey);
    }
  };

  const getManualServicesForProf = (profId) => {
    if (!profId) return [];
    return services.filter(s => {
      let allowedProfIds = s.professional_ids;
      if (typeof allowedProfIds === 'string') {
        try { allowedProfIds = JSON.parse(allowedProfIds); } catch (e) { allowedProfIds = []; }
      }
      if (Array.isArray(allowedProfIds) && allowedProfIds.length > 0) {
        return allowedProfIds.some(id => String(id) === String(profId));
      }
      return true;
    });
  };

  const fetchTenantAndData = async () => {
    try {
      setLoading(true);
      const cleanSlug = String(slug).toLowerCase().trim();
      const { data: tData, error: tErr } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

      if (tErr) throw tErr;

      if (tData) {
        setTenant(tData);
        const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tData.id).eq('active', true);
        const { data: sData } = await supabase.from('services').select('*').eq('tenant_id', tData.id).eq('active', true);
        
        let initialProfId = '';
        if (pData && pData.length > 0) {
          setProfessionals(pData);
          initialProfId = pData[0].id;
          setSelectedProf(initialProfId);
          setBlockProfId(initialProfId);
          setManualProfId(initialProfId);
        }

        if (sData) {
          setServices(sData);
          if (initialProfId) {
            const availableForProf = sData.filter(s => {
              let allowed = s.professional_ids;
              if (typeof allowed === 'string') {
                try { allowed = JSON.parse(allowed); } catch (e) { allowed = []; }
              }
              if (Array.isArray(allowed) && allowed.length > 0) {
                return allowed.some(id => String(id) === String(initialProfId));
              }
              return true;
            });
            if (availableForProf.length > 0) {
              setManualSelectedServiceId(availableForProf[0].id);
            }
          }
        }
        
        await fetchAppointmentsAndBlocks(tData.id);
        await fetchTomorrowAppointments(tData.id);
        await fetchCustomersDirectory(tData.id);
      }
    } catch (err) {
      console.error("Erro ao carregar dados da agenda:", err);
    } font-sans finally {
      setLoading(false);
    }
  };

  const fetchAppointmentsAndBlocks = async (tenantId = tenant?.id) => {
    if (!tenantId) return;

    try {
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
    } catch (err) {
      console.error("Erro ao carregar horários e bloqueios:", err);
    }
  };

  const fetchTomorrowAppointments = async (tenantId = tenant?.id) => {
    if (!tenantId) return;
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString('sv-SE');

      let query = supabase.from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('appointment_date', tomorrowStr)
        .neq('status', 'cancelado');

      if (selectedProf) {
        query = query.eq('professional_id', selectedProf);
      }

      const { data: tApps } = await query.order('start_time', { ascending: true });
      if (tApps) setTomorrowApps(tApps);
    } catch (err) {
      console.error("Erro ao carregar agendamentos de amanhã:", err);
    }
  };

  const fetchCustomersDirectory = async (tenantId = tenant?.id) => {
    if (!tenantId) return;

    try {
      const { data: apps, error } = await supabase
        .from('appointments')
        .select('customer_name, customer_phone, professional_id')
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelado');

      if (!error && apps) {
        const customerMap = {};

        apps.forEach(a => {
          const phone = (a.customer_phone || '').replace(/\D/g, '');
          const name = (a.customer_name || '').trim();
          if (!phone || !name) return;

          if (!customerMap[phone]) {
            customerMap[phone] = {
              customer_name: name,
              customer_phone: phone,
              profIds: new Set()
            };
          }
          if (a.professional_id) {
            customerMap[phone].profIds.add(String(a.professional_id));
          }
        });

        const formattedList = Object.values(customerMap).map(c => ({
          customer_name: c.customer_name,
          customer_phone: c.customer_phone,
          profIds: Array.from(c.profIds)
        }));

        formattedList.sort((a, b) => 
          a.customer_name.localeCompare(b.customer_name, 'pt-BR', { sensitivity: 'base' })
        );

        setCustomerList(formattedList);
      }
    } catch (err) {
      console.error("Erro ao carregar diretório de clientes:", err);
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

  const handleSelectExistingCustomer = (phone) => {
    const found = customerList.find(c => c.customer_phone === phone);
    if (found) {
      setManualCustomerName(found.customer_name);
      setManualCustomerPhone(found.customer_phone);
    }
  };

  // 1. LEMBRETE DE AMANHÃ
  const handleSendWhatsappReminder = (app) => {
    const cleanPhone = (app.customer_phone || '').replace(/\D/g, '');
    if (!cleanPhone) return alert("Cliente não possui WhatsApp válido.");

    const formattedDate = app.appointment_date.split('-').reverse().join('/');
    const profObj = professionals.find(p => String(p.id) === String(app.professional_id));
    const profName = profObj ? profObj.name : tenant?.name;

    const msg = `*LEMBRETE DE AGENDAMENTO - ${(tenant?.name || '').toUpperCase()}* 🗓️\n\n` +
      `Olá *${app.customer_name}*, passando para lembrar do seu agendamento *Amanhã (${formattedDate})* às *${app.start_time}* com ${profName}.\n\n` +
      `Podemos confirmar sua presença? Responda este WhatsApp para confirmar! 😊`;

    window.location.href = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  // 2. AGENDAMENTO MANUAL
  const handleCreateManualApp = async (e) => {
    e.preventDefault();
    if (!manualCustomerName || !manualCustomerPhone) return alert("Preencha o Nome e WhatsApp do cliente!");
    if (!manualSelectedServiceId) return alert("Selecione o procedimento!");

    setIsSavingManualApp(true);

    try {
      const serviceObj = services.find(s => String(s.id) === String(manualSelectedServiceId));
      const duration = serviceObj?.duration_minutes || 30;
      const price = Number(serviceObj?.price || 0);

      const [h, m] = manualStartTime.split(':').map(Number);
      const endDateObj = new Date();
      endDateObj.setHours(h, m + duration, 0, 0);
      const endTime = endDateObj.toTimeString().substring(0, 5);

      const chosenProfObj = professionals.find(p => String(p.id) === String(manualProfId));
      const cleanPhone = manualCustomerPhone.replace(/\D/g, '');

      const parsedProfId = manualProfId ? parseInt(manualProfId, 10) : null;
      if (!parsedProfId) {
        setIsSavingManualApp(false);
        return alert("Selecione um profissional válido.");
      }

      const appointmentPayload = {
        tenant_id: tenant.id,
        professional_id: parsedProfId,
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

      if (error) {
        alert("Erro ao criar agendamento: " + error.message);
      } else {
        const formattedDate = manualDate.split('-').reverse().join('/');
        
        setShowManualAppModal(false);
        setManualCustomerName('');
        setManualCustomerPhone('');
        fetchAppointmentsAndBlocks();
        fetchTomorrowAppointments();
        fetchCustomersDirectory();

        if (cleanPhone) {
          const msg = `Olá *${manualCustomerName}*! 👋\n\n` +
            `Seu agendamento no *${tenant.name}* foi confirmado com sucesso!\n\n` +
            `📅 *Data:* ${formattedDate} às *${manualStartTime}*\n` +
            `👤 *Profissional:* ${chosenProfObj?.name || 'Equipe'}\n` +
            `✂️ *Procedimento:* ${serviceObj?.name || 'Atendimento'}\n\n` +
            `Te aguardamos! Se precisar alterar, nos avise por aqui.`;

          window.location.href = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
        }
      }
    } catch (err) {
      console.error("Erro na requisição de agendamento:", err);
      alert("Falha de conexão ao criar agendamento. Verifique sua internet e tente novamente.");
    } finally {
      setIsSavingManualApp(false);
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

    try {
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
      const parsedProfId = blockProfId ? parseInt(blockProfId, 10) : null;

      if (isRecurringBlock) {
        payloads = blockRepeatDays.map(dayNum => ({
          tenant_id: tenant.id,
          professional_id: parsedProfId,
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
          professional_id: parsedProfId,
          block_date: blockDate,
          start_time: finalStartTime,
          end_time: finalEndTime,
          reason: finalReason,
          is_recurring: false,
          recurring_day: blockDayOfWeek
        }];
      }

      const { error } = await supabase.from('blocked_times').insert(payloads);

      if (error) {
        alert("Erro ao fechar horário: " + error.message);
      } else {
        setShowBlockModal(false);
        setIsFullDayBlock(false);
        setIsRecurringBlock(false);
        fetchAppointmentsAndBlocks();
      }
    } catch (err) {
      console.error("Erro ao salvar bloqueio:", err);
      alert("Erro de conexão ao bloquear horário.");
    } finally {
      setIsSavingBlock(false);
    }
  };

  const handleDeleteBlock = async (blockId) => {
    if (!confirm("Deseja desmarcar este bloqueio e liberar o horário novamente?")) return;

    try {
      const { error } = await supabase.from('blocked_times').delete().eq('id', blockId);

      if (error) {
        alert("Erro ao remover bloqueio: " + error.message);
      } else {
        fetchAppointmentsAndBlocks();
      }
    } catch (err) {
      console.error("Erro ao remover bloqueio:", err);
      alert("Erro de conexão ao remover bloqueio.");
    }
  };

  const handleOpenReschedule = (app) => {
    setEditingApp(app);
    setRescheduleDate(app.appointment_date);
    setRescheduleTime(app.start_time);
    setRescheduleProfId(app.professional_id);
  };

  // 3. REAGENDAMENTO
  const handleSaveReschedule = async (e) => {
    e.preventDefault();
    if (!rescheduleDate || !rescheduleTime) return alert("Selecione nova data e horário!");

    setIsSavingReschedule(true);

    try {
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
          professional_id: parseInt(rescheduleProfId, 10),
          status: 'agendado'
        })
        .eq('id', editingApp.id);

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
        
        setEditingApp(null);
        fetchAppointmentsAndBlocks();
        fetchTomorrowAppointments();

        if (cleanPhone) {
          const msg = `Olá ${editingApp.customer_name}! 🔄 Seu agendamento no *${tenant.name}* foi reagendado para o dia *${formattedDate}* às *${rescheduleTime}*.`;
          window.location.href = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
        }
      }
    } catch (err) {
      console.error("Erro ao reagendar:", err);
      alert("Erro de conexão ao reagendar.");
    } finally {
      setIsSavingReschedule(false);
    }
  };

  const handleUpdateAppStatus = async (app, newStatus) => {
    try {
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
        fetchTomorrowAppointments();
      }
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
    }
  };

  const openManualModalWithProf = (profId, timeSlot = '09:00') => {
    setManualProfId(profId);
    setManualDate(selectedDate);
    setManualStartTime(timeSlot);

    const validServices = getManualServicesForProf(profId);
    if (validServices.length > 0) {
      setManualSelectedServiceId(validServices[0].id);
    } else {
      setManualSelectedServiceId('');
    }

    setShowManualAppModal(true);
  };

  const handleQuickManualAppSlot = (timeSlot) => {
    openManualModalWithProf(selectedProf, timeSlot);
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

  const generateTimeline = () => {
    if (!selectedProf) return [];

    const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
    const currentProf = professionals.find(p => String(p.id) === String(selectedProf));

    let profWorkDays = currentProf?.work_days || [1, 2, 3, 4, 5, 6];
    if (typeof profWorkDays === 'string') {
      try { profWorkDays = JSON.parse(profWorkDays); } catch (e) { profWorkDays = [1, 2, 3, 4, 5, 6]; }
    }

    if (!profWorkDays.includes(selectedDayOfWeek)) {
      return [{ type: 'prof_off', reason: `${currentProf?.name || 'Profissional'} não atende neste dia da semana (Folga Recorrente).` }];
    }

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

  const activeTheme = THEME_PRESETS[agendaTheme] || THEME_PRESETS.dark;
  const primaryColor = activeTheme.primary;
  const secondaryColor = activeTheme.secondary;
  const cardBgColor = activeTheme.cardBg;
  const textColor = activeTheme.text;
  const borderColor = activeTheme.border;

  const currentProf = professionals.find(p => String(p.id) === String(selectedProf));
  const displayedAppointments = appointments.filter(a => String(a.professional_id) === String(selectedProf));
  const completedCount = displayedAppointments.filter(app => app.status === 'concluido').length;
  const pendingCount = displayedAppointments.filter(app => app.status === 'agendado').length;

  const timelineItems = generateTimeline();
  const selectedDayOfWeekNum = new Date(blockDate + 'T00:00:00').getDay();
  const selectedDayLabel = ALL_DAYS.find(d => d.id === selectedDayOfWeekNum)?.label || '';

  const manualFilteredServices = getManualServicesForProf(manualProfId);

  const filteredCustomerList = customerList.filter(c => {
    if (customerFilterMode === 'all') return true;
    return c.profIds.includes(String(manualProfId));
  });

  const activeManualProfObj = professionals.find(p => String(p.id) === String(manualProfId));

  return (
    <div 
      className="min-h-screen p-4 max-w-5xl mx-auto font-sans pb-20 transition-colors duration-300"
      style={{ backgroundColor: secondaryColor, color: textColor }}
    >
      {/* BARRA DE SELEÇÃO DE TEMA EXCLUSIVA DA AGENDA */}
      <div className="flex flex-col sm:flex-row justify-between items-center p-3 rounded-2xl mb-4 border space-y-2 sm:space-y-0" style={{ backgroundColor: cardBgColor, borderColor: borderColor }}>
        <span className="text-xs font-bold opacity-80 flex items-center space-x-1">
          <span>🎨 Aparência da Agenda:</span>
        </span>
        <div className="flex space-x-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {Object.entries(THEME_PRESETS).map(([key, themeObj]) => {
            const isActive = agendaTheme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleThemeChange(key)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center space-x-1 ${
                  isActive ? 'shadow-md scale-105' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: isActive ? themeObj.primary : secondaryColor,
                  color: isActive ? '#FFFFFF' : textColor,
                  border: `1px solid ${isActive ? themeObj.primary : borderColor}`
                }}>
                <span>{themeObj.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-4 border-b mb-4 gap-4" style={{ borderColor: borderColor }}>
        <div>
          <h1 className="font-bold text-xl" style={{ color: primaryColor }}>
            📅 Gestão da Agenda — {tenant.name}
          </h1>
          <p className="text-xs opacity-70">Navegue pelos horários livres e compromissos marcados.</p>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto flex-wrap gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border p-2.5 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
            style={{ backgroundColor: cardBgColor, color: textColor, borderColor: borderColor }}
          />

          <button
            onClick={() => openManualModalWithProf(selectedProf)}
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

          <button 
            onClick={() => fetchAppointmentsAndBlocks()} 
            className="border p-2.5 rounded-xl text-xs font-bold transition hover:opacity-80"
            style={{ backgroundColor: cardBgColor, color: textColor, borderColor: borderColor }}>
            🔄
          </button>
        </div>
      </header>

      {/* PAINEL DE LEMBRETES DO DIA SEGUINTE */}
      <div 
        className="mb-6 border rounded-2xl p-4 space-y-3 shadow-lg"
        style={{ backgroundColor: cardBgColor, borderColor: borderColor }}>
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowTomorrowSummary(!showTomorrowSummary)}>
          <div className="flex items-center space-x-2">
            <span className="text-base">🔔</span>
            <h2 className="font-bold text-xs" style={{ color: primaryColor }}>
              Lembretes de Amanhã ({tomorrowApps.length} agendamentos)
            </h2>
          </div>
          <button className="text-xs font-bold" style={{ color: primaryColor }}>
            {showTomorrowSummary ? '▲ Ocultar' : '▼ Visualizar & Enviar'}
          </button>
        </div>

        {showTomorrowSummary && (
          <div className="space-y-2 pt-2 border-t max-h-60 overflow-y-auto" style={{ borderColor: borderColor }}>
            {tomorrowApps.length === 0 ? (
              <p className="text-xs opacity-60 text-center py-2">Nenhum agendamento para amanhã nesta agenda.</p>
            ) : (
              tomorrowApps.map(app => (
                <div 
                  key={app.id} 
                  className="p-3 rounded-xl border flex justify-between items-center text-xs"
                  style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                  <div>
                    <span className="font-bold block" style={{ color: primaryColor }}>{app.start_time} — {app.customer_name}</span>
                    <span className="text-[10px] opacity-70 block">
                      {Array.isArray(app.services_json) ? app.services_json.map(s => s.name).join(', ') : 'Serviços'}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleSendWhatsappReminder(app)}
                    className="bg-green-600/20 hover:bg-green-600/30 text-green-500 border border-green-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition">
                    <span>📲 Enviar Lembrete</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* DIAS DA SEMANA */}
      <div className="mb-6">
        <label className="text-[11px] font-bold opacity-70 block uppercase tracking-wider mb-2">
          📆 Dias da Semana
        </label>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {currentWeekDays.map((item) => {
            const isSelected = item.dateStr === selectedDate;

            return (
              <button
                key={item.dateStr}
                onClick={() => setSelectedDate(item.dateStr)}
                className="py-2.5 px-1 rounded-xl border flex flex-col items-center justify-center transition"
                style={{
                  backgroundColor: isSelected ? primaryColor : cardBgColor,
                  borderColor: isSelected ? primaryColor : borderColor,
                  color: isSelected ? '#FFFFFF' : textColor
                }}>
                <span className="text-[10px] uppercase">{item.name}</span>
                <span className="text-sm font-bold mt-0.5">{item.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SELEÇÃO DA EQUIPE */}
      <div className="mb-6">
        <label className="text-[11px] font-bold opacity-70 block uppercase tracking-wider mb-2">
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
                className="p-3 rounded-2xl border flex items-center space-x-3 min-w-[170px] transition text-left relative"
                style={{
                  backgroundColor: isSelected ? `${primaryColor}20` : cardBgColor,
                  borderColor: isSelected ? primaryColor : borderColor,
                  color: textColor
                }}>
                <img
                  src={prof.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}
                  alt={prof.name}
                  className="w-10 h-10 rounded-full object-cover border"
                  style={{ borderColor: borderColor }}
                />
                <div className="truncate">
                  <span className="font-bold text-xs block truncate" style={{ color: textColor }}>{prof.name}</span>
                  <span className="text-[10px] opacity-70 truncate block">{prof.specialty || 'Profissional'}</span>
                </div>
                {profAppsCount > 0 && (
                  <span 
                    className="absolute -top-1.5 -right-1.5 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow"
                    style={{ backgroundColor: primaryColor }}>
                    {profAppsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MÉTRICAS */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border p-3 rounded-2xl" style={{ backgroundColor: cardBgColor, borderColor: borderColor }}>
          <span className="text-[10px] font-bold opacity-70 uppercase block">Atendimentos</span>
          <span className="text-base font-bold" style={{ color: textColor }}>{displayedAppointments.length}</span>
        </div>
        <div className="border p-3 rounded-2xl" style={{ backgroundColor: cardBgColor, borderColor: borderColor }}>
          <span className="text-[10px] font-bold text-yellow-500 uppercase block">Pendentes</span>
          <span className="text-base font-bold text-yellow-500">{pendingCount}</span>
        </div>
        <div className="border p-3 rounded-2xl" style={{ backgroundColor: cardBgColor, borderColor: borderColor }}>
          <span className="text-[10px] font-bold text-green-500 uppercase block">Concluídos</span>
          <span className="text-base font-bold text-green-500">{completedCount}</span>
        </div>
      </div>

      {/* LINHA DO TEMPO */}
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider opacity-70">
            📋 Agenda do Dia — {currentProf?.name || 'Profissional'}
          </h2>
          <span className="text-[10px] opacity-50">Horários organizados</span>
        </div>

        {timelineItems.map((item, idx) => {
          if (item.type === 'prof_off') {
            return (
              <div key={`off-${idx}`} className="bg-red-500/10 border border-red-500/30 p-6 rounded-3xl text-center space-y-2 my-4">
                <span className="text-2xl block">🛑</span>
                <h3 className="font-bold text-sm text-red-500">Agenda Indisponível neste dia</h3>
                <p className="text-xs opacity-80">{item.reason}</p>
                <p className="text-[10px] opacity-60">Você pode ajustar os dias de atendimento na aba Equipe do Admin.</p>
              </div>
            );
          }

          if (item.type === 'free') {
            return (
              <div 
                key={`free-${selectedProf}-${item.time}`} 
                className={`border border-dashed p-3 rounded-2xl flex justify-between items-center transition ${item.isPast ? 'opacity-50' : ''}`}
                style={{ backgroundColor: cardBgColor, borderColor: borderColor }}>
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg border" style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                    ⏰ {item.time}
                  </span>
                  {item.isPast ? (
                    <span className="text-xs font-bold opacity-50 flex items-center space-x-1">
                      <span>⏳ Horário Passado</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-emerald-500 flex items-center space-x-1">
                      <span>🟢 Horário Livre / Disponível</span>
                    </span>
                  )}
                </div>

                <div className="flex space-x-1.5">
                  <button
                    onClick={() => handleQuickManualAppSlot(item.time)}
                    className="bg-green-600/20 hover:bg-green-600/40 text-green-500 border border-green-500/30 px-3 py-1 rounded-xl text-[11px] font-bold transition">
                    ➕ Agendar
                  </button>
                  <button
                    onClick={() => handleQuickBlockSlot(item.time)}
                    className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-xl text-[11px] font-bold transition">
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
              <div 
                key={`app-${app.id}-${idx}`} 
                className={`border p-4 rounded-2xl space-y-3 shadow-lg border-l-4 ${item.isPast ? 'opacity-80' : ''}`}
                style={{ backgroundColor: cardBgColor, borderColor: borderColor, borderLeftColor: primaryColor }}>
                <div className="flex justify-between items-start border-b pb-2.5" style={{ borderColor: borderColor }}>
                  <div className="flex items-center space-x-3">
                    <span 
                      className="px-3 py-1.5 rounded-xl font-bold text-xs border"
                      style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, borderColor: borderColor }}>
                      ⏰ {app.start_time} - {app.end_time}
                    </span>
                    <div>
                      <h3 className="font-bold text-xs flex items-center space-x-1" style={{ color: textColor }}>
                        <span>{app.customer_name}</span>
                        {cleanPhone && (
                          <a
                            href={`https://wa.me/55${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] bg-green-500/20 hover:bg-green-500/40 text-green-500 border border-green-500/30 px-2 py-0.5 rounded-full ml-1">
                            💬 WhatsApp
                          </a>
                        )}
                      </h3>
                      <p className="text-[10px] opacity-70">📱 {app.customer_phone}</p>
                    </div>
                  </div>

                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg ${
                    app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
                    app.status === 'concluido' ? 'bg-green-500/20 text-green-500 border border-green-500/30' :
                    'bg-red-500/20 text-red-500 border border-red-500/30'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="p-3 rounded-xl border text-xs" style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                  <span className="opacity-60 block text-[10px]">Serviço(s) Solicitado(s):</span>
                  <span className="font-bold" style={{ color: primaryColor }}>
                    {servicesList.map(s => s.name).join(', ') || 'Atendimento Geral'}
                  </span>
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  {app.status === 'agendado' && (
                    <>
                      <button
                        onClick={() => handleOpenReschedule(app)}
                        className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded-xl font-bold text-xs transition">
                        ✏️ Reagendar
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app, 'concluido')}
                        className="bg-green-600/20 hover:bg-green-600/40 text-green-500 border border-green-500/30 px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
                        ✅ Concluir
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app, 'cancelado')}
                        className="bg-red-600/20 hover:bg-red-600/40 text-red-500 border border-red-500/30 px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
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
              <div key={`block-${block.id}-${idx}`} className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-red-500 font-bold block">🔒 Horário Bloqueado</span>
                    {isRecurring && (
                      <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full">
                        🔁 Recorrente
                      </span>
                    )}
                  </div>
                  <span className="text-red-400 text-xs font-bold">⏰ {block.start_time} às {block.end_time}</span>
                  {block.reason && <span className="opacity-70 text-[10px] block italic">{block.reason.replace(' [RECORRENTE]', '')}</span>}
                </div>
                <button
                  onClick={() => handleDeleteBlock(block.id)}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-xl font-bold text-[11px] transition">
                  🔓 Desbloquear
                </button>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* MODAL DE AGENDAMENTO MANUAL */}
      {showManualAppModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="border w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: cardBgColor, color: textColor, borderColor: borderColor }}>
            <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: borderColor }}>
              <h3 className="font-bold text-sm text-green-500 flex items-center space-x-1">
                <span>➕ Agendar Atendimento Manual</span>
              </h3>
              <button onClick={() => setShowManualAppModal(false)} className="opacity-60 font-bold text-xs hover:opacity-100">✕ Fechar</button>
            </div>

            <form onSubmit={handleCreateManualApp} className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="opacity-70 block text-[11px]">📋 Selecionar Cliente Cadastrado:</label>
                  <div className="flex space-x-1 p-0.5 rounded-lg border" style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                    <button
                      type="button"
                      onClick={() => setCustomerFilterMode('prof')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        customerFilterMode === 'prof' ? 'text-white shadow' : 'opacity-60'
                      }`}
                      style={{ backgroundColor: customerFilterMode === 'prof' ? primaryColor : 'transparent' }}>
                      De {activeManualProfObj?.name ? activeManualProfObj.name.split(' ')[0] : 'Profissional'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerFilterMode('all')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        customerFilterMode === 'all' ? 'text-white shadow' : 'opacity-60'
                      }`}
                      style={{ backgroundColor: customerFilterMode === 'all' ? primaryColor : 'transparent' }}>
                      Todos ({customerList.length})
                    </button>
                  </div>
                </div>

                <select 
                  onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none cursor-pointer"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}>
                  <option value="">
                    {filteredCustomerList.length === 0 
                      ? '-- Nenhum cliente encontrado para este filtro --' 
                      : '-- Selecione um cliente da lista (A-Z) --'}
                  </option>
                  {filteredCustomerList.map((c, i) => (
                    <option key={i} value={c.customer_phone}>
                      {c.customer_name} ({c.customer_phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="opacity-70 block mb-1">Profissional Atendente:</label>
                <select
                  value={manualProfId}
                  onChange={(e) => {
                    const newProfId = e.target.value;
                    setManualProfId(newProfId);
                    const validServices = getManualServicesForProf(newProfId);
                    if (validServices.length > 0) {
                      setManualSelectedServiceId(validServices[0].id);
                    } else {
                      setManualSelectedServiceId('');
                    }
                  }}
                  className="w-full border p-2.5 rounded-xl focus:outline-none cursor-pointer"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="opacity-70 block mb-1">Nome Completo do Cliente:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria Oliveira"
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                />
              </div>

              <div>
                <label className="opacity-70 block mb-1">WhatsApp do Cliente (DDD + Número):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 47999999999"
                  value={manualCustomerPhone}
                  onChange={(e) => setManualCustomerPhone(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                />
              </div>

              <div>
                <label className="opacity-70 block mb-1">Procedimento / Serviço:</label>
                <select
                  value={manualSelectedServiceId}
                  onChange={(e) => setManualSelectedServiceId(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none cursor-pointer"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}>
                  {manualFilteredServices.length === 0 ? (
                    <option value="">Nenhum procedimento atribuído a esta profissional</option>
                  ) : (
                    manualFilteredServices.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatDuration(s.duration_minutes)})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="opacity-70 block mb-1">Data:</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full border p-2.5 rounded-xl focus:outline-none cursor-pointer"
                    style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                  />
                </div>

                <div>
                  <label className="opacity-70 block mb-1">Horário de Início:</label>
                  <input
                    type="time"
                    required
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    className="w-full border p-2.5 rounded-xl focus:outline-none"
                    style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualAppModal(false)}
                  className="w-1/2 border opacity-70 py-3 rounded-xl font-bold"
                  style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingManualApp || manualFilteredServices.length === 0}
                  className="w-1/2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-50">
                  {isSavingManualApp ? 'Agendando...' : 'Confirmar & Notificar 🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REAGENDAR ATENDIMENTO */}
      {editingApp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="border w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl" style={{ backgroundColor: cardBgColor, color: textColor, borderColor: borderColor }}>
            <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: borderColor }}>
              <h3 className="font-bold text-sm text-purple-400">✏️ Reagendar Atendimento #{editingApp.id}</h3>
              <button onClick={() => setEditingApp(null)} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            <form onSubmit={handleSaveReschedule} className="space-y-3 text-xs">
              <div className="p-2.5 rounded-xl border" style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                <span className="font-bold block">Cliente: {editingApp.customer_name}</span>
                <span className="opacity-70 text-[10px]">Horário Atual: {editingApp.appointment_date.split('-').reverse().join('/')} às {editingApp.start_time}</span>
              </div>

              <div>
                <label className="opacity-70 block mb-1">Profissional Atendente:</label>
                <select
                  value={rescheduleProfId}
                  onChange={(e) => setRescheduleProfId(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="opacity-70 block mb-1">Nova Data:</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none cursor-pointer"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                />
              </div>

              <div>
                <label className="opacity-70 block mb-1">Novo Horário de Início:</label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingApp(null)}
                  className="w-1/2 border opacity-70 py-3 rounded-xl font-bold"
                  style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
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
          <div className="border w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: cardBgColor, color: textColor, borderColor: borderColor }}>
            <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: borderColor }}>
              <h3 className="font-bold text-sm text-purple-400 flex items-center space-x-1">
                <span>🔒 Fechar Agenda / Bloquear Horário</span>
              </h3>
              <button onClick={() => setShowBlockModal(false)} className="opacity-60 font-bold text-xs hover:opacity-100">✕ Fechar</button>
            </div>

            <form onSubmit={handleCreateBlock} className="space-y-3 text-xs">
              <div>
                <label className="opacity-70 block mb-1">Selecione o Profissional:</label>
                <select
                  value={blockProfId}
                  onChange={(e) => setBlockProfId(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="opacity-70 block mb-1">Data de Referência:</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none cursor-pointer"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border" style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
                <div>
                  <span className="font-bold block">📅 Bloquear o Dia Inteiro</span>
                  <span className="text-[10px] opacity-70">Bloqueia do horário de abertura ao fechamento</span>
                </div>
                <input
                  type="checkbox"
                  checked={isFullDayBlock}
                  onChange={(e) => setIsFullDayBlock(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl border border-purple-500/30 space-y-2 bg-purple-500/10">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-purple-400 block">🔁 Repetir durante o mês todo (Recorrente)</span>
                    <span className="text-[10px] opacity-70">Ideal para Almoço, Intervalos e Cursos fixos</span>
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
                    <div className="flex justify-between items-center text-[10px] opacity-80">
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
                                : 'opacity-50'
                            }`}
                            style={{ 
                              backgroundColor: !isSelected ? secondaryColor : undefined,
                              borderColor: !isSelected ? borderColor : undefined
                            }}>
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
                    <label className="opacity-70 block mb-1">Hora de Início:</label>
                    <input
                      type="time"
                      required={!isFullDayBlock}
                      value={blockStartTime}
                      onChange={(e) => setBlockStartTime(e.target.value)}
                      className="w-full border p-2.5 rounded-xl focus:outline-none"
                      style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                    />
                  </div>

                  <div>
                    <label className="opacity-70 block mb-1">Hora de Fim:</label>
                    <input
                      type="time"
                      required={!isFullDayBlock}
                      value={blockEndTime}
                      onChange={(e) => setBlockEndTime(e.target.value)}
                      className="w-full border p-2.5 rounded-xl focus:outline-none"
                      style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="opacity-70 block mb-1">Motivo do Bloqueio:</label>
                <input
                  type="text"
                  placeholder="Ex: Almoço / Intervalo, Curso..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full border p-2.5 rounded-xl focus:outline-none"
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: borderColor }}
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="w-1/2 border opacity-70 py-3 rounded-xl font-bold"
                  style={{ backgroundColor: secondaryColor, borderColor: borderColor }}>
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
