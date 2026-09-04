import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AgendamentoCliente() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // ESTADOS DO AGENDAMENTO
  const [selectedProf, setSelectedProf] = useState('ANY');
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');
  const [existingAppointments, setExistingAppointments] = useState([]);

  // DADOS DO CLIENTE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('No Local');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (tenant?.id && selectedDate) {
      fetchExistingAppointments();
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

      if (pData) setProfessionals(pData);
      if (sData) setServices(sData);
    }
    setLoading(false);
  };

  const fetchExistingAppointments = async () => {
    let query = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelado');

    if (selectedProf !== 'ANY') {
      query = query.eq('professional_id', selectedProf);
    }

    const { data } = await query;
    if (data) setExistingAppointments(data);
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando horários...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  const primaryColor = tenant.primary_color || '#FF8C00';
  const secondaryColor = tenant.secondary_color || '#111827';

  const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
  const totalPrice = selectedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);

  const handleToggleService = (srv) => {
    const exists = selectedServices.some(s => s.id === srv.id);
    if (exists) {
      setSelectedServices(selectedServices.filter(s => s.id !== srv.id));
    } else {
      setSelectedServices([...selectedServices, srv]);
    }
    setSelectedTime('');
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

      if (!isOccupied) {
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

    const chosenProfId = selectedProf === 'ANY' ? (professionals[0]?.id || null) : parseInt(selectedProf);
    const chosenProfName = professionals.find(p => p.id === chosenProfId)?.name || 'Qualquer Profissional';

    const appointmentData = {
      tenant_id: tenant.id,
      professional_id: chosenProfId,
      customer_name: customerName,
      customer_phone: customerPhone,
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
      <div className="relative h-36 bg-gray-900 border-b border-gray-800">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-50" />
        <div className="absolute -bottom-5 left-4 flex items-center space-x-3">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=150&auto=format&fit=crop&q=80'} alt="Logo" className="w-16 h-16 rounded-full border-2 border-gray-950 object-cover bg-gray-800 shadow-lg" />
          <div className="pt-4">
            <h1 className="font-bold text-lg text-white leading-tight">{tenant.name}</h1>
            <p className="text-[11px] text-gray-400">📅 Agendamento Online</p>
          </div>
        </div>
      </div>

      <div className="mt-8 px-4 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">1. Escolha o Profissional</label>
          <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedProf('ANY')}
              style={{ backgroundColor: selectedProf === 'ANY' ? primaryColor : 'rgba(255,255,255,0.05)' }}
              className="p-3 rounded-xl border border-white/10 flex flex-col items-center min-w-[100px] text-center">
              <span className="text-xl mb-1">💈</span>
              <span className="text-xs font-bold text-white">Qualquer um</span>
            </button>
            {professionals.map(p => (
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
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-300 block uppercase tracking-wider">2. Selecione os Serviços</label>
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

        {selectedServices.length > 0 && (
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
                <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center">Nenhum horário livre para essa data/duração.</p>
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

        {selectedTime && (
          <form onSubmit={handleConfirmAppointment} className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="font-bold text-xs text-gray-300 uppercase tracking-wider">5. Seus Dados para Contato</h3>
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
    </div>
  );
}
