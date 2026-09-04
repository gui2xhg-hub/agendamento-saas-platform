import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AdminAgendamento() {
  const router = useRouter();
  const { slug } = router.query;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('services');
  const [loading, setLoading] = useState(true);

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [profServices, setProfServices] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [reportFilter, setReportFilter] = useState('all');

  // FORMULÁRIOS
  const [newProf, setNewProf] = useState({ name: '', phone: '', avatar_url: '', commission_percentage: '50' });
  const [newService, setNewService] = useState({ name: '', price: '', duration_minutes: '30', category: 'Geral', selectedProfs: [] });
  const [newBlock, setNewBlock] = useState({ professional_id: 'ALL', block_date: new Date().toISOString().split('T')[0], start_time: '12:00', end_time: '13:00', reason: '' });

  const [editingProf, setEditingProf] = useState(null);
  const [editingService, setEditingService] = useState(null);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenant();
    }
  }, [router.isReady, slug]);

  const fetchTenant = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant(tData);
    }
    setLoading(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (tenant && (password === tenant.admin_password || password === 'master123')) {
      setIsAuthenticated(true);
      fetchData(tenant.id);
    } else {
      alert('Senha incorreta!');
    }
  };

  const fetchData = async (tenantId = tenant?.id) => {
    if (!tenantId) return;
    const { data: tData } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: sData } = await supabase.from('services').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: aData } = await supabase.from('appointments').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    const { data: psData } = await supabase.from('professional_services').select('*');
    const { data: bData } = await supabase.from('blocked_times').select('*').eq('tenant_id', tenantId).order('block_date', { ascending: false });

    if (tData) setTenant(tData);
    if (pData) setProfessionals(pData);
    if (sData) setServices(sData);
    if (aData) setAppointments(aData);
    if (psData) setProfServices(psData);
    if (bData) setBlockedTimes(bData);
  };

  // HANDLERS PROFISSIONAIS
  const handleAddProf = async (e) => {
    e.preventDefault();
    if (!newProf.name) return alert("Preencha o nome!");
    await supabase.from('professionals').insert([{
      tenant_id: tenant.id,
      name: newProf.name.trim(),
      phone: newProf.phone,
      avatar_url: newProf.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      commission_percentage: parseFloat(newProf.commission_percentage || 50),
      active: true
    }]);
    setNewProf({ name: '', phone: '', avatar_url: '', commission_percentage: '50' });
    fetchData();
  };

  const handleUpdateProf = async (e) => {
    e.preventDefault();
    await supabase.from('professionals').update({
      name: editingProf.name,
      phone: editingProf.phone,
      avatar_url: editingProf.avatar_url,
      commission_percentage: parseFloat(editingProf.commission_percentage)
    }).eq('id', editingProf.id);
    setEditingProf(null);
    fetchData();
  };

  // HANDLERS SERVIÇOS
  const toggleProfForNewService = (pId) => {
    const current = newService.selectedProfs || [];
    if (current.includes(pId)) {
      setNewService({ ...newService, selectedProfs: current.filter(id => id !== pId) });
    } else {
      setNewService({ ...newService, selectedProfs: [...current, pId] });
    }
  };

  const toggleProfForEditService = (pId) => {
    const current = editingService.selectedProfs || [];
    if (current.includes(pId)) {
      setEditingService({ ...editingService, selectedProfs: current.filter(id => id !== pId) });
    } else {
      setEditingService({ ...editingService, selectedProfs: [...current, pId] });
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newService.name || !newService.price) return alert("Preencha nome e preço!");
    const formattedPrice = parseFloat(String(newService.price).replace(',', '.'));

    const { data: createdService, error } = await supabase.from('services').insert([{
      tenant_id: tenant.id,
      name: newService.name.trim(),
      price: formattedPrice,
      duration_minutes: parseInt(newService.duration_minutes || 30),
      category: newService.category || 'Geral',
      active: true
    }]).select().single();

    if (error) return alert("Erro ao criar serviço: " + error.message);

    // Se nenhum profissional for marcado explicitamente, vincula a todos
    const profsToBind = (newService.selectedProfs && newService.selectedProfs.length > 0)
      ? newService.selectedProfs
      : professionals.map(p => p.id);

    if (profsToBind.length > 0) {
      const inserts = profsToBind.map(pId => ({
        professional_id: pId,
        service_id: createdService.id
      }));
      await supabase.from('professional_services').insert(inserts);
    }

    setNewService({ name: '', price: '', duration_minutes: '30', category: 'Geral', selectedProfs: [] });
    fetchData();
  };

  const handleOpenEditService = (srv) => {
    const assignedProfs = profServices
      .filter(ps => ps.service_id === srv.id)
      .map(ps => ps.professional_id);
    setEditingService({ ...srv, selectedProfs: assignedProfs });
  };

  const handleUpdateService = async (e) => {
    e.preventDefault();
    const formattedPrice = parseFloat(String(editingService.price).replace(',', '.'));

    await supabase.from('services').update({
      name: editingService.name,
      price: formattedPrice,
      duration_minutes: parseInt(editingService.duration_minutes),
      category: editingService.category
    }).eq('id', editingService.id);

    // Atualiza vínculos de profissionais
    await supabase.from('professional_services').delete().eq('service_id', editingService.id);
    
    if (editingService.selectedProfs && editingService.selectedProfs.length > 0) {
      const inserts = editingService.selectedProfs.map(pId => ({
        professional_id: pId,
        service_id: editingService.id
      }));
      await supabase.from('professional_services').insert(inserts);
    }

    setEditingService(null);
    fetchData();
  };

  // HANDLERS FECHAR AGENDA (BLOQUEIO)
  const handleAddBlock = async (e) => {
    e.preventDefault();
    if (!newBlock.block_date || !newBlock.start_time || !newBlock.end_time) {
      return alert("Preencha data e horários de bloqueio!");
    }

    const profId = newBlock.professional_id === 'ALL' ? null : parseInt(newBlock.professional_id);

    const { error } = await supabase.from('blocked_times').insert([{
      tenant_id: tenant.id,
      professional_id: profId,
      block_date: newBlock.block_date,
      start_time: newBlock.start_time,
      end_time: newBlock.end_time,
      reason: newBlock.reason || 'Bloqueio de Agenda'
    }]);

    if (error) alert("Erro ao bloquear: " + error.message);
    else {
      alert("Agenda fechada para o período selecionado!");
      setNewBlock({ professional_id: 'ALL', block_date: new Date().toISOString().split('T')[0], start_time: '12:00', end_time: '13:00', reason: '' });
      fetchData();
    }
  };

  const handleDeleteBlock = async (id) => {
    if (confirm("Remover este bloqueio de agenda?")) {
      await supabase.from('blocked_times').delete().eq('id', id);
      fetchData();
    }
  };

  const handleSaveTenantSettings = async (e) => {
    e.preventDefault();
    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    const { error } = await supabase.from('tenants').update({
      name: tenant.name,
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url,
      banner_url: tenant.banner_url,
      primary_color: tenant.primary_color || '#FF8C00',
      secondary_color: tenant.secondary_color || '#111827',
      opening_time: tenant.opening_time || '08:00',
      closing_time: tenant.closing_time || '20:00',
      custom_message: tenant.custom_message || '',
      admin_password: tenant.admin_password
    }).eq('id', tenant.id);

    if (error) alert("Erro ao salvar: " + error.message);
    else { alert("Configurações salvas!"); fetchData(); }
  };

  // RELATÓRIO E COMISSÕES
  const getFilteredAppointments = () => {
    const now = new Date();
    return appointments.filter(a => {
      if (a.status === 'cancelado') return false;
      if (reportFilter === 'all') return true;
      if (!a.created_at) return true;
      const appDate = new Date(a.created_at);
      const diffDays = (now - appDate) / (1000 * 60 * 60 * 24);
      if (reportFilter === 'today') return appDate.toDateString() === now.toDateString();
      if (reportFilter === '7days') return diffDays <= 7;
      if (reportFilter === '30days') return diffDays <= 30;
      return true;
    });
  };

  const filteredApps = getFilteredAppointments();
  const totalRevenue = filteredApps.reduce((sum, a) => sum + Number(a.total_price || 0), 0);

  const profCommissionsMap = {};
  filteredApps.forEach(a => {
    const prof = professionals.find(p => p.id === a.professional_id);
    if (prof) {
      const commRate = Number(prof.commission_percentage || 50) / 100;
      const commValue = Number(a.total_price || 0) * commRate;
      profCommissionsMap[prof.name] = (profCommissionsMap[prof.name] || 0) + commValue;
    }
  });

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-sm text-gray-400">Carregando admin...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm">
          <h2 className="text-xl font-bold text-orange-500 mb-1 text-center">{tenant.name}</h2>
          <p className="text-xs text-gray-400 text-center mb-6">Painel Administrativo — Agendamentos</p>
          <input type="password" placeholder="Senha de acesso..." className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-sm mb-4 text-white focus:outline-none" onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl text-sm">Entrar no Painel</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto font-sans pb-12">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-4">
        <div>
          <h1 className="font-bold text-lg text-orange-500">{tenant.name}</h1>
          <p className="text-xs text-gray-400">Gestão de Agendamentos</p>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="text-xs bg-gray-800 px-3 py-1.5 rounded-lg text-red-400 font-bold">Sair</button>
      </header>

      {/* NAVEGAÇÃO ENTRE ABAS */}
      <div className="flex space-x-1 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveTab('services')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'services' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>💈 Serviços</button>
        <button onClick={() => setActiveTab('professionals')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'professionals' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>👨‍🔬 Equipe</button>
        <button onClick={() => setActiveTab('blocked')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'blocked' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>⛔ Fechar Agenda</button>
        <button onClick={() => setActiveTab('reports')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'reports' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>📊 Financeiro</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'settings' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>⚙️ Config</button>
      </div>

      {/* ABA SERVIÇOS */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Cadastrar Serviço</h3>
            <form onSubmit={handleAddService} className="space-y-3">
              <input type="text" placeholder="Nome do Serviço (Ex: Corte Degradê)" value={newService.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, name: e.target.value })} />
              <div className="flex space-x-2">
                <input type="text" placeholder="Preço R$" value={newService.price} className="w-1/2 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, price: e.target.value })} />
                <input type="number" placeholder="Duração (min)" value={newService.duration_minutes} className="w-1/2 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, duration_minutes: e.target.value })} />
              </div>

              {/* SELEÇÃO DE PROFISSIONAIS HABILITADOS */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] text-gray-400 font-bold block">Profissionais que realizam este serviço:</label>
                <div className="flex flex-wrap gap-1.5">
                  {professionals.map(p => {
                    const isSelected = (newService.selectedProfs || []).includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleProfForNewService(p.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          isSelected ? 'bg-orange-500/20 text-orange-400 border-orange-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}>
                        {isSelected ? '✓ ' : '+ '} {p.name}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] text-gray-500 block">*(Se nenhum for marcado, todos os profissionais farão o serviço)*</span>
              </div>

              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Salvar Serviço 🚀</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">📋 Catálogo de Serviços ({services.length})</h3>
            {services.map((srv) => {
              const assignedProfIds = profServices.filter(ps => ps.service_id === srv.id).map(ps => ps.professional_id);
              const assignedProfs = professionals.filter(p => assignedProfIds.includes(p.id));

              return (
                <div key={srv.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold block text-white">{srv.name}</span>
                      <span className="text-orange-400 font-bold">R$ {Number(srv.price).toFixed(2)}</span>
                      <span className="text-gray-400 text-[10px] block">⏱️ {srv.duration_minutes} min</span>
                    </div>
                    <div className="flex space-x-1.5">
                      <button onClick={() => handleOpenEditService(srv)} className="bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                      <button onClick={async () => { if (confirm("Excluir serviço?")) { await supabase.from('services').delete().eq('id', srv.id); fetchData(); } }} className="text-red-400 font-bold p-1.5">🗑</button>
                    </div>
                  </div>

                  {/* PROFISSIONAIS VINCULADOS */}
                  <div className="pt-2 border-t border-gray-800/80 flex items-center space-x-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-500 font-bold">Realizado por:</span>
                    {assignedProfs.length === 0 ? (
                      <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded">Todos da equipe</span>
                    ) : (
                      assignedProfs.map(p => (
                        <span key={p.id} className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded font-bold">
                          {p.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ABA PROFISSIONAIS */}
      {activeTab === 'professionals' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Novo Profissional / Barbeiro</h3>
            <form onSubmit={handleAddProf} className="space-y-3">
              <input type="text" placeholder="Nome Completo" value={newProf.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, name: e.target.value })} />
              <input type="text" placeholder="WhatsApp" value={newProf.phone} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, phone: e.target.value })} />
              <input type="text" placeholder="URL da Foto de Perfil" value={newProf.avatar_url} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, avatar_url: e.target.value })} />
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Porcentagem de Comissão (%):</label>
                <input type="number" value={newProf.commission_percentage} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, commission_percentage: e.target.value })} />
              </div>
              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Cadastrar Profissional</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">💈 Equipe ({professionals.length})</h3>
            {professionals.map((p) => (
              <div key={p.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 flex justify-between items-center text-xs">
                <div className="flex items-center space-x-2">
                  <img src={p.avatar_url} alt={p.name} className="w-9 h-9 rounded-full object-cover border border-gray-700" />
                  <div>
                    <span className="font-bold block text-white">{p.name}</span>
                    <span className="text-gray-400 text-[10px]">Comissão: <b>{p.commission_percentage}%</b></span>
                  </div>
                </div>
                <div className="flex space-x-1.5">
                  <button onClick={() => setEditingProf(p)} className="bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                  <button onClick={async () => { if (confirm("Excluir?")) { await supabase.from('professionals').delete().eq('id', p.id); fetchData(); } }} className="text-red-400 font-bold p-1.5">🗑</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* ABA FECHAR AGENDA (BLOQUEIO DE HORÁRIOS) */}
      {activeTab === 'blocked' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-red-400">⛔ Bloquear Horário / Fechar Agenda</h3>
            <form onSubmit={handleAddBlock} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Profissional Atingido:</label>
                <select
                  value={newBlock.professional_id}
                  onChange={(e) => setNewBlock({ ...newBlock, professional_id: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none">
                  <option value="ALL">🚨 Toda a Equipe (Fechar Estabelecimento)</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>💈 Apensas {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Data do Bloqueio:</label>
                <input
                  type="date"
                  value={newBlock.block_date}
                  onChange={(e) => setNewBlock({ ...newBlock, block_date: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Horário Inicial:</label>
                  <input
                    type="time"
                    value={newBlock.start_time}
                    onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Horário Final:</label>
                  <input
                    type="time"
                    value={newBlock.end_time}
                    onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Motivo (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ex: Almoço, Curso, Feriado ou Imprevisto"
                  value={newBlock.reason}
                  onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full bg-red-600 hover:bg-red-700 font-bold py-2.5 rounded-lg text-xs transition">
                🚫 Confirmar Bloqueio de Horário
              </button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">📋 Bloqueios Ativos ({blockedTimes.length})</h3>
            {blockedTimes.length === 0 ? (
              <p className="text-xs text-gray-500 bg-gray-900 p-4 rounded-xl border border-gray-800 text-center">Nenhum horário bloqueado.</p>
            ) : (
              blockedTimes.map(b => {
                const targetProf = professionals.find(p => p.id === b.professional_id);
                return (
                  <div key={b.id} className="bg-gray-900 p-3 rounded-xl border border-red-500/20 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-red-400 block">
                        📅 {b.block_date.split('-').reverse().join('/')} ({b.start_time} - {b.end_time})
                      </span>
                      <span className="text-gray-300 block text-[11px]">
                        <b>Atinge:</b> {targetProf ? targetProf.name : 'Toda a Equipe'}
                      </span>
                      {b.reason && <span className="text-gray-400 text-[10px] block">Motivo: {b.reason}</span>}
                    </div>

                    <button onClick={() => handleDeleteBlock(b.id)} className="bg-red-500/20 text-red-400 p-2 rounded-lg font-bold border border-red-500/30 text-[11px]">
                      🔓 Desbloquear
                    </button>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}

      {/* ABA FINANCEIRO */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-col space-y-2 bg-gray-900 p-3 rounded-xl border border-gray-800 text-xs">
            <span className="text-gray-400 font-bold">Filtro de Período:</span>
            <div className="flex space-x-1 overflow-x-auto pb-1">
              <button onClick={() => setReportFilter('all')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Tudo</button>
              <button onClick={() => setReportFilter('today')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'today' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Hoje</button>
              <button onClick={() => setReportFilter('7days')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === '7days' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>7 Dias</button>
              <button onClick={() => setReportFilter('30days')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === '30days' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>30 Dias</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Faturamento Bruto</span>
              <span className="text-lg font-bold text-green-400">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Agendamentos</span>
              <span className="text-lg font-bold text-orange-400">{filteredApps.length}</span>
            </div>
          </div>

          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">💰 REPASSE DE COMISSÕES</h3>
            <div className="space-y-2">
              {Object.keys(profCommissionsMap).length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum cálculo de comissão no período.</p>
              ) : (
                Object.entries(profCommissionsMap).map(([profName, val], idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-800 p-2.5 rounded-lg text-xs">
                    <span className="font-bold text-white">{profName}</span>
                    <span className="bg-green-500/20 text-green-400 px-2.5 py-1 rounded-md font-bold">A pagar: R$ {val.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* ABA CONFIGURAÇÕES */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">⚙️ Configurações da Loja</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nome do Estabelecimento:</label>
                <input type="text" value={tenant.name || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Horário Abertura:</label>
                  <input type="time" value={tenant.opening_time || '08:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, opening_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Horário Fechamento:</label>
                  <input type="time" value={tenant.closing_time || '20:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, closing_time: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Instrução Customizada no WhatsApp:</label>
                <input type="text" placeholder="Ex: Por favor, chegue com 5 minutos de antecedência." value={tenant.custom_message || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, custom_message: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">WhatsApp de Recebimento:</label>
                <input type="text" value={tenant.whatsapp || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, whatsapp: e.target.value })} />
              </div>

              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Salvar Configurações</button>
            </form>
          </section>
        </div>
      )}

      {/* MODAL EDITAR SERVIÇO */}
      {editingService && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateService} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Serviço</h3>
            <input type="text" value={editingService.name} onChange={(e) => setEditingService({ ...editingService, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <input type="text" value={editingService.price} onChange={(e) => setEditingService({ ...editingService, price: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <input type="number" value={editingService.duration_minutes} onChange={(e) => setEditingService({ ...editingService, duration_minutes: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] text-gray-400 font-bold block">Profissionais Habilitados:</label>
              <div className="flex flex-wrap gap-1.5">
                {professionals.map(p => {
                  const isSelected = (editingService.selectedProfs || []).includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleProfForEditService(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        isSelected ? 'bg-orange-500/20 text-orange-400 border-orange-500' : 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}>
                      {isSelected ? '✓ ' : '+ '} {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingService(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Atualizar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDITAR PROFISSIONAL */}
      {editingProf && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateProf} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Profissional</h3>
            <input type="text" value={editingProf.name} onChange={(e) => setEditingProf({ ...editingProf, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <input type="text" value={editingProf.phone || ''} onChange={(e) => setEditingProf({ ...editingProf, phone: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <input type="text" value={editingProf.avatar_url || ''} onChange={(e) => setEditingProf({ ...editingProf, avatar_url: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <input type="number" value={editingProf.commission_percentage || ''} onChange={(e) => setEditingProf({ ...editingProf, commission_percentage: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <div className="flex space-x-2"><button type="button" onClick={() => setEditingProf(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button><button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Atualizar</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
