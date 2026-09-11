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

export default function AgendamentoCliente() {
  const router = useRouter();
  const { slug, prof, staff } = router.query;

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [profServices, setProfServices] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [loading, setLoading] = useState(true);

  // ESTADOS DO AGENDAMENTO
  const [selectedProf, setSelectedProf] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');
  const [existingAppointments, setExistingAppointments] = useState([]);

  // DADOS DO CLIENTE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('No Local');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // MODAL MEUS AGENDAMENTOS
  const [showMyAppsModal, setShowMyAppsModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [myAppointments, setMyAppointments] = useState([]);
  const [isSearchingApps, setIsSearchingApps] = useState(false);

  // ESTADOS DE REAGENDAMENTO
  const [editingUserApp, setEditingUserApp] = useState(null);
  const [userNewDate, setUserNewDate] = useState('');
  const [userNewTime, setUserNewTime] = useState('');
  const [isSavingUserReschedule, setIsSavingUserReschedule] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (professionals.length === 1) {
      setSelectedProf(professionals[0].id);
    } else if (professionals.length > 1) {
      const urlProfId = prof || staff;
      if (urlProfId) {
        const urlMatch = professionals.find(p => String(p.id) === String(urlProfId));
        if (urlMatch) {
          setSelectedProf(urlMatch.id);
        }
      }
    }
  }, [professionals, prof, staff]);

  useEffect(() => {
    if (tenant?.id && selectedDate && selectedProf) {
      fetchExistingAppointmentsAndBlocks();
    }
  }, [tenant?.id, selectedDate, selectedProf]);

  const fetchTenantData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant({
        ...tData,
        work_days: tData.work_days || [1, 2, 3, 4, 5, 6]
      });

      const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tData.id).eq('active', true);
      const { data: sData } = await supabase.from('services').select('*').eq('tenant_id', tData.id).eq('active', true);
      const { data: psData } = await supabase.from('professional_services').select('*');

      if (pData) setProfessionals(pData);
      if (sData) setServices(sData);
      if (psData) setProfServices(psData);
    }
    setLoading(false);
  };

  const fetchExistingAppointmentsAndBlocks = async () => {
    if (!tenant?.id) return;

    let appQuery = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelado');

    if (selectedProf) {
      appQuery = appQuery.eq('professional_id', selectedProf);
    }

    let blockQuery = supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenant.id);

    const { data: apps } = await appQuery;
    const { data: blocks } = await blockQuery;

    if (apps) setExistingAppointments(apps);
    if (blocks) setBlockedTimes(blocks);
  };

  const handleSearchMyAppointments = async (e) => {
    if (e) e.preventDefault();
    const clean = searchPhone.replace(/\D/g, '');
    if (!clean) return alert("Digite um número de telefone válido!");

    setIsSearchingApps(true);
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .ilike('customer_phone', `%${clean}%`)
      .order('appointment_date', { ascending: false });

    if (data) setMyAppointments(data);
    setIsSearchingApps(false);
  };

  const handleUserCancelApp = async (app) => {
    const formattedDate = app.appointment_date.split('-').reverse().join('/');
    if (!confirm(`Deseja realmente cancelar seu agendamento do dia ${formattedDate} às ${app.start_time}?`)) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado' })
      .eq('id', app.id);

    if (error) {
      alert("Erro ao cancelar: " + error.message);
    } else {
      alert("Agendamento cancelado com sucesso!");

      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '❌ Agendamento Cancelado',
            message: `O cliente ${app.customer_name} cancelou o agendamento do dia ${formattedDate} às ${app.start_time}.`,
            url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
          })
        });
      } catch (err) {
        console.error("Erro ao disparar notificação:", err);
      }

      const appProfObj = professionals.find(p => String(p.id) === String(app.professional_id));
      const targetPhone = (appProfObj && appProfObj.phone) ? appProfObj.phone : tenant.whatsapp;
      const cleanWhatsapp = targetPhone ? targetPhone.replace(/\D/g, '') : '';

      if (cleanWhatsapp) {
        const msg = `*CANCELAMENTO DE AGENDAMENTO #${app.id} - ${tenant.name.toUpperCase()}*\n\n` +
          `Olá, o cliente *${app.customer_name}* cancelou o agendamento do dia *${formattedDate}* às *${app.start_time}*.`;

        window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
      }

      handleSearchMyAppointments();
    }
  };

  const handleOpenUserReschedule = (app) => {
    setEditingUserApp(app);
    setUserNewDate(app.appointment_date);
    setUserNewTime(app.start_time);
  };

  const handleSaveUserReschedule = async (e) => {
    e.preventDefault();
    if (!userNewDate || !userNewTime) return alert("Selecione nova data e horário!");

    setIsSavingUserReschedule(true);

    const duration = editingUserApp.total_duration_minutes || 30;
    const [h, m] = userNewTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + duration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const { error } = await supabase
      .from('appointments')
      .update({
        appointment_date: userNewDate,
        start_time: userNewTime,
        end_time: endTime,
        status: 'agendado'
      })
      .eq('id', editingUserApp.id);

    setIsSavingUserReschedule(false);

    if (error) {
      return alert("Erro ao reagendar: " + error.message);
    }

    const formattedDate = userNewDate.split('-').reverse().join('/');
    alert("Agendamento reagendado com sucesso!");

    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔄 Horário Reagendado!',
          message: `${editingUserApp.customer_name} reagendou o atendimento para ${formattedDate} às ${userNewTime}.`,
          url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
        })
      });
    } catch (err) {
      console.error("Erro ao disparar notificação:", err);
    }

    const appProfObj = professionals.find(p => String(p.id) === String(editingUserApp.professional_id));
    const targetPhone = (appProfObj && appProfObj.phone) ? appProfObj.phone : tenant.whatsapp;
    const cleanWhatsapp = targetPhone ? targetPhone.replace(/\D/g, '') : '';

    if (cleanWhatsapp) {
      const msg = `*SOLICITAÇÃO DE REAGENDAMENTO #${editingUserApp.id} - ${tenant.name.toUpperCase()}*\n\n` +
        `Cliente: *${editingUserApp.customer_name}*\n` +
        `Nova Data: *${formattedDate}*\n` +
        `Novo Horário: *${userNewTime}*`;

      window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    setEditingUserApp(null);
    handleSearchMyAppointments();
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  const isColorDark = (hex) => {
    if (!hex || hex.length < 6) return true;
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  // PADRONIZAÇÃO DAS CORES PUXADAS DO MASTER ADMIN
  const primaryColor = tenant.primary_color || '#FF8C00';
  const btnTextColor = tenant.button_text_color || '#FFFFFF';
  const bgColor = tenant.secondary_color || tenant.background_color || '#090D16';
  const cardColor = tenant.card_bg_color || tenant.card_color || '#111827';
  const textColor = tenant.text_color || '#FFFFFF';

  // CONTRASTE INTELIGENTE PARA TEXTOS DENTRO DO CARD
  const cardTextColor = isColorDark(cardColor) ? textColor : (isColorDark(textColor) ? textColor : '#111827');

  const accentPriceColor = tenant.price_color 
    ? tenant.price_color 
    : (isColorDark(primaryColor) ? (isColorDark(cardColor) ? '#FF8C00' : textColor) : primaryColor);

  const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
  const totalPrice = selectedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);

  const selectedProfObj = professionals.find(p => String(p.id) === String(selectedProf));
  const activeInstagram = (selectedProfObj && selectedProfObj.instagram_url) 
    ? selectedProfObj.instagram_url 
    : (tenant?.instagram_url || '');

  const formattedInstagramUrl = activeInstagram
    ? (activeInstagram.startsWith('http') ? activeInstagram : `https://instagram.com/${activeInstagram.replace('@', '').trim()}`)
    : '';

  const displayedServices = services.filter(srv => {
    if (!selectedProf) return false;

    let allowedProfIds = srv.professional_ids;
    if (typeof allowedProfIds === 'string') {
      try { allowedProfIds = JSON.parse(allowedProfIds); } catch (e) { allowedProfIds = []; }
    }

    if (Array.isArray(allowedProfIds) && allowedProfIds.length > 0) {
      return allowedProfIds.some(id => String(id) === String(selectedProf));
    }

    const hasTableRel = profServices.some(ps => String(ps.service_id) === String(srv.id));
    if (hasTableRel) {
      return profServices.some(ps => String(ps.service_id) === String(srv.id) && String(ps.professional_id) === String(selectedProf));
    }

    return true;
  });

  const handleSelectProf = (profId) => {
    setSelectedProf(profId);
    setSelectedServices([]);
    setSelectedTime('');
  };

  const handleToggleService = (srv) => {
    const exists = selectedServices.some(s => s.id === srv.id);
    if (exists) {
      setSelectedServices(selectedServices.filter(s => s.id !== srv.id));
    } else {
      setSelectedServices([...selectedServices, srv]);
    }
    setSelectedTime('');
  };

  const getSlotAvailability = () => {
    if (selectedServices.length === 0 || !selectedDate) {
      return { slots: [], status: 'select_service', message: 'Selecione ao menos um serviço.' };
    }

    if (!selectedProf) {
      return { slots: [], status: 'select_prof', message: '💈 Selecione um profissional.' };
    }

    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();

    const profObj = professionals.find(p => String(p.id) === String(selectedProf));
    if (!profObj) {
      return { slots: [], status: 'no_prof', message: 'Profissional não encontrado.' };
    }

    let pDays = profObj.work_days || [1, 2, 3, 4, 5, 6];
    if (typeof pDays === 'string') {
      try { pDays = JSON.parse(pDays); } catch (e) { pDays = [1, 2, 3, 4, 5, 6]; }
    }

    if (!pDays.includes(dayOfWeek)) {
      return { slots: [], status: 'prof_off', message: `💈 ${profObj.name} não atende neste dia da semana.` };
    }

    let profWorkHours = profObj.work_hours || {};
    if (typeof profWorkHours === 'string') {
      try { profWorkHours = JSON.parse(profWorkHours); } catch (e) { profWorkHours = {}; }
    }

    const dayHours = profWorkHours[dayOfWeek] || { open: '08:00', close: '18:00' };

    const openHour = parseInt((dayHours.open || '08:00').split(':')[0]);
    const openMin = parseInt((dayHours.open || '08:00').split(':')[1] || '0');
    const closeHour = parseInt((dayHours.close || '18:00').split(':')[0]);
    const closeMin = parseInt((dayHours.close || '18:00').split(':')[1] || '0');

    const dayBlocks = blockedTimes.filter(b => {
      const isProfTarget = b.professional_id === null || String(b.professional_id) === String(selectedProf);
      if (!isProfTarget) return false;

      if (b.block_date === selectedDate) return true;
      if (b.is_recurring && b.recurring_day === dayOfWeek) return true;
      if (b.reason && b.reason.includes('[RECORRENTE]') && b.recurring_day === dayOfWeek) return true;
      return false;
    });

    let currentMin = openHour * 60 + openMin;
    const endMin = closeHour * 60 + closeMin;
    const slots = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = selectedDate === todayStr;
    const nowInMinutes = now.getHours() * 60 + now.getMinutes();

    while (currentMin + totalDuration <= endMin) {
      if (isToday && currentMin <= nowInMinutes) {
        currentMin += 30;
        continue;
      }

      const h = Math.floor(currentMin / 60);
      const m = currentMin % 60;
      const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const slotStartMin = currentMin;
      const slotEndMin = currentMin + totalDuration;

      const profApps = existingAppointments.filter(app => String(app.professional_id) === String(selectedProf));
      const hasAppConflict = profApps.some(app => {
        const [aStartH, aStartM] = app.start_time.split(':').map(Number);
        const aStartMin = aStartH * 60 + aStartM;
        const aEndMin = aStartMin + (app.total_duration_minutes || 30);
        return Math.max(slotStartMin, aStartMin) < Math.min(slotEndMin, aEndMin);
      });

      const hasBlockConflict = dayBlocks.some(b => {
        const [bStartH, bStartM] = b.start_time.split(':').map(Number);
        const [bEndH, bEndM] = b.end_time.split(':').map(Number);
        const bStartMin = bStartH * 60 + bStartM;
        const bEndMin = bEndH * 60 + bEndM;
        return Math.max(slotStartMin, bStartMin) < Math.min(slotEndMin, bEndMin);
      });

      if (!hasAppConflict && !hasBlockConflict) {
        slots.push(timeString);
      }

      currentMin += 30;
    }

    return { slots, status: 'ok' };
  };

  const slotData = getSlotAvailability();
  const availableSlots = slotData.slots;

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    if (!selectedProf) return alert("Selecione a profissional!");
    if (selectedServices.length === 0) return alert("Selecione pelo menos 1 serviço!");
    if (!selectedTime) return alert("Selecione o horário desejado!");
    if (!customerName || !customerPhone) return alert("Preencha seu Nome e WhatsApp!");

    setIsSubmitting(true);

    const [h, m] = selectedTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + totalDuration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const chosenProfId = parseInt(selectedProf);
    const chosenProfObj = professionals.find(p => String(p.id) === String(chosenProfId));
    const chosenProfName = chosenProfObj?.name || '';

    const appointmentData = {
      tenant_id: tenant.id,
      professional_id: chosenProfId,
      customer_name: customerName,
      customer_phone: customerPhone.replace(/\D/g, ''),
      services_json: selectedServices,
      total_price: totalPrice,
      total_duration_minutes: totalDuration,
      appointment_date: selectedDate,
      start_time: selectedTime,
      end_time: endTime,
      payment_method: paymentMethod,
      status: 'agendado',
      is_paid: false
    };

    const { data: createdApp, error } = await supabase.from('appointments').insert([appointmentData]).select().single();

    if (error) {
      setIsSubmitting(false);
      return alert("Erro ao agendar: " + error.message);
    }

    const formattedDate = selectedDate.split('-').reverse().join('/');
    const servicesListText = selectedServices.map(s => `• ${s.name} (R$ ${Number(s.price).toFixed(2)})`).join('\n');

    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '✂️ Novo Agendamento Recebido!',
          message: `${customerName} agendou para ${formattedDate} às ${selectedTime} (${chosenProfName}).`,
          url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
        })
      });
    } catch (err) {
      console.error("Erro ao disparar notificação:", err);
    }

    let msg = `*NOVO AGENDAMENTO #${createdApp.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
    msg += `*Data:* ${formattedDate} às *${selectedTime}*\n`;
    msg += `*Profissional:* ${chosenProfName}\n\n`;
    msg += `*SERVIÇOS:*\n${servicesListText}\n\n`;
    msg += `*Tempo Total:* ${formatDuration(totalDuration)}\n`;
    msg += `*TOTAL:* *R$ ${totalPrice.toFixed(2)}* (${paymentMethod})`;

    if (tenant.custom_message) {
      msg += `\n\n📌 _${tenant.custom_message}_`;
    }

    const targetPhone = (chosenProfObj && chosenProfObj.phone && chosenProfObj.phone.trim() !== '') 
      ? chosenProfObj.phone 
      : tenant.whatsapp;
      
    const cleanWhatsapp = targetPhone ? targetPhone.replace(/\D/g, '') : '';

    if (cleanWhatsapp) {
      window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    setIsSubmitting(false);
    alert("Agendamento realizado com sucesso!");
    router.reload();
  };

  return (
    <div className="min-h-screen font-sans pb-12 max-w-md mx-auto transition-colors duration-300" style={{ backgroundColor: bgColor, color: textColor }}>
      
      {/* CAPA, INSTAGRAM & MEUS AGENDAMENTOS */}
      <div className="relative h-36 bg-gray-900 border-b border-black/10">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-50" />

        {formattedInstagramUrl && (
          <a
            href={formattedInstagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 left-3 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-full shadow-lg transition flex items-center space-x-1 hover:opacity-90 z-10">
            <span>📸 Instagram</span>
          </a>
        )}

        <button
          onClick={() => setShowMyAppsModal(true)}
          style={{ backgroundColor: primaryColor, color: btnTextColor }}
          className="absolute top-3 right-3 font-bold text-[10px] px-3 py-1.5 rounded-full shadow-lg transition z-10">
          📋 Meus Agendamentos
        </button>

        <div className="absolute -bottom-5 left-4 flex items-center space-x-3">
          <img 
            src={selectedProfObj?.avatar_url || tenant.logo_url || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=150&auto=format&fit=crop&q=80'} 
            alt="Foto Profissional" 
            className="w-16 h-16 rounded-full border-2 border-black/40 object-cover bg-gray-800 shadow-lg" 
          />
          <div className="pt-4">
            <h1 className="font-bold text-lg leading-tight" style={{ color: textColor }}>
              {selectedProfObj ? selectedProfObj.name : tenant.name}
            </h1>
            <p className="text-[11px] opacity-70">
              {selectedProfObj?.specialty ? selectedProfObj.specialty : (selectedProfObj ? `💈 ${tenant.name}` : '📅 Agendamento Online')}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 px-4 space-y-6">

        {/* PASSO 1: ESCOLHA O PROFISSIONAL */}
        {professionals.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-bold block uppercase tracking-wider opacity-80">1. Escolha a Profissional</label>
            <div className="grid grid-cols-2 gap-2.5">
              {professionals.map(p => {
                const isSelected = String(selectedProf) === String(p.id);

                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleSelectProf(p.id)}
                    style={{ 
                      backgroundColor: isSelected ? primaryColor : cardColor,
                      color: isSelected ? btnTextColor : cardTextColor,
                      borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.1)'
                    }}
                    className="p-3 rounded-2xl border flex items-center space-x-2.5 text-left transition shadow-md relative overflow-hidden">
                    <img 
                      src={p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} 
                      alt={p.name} 
                      className="w-10 h-10 rounded-full object-cover border border-black/20 shrink-0 bg-gray-800" 
                    />
                    <div className="truncate">
                      <span className="font-bold text-xs block truncate">{p.name}</span>
                      <span className="text-[10px] opacity-80 block truncate font-medium">
                        {p.specialty || 'Atendimento'}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="absolute top-1.5 right-2 text-[10px] font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PASSO 2: ESCOLHA OS SERVIÇOS DELE(A) */}
        {selectedProf ? (
          <div className="space-y-2 pt-2 border-t border-black/10">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                {professionals.length > 1 ? `2. Serviços de ${selectedProfObj?.name}` : `1. Escolha os Serviços de ${selectedProfObj?.name}`}
              </label>
              {selectedServices.length > 0 && (
                <span className="text-[10px] font-bold opacity-80" style={{ color: accentPriceColor }}>
                  {selectedServices.length} selecionado(s) ({formatDuration(totalDuration)})
                </span>
              )}
            </div>

            <div className="space-y-2">
              {displayedServices.length === 0 ? (
                <p className="text-xs opacity-60 p-4 rounded-xl text-center border border-black/10" style={{ backgroundColor: cardColor, color: cardTextColor }}>
                  Nenhum serviço cadastrado para esta profissional.
                </p>
              ) : (
                displayedServices.map(srv => {
                  const isSelected = selectedServices.some(s => s.id === srv.id);
                  const serviceImg = srv.image_url || srv.image;

                  return (
                    <div
                      key={srv.id}
                      onClick={() => handleToggleService(srv)}
                      style={{
                        backgroundColor: cardColor,
                        borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.1)',
                        color: cardTextColor
                      }}
                      className="p-3 rounded-xl border flex justify-between items-center cursor-pointer transition shadow-sm">
                      <div className="flex items-center space-x-3">
                        {serviceImg && (
                          <img 
                            src={serviceImg} 
                            alt={srv.name} 
                            className="w-12 h-12 rounded-xl object-cover border border-black/10 bg-gray-800 shrink-0" 
                          />
                        )}
                        <div>
                          <h3 className="font-bold text-xs">{srv.name}</h3>
                          <p className="text-[10px] opacity-60">⏱️ {formatDuration(srv.duration_minutes)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-xs block" style={{ color: accentPriceColor }}>
                          R$ {Number(srv.price).toFixed(2)}
                        </span>
                        <span className="block text-[10px] font-bold mt-0.5" style={{ color: isSelected ? accentPriceColor : 'rgba(0,0,0,0.4)' }}>
                          {isSelected ? '✓ Selecionado' : '+ Adicionar'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-dashed border-black/20 text-center" style={{ backgroundColor: cardColor, color: cardTextColor }}>
            <span className="text-lg block mb-1">👆</span>
            <p className="text-xs opacity-60">Selecione uma profissional acima para ver os serviços e valores.</p>
          </div>
        )}

        {/* PASSO 3: DATA E HORÁRIO */}
        {selectedProf && selectedServices.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-black/10">
            <div className="space-y-1">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                {professionals.length > 1 ? '3. Escolha a Data' : '2. Escolha a Data'}
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedTime('');
                }}
                style={{ backgroundColor: cardColor, color: cardTextColor }}
                className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                {professionals.length > 1 ? `4. Horários Disponíveis (${availableSlots.length})` : `3. Horários Disponíveis (${availableSlots.length})`}
              </label>
              
              {slotData.status !== 'ok' ? (
                <p className="text-xs text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center font-semibold">
                  {slotData.message}
                </p>
              ) : availableSlots.length === 0 ? (
                <div className="text-xs text-red-500 bg-red-500/10 p-3.5 rounded-xl border border-red-500/20 text-center space-y-1">
                  <p className="font-bold">Nenhum horário contínuo de {formatDuration(totalDuration)} disponível nesta data.</p>
                  {selectedServices.length > 1 && (
                    <p className="text-[10px] opacity-80">
                      💡 Tente selecionar outra data ou agendar os procedimentos separadamente.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pt-1">
                  {availableSlots.map(slot => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        type="button"
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        style={{ 
                          backgroundColor: isSelected ? primaryColor : cardColor,
                          color: isSelected ? btnTextColor : cardTextColor
                        }}
                        className="py-2 rounded-lg border border-black/10 text-xs font-bold text-center transition">
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PASSO 4: CONFIRMAÇÃO DE DADOS */}
        {selectedTime && (
          <form onSubmit={handleConfirmAppointment} className="space-y-3 pt-4 border-t border-black/10">
            <h3 className="font-bold text-xs uppercase tracking-wider opacity-80">
              {professionals.length > 1 ? '5. Seus Dados' : '4. Seus Dados'}
            </h3>
            <input
              type="text"
              required
              placeholder="Seu Nome Completo"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ backgroundColor: cardColor, color: cardTextColor }}
              className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Seu WhatsApp (DDD + Número)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              style={{ backgroundColor: cardColor, color: cardTextColor }}
              className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none"
            />

            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ backgroundColor: cardColor, color: cardTextColor }}
              className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none">
              <option value="No Local">Pagar no Local (Dinheiro / Cartão / PIX)</option>
              <option value="PIX Antecipado">PIX Antecipado</option>
            </select>

            <div style={{ backgroundColor: cardColor, color: cardTextColor }} className="p-3 rounded-xl border border-black/10 flex justify-between items-center text-xs">
              <div>
                <span className="opacity-60 block text-[10px]">Duração: {formatDuration(totalDuration)}</span>
                <span className="font-bold text-sm">TOTAL: R$ {totalPrice.toFixed(2)}</span>
              </div>
              <span className="font-bold" style={{ color: accentPriceColor }}>{selectedDate.split('-').reverse().join('/')} às {selectedTime}</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ backgroundColor: primaryColor, color: btnTextColor }}
              className="w-full font-bold py-3.5 rounded-xl text-xs shadow-lg transition hover:opacity-90">
              {isSubmitting ? 'Agendando...' : 'Confirmar Agendamento no WhatsApp 🚀'}
            </button>
          </form>
        )}
      </div>

      {/* MODAL MEUS AGENDAMENTOS */}
      {showMyAppsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: cardTextColor }} className="border border-black/10 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-black/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: accentPriceColor }}>📋 Meus Agendamentos</h3>
              <button onClick={() => { setShowMyAppsModal(false); setEditingUserApp(null); }} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            {!editingUserApp ? (
              <>
                <form onSubmit={handleSearchMyAppointments} className="space-y-2">
                  <label className="text-[11px] opacity-70 block">Digite seu WhatsApp para consultar:</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="DDD + WhatsApp"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      style={{ backgroundColor: bgColor, color: textColor }}
                      className="w-full border border-black/10 p-2.5 rounded-xl text-xs focus:outline-none"
                    />
                    <button type="submit" disabled={isSearchingApps} style={{ backgroundColor: primaryColor, color: btnTextColor }} className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap">
                      {isSearchingApps ? '...' : 'Buscar'}
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {myAppointments.length === 0 ? (
                    <p className="text-xs opacity-50 text-center py-4">Nenhum agendamento encontrado.</p>
                  ) : (
                    myAppointments.map(app => {
                      const canManage = app.status === 'agendado';

                      return (
                        <div key={app.id} style={{ backgroundColor: bgColor, color: textColor }} className="p-3 rounded-xl border border-black/10 text-xs space-y-2">
                          <div className="flex justify-between font-bold">
                            <span style={{ color: accentPriceColor }}>📅 {app.appointment_date.split('-').reverse().join('/')} às {app.start_time}</span>
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-500' :
                              app.status === 'concluido' ? 'bg-green-500/20 text-green-500' :
                              'bg-red-500/20 text-red-500'
                            }`}>
                              {app.status}
                            </span>
                          </div>

                          <p className="opacity-80"><b>Valor:</b> R$ {Number(app.total_price).toFixed(2)} ({app.payment_method})</p>

                          {canManage && (
                            <div className="flex space-x-2 pt-1 border-t border-black/10">
                              <button
                                onClick={() => handleOpenUserReschedule(app)}
                                className="flex-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-600 py-1.5 rounded-lg font-bold text-[10px] border border-purple-500/30">
                                ✏️ Reagendar
                              </button>
                              <button
                                onClick={() => handleUserCancelApp(app)}
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-600 py-1.5 rounded-lg font-bold text-[10px] border border-red-500/30">
                                ❌ Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveUserReschedule} className="space-y-3">
                <div className="bg-purple-500/10 border border-purple-500/30 p-2.5 rounded-xl text-xs">
                  <span className="text-purple-600 font-bold block">Reagendando Atendimento #{editingUserApp.id}</span>
                  <span className="opacity-60 text-[10px]">Data Atual: {editingUserApp.appointment_date.split('-').reverse().join('/')} às {editingUserApp.start_time}</span>
                </div>

                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Nova Data:</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={userNewDate}
                    onChange={(e) => setUserNewDate(e.target.value)}
                    style={{ backgroundColor: bgColor, color: textColor }}
                    className="w-full border border-black/10 p-2.5 rounded-xl text-xs focus:outline-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Novo Horário:</label>
                  <input
                    type="time"
                    value={userNewTime}
                    onChange={(e) => setUserNewTime(e.target.value)}
                    style={{ backgroundColor: bgColor, color: textColor }}
                    className="w-full border border-black/10 p-2.5 rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUserApp(null)}
                    className="w-1/2 bg-gray-300 text-gray-800 py-2.5 rounded-xl text-xs font-bold">
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUserReschedule}
                    style={{ backgroundColor: primaryColor, color: btnTextColor }}
                    className="w-1/2 py-2.5 rounded-xl text-xs font-bold transition">
                    {isSavingUserReschedule ? 'Salvando...' : 'Confirmar Novo Horário'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
