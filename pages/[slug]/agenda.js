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
  const [loading, setLoading] = useState(true);

  // FILTROS
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProf, setSelectedProf] = useState('ALL');

  // MODAL DE BLOQUEIO DE HORÁRIO
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockProfId, setBlockProfId] = useState('');
  const [blockDate, setBlockDate] = useState(new Date().toISOString().split('T')[0]);
  const [blockStartTime, setBlockStartTime] = useState('08:00');
  const [blockEndTime, setBlockEndTime] = useState('09:00');
  const [blockReason, setBlockReason] = useState('Compromisso Pessoal');
  const [isSavingBlock, setIsSavingBlock] = useState(false);

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
      if (pData) setProfessionals(pData);
      
      await fetchAppointmentsAndBlocks(tData.id);
    }
    setLoading(false);
  };

  const fetchAppointmentsAndBlocks = async (tenantId = tenant?.id) => {
    if (!tenantId) return;

    // Buscar todos os agendamentos da data selecionada
    const { data: apps } = await supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelado')
      .order('start_time', { ascending: true });

    // Buscar bloqueios da data selecionada
    const { data: blocks } = await supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('block_date', selectedDate);

    if (apps) setAppointments(apps);
    if (blocks) setBlockedTimes(blocks);
  };

  // CRIAR BLOQUEIO DE AGENDA
  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!blockDate || !blockStartTime || !blockEndTime) {
      return alert("Preencha data, horário de início e fim!");
    }

    setIsSavingBlock(true);

    const payload = {
      tenant_id: tenant.id,
      professional_id: blockProfId ? parseInt(blockProfId) : null,
      block_date: blockDate,
      start_time: blockStartTime,
      end_time: blockEndTime,
      reason: blockReason || 'Horário Bloqueado'
    };

    const { error } = await supabase.from('blocked_times').insert([payload]);

    setIsSavingBlock(false);

    if (error) {
      alert("Erro ao fechar horário: " + error.message);
    } else {
      alert("Agenda fechada com sucesso!");
      setShowBlockModal(false);
      fetchAppointmentsAndBlocks();
    }
  };

  // REMOVER BLOQUEIO
  const handleDeleteBlock = async (blockId) => {
    if (!confirm("Deseja desmarcar este bloqueio e liberar o horário novamente?")) return;

    const { error } = await supabase.from('blocked_times').delete().eq('id', blockId);

    if (error) {
      alert("Erro ao remover bloqueio: " + error.message);
    } else {
      fetchAppointmentsAndBlocks();
    }
  };

  // ATUALIZAR STATUS DO AGENDAMENTO
  const handleUpdateAppStatus = async (appId, newStatus) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', appId);
    if (error) {
      alert("Erro ao atualizar status: " + error.message);
    } else {
      fetchAppointmentsAndBlocks();
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando Agenda...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  const primaryColor = tenant.primary_color || '#FF8C00';

  // FILTRAGEM DOS AGENDAMENTOS E BLOQUEIOS
  const displayedAppointments = appointments.filter(app => {
    if (selectedProf === 'ALL') return true;
    return String(app.professional_id) === String(selectedProf);
  });

  const displayedBlocks = blockedTimes.filter(b => {
    if (selectedProf === 'ALL') return true;
    return b.professional_id === null || String(b.professional_id) === String(selectedProf);
  });

  // MÉTRICAS DO PROFISSIONAL/GERAL
  const totalAmount = displayedAppointments.reduce((acc, app) => acc + Number(app.total_price || 0), 0);
  const completedCount = displayedAppointments.filter(app => app.status === 'concluido').length;
  const pendingCount = displayedAppointments.filter(app => app.status === 'agendado').length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-5xl mx-auto font-sans pb-20">
      
      {/* topo: CABEÇALHO & SELETOR DE DATA */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-4 border-b border-gray-800 mb-6 gap-4">
        <div>
          <h1 className="font-bold text-xl text-orange-500">📅 Gestão da Agenda — {tenant.name}</h1>
          <p className="text-xs text-gray-400">Clique no profissional para visualizar os horários ocupados.</p>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs font-bold text-white focus:outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
          />

          <button
            onClick={() => {
              setBlockDate(selectedDate);
              setShowBlockModal(true);
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center space-x-1 whitespace-nowrap">
            <span>🔒 Bloquear Horário</span>
          </button>

          <button onClick={() => fetchAppointmentsAndBlocks()} className="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-2.5 rounded-xl text-xs font-bold transition">
            🔄
          </button>
        </div>
      </header>

      {/* SELEÇÃO DA EQUIPE COM CARDS VISUAIS E AVATARES */}
      <div className="mb-6">
        <label className="text-xs font-bold text-gray-400 block uppercase tracking-wider mb-2.5">
          👥 Selecione a Agenda do Profissional ({professionals.length})
        </label>

        <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-none">
          {/* CARD TODOS */}
          <button
            onClick={() => setSelectedProf('ALL')}
            className={`p-3 rounded-2xl border flex items-center space-x-3 min-w-[140px] transition text-left relative ${
              selectedProf === 'ALL'
                ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                : 'border-gray-800 bg-gray-900/60 hover:bg-gray-900'
            }`}>
            <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-lg font-bold">
              👥
            </div>
            <div>
              <span className="font-bold text-xs text-white block">Todos</span>
              <span className="text-[10px] text-gray-400">Visão Geral</span>
            </div>
            {appointments.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                {appointments.length}
              </span>
            )}
          </button>

          {/* CARDS DOS PROFISSIONAIS */}
          {professionals.map(prof => {
            const isSelected = String(selectedProf) === String(prof.id);
            const profAppsCount = appointments.filter(a => String(a.professional_id) === String(prof.id)).length;

            return (
              <button
                key={prof.id}
                onClick={() => setSelectedProf(prof.id)}
                className={`p-3 rounded-2xl border flex items-center space-x-3 min-w-[160px] transition text-left relative ${
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

      {/* PAINEL DE RESUMO E MÉTRICAS DA SELEÇÃO */}
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
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Total R$ Previsto</span>
          <span className="text-base font-bold text-green-400">R$ {totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* PAINEL DE BLOQUEIOS DE HORÁRIO */}
      {displayedBlocks.length > 0 && (
        <div className="mb-6 bg-red-950/30 border border-red-500/30 p-4 rounded-2xl space-y-2">
          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center space-x-1">
            <span>🔒 Horários Bloqueados / Indisponíveis ({displayedBlocks.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {displayedBlocks.map(block => {
              const profName = professionals.find(p => p.id === block.professional_id)?.name || 'Toda a Casa (Geral)';

              return (
                <div key={block.id} className="bg-gray-900/90 border border-red-500/20 p-3 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-white block">{profName}</span>
                    <span className="text-red-300 font-bold">⏰ {block.start_time} às {block.end_time}</span>
                    {block.reason && <span className="text-gray-400 text-[10px] block italic">{block.reason}</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteBlock(block.id)}
                    className="bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 px-2.5 py-1 rounded-lg font-bold text-[10px] transition">
                    🔓 Desbloquear
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA DE AGENDAMENTOS (DETALHADO) */}
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            📋 Horários Agendados ({displayedAppointments.length})
          </h2>
          <span className="text-[10px] text-gray-500">Ordenados por horário</span>
        </div>

        {displayedAppointments.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-2">
            <span className="text-3xl block">☕</span>
            <p className="text-xs text-gray-400 font-bold">Nenhum agendamento para este profissional nesta data.</p>
            <p className="text-[11px] text-gray-500">A agenda está livre ou o profissional selecionado não possui horários marcados.</p>
          </div>
        ) : (
          displayedAppointments.map(app => {
            const prof = professionals.find(p => p.id === app.professional_id);
            const profName = prof?.name || 'Profissional';
            const servicesList = Array.isArray(app.services_json) ? app.services_json : [];
            const cleanPhone = (app.customer_phone || '').replace(/\D/g, '');

            return (
              <div key={app.id} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl space-y-3 shadow-lg hover:border-gray-700 transition">
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

                {/* CORPO DO CARD */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-gray-950 p-3 rounded-xl border border-gray-800/80">
                  <div>
                    <span className="text-gray-400 block text-[10px]">Profissional Atendente:</span>
                    <span className="font-bold text-white flex items-center space-x-1">
                      {prof?.avatar_url && (
                        <img src={prof.avatar_url} alt={profName} className="w-4 h-4 rounded-full object-cover inline mr-1" />
                      )}
                      <span>{profName}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400 block text-[10px]">Serviço(s) Solicitado(s):</span>
                    <span className="font-bold text-orange-300">
                      {servicesList.map(s => s.name).join(', ') || 'Atendimento Geral'}
                    </span>
                  </div>

                  <div className="sm:col-span-2 border-t border-gray-800/60 pt-2 flex justify-between items-center">
                    <div>
                      <span className="text-gray-400 block text-[10px]">Forma de Pagamento:</span>
                      <span className="font-bold text-gray-200">{app.payment_method || 'No Local'}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-gray-400 block text-[10px]">Valor Total:</span>
                      <span className="font-bold text-green-400 text-sm">R$ {Number(app.total_price || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO */}
                <div className="flex justify-end space-x-2 pt-1">
                  {app.status === 'agendado' && (
                    <>
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, 'concluido')}
                        className="bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/30 px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
                        ✅ Concluir Atendimento
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, 'cancelado')}
                        className="bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 px-3.5 py-1.5 rounded-xl font-bold text-xs transition">
                        ❌ Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

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
                  <option value="">💈 Toda a Casa (Geral / Todos)</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Data do Bloqueio:</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-400 block mb-1">Hora de Início:</label>
                  <input
                    type="time"
                    required
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-gray-400 block mb-1">Hora de Fim:</label>
                  <input
                    type="time"
                    required
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Motivo do Bloqueio (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ex: Almoço, Médico, Folga, Manutenção..."
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
