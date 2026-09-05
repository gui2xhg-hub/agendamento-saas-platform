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
  }, [tenant?.id, selectedDate, selectedProf]);

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

    // Buscar agendamentos
    let appQuery = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelado');

    // Buscar bloqueios
    let blockQuery = supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('block_date', selectedDate);

    if (selectedProf !== 'ALL') {
      appQuery = appQuery.eq('professional_id', selectedProf);
    }

    const { data: apps } = await appQuery;
    const { data: blocks } = await blockQuery;

    if (apps) setAppointments(apps);
    if (blocks) setBlockedTimes(blocks);
  };

  // CRIAR NOVO BLOQUEIO DE HORÁRIO / FECHAR AGENDA
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
      alert("Agenda fechada com sucesso para o período selecionado!");
      setShowBlockModal(false);
      fetchAppointmentsAndBlocks();
    }
  };

  // REMOVER BLOQUEIO / REABRIR HORÁRIO
  const handleDeleteBlock = async (blockId) => {
    if (!confirm("Deseja desmarcar este bloqueio e liberar o horário novamente?")) return;

    const { error } = await supabase.from('blocked_times').delete().eq('id', blockId);

    if (error) {
      alert("Erro ao remover bloqueio: " + error.message);
    } else {
      alert("Horário liberado novamente!");
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

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-4xl mx-auto font-sans pb-16">
      {/* CABEÇALHO DA AGENDA */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-4 border-b border-gray-800 mb-6 gap-3">
        <div>
          <h1 className="font-bold text-xl text-orange-500">📅 Gestão da Agenda — {tenant.name}</h1>
          <p className="text-xs text-gray-400">Acompanhe compromissos e gerencie bloqueios da equipe.</p>
        </div>

        <div className="flex space-x-2 w-full md:w-auto">
          <button
            onClick={() => {
              setBlockDate(selectedDate);
              setShowBlockModal(true);
            }}
            className="flex-1 md:flex-initial bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center space-x-1">
            <span>🔒 Fechar Agenda / Bloquear</span>
          </button>
          <button onClick={() => fetchAppointmentsAndBlocks()} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 rounded-xl text-xs font-bold">
            🔄
          </button>
        </div>
      </header>

      {/* FILTROS DE DATA E PROFISSIONAL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-900 p-3 rounded-2xl border border-gray-800 mb-6">
        <div>
          <label className="text-[11px] font-bold text-gray-400 block mb-1">Data da Agenda:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-gray-400 block mb-1">Filtrar por Profissional:</label>
          <select
            value={selectedProf}
            onChange={(e) => setSelectedProf(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-xl text-xs text-white focus:outline-none">
            <option value="ALL">👥 Todos os Profissionais</option>
            {professionals.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* PAINEL DE BLOQUEIOS ATIVOS NA DATA */}
      {blockedTimes.length > 0 && (
        <div className="mb-6 bg-red-950/40 border border-red-500/30 p-4 rounded-2xl space-y-2">
          <h3 className="text-xs font-bold text-red-400 flex items-center space-x-1 uppercase tracking-wider">
            <span>🔒 Horários Bloqueados nesta Data ({blockedTimes.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {blockedTimes.map(block => {
              const profName = professionals.find(p => p.id === block.professional_id)?.name || 'Toda a Casa (Geral)';

              return (
                <div key={block.id} className="bg-gray-900 border border-red-500/20 p-3 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-white block">{profName}</span>
                    <span className="text-red-300">⏰ {block.start_time} às {block.end_time}</span>
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

      {/* LISTA DE AGENDAMENTOS DO DIA */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          📋 Agendamentos do Dia ({appointments.length})
        </h2>

        {appointments.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-xs">
            Nenhum agendamento encontrado para esta data ou filtro.
          </div>
        ) : (
          appointments.map(app => {
            const profName = professionals.find(p => p.id === app.professional_id)?.name || 'Não especificado';
            const servicesList = Array.isArray(app.services_json) ? app.services_json : [];

            return (
              <div key={app.id} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl space-y-3 shadow-lg">
                <div className="flex justify-between items-start border-b border-gray-800 pb-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-orange-400">⏰ {app.start_time} - {app.end_time}</span>
                      <span className="text-xs text-gray-400">({app.total_duration_minutes || 30} min)</span>
                    </div>
                    <h3 className="font-bold text-xs text-white mt-1">{app.customer_name} • <span className="text-gray-400 font-normal">{app.customer_phone}</span></h3>
                  </div>

                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                    app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                    app.status === 'concluido' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="text-xs space-y-1 bg-gray-950 p-2.5 rounded-xl border border-gray-800">
                  <p className="text-gray-300"><b>Profissional:</b> {profName}</p>
                  <p className="text-gray-300"><b>Serviços:</b> {servicesList.map(s => s.name).join(', ')}</p>
                  <p className="text-gray-300"><b>Pagamento:</b> R$ {Number(app.total_price || 0).toFixed(2)} ({app.payment_method})</p>
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  {app.status === 'agendado' && (
                    <>
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, 'concluido')}
                        className="bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/30 px-3 py-1.5 rounded-xl font-bold text-xs transition">
                        ✅ Concluir
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, 'cancelado')}
                        className="bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-xl font-bold text-xs transition">
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
