import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AgendamentoCliente() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [profServices, setProfServices] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [loading, setLoading] = useState(true);

  // ESTADOS DO AGENDAMENTO
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedProf, setSelectedProf] = useState('ANY');
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

  // ESTADOS DE REAGENDAMENTO DO CLIENTE
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
    if (tenant?.id && selectedDate) {
      fetchExistingAppointmentsAndBlocks();
    }
  }, [tenant?.id, selectedDate, selectedProf]);

  const fetchTenantData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant(tData);
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
    let appQuery = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelado');

    let blockQuery = supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('block_date', selectedDate);

    if (selectedProf !== 'ANY') {
      appQuery = appQuery.eq('professional_id', selectedProf);
    }

    const { data: apps } = await appQuery;
    const { data: blocks } = await blockQuery;

    if (apps) setExistingAppointments(apps);
    if (blocks) setBlockedTimes(blocks);
  };

  // BUSCA DE AGENDAMENTOS DO CLIENTE
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

  // CLIENTE CANCELA PRÓPRIO AGENDAMENTO
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
      
      const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
      const msg = `*CANCELAMENTO DE AGENDAMENTO #${app.id} - ${tenant.name.toUpperCase()}*\n\n` +
        `Olá, o cliente *${app.customer_name}* cancelou o agendamento do dia *${formattedDate}* às *${app.start_time}*.`;
      
      window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
      
      handleSearchMyAppointments();
    }
  };

  // CLIENTE REAGENDA PRÓPRIO AGENDAMENTO
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

    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    const msg = `*SOLICITAÇÃO DE REAGENDAMENTO #${editingUserApp.id} - ${tenant.name.toUpperCase()}*\n\n` +
      `Cliente: *${editingUserApp.customer_name}*\n` +
      `Nova Data: *${formattedDate}*\n` +
      `Novo Horário: *${userNewTime}*`;

    window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');

    setEditingUserApp(null);
    handleSearchMyAppointments();
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  const primaryColor = tenant.primary_color || '#FF8C00';
  const secondaryColor = tenant.secondary_color || '#111827';

  const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
  const totalPrice = selectedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);

  const filteredProfessionals = professionals.filter(p => {
    if (selectedServices.length === 0) return true;
    if (profServices.length === 0) return true;
    const pServiceIds = profServices.filter(ps => ps.professional_id === p.id).map(ps => ps.service_id);
    return selectedServices.every(srv => pServiceIds.includes(srv.id));
  });

  const handleToggleService = (srv) => {
    const exists = selectedServices.some(s => s.id === srv.id);
    if (exists) {
      setSelectedServices(selectedServices.filter(s => s.id !== srv.id));
    } else {
      setSelectedServices([...selectedServices, srv]);
    }
    setSelectedTime('');
    setSelectedProf('ANY');
  };

  const generateAvailableTimeSlots = () => {
    if (selectedServices.length === 0) return [];

    const slots = [];
    const openHour = parseInt((tenant.opening_time || '08:00').split(':')[0]);
    const closeHour = parseInt((tenant.closing_time || '20:00').split(':')[0]);

    let current = new Date();
    current.setHours(openHour, 0, 0, 0);

    const endDay = new Date();
    endDay.setHours(closeHour, 0, 0, 0);

    while (current < endDay) {
      const timeString = current.toTimeString().substring(0, 5);
      
      const [h, m] = timeString.split(':').map(Number);
      const slotStartMin = h * 60 + m;
      const slotEndMin = slotStartMin + totalDuration;

      const isOccupied = existingAppointments.some(app => {
        const [appStartH, appStartM] = app.start_time.split(':').map(Number);
        const appStartMin = appStartH * 60 + appStartM;
        const appEndMin = appStartMin + (app.total_duration_minutes || 30);
        return (slotStartMin < appEndMin && slotEndMin > appStartMin);
      });

      const isBlocked = blockedTimes.some(b => {
        if (b.professional_id !== null && selectedProf !== 'ANY' && b.professional_id !== parseInt(selectedProf)) {
          return false;
        }
        const [bStartH, bStartM] = b.start_time.split(':').map(Number);
        const [bEndH, bEndM] = b.end_time.split(':').map(Number);
        const bStartMin = bStartH * 60 + bStartM;
        const bEndMin = bEndH * 60 + bEndM;
        return (slotStartMin < bEndMin && slotEndMin > bStartMin);
      });

      if (!isOccupied && !isBlocked) {
        slots.push(timeString);
      }

      current.setMinutes(current.getMinutes() + 30);
    }

    return slots;
  };

  const availableSlots = generateAvailableTimeSlots();

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    if (selectedServices.length === 0) return alert("Selecione pelo menos 1 serviço!");
    if (!selectedTime) return alert("Selecione o horário desejado!");
    if (!customerName || !customerPhone) return alert("Preencha seu Nome e WhatsApp!");

    setIsSubmitting(true);

    const [h, m] = selectedTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + totalDuration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const chosenProfId = selectedProf === 'ANY' ? (filteredProfessionals[0]?.id || null) : parseInt(selectedProf);
    const chosenProfName = professionals.find(p => p.id === chosenProfId)?.name || 'Qualquer Profissional';

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

    const servicesListText = selectedServices.map(s => `• ${s.name} (R$ ${Number(s.price).toFixed(2)})`).join('\n');
    const formattedDate = selectedDate.split('-').reverse().join('/');

    let msg = `*NOVO AGENDAMENTO #${createdApp.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
    msg += `*Data:* ${formattedDate} às *${selectedTime}*\n`;
    msg += `*Profissional:* ${chosenProfName}\n\n`;
    msg += `*SERVIÇOS:*\n${servicesListText}\n\n`;
    msg += `*Tempo Total:* ${totalDuration} min\n`;
    msg += `*TOTAL:* *R$ ${totalPrice.toFixed(2)}* (${paymentMethod})`;

    if (tenant.custom_message) {
      msg += `\n\n📌 _${tenant.custom_message}_`;
    }

    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    
    setIsSubmitting(false);
    alert("Agendamento realizado com sucesso!");
    router.reload();
  };

  return (
    <div className="min-h-screen text-white font-sans pb-12 max-w-md mx-auto" style={{ backgroundColor: secondaryColor }}>
      {/* CAPA & BOTÃO MEUS AGENDAMENTOS */}
      <div className="relative h-36 bg-gray-900 border-b border-gray-800">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-50" />
        
        <button
          onClick={() => setShowMyAppsModal(true)}
          className="absolute top-3 right-3 bg-black/60 hover:bg-black border border-white/20 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md transition">
          📋 Meus Agendamentos
        </button>

        <div className="absolute -bottom-5 left-4 flex items-center space-x-3">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=150&auto=format&fit=crop&q=80'} alt="Logo" className="w-16 h-16 rounded-full border-2 border-gray-950 object-cover bg-gray-800 shadow-lg" />
          <div className="pt-4">
            <h1 className="font-bold text-lg text-white leading-tight">{tenant.name}</h1>
            <p className="text-[11px] text-gray-400">📅 Agendamento Online</p>
          </div>
        </div>
      </div>

      <div className="mt-8 px-4 space-y-6">
        {/* PASSO 1: SELEÇÃO DE SERVIÇOS */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">1. Escolha os Serviços</label>
          <div className="space-y-2">
            {services.map(srv => {
              const isSelected = selectedServices.some(s => s.id === srv.id);
              return (
                <div
                  key={srv.id}
                  onClick={() => handleToggleService(srv)}
                  className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition ${isSelected ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-black/30'}`}>
                  <div>
                    <h3 className="font-bold text-xs text-white">{srv.name}</h3>
                    <p className="text-[10px] text-gray-400">⏱️ {srv.duration_minutes || 30} min</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-xs" style={{ color: primaryColor }}>R$ {Number(srv.price).toFixed(2)}</span>
                    <span className={`block text-[10px] font-bold mt-0.5 ${isSelected ? 'text-orange-400' : 'text-gray-500'}`}>
                      {isSelected ? '✓ Selecionado' : '+ Adicionar'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PASSO 2: PROFISSIONAIS */}
        {selectedServices.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">2. Escolha o Profissional</label>
            {filteredProfessionals.length === 0 ? (
              <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center">Nenhum profissional realiza todos os serviços selecionados.</p>
            ) : (
              <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedProf('ANY')}
                  style={{ backgroundColor: selectedProf === 'ANY' ? primaryColor : 'rgba(255,255,255,0.05)' }}
                  className="p-3 rounded-xl border border-white/10 flex flex-col items-center min-w-[100px] text-center">
                  <span className="text-xl mb-1">💈</span>
                  <span className="text-xs font-bold text-white">Qualquer um</span>
                </button>
                {filteredProfessionals.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProf(p.id)}
                    style={{ backgroundColor: selectedProf === p.id ? primaryColor : 'rgba(255,255,255,0.05)' }}
                    className="p-3 rounded-xl border border-white/10 flex flex-col items-center min-w-[100px] text-center">
                    <img src={p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} alt={p.name} className="w-9 h-9 rounded-full object-cover mb-1 border border-white/20" />
                    <span className="text-xs font-bold text-white truncate max-w-[80px]">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PASSO 3: DATA E HORÁRIO */}
        {selectedServices.length > 0 && filteredProfessionals.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-white/10">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">3. Escolha a Data</label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">4. Horários Disponíveis ({availableSlots.length})</label>
              {availableSlots.length === 0 ? (
                <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center">Nenhum horário livre ou agenda fechada nesta data.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pt-1">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      style={{ backgroundColor: selectedTime === slot ? primaryColor : 'rgba(255,255,255,0.05)' }}
                      className="py-2 rounded-lg border border-white/10 text-xs font-bold text-white text-center">
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PASSO 4: CONFIRMAÇÃO */}
        {selectedTime && (
          <form onSubmit={handleConfirmAppointment} className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="font-bold text-xs text-gray-300 uppercase tracking-wider">5. Seus Dados</h3>
            <input
              type="text"
              required
              placeholder="Seu Nome Completo"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs text-white focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Seu WhatsApp (DDD + Número)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs text-white focus:outline-none"
            />

            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-xs text-white focus:outline-none">
              <option value="No Local">Pagar no Local (Dinheiro / Cartão / PIX)</option>
              <option value="PIX Antecipado">PIX Antecipado</option>
            </select>

            <div className="bg-black/50 p-3 rounded-xl border border-white/10 flex justify-between items-center text-xs">
              <div>
                <span className="text-gray-400 block text-[10px]">Duração: {totalDuration} min</span>
                <span className="font-bold text-white text-sm">TOTAL: R$ {totalPrice.toFixed(2)}</span>
              </div>
              <span className="text-orange-400 font-bold">{selectedDate.split('-').reverse().join('/')} às {selectedTime}</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ backgroundColor: primaryColor }}
              className="w-full font-bold py-3.5 rounded-xl text-xs text-white shadow-lg transition opacity-90 hover:opacity-100">
              {isSubmitting ? 'Agendando...' : 'Confirmar Agendamento no WhatsApp 🚀'}
            </button>
          </form>
        )}
      </div>

      {/* MODAL MEUS AGENDAMENTOS COM OPÇÕES DE CANCELAR E REAGENDAR */}
      {showMyAppsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-orange-400">📋 Meus Agendamentos</h3>
              <button onClick={() => { setShowMyAppsModal(false); setEditingUserApp(null); }} className="text-gray-400 font-bold text-xs">✕ Fechar</button>
            </div>

            {!editingUserApp ? (
              <>
                <form onSubmit={handleSearchMyAppointments} className="space-y-2">
                  <label className="text-[11px] text-gray-400 block">Digite seu WhatsApp para consultar:</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="DDD + WhatsApp"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                    />
                    <button type="submit" disabled={isSearchingApps} className="bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap">
                      {isSearchingApps ? '...' : 'Buscar'}
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {myAppointments.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">Nenhum agendamento encontrado.</p>
                  ) : (
                    myAppointments.map(app => {
                      const canManage = app.status === 'agendado';

                      return (
                        <div key={app.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700 text-xs space-y-2">
                          <div className="flex justify-between font-bold">
                            <span className="text-orange-400">📅 {app.appointment_date.split('-').reverse().join('/')} às {app.start_time}</span>
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-400' :
                              app.status === 'concluido' ? 'bg-green-500/20 text-green-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {app.status}
                            </span>
                          </div>

                          <p className="text-gray-300"><b>Valor:</b> R$ {Number(app.total_price).toFixed(2)} ({app.payment_method})</p>

                          {/* BOTOES DE CANCELAR E REAGENDAR (Apenas se status for 'agendado') */}
                          {canManage && (
                            <div className="flex space-x-2 pt-1 border-t border-gray-700/60">
                              <button
                                onClick={() => handleOpenUserReschedule(app)}
                                className="flex-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 py-1.5 rounded-lg font-bold text-[10px] border border-purple-500/30">
                                ✏️ Reagendar
                              </button>
                              <button
                                onClick={() => handleUserCancelApp(app)}
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 py-1.5 rounded-lg font-bold text-[10px] border border-red-500/30">
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
              /* FORMULÁRIO DE REAGENDAMENTO DENTRO DO MODAL */
              <form onSubmit={handleSaveUserReschedule} className="space-y-3">
                <div className="bg-purple-500/10 border border-purple-500/30 p-2.5 rounded-xl text-xs">
                  <span className="text-purple-300 font-bold block">Reagendando Atendimento #{editingUserApp.id}</span>
                  <span className="text-gray-400 text-[10px]">Data Atual: {editingUserApp.appointment_date.split('-').reverse().join('/')} às {editingUserApp.start_time}</span>
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Nova Data:</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={userNewDate}
                    onChange={(e) => setUserNewDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Novo Horário:</label>
                  <input
                    type="time"
                    value={userNewTime}
                    onChange={(e) => setUserNewTime(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUserApp(null)}
                    className="w-1/2 bg-gray-800 text-gray-300 py-2.5 rounded-xl text-xs font-bold">
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUserReschedule}
                    className="w-1/2 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-xs font-bold transition">
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
