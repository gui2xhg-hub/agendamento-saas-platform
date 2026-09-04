import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AgendaTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProfFilter, setSelectedProfFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' ou 'archived'
  const [loading, setLoading] = useState(true);

  // ESTADO PARA REAGENDAMENTO
  const [reschedulingApp, setReschedulingApp] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);

  // SOLICITA PERMISSÃO DE NOTIFICAÇÃO AO ABRIR O APP NO CELULAR / PC
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  // BUSCA DADOS E MANTÉM CONEXÃO TEMPO REAL (REALTIME) COM NOTIFICAÇÕES
  useEffect(() => {
    if (!tenant?.id) return;

    fetchAppointmentsAndBlocks();

    // ESCUTA EM TEMPO REAL (REALTIME WEBSOCKET)
    const channel = supabase
      .channel(`agenda-realtime-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          fetchAppointmentsAndBlocks();

          // SE FOR UM NOVO AGENDAMENTO (INSERT), EMITE SOM E NOTIFICAÇÃO PUSH
          if (payload.eventType === 'INSERT') {
            // 1. Toca som de alerta no dispositivo
            try {
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
              audio.play().catch(() => {});
            } catch (e) {}

            // 2. Dispara notificação nativa no celular (Android / iOS / PC)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const clientName = payload.new?.customer_name || payload.new?.client_name || 'Novo cliente';
              const appTime = payload.new?.start_time || '';

              if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then((registration) => {
                  registration.showNotification('🚨 Novo Agendamento!', {
                    body: `${clientName} agendou para às ${appTime}`,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    vibrate: [300, 100, 300]
                  });
                });
              } else {
                new Notification('🚨 Novo Agendamento!', {
                  body: `${clientName} agendou para às ${appTime}`,
                  icon: '/icon-192.png'
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, selectedDate, selectedProfFilter, viewMode]);

  const fetchTenantData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant(tData);
      const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tData.id);
      if (pData) setProfessionals(pData);
    }
    setLoading(false);
  };

  const fetchAppointmentsAndBlocks = async () => {
    let query = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (viewMode === 'agenda') {
      query = query
        .eq('appointment_date', selectedDate)
        .or('is_archived.is.null,is_archived.eq.false')
        .order('start_time', { ascending: true });
    } else {
      // MODO ARQUIVADOS
      query = query
        .eq('is_archived', true)
        .order('appointment_date', { ascending: false });
    }

    let blockQuery = supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('block_date', selectedDate);

    if (selectedProfFilter !== 'ALL' && viewMode === 'agenda') {
      query = query.eq('professional_id', selectedProfFilter);
    }

    const { data: aData } = await query;
    const { data: bData } = await blockQuery;

    if (aData) setAppointments(aData);
    if (bData) setBlockedTimes(bData);
  };

  const updateStatus = async (appId, newStatus) => {
    await supabase.from('appointments').update({ status: newStatus }).eq('id', appId);
  };

  const togglePayment = async (appId, currentPaid) => {
    await supabase.from('appointments').update({ is_paid: !currentPaid }).eq('id', appId);
  };

  // ARQUIVAR AGENDAMENTO
  const handleArchiveApp = async (appId) => {
    await supabase.from('appointments').update({ is_archived: true }).eq('id', appId);
  };

  // DESARQUIVAR AGENDAMENTO
  const handleUnarchiveApp = async (appId) => {
    await supabase.from('appointments').update({ is_archived: false }).eq('id', appId);
  };

  // EXCLUIR DEFINITIVO (INDIVIDUAL)
  const handleDeleteApp = async (appId) => {
    if (confirm("TEM CERTEZA que deseja apagar definitivamente este agendamento?")) {
      await supabase.from('appointments').delete().eq('id', appId);
    }
  };

  // LIMPAR TODOS OS ARQUIVADOS
  const handleClearAllArchived = async () => {
    if (confirm("TEM CERTEZA que deseja APAGAR DEFINITIVAMENTE todos os agendamentos arquivados?\nEsta ação não poderá ser desfeita!")) {
      await supabase.from('appointments').delete().eq('tenant_id', tenant.id).eq('is_archived', true);
    }
  };

  // REAGENDAMENTO
  const handleOpenReschedule = (app) => {
    setReschedulingApp(app);
    setNewDate(app.appointment_date);
    setNewTime(app.start_time);
  };

  const handleSaveReschedule = async (e) => {
    e.preventDefault();
    if (!newDate || !newTime) return alert("Selecione nova data e novo horário!");

    setIsSavingReschedule(true);

    const duration = reschedulingApp.total_duration_minutes || 30;
    const [h, m] = newTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + duration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const { error } = await supabase
      .from('appointments')
      .update({
        appointment_date: newDate,
        start_time: newTime,
        end_time: endTime
      })
      .eq('id', reschedulingApp.id);

    setIsSavingReschedule(false);

    if (error) {
      return alert("Erro ao reagendar: " + error.message);
    }

    const formattedDate = newDate.split('-').reverse().join('/');
    const msg = `*REAGENDAMENTO DE HORÁRIO - ${tenant.name.toUpperCase()}*\n\n` +
      `Olá *${reschedulingApp.customer_name}*, seu agendamento foi alterado com sucesso!\n\n` +
      `📅 *Nova Data:* ${formattedDate}\n` +
      `⏰ *Novo Horário:* ${newTime}\n\n` +
      `Qualquer dúvida, estamos à disposição!`;

    const cleanPhone = reschedulingApp.customer_phone.replace(/\D/g, '');
    
    if (confirm("Agendamento alterado! Deseja notificar o cliente via WhatsApp agora?")) {
      window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    setReschedulingApp(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans">
      <p className="text-xs text-gray-400">Carregando Agenda...</p>
    </div>
  );

  if (!tenant) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans">
      <h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 font-sans max-w-6xl mx-auto pb-12">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-xl text-orange-500">📅 Agenda — {tenant.name}</h1>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest">Ao Vivo</span>
          </div>
          <p className="text-xs text-gray-400">Painel de Atendimentos em Tempo Real</p>
        </div>

        {/* NAVEGAÇÃO ENTRE MODO AGENDA E MODO ARQUIVADOS */}
        <div className="flex space-x-2 bg-gray-900 p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setViewMode('agenda')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === 'agenda' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            📅 Agenda Do Dia
          </button>
          <button
            onClick={() => setViewMode('archived')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === 'archived' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            📦 Arquivados
          </button>
        </div>
      </header>

      {/* PAINEL MODO AGENDA */}
      {viewMode === 'agenda' ? (
        <>
          <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 mb-6 flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <label className="text-xs font-bold text-gray-400">Data:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-gray-800 border border-gray-700 p-2 rounded-xl text-xs text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedProfFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                  selectedProfFilter === 'ALL' ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}>
                Todos os Profissionais
              </button>
              {professionals.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProfFilter(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                    selectedProfFilter === p.id ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* HORÁRIOS BLOQUEADOS */}
          {blockedTimes.length > 0 && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 p-3 rounded-2xl space-y-1">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider block">⛔ Bloqueios de Horário Hoje:</span>
              {blockedTimes.map(b => {
                const p = professionals.find(prof => prof.id === b.professional_id);
                return (
                  <p key={b.id} className="text-xs text-gray-300">
                    • <b>{b.start_time} - {b.end_time}</b>: {p ? p.name : 'Toda a Equipe'} {b.reason && `(${b.reason})`}
                  </p>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* PAINEL MODO ARQUIVADOS (HEADER COM BOTAO DE LIMPAR) */
        <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 mb-6 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-sm text-purple-400">📦 Historico de Agendamentos Arquivados ({appointments.length})</h2>
            <p className="text-[11px] text-gray-400">Atendimentos finalizados armazenados no histórico.</p>
          </div>

          {appointments.length > 0 && (
            <button
              onClick={handleClearAllArchived}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-lg">
              🧹 Limpar Todos os Arquivados
            </button>
          )}
        </div>
      )}

      {/* GRADE DE AGENDAMENTOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {appointments.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500 text-sm">
            {viewMode === 'agenda' ? 'Nenhum agendamento para esta data.' : 'Nenhum agendamento no histórico de arquivados.'}
          </div>
        ) : (
          appointments.map(app => {
            const prof = professionals.find(p => p.id === app.professional_id);
            const servicesList = Array.isArray(app.services_json) ? app.services_json : [];

            return (
              <div key={app.id} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl space-y-3 shadow-lg relative">
                <div className="flex justify-between items-start border-b border-gray-800 pb-2">
                  <div>
                    <span className="text-xs font-bold text-orange-400">⏰ {app.appointment_date?.split('-').reverse().join('/')} — {app.start_time} até {app.end_time}</span>
                    <h3 className="font-bold text-sm text-white">{app.customer_name}</h3>
                    <p className="text-xs text-gray-400">📱 {app.customer_phone}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                    app.status === 'em_atendimento' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    app.status === 'concluido' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="text-xs text-gray-300 bg-gray-800/50 p-2 rounded-xl border border-gray-800">
                  <p><b>Profissional:</b> {prof?.name || 'Não atribuído'}</p>
                  <p><b>Duração Total:</b> {app.total_duration_minutes || 30} min</p>
                </div>

                <div className="space-y-1 border-t border-b border-gray-800 py-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Serviços:</span>
                  {servicesList.map((s, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-gray-200">
                      <span>• {s.name}</span>
                      <span className="font-bold">R$ {Number(s.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-gray-400 block text-[10px]">TOTAL:</span>
                    <span className="text-green-400 font-bold text-sm">R$ {Number(app.total_price).toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => togglePayment(app.id, app.is_paid)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                      app.is_paid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    }`}>
                    {app.is_paid ? '🟢 Pago' : '🟡 Cobrar no Local'}
                  </button>
                </div>

                {/* BOTÕES DE AÇÃO */}
                <div className="flex space-x-1 pt-1 text-[10px] font-bold flex-wrap gap-y-1">
                  {viewMode === 'agenda' ? (
                    <>
                      {app.status === 'agendado' && (
                        <button onClick={() => updateStatus(app.id, 'em_atendimento')} className="flex-1 bg-blue-600 hover:bg-blue-700 py-1.5 rounded-lg text-white">
                          ✂️ Iniciar
                        </button>
                      )}
                      {app.status === 'em_atendimento' && (
                        <button onClick={() => updateStatus(app.id, 'concluido')} className="flex-1 bg-green-600 hover:bg-green-700 py-1.5 rounded-lg text-white">
                          ✅ Concluir
                        </button>
                      )}

                      {/* BOTÃO ARQUIVAR (QUANDO CONCLUÍDO) */}
                      {app.status === 'concluido' && (
                        <button onClick={() => handleArchiveApp(app.id)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-1.5 rounded-lg">
                          📦 Arquivar
                        </button>
                      )}

                      <button onClick={() => handleOpenReschedule(app)} className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 px-2 py-1.5 rounded-lg border border-purple-500/30">
                        ✏️ Reagendar
                      </button>

                      <button onClick={() => updateStatus(app.id, 'cancelado')} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1.5 rounded-lg border border-red-500/30">
                        ❌ Cancelar
                      </button>
                    </>
                  ) : (
                    /* AÇÕES DENTRO DA ABA ARQUIVADOS */
                    <>
                      <button onClick={() => handleUnarchiveApp(app.id)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-1.5 rounded-lg border border-gray-700">
                        ↩️ Desarquivar
                      </button>
                      <button onClick={() => handleDeleteApp(app.id)} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/30">
                        🗑 Excluir Definitivo
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL REAGENDAR HORÁRIO */}
      {reschedulingApp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveReschedule} className="bg-gray-900 border border-purple-500/40 w-full max-w-sm rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-sm text-purple-400">✏️ Reagendar Agendamento #{reschedulingApp.id}</h3>
            <p className="text-xs text-gray-300">Cliente: <b>{reschedulingApp.customer_name}</b></p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nova Data:</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Novo Horário:</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setReschedulingApp(null)}
                className="w-1/2 bg-gray-800 text-gray-300 py-2.5 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingReschedule}
                className="w-1/2 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-xs font-bold transition">
                {isSavingReschedule ? 'Salvar...' : 'Salvar & Notificar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
