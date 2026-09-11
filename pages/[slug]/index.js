import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

const formatDuration = (minutes) => {
  const mins = Number(minutes) || 0;
  if (mins <= 0) return '30 min';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) return `${hrs}h`;
  return `${hrs}h ${remMins}min`;
};

// MÁSCARA AUXILIAR DE TELEFONE
const maskPhone = (value) => {
  if (!value) return '';
  const clean = value.replace(/\D/g, '');
  if (clean.length <= 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return clean.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').slice(0, 15);
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
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // ESTADOS DE REAGENDAMENTO
  const [editingUserApp, setEditingUserApp] = useState(null);
  const [userNewDate, setUserNewDate] = useState('');
  const [userNewTime, setUserNewTime] = useState('');
  const [isSavingUserReschedule, setIsSavingUserReschedule] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
    // RECUPERA O WHATSAPP SALVO DO CLIENTE
    const savedPhone = localStorage.getItem('client_saved_phone');
    if (savedPhone) {
      setCustomerPhone(maskPhone(savedPhone));
      setSearchPhone(maskPhone(savedPhone));
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (professionals.length === 1) {
      setSelectedProf(professionals[0].id);
    } else if (professionals.length > 1) {
      const urlProfId = prof || staff;
      if (urlProfId) {
        const urlMatch = professionals.find(p => String(p.id) === String(urlProfId));
        if (urlMatch) setSelectedProf(urlMatch.id);
      }
    }
  }, [professionals, prof, staff]);

  useEffect(() => {
    const targetDate = editingUserApp ? userNewDate : selectedDate;
    const targetProf = editingUserApp ? editingUserApp.professional_id : selectedProf;

    if (tenant?.id && targetDate && targetProf) {
      fetchExistingAppointmentsAndBlocks(targetDate, targetProf);
    }
  }, [tenant?.id, selectedDate, selectedProf, userNewDate, editingUserApp]);

  const fetchTenantData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant({ ...tData, work_days: tData.work_days || [1, 2, 3, 4, 5, 6] });
      const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tData.id).eq('active', true);
      const { data: sData } = await supabase.from('services').select('*').eq('tenant_id', tData.id).eq('active', true);
      const { data: psData } = await supabase.from('professional_services').select('*');

      if (pData) setProfessionals(pData);
      if (sData) setServices(sData);
      if (psData) setProfServices(psData);
    }
    setLoading(false);
  };

  const fetchExistingAppointmentsAndBlocks = async (dateParam, profParam) => {
    if (!tenant?.id) return;

    let appQuery = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', dateParam)
      .neq('status', 'cancelado');

    if (profParam) {
      appQuery = appQuery.eq('professional_id', profParam);
    }

    const { data: apps } = await appQuery;
    const { data: blocks } = await supabase.from('blocked_times').select('*').eq('tenant_id', tenant.id);

    if (apps) setExistingAppointments(apps);
    if (blocks) setBlockedTimes(blocks);
  };

  const handleSearchMyAppointments = async (e) => {
    if (e) e.preventDefault();
    const clean = searchPhone.replace(/\D/g, '');
    if (!clean) return alert("Digite seu número de WhatsApp!");

    localStorage.setItem('client_saved_phone', clean);
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

  // CANCELAMENTO SEGURO
  const handleUserCancelApp = async (app) => {
    const formattedDate = app.appointment_date.split('-').reverse().join('/');
    
    if (!confirm(`Confirmar cancelamento do dia ${formattedDate} às ${app.start_time}?`)) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado' })
      .eq('id', app.id);

    if (error) {
      alert("Erro ao cancelar: " + error.message);
    } else {
      setFeedbackMsg("Agendamento cancelado com sucesso!");
      setTimeout(() => setFeedbackMsg(null), 4000);

      // Notificação interna
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '❌ Agendamento Cancelado',
            message: `O cliente ${app.customer_name} cancelou para o dia ${formattedDate} às ${app.start_time}.`,
            url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
          })
        });
      } catch (err) {
        console.error("Erro ao disparar notificação:", err);
      }

      handleSearchMyAppointments();
    }
  };

  const handleOpenUserReschedule = (app) => {
    setEditingUserApp(app);
    setUserNewDate(app.appointment_date);
    setUserNewTime('');
  };

  // CÁLCULO DE HORÁRIOS DISPONÍVEIS (REUTILIZÁVEL PARA AGENDAMENTO E REAGENDAMENTO)
  const calculateSlots = (profId, servicesArr, dateStr) => {
    if (!profId || !dateStr || servicesArr.length === 0) {
      return { slots: [], status: 'invalid' };
    }

    const totalDur = servicesArr.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();

    const profObj = professionals.find(p => String(p.id) === String(profId));
    if (!profObj) return { slots: [], status: 'no_prof' };

    let pDays = profObj.work_days || [1, 2, 3, 4, 5, 6];
    if (typeof pDays === 'string') {
      try { pDays = JSON.parse(pDays); } catch (e) { pDays = [1, 2, 3, 4, 5, 6]; }
    }

    if (!pDays.includes(dayOfWeek)) {
      return { slots: [], status: 'off', message: `${profObj.name} não atende neste dia.` };
    }

    let profWorkHours = profObj.work_hours || {};
    if (typeof profWorkHours === 'string') {
      try { profWorkHours = JSON.parse(profWorkHours); } catch (e) { profWorkHours = {}; }
    }

    const dayHours = profWorkHours[dayOfWeek] || { open: '08:00', close: '18:00' };
    const openMin = parseInt((dayHours.open || '08:00').split(':')[0]) * 60 + parseInt((dayHours.open || '08:00').split(':')[1] || '0');
    const endMin = parseInt((dayHours.close || '18:00').split(':')[0]) * 60 + parseInt((dayHours.close || '18:00').split(':')[1] || '0');

    const dayBlocks = blockedTimes.filter(b => {
      const isProfTarget = b.professional_id === null || String(b.professional_id) === String(profId);
      if (!isProfTarget) return false;
      return b.block_date === dateStr || (b.is_recurring && b.recurring_day === dayOfWeek);
    });

    let currentMin = openMin;
    const slots = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const nowInMinutes = now.getHours() * 60 + now.getMinutes();

    while (currentMin + totalDur <= endMin) {
      if (isToday && currentMin <= nowInMinutes) {
        currentMin += 30;
        continue;
      }

      const h = Math.floor(currentMin / 60);
      const m = currentMin % 60;
      const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const slotStartMin = currentMin;
      const slotEndMin = currentMin + totalDur;

      const profApps = existingAppointments.filter(app => String(app.professional_id) === String(profId) && app.id !== editingUserApp?.id);
      
      const hasAppConflict = profApps.some(app => {
        const [aStartH, aStartM] = app.start_time.split(':').map(Number);
        const aStartMin = aStartH * 60 + aStartM;
        const aEndMin = aStartMin + (app.total_duration_minutes || 30);
        return Math.max(slotStartMin, aStartMin) < Math.min(slotEndMin, aEndMin);
      });

      const hasBlockConflict = dayBlocks.some(b => {
        const [bStartH, bStartM] = b.start_time.split(':').map(Number);
        const [bEndH, bEndM] = b.end_time.split(':').map(Number);
        return Math.max(slotStartMin, bStartH * 60 + bStartM) < Math.min(slotEndMin, bEndH * 60 + bEndM);
      });

      if (!hasAppConflict && !hasBlockConflict) {
        slots.push(timeString);
      }

      currentMin += 30;
    }

    return { slots, status: 'ok' };
  };

  const handleSaveUserReschedule = async (e) => {
    e.preventDefault();
    if (!userNewDate || !userNewTime) return alert("Selecione a nova data e um horário válido!");

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

    setFeedbackMsg("Horário reagendado com sucesso!");
    setTimeout(() => setFeedbackMsg(null), 4000);
    setEditingUserApp(null);
    handleSearchMyAppointments();
  };

  const slotData = calculateSlots(selectedProf, selectedServices, selectedDate);
  const availableSlots = slotData.slots;

  const rescheduleSlotData = editingUserApp 
    ? calculateSlots(editingUserApp.professional_id, editingUserApp.services_json || [{ duration_minutes: editingUserApp.total_duration_minutes }], userNewDate)
    : { slots: [] };

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!selectedProf) return alert("Selecione o profissional!");
    if (selectedServices.length === 0) return alert("Selecione pelo menos 1 serviço!");
    if (!selectedTime) return alert("Selecione o horário desejado!");
    if (!customerName || cleanPhone.length < 10) return alert("Preencha seu Nome e WhatsApp válido!");

    setIsSubmitting(true);
    localStorage.setItem('client_saved_phone', cleanPhone);

    const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
    const totalPrice = selectedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);

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
      customer_phone: cleanPhone,
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

    let msg = `*NOVO AGENDAMENTO #${createdApp.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
    msg += `*Data:* ${formattedDate} às *${selectedTime}*\n`;
    msg += `*Profissional:* ${chosenProfName}\n\n`;
    msg += `*SERVIÇOS:*\n${servicesListText}\n\n`;
    msg += `*Tempo Total:* ${formatDuration(totalDuration)}\n`;
    msg += `*TOTAL:* *R$ ${totalPrice.toFixed(2)}* (${paymentMethod})`;

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

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  const primaryColor = tenant.primary_color || '#FF8C00';
  const btnTextColor = tenant.button_text_color || '#FFFFFF';
  const bgColor = tenant.secondary_color || tenant.background_color || '#090D16';
  const cardColor = tenant.card_bg_color || tenant.card_color || '#111827';
  const textColor = tenant.text_color || '#FFFFFF';

  const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
  const totalPrice = selectedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);
  const selectedProfObj = professionals.find(p => String(p.id) === String(selectedProf));

  const displayedServices = services.filter(srv => {
    if (!selectedProf) return false;
    let allowedProfIds = srv.professional_ids;
    if (typeof allowedProfIds === 'string') {
      try { allowedProfIds = JSON.parse(allowedProfIds); } catch (e) { allowedProfIds = []; }
    }
    if (Array.isArray(allowedProfIds) && allowedProfIds.length > 0) {
      return allowedProfIds.some(id => String(id) === String(selectedProf));
    }
    return true;
  });

  return (
    <div className="min-h-screen font-sans pb-12 max-w-md mx-auto shadow-2xl transition-colors duration-300 relative" style={{ backgroundColor: bgColor, color: textColor }}>
      
      {/* CAPA & MEUS AGENDAMENTOS */}
      <div className="relative h-36 bg-gray-900 border-b border-black/10">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-50" />

        <button
          onClick={() => {
            setShowMyAppsModal(true);
            if (searchPhone) handleSearchMyAppointments();
          }}
          style={{ backgroundColor: primaryColor, color: btnTextColor }}
          className="absolute top-3 right-3 font-bold text-[10px] px-3.5 py-2 rounded-full shadow-lg transition z-10 hover:opacity-90 active:scale-95">
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
              {selectedProfObj?.specialty ? selectedProfObj.specialty : '📅 Agendamento Online'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 px-4 space-y-6">

        {/* PASSO 1: ESCOLHA A PROFISSIONAL */}
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
                    onClick={() => {
                      setSelectedProf(p.id);
                      setSelectedServices([]);
                      setSelectedTime('');
                    }}
                    style={{ 
                      backgroundColor: isSelected ? primaryColor : cardColor,
                      color: isSelected ? btnTextColor : textColor,
                      borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.1)'
                    }}
                    className="p-3 rounded-2xl border flex items-center space-x-2.5 text-left transition shadow-md relative overflow-hidden">
                    <img src={p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} alt={p.name} className="w-10 h-10 rounded-full object-cover shrink-0 bg-gray-800" />
                    <div className="truncate">
                      <span className="font-bold text-xs block truncate">{p.name}</span>
                      <span className="text-[10px] opacity-80 block truncate font-medium">{p.specialty || 'Atendimento'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PASSO 2: SERVIÇOS */}
        {selectedProf && (
          <div className="space-y-2 pt-2 border-t border-black/10">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                {professionals.length > 1 ? `2. Serviços de ${selectedProfObj?.name}` : `1. Serviços de ${selectedProfObj?.name}`}
              </label>
              {selectedServices.length > 0 && (
                <span className="text-[10px] font-bold text-orange-400">
                  {selectedServices.length} sel. ({formatDuration(totalDuration)})
                </span>
              )}
            </div>

            <div className="space-y-2">
              {displayedServices.map(srv => {
                const isSelected = selectedServices.some(s => s.id === srv.id);
                return (
                  <div
                    key={srv.id}
                    onClick={() => {
                      if (isSelected) setSelectedServices(selectedServices.filter(s => s.id !== srv.id));
                      else setSelectedServices([...selectedServices, srv]);
                      setSelectedTime('');
                    }}
                    style={{ backgroundColor: cardColor, borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.1)' }}
                    className="p-3 rounded-xl border flex justify-between items-center cursor-pointer transition shadow-sm">
                    <div>
                      <h3 className="font-bold text-xs">{srv.name}</h3>
                      <p className="text-[10px] opacity-60">⏱️ {formatDuration(srv.duration_minutes)}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-xs block" style={{ color: primaryColor }}>R$ {Number(srv.price).toFixed(2)}</span>
                      <span className="block text-[10px] font-bold mt-0.5 opacity-80">{isSelected ? '✓ Selecionado' : '+ Adicionar'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PASSO 3: DATA E HORÁRIO */}
        {selectedProf && selectedServices.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-black/10">
            <div className="space-y-1">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">Data</label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                style={{ backgroundColor: cardColor }}
                className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">Horários Disponíveis ({availableSlots.length})</label>
              {availableSlots.length === 0 ? (
                <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center font-semibold">
                  Sem horários livres para esta data/duração.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pt-1">
                  {availableSlots.map(slot => (
                    <button
                      type="button"
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      style={{ backgroundColor: selectedTime === slot ? primaryColor : cardColor, color: selectedTime === slot ? btnTextColor : textColor }}
                      className="py-2 rounded-lg border border-black/10 text-xs font-bold text-center transition">
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PASSO 4: SEUS DADOS */}
        {selectedTime && (
          <form onSubmit={handleConfirmAppointment} className="space-y-3 pt-4 border-t border-black/10">
            <h3 className="font-bold text-xs uppercase tracking-wider opacity-80">Seus Dados</h3>
            <input
              type="text"
              required
              placeholder="Seu Nome Completo"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ backgroundColor: cardColor }}
              className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Seu WhatsApp (DDD + Número)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(maskPhone(e.target.value))}
              style={{ backgroundColor: cardColor }}
              className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none"
            />

            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={{ backgroundColor: cardColor }}
              className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none">
              <option value="No Local">Pagar no Local (Dinheiro / Cartão / PIX)</option>
              <option value="PIX Antecipado">PIX Antecipado</option>
            </select>

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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-gray-800 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-orange-400">📋 Meus Agendamentos</h3>
              <button onClick={() => { setShowMyAppsModal(false); setEditingUserApp(null); }} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            {feedbackMsg && (
              <div className="bg-green-500/20 border border-green-500/40 text-green-400 p-2.5 rounded-xl text-xs text-center font-bold">
                {feedbackMsg}
              </div>
            )}

            {!editingUserApp ? (
              <>
                <form onSubmit={handleSearchMyAppointments} className="space-y-2">
                  <label className="text-[11px] opacity-70 block">Digite seu WhatsApp para buscar seus horários:</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="(DDD) 99999-9999"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(maskPhone(e.target.value))}
                      style={{ backgroundColor: bgColor }}
                      className="w-full border border-gray-700 p-2.5 rounded-xl text-xs focus:outline-none"
                    />
                    <button type="submit" disabled={isSearchingApps} style={{ backgroundColor: primaryColor, color: btnTextColor }} className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap">
                      {isSearchingApps ? '...' : 'Buscar'}
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto pt-2">
                  {myAppointments.length === 0 ? (
                    <p className="text-xs opacity-50 text-center py-4">Nenhum agendamento encontrado.</p>
                  ) : (
                    myAppointments.map(app => {
                      const canManage = app.status === 'agendado';
                      return (
                        <div key={app.id} style={{ backgroundColor: bgColor }} className="p-3 rounded-xl border border-gray-800 text-xs space-y-2">
                          <div className="flex justify-between font-bold">
                            <span className="text-orange-400">📅 {app.appointment_date.split('-').reverse().join('/')} às {app.start_time}</span>
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-400' :
                              app.status === 'concluido' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {app.status}
                            </span>
                          </div>

                          <p className="opacity-80"><b>Valor:</b> R$ {Number(app.total_price).toFixed(2)} ({app.payment_method})</p>

                          {canManage && (
                            <div className="flex space-x-2 pt-1 border-t border-gray-800">
                              <button
                                onClick={() => handleOpenUserReschedule(app)}
                                className="flex-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 py-1.5 rounded-lg font-bold text-[10px] border border-purple-500/30 transition">
                                ✏️ Reagendar
                              </button>
                              <button
                                onClick={() => handleUserCancelApp(app)}
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 py-1.5 rounded-lg font-bold text-[10px] border border-red-500/30 transition">
                                ❌ Cancelar Horário
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
              /* FORMULÁRIO DE REAGENDAMENTO COM HORÁRIOS REAIS DISPONÍVEIS */
              <form onSubmit={handleSaveUserReschedule} className="space-y-3">
                <div className="bg-purple-500/10 border border-purple-500/30 p-2.5 rounded-xl text-xs">
                  <span className="text-purple-400 font-bold block">Reagendando #{editingUserApp.id}</span>
                  <span className="opacity-60 text-[10px]">Atual: {editingUserApp.appointment_date.split('-').reverse().join('/')} às {editingUserApp.start_time}</span>
                </div>

                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Escolha a Nova Data:</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={userNewDate}
                    onChange={(e) => { setUserNewDate(e.target.value); setUserNewTime(''); }}
                    style={{ backgroundColor: bgColor }}
                    className="w-full border border-gray-700 p-2.5 rounded-xl text-xs focus:outline-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Selecione o Novo Horário Livre:</label>
                  {rescheduleSlotData.slots.length === 0 ? (
                    <p className="text-[11px] text-red-400 bg-red-500/10 p-2 rounded-lg text-center">
                      Nenhum horário disponível nesta data.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                      {rescheduleSlotData.slots.map(slot => (
                        <button
                          type="button"
                          key={slot}
                          onClick={() => setUserNewTime(slot)}
                          style={{ backgroundColor: userNewTime === slot ? primaryColor : bgColor }}
                          className="py-1.5 rounded-lg border border-gray-700 text-xs font-bold text-center">
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex space-x-2 pt-2">
                  <button type="button" onClick={() => setEditingUserApp(null)} className="w-1/2 bg-gray-800 text-gray-300 py-2.5 rounded-xl text-xs font-bold">
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUserReschedule || !userNewTime}
                    style={{ backgroundColor: primaryColor, color: btnTextColor }}
                    className="w-1/2 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50">
                    {isSavingUserReschedule ? 'Salvando...' : 'Confirmar'}
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
