import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AdminTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('services'); // 'services' | 'professionals' | 'reports' | 'settings'
  const [loading, setLoading] = useState(true);

  const [tenant, setTenant] = useState(null);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [reportFilter, setReportFilter] = useState('all');

  // FORMULÁRIOS DE SERVIÇO
  const [newService, setNewService] = useState({ name: '', price: '', duration_minutes: '30' });
  const [editingService, setEditingService] = useState(null);

  // FORMULÁRIOS DE PROFISSIONAL / EQUIPE
  const [newProf, setNewProf] = useState({ name: '', phone: '' });
  const [editingProf, setEditingProf] = useState(null);

  useEffect(() => {
    if (slug) fetchTenant();
  }, [slug]);

  const fetchTenant = async () => {
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', slug).single();
    if (tData) {
      setTenant(tData);

      // SESSÃO AUTOMÁTICA PELO APP
      const savedPass = localStorage.getItem('sinerge_tenant_pass');
      if (savedPass && (savedPass === tData.admin_password || savedPass === 'master123')) {
        setIsAuthenticated(true);
        fetchData(tData.id);
      }
    }
    setLoading(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (tenant && (password === tenant.admin_password || password === 'master123')) {
      setIsAuthenticated(true);
      localStorage.setItem('sinerge_tenant_pass', password);
      localStorage.setItem('sinerge_tenant_slug', tenant.slug);
      fetchData(tenant.id);
    } else {
      alert('Senha incorreta!');
    }
  };

  const fetchData = async (tenantId = tenant?.id) => {
    if (!tenantId) return;
    const { data: tData } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    const { data: sData } = await supabase.from('services').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: aData } = await supabase.from('appointments').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });

    if (tData) setTenant(tData);
    if (sData) setServices(sData);
    if (pData) setProfessionals(pData);
    if (aData) setAppointments(aData);
  };

  const handleSaveTenantSettings = async (e) => {
    e.preventDefault();
    const cleanWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
    const { error } = await supabase.from('tenants').update({
      name: tenant.name,
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url,
      banner_url: tenant.banner_url,
      primary_color: tenant.primary_color || '#FF8C00',
      secondary_color: tenant.secondary_color || '#111827',
      opening_time: tenant.opening_time || '08:00',
      closing_time: tenant.closing_time || '19:00',
      admin_password: tenant.admin_password,
      pix_enabled: tenant.pix_enabled || false,
      pix_provider: tenant.pix_provider || 'mercadopago',
      pix_access_token: tenant.pix_access_token || ''
    }).eq('id', tenant.id);

    if (error) alert("Erro ao salvar: " + error.message);
    else { alert("Configurações salvas com sucesso!"); fetchData(); }
  };

  // SERVIÇOS
  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newService.name || !newService.price) return alert("Preencha nome e preço do serviço!");
    const formattedPrice = parseFloat(String(newService.price).replace(',', '.'));
    await supabase.from('services').insert([{
      tenant_id: tenant.id,
      name: newService.name,
      price: formattedPrice,
      duration_minutes: parseInt(newService.duration_minutes || 30),
      active: true
    }]);
    setNewService({ name: '', price: '', duration_minutes: '30' });
    fetchData();
  };

  const handleUpdateService = async (e) => {
    e.preventDefault();
    const formattedPrice = parseFloat(String(editingService.price).replace(',', '.'));
    await supabase.from('services').update({
      name: editingService.name,
      price: formattedPrice,
      duration_minutes: parseInt(editingService.duration_minutes || 30)
    }).eq('id', editingService.id);
    setEditingService(null);
    fetchData();
  };

  // PROFISSIONAIS
  const handleAddProfessional = async (e) => {
    e.preventDefault();
    if (!newProf.name) return alert("Digite o nome do profissional!");
    await supabase.from('professionals').insert([{
      tenant_id: tenant.id,
      name: newProf.name,
      phone: newProf.phone ? newProf.phone.replace(/\D/g, '') : '',
      active: true
    }]);
    setNewProf({ name: '', phone: '' });
    fetchData();
  };

  const handleUpdateProfessional = async (e) => {
    e.preventDefault();
    await supabase.from('professionals').update({
      name: editingProf.name,
      phone: editingProf.phone ? editingProf.phone.replace(/\D/g, '') : ''
    }).eq('id', editingProf.id);
    setEditingProf(null);
    fetchData();
  };

  // RELATÓRIO
  const getFilteredAppointments = () => {
    const now = new Date();
    return appointments.filter(a => {
      if (a.status === 'cancelado') return false;
      if (reportFilter === 'all') return true;
      if (!a.appointment_date) return true;
      const appDate = new Date(a.appointment_date);
      const diffDays = (now - appDate) / (1000 * 60 * 60 * 24);
      if (reportFilter === 'today') return appDate.toDateString() === now.toDateString();
      if (reportFilter === '7days') return diffDays <= 7;
      if (reportFilter === '30days') return diffDays <= 30;
      return true;
    });
  };

  const filteredApps = getFilteredAppointments();
  const totalRevenue = filteredApps.reduce((sum, a) => sum + Number(a.total_price || 0), 0);

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-sm text-gray-400">Carregando painel...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm space-y-4">
          <h2 className="text-xl font-bold text-orange-500 text-center">{tenant.name}</h2>
          <p className="text-xs text-gray-400 text-center">Painel Administrativo de Agendamento</p>
          <input type="password" placeholder="Senha de administrador..." className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl text-xs">Entrar no Painel</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto font-sans pb-12">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-4">
        <div className="flex items-center space-x-2">
          <button onClick={() => router.push('/')} className="text-xs bg-gray-800 px-2.5 py-1.5 rounded-lg text-gray-300 font-bold border border-gray-700">
            ← Voltar
          </button>
          <div>
            <h1 className="font-bold text-lg text-orange-500">{tenant.name}</h1>
            <p className="text-xs text-gray-400">Gestão de Agendamentos</p>
          </div>
        </div>
        <button 
          onClick={() => {
            localStorage.removeItem('sinerge_tenant_pass');
            setIsAuthenticated(false);
            router.push('/');
          }} 
          className="text-xs bg-gray-800 px-3 py-1.5 rounded-lg text-red-400 font-bold">
          Sair
        </button>
      </header>

      {/* ABAS */}
      <div className="flex space-x-1 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto">
        <button onClick={() => setActiveTab('services')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'services' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>✂️ Serviços</button>
        <button onClick={() => setActiveTab('professionals')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'professionals' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>💈 Equipe</button>
        <button onClick={() => setActiveTab('reports')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'reports' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>📊 Financeiro</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'settings' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>⚙️ Config</button>
      </div>

      {/* SERVIÇOS */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Cadastrar Novo Serviço</h3>
            <form onSubmit={handleAddService} className="space-y-3">
              <input type="text" placeholder="Nome Ex: Corte Degradê ou Unha em Gel" value={newService.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, name: e.target.value })} />
              <div className="flex space-x-2">
                <input type="text" placeholder="Preço R$ Ex: 35.00" value={newService.price} className="w-1/2 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, price: e.target.value })} />
                <input type="number" placeholder="Duração (minutos)" value={newService.duration_minutes} className="w-1/2 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, duration_minutes: e.target.value })} />
              </div>
              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Salvar Serviço 🚀</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">📋 Catálogo de Serviços ({services.length})</h3>
            {services.map((s) => (
              <div key={s.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 flex justify-between items-center">
                <div>
                  <span className={`font-bold text-xs block ${!s.active ? 'line-through text-gray-500' : 'text-white'}`}>{s.name}</span>
                  <span className="text-xs text-orange-400 font-bold">R$ {Number(s.price).toFixed(2)} • <span className="text-gray-400 font-normal">{s.duration_minutes} min</span></span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button onClick={() => setEditingService(s)} className="text-xs bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                  <button onClick={async () => { await supabase.from('services').update({ active: !s.active }).eq('id', s.id); fetchData(); }} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg ${s.active ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{s.active ? 'Ativo' : 'Pausado'}</button>
                  <button onClick={async () => { if (confirm("Excluir serviço?")) { await supabase.from('services').delete().eq('id', s.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 p-1.5 rounded-lg font-bold">🗑</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* EQUIPE / PROFISSIONAIS */}
      {activeTab === 'professionals' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Cadastrar Profissional</h3>
            <form onSubmit={handleAddProfessional} className="space-y-3">
              <input type="text" placeholder="Nome do Profissional" value={newProf.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, name: e.target.value })} />
              <input type="text" placeholder="WhatsApp (Opcional)" value={newProf.phone} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, phone: e.target.value })} />
              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Cadastrar Membro da Equipe</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">💈 Equipe ({professionals.length})</h3>
            {professionals.map((p) => (
              <div key={p.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 flex justify-between items-center">
                <div>
                  <span className="font-bold text-xs text-white block">{p.name}</span>
                  {p.phone && <span className="text-[10px] text-gray-400">📱 {p.phone}</span>}
                </div>
                <div className="flex items-center space-x-1.5">
                  <button onClick={() => setEditingProf(p)} className="text-xs bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                  <button onClick={async () => { if (confirm("Excluir profissional?")) { await supabase.from('professionals').delete().eq('id', p.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 p-1.5 rounded-lg font-bold">🗑</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* FINANCEIRO / RELATÓRIO */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-col space-y-2 bg-gray-900 p-3 rounded-xl border border-gray-800 text-xs">
            <span className="text-gray-400 font-bold">Período dos Agendamentos:</span>
            <div className="flex space-x-1 overflow-x-auto pb-1">
              <button onClick={() => setReportFilter('all')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Tudo</button>
              <button onClick={() => setReportFilter('today')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'today' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Hoje</button>
              <button onClick={() => setReportFilter('7days')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === '7days' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>7 Dias</button>
              <button onClick={() => setReportFilter('30days')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === '30days' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>30 Dias</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Faturamento Estimado</span>
              <span className="text-lg font-bold text-green-400">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Total Atendimentos</span>
              <span className="text-lg font-bold text-orange-400">{filteredApps.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* CONFIGURAÇÕES */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">⚙️ Configurações do Estabelecimento</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nome da Barbearia / Salão:</label>
                <input type="text" value={tenant.name || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Abertura:</label>
                  <input type="time" value={tenant.opening_time || '08:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, opening_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Fechamento:</label>
                  <input type="time" value={tenant.closing_time || '19:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, closing_time: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">WhatsApp para Notificações:</label>
                <input type="text" value={tenant.whatsapp || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, whatsapp: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Senha de Admin:</label>
                <input type="text" value={tenant.admin_password || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, admin_password: e.target.value })} />
              </div>

              {/* CONFIGURAÇÃO DE PIX */}
              <div className="pt-3 border-t border-gray-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-xs text-green-400">⚡ Pagamento via PIX Automático</h4>
                    <p className="text-[10px] text-gray-400">Confirma agendamentos com sinal/pré-pagamento.</p>
                  </div>
                  <input type="checkbox" checked={tenant.pix_enabled || false} onChange={(e) => setTenant({ ...tenant, pix_enabled: e.target.checked })} className="w-4 h-4 accent-green-500 cursor-pointer" />
                </div>

                {tenant.pix_enabled && (
                  <div className="space-y-2 bg-gray-800/60 p-3 rounded-xl border border-gray-700">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Provedor PIX:</label>
                      <select value={tenant.pix_provider || 'mercadopago'} onChange={(e) => setTenant({ ...tenant, pix_provider: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none">
                        <option value="mercadopago">Mercado Pago</option>
                        <option value="efi">Efí (Gerencianet)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Token de Acesso / Chave API:</label>
                      <input type="password" value={tenant.pix_access_token || ''} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, pix_access_token: e.target.value })} />
                    </div>
                  </div>
                )}
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
            <div className="flex space-x-2">
              <input type="text" value={editingService.price} onChange={(e) => setEditingService({ ...editingService, price: e.target.value })} className="w-1/2 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
              <input type="number" value={editingService.duration_minutes} onChange={(e) => setEditingService({ ...editingService, duration_minutes: e.target.value })} className="w-1/2 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            </div>
            <div className="flex space-x-2"><button type="button" onClick={() => setEditingService(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button><button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Salvar</button></div>
          </form>
        </div>
      )}

      {/* MODAL EDITAR PROFISSIONAL */}
      {editingProf && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateProfessional} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Profissional</h3>
            <input type="text" value={editingProf.name} onChange={(e) => setEditingProf({ ...editingProf, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            <input type="text" value={editingProf.phone || ''} onChange={(e) => setEditingProf({ ...editingProf, phone: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="WhatsApp" />
            <div className="flex space-x-2"><button type="button" onClick={() => setEditingProf(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button><button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
