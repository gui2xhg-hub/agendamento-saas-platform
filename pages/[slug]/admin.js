import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AdminTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('services'); // services, professionals, reports, links, bot, settings
  const [loading, setLoading] = useState(true);

  const [tenant, setTenant] = useState(null);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [reportFilter, setReportFilter] = useState('all');

  // CONTROLE DO FINANCEIRO GERAL / SENHA ADMIN
  const [isGlobalFinUnlocked, setIsGlobalFinUnlocked] = useState(false);
  const [adminFinPass, setAdminFinPass] = useState('');

  // CONTROLE DO FINANCEIRO INDIVIDUAL / PIN
  const [finViewMode, setFinViewMode] = useState('global'); // 'global' ou 'individual'
  const [selectedProfForFin, setSelectedProfForFin] = useState('');
  const [inputProfPin, setInputProfPin] = useState('');
  const [isProfFinUnlocked, setIsProfFinUnlocked] = useState(false);
  const [unlockedProfData, setUnlockedProfData] = useState(null);

  // CONTROLE DE DIVULGAÇÃO & LINKS
  const [selectedProfForLink, setSelectedProfForLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

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

  const [newService, setNewService] = useState({ 
    name: '', 
    price: '', 
    duration_minutes: '30', 
    category: 'Geral', 
    professional_ids: [],
    image_url: ''
  });
  const [editingService, setEditingService] = useState(null);

  const [newProf, setNewProf] = useState({ 
    name: '', 
    phone: '', 
    specialty: '',
    avatar_url: '', 
    instagram_url: '',
    commission_percentage: '50',
    work_days: [1, 2, 3, 4, 5, 6],
    pin: '1234',
    bot_message_template: ''
  });
  const [editingProf, setEditingProf] = useState(null);

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
      setTenant({
        ...tData,
        work_days: tData.work_days || [1, 2, 3, 4, 5, 6],
        share_template: tData.share_template || 'Olá! Agende seu horário no *{empresa}* com *{profissional}* acessando: {link}',
        bot_enabled: tData.bot_enabled || false,
        bot_send_time: tData.bot_send_time || '08:00',
        bot_message_template: tData.bot_message_template || 'Olá {cliente}! 👋 Passando para lembrar do seu agendamento de *{servico}* amanhã ({data}) às *{horario}* no *{empresa}* com *{profissional}*.',
        bot_whatsapp_instance: tData.bot_whatsapp_instance || '',
        bot_whatsapp_token: tData.bot_whatsapp_token || ''
      });

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

    if (tData) {
      setTenant({
        ...tData,
        work_days: tData.work_days || [1, 2, 3, 4, 5, 6],
        share_template: tData.share_template || 'Olá! Agende seu horário no *{empresa}* com *{profissional}* acessando: {link}',
        bot_enabled: tData.bot_enabled || false,
        bot_send_time: tData.bot_send_time || '08:00',
        bot_message_template: tData.bot_message_template || 'Olá {cliente}! 👋 Passando para lembrar do seu agendamento de *{servico}* amanhã ({data}) às *{horario}* no *{empresa}* com *{profissional}*.',
        bot_whatsapp_instance: tData.bot_whatsapp_instance || '',
        bot_whatsapp_token: tData.bot_whatsapp_token || ''
      });
    }
    if (sData) setServices(sData);
    if (pData) setProfessionals(pData);
    if (aData) setAppointments(aData);
  };

  const handleSaveTenantSettings = async (e) => {
    if (e) e.preventDefault();
    const cleanWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
    const { error } = await supabase.from('tenants').update({
      name: tenant.name,
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url,
      banner_url: tenant.banner_url,
      instagram_url: tenant.instagram_url || '',
      primary_color: tenant.primary_color || '#FF8C00',
      secondary_color: tenant.secondary_color || '#111827',
      opening_time: tenant.opening_time || '08:00',
      closing_time: tenant.closing_time || '20:00',
      work_days: tenant.work_days || [1, 2, 3, 4, 5, 6],
      custom_message: tenant.custom_message || '',
      share_template: tenant.share_template || '',
      admin_password: tenant.admin_password,
      pix_enabled: tenant.pix_enabled || false,
      pix_provider: tenant.pix_provider || 'mercadopago',
      pix_access_token: tenant.pix_access_token || '',
      bot_enabled: tenant.bot_enabled || false,
      bot_send_time: tenant.bot_send_time || '08:00',
      bot_message_template: tenant.bot_message_template || '',
      bot_whatsapp_instance: tenant.bot_whatsapp_instance || '',
      bot_whatsapp_token: tenant.bot_whatsapp_token || ''
    }).eq('id', tenant.id);

    if (error) alert("Erro ao salvar configurações: " + error.message);
    else { alert("Configurações salvas com sucesso!"); fetchData(); }
  };

  const handleClearFinancialData = async () => {
    if (confirm("⚠️ ATENÇÃO: Tem certeza que deseja zerar TODOS os agendamentos e dados financeiros?\n\nEsta ação vai apagar definitivamente todos os agendamentos de teste. Não poderá ser desfeito!")) {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('tenant_id', tenant.id);

      if (error) {
        alert("Erro ao limpar financeiro: " + error.message);
      } else {
        alert("Histórico financeiro e agendamentos zerados com sucesso!");
        fetchData();
      }
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newService.name || !newService.price) return alert("Preencha nome e preço do serviço!");
    const formattedPrice = parseFloat(String(newService.price).replace(',', '.'));
    
    let cleanImage = (newService.image_url || '').trim();
    if (cleanImage.startsWith('blob:')) cleanImage = '';

    const { error } = await supabase.from('services').insert([{
      tenant_id: tenant.id,
      name: newService.name.trim(),
      price: formattedPrice,
      duration_minutes: parseInt(newService.duration_minutes || 30),
      category: newService.category || 'Geral',
      professional_ids: newService.professional_ids || [],
      image_url: cleanImage,
      active: true
    }]);

    if (error) {
      alert("Erro ao cadastrar serviço: " + error.message);
    } else {
      alert("Serviço cadastrado com sucesso!");
      setNewService({ name: '', price: '', duration_minutes: '30', category: 'Geral', professional_ids: [], image_url: '' });
      fetchData();
    }
  };

  const handleUpdateService = async (e) => {
    e.preventDefault();
    const formattedPrice = parseFloat(String(editingService.price).replace(',', '.'));
    
    let cleanImage = (editingService.image_url || editingService.image || '').trim();
    if (cleanImage.startsWith('blob:')) cleanImage = '';

    const { error } = await supabase.from('services').update({
      name: editingService.name.trim(),
      price: formattedPrice,
      duration_minutes: parseInt(editingService.duration_minutes || 30),
      category: editingService.category || 'Geral',
      professional_ids: editingService.professional_ids || [],
      image_url: cleanImage
    }).eq('id', editingService.id);

    if (error) {
      alert("Erro ao atualizar serviço: " + error.message);
    } else {
      setEditingService(null);
      fetchData();
    }
  };

  const handleAddProf = async (e) => {
    e.preventDefault();
    if (!newProf.name || !newProf.name.trim()) return alert("Digite o nome do profissional!");
    
    // Remove qualquer link blob: temporário do navegador
    let cleanAvatar = (newProf.avatar_url || '').trim();
    if (cleanAvatar.startsWith('blob:')) {
      cleanAvatar = '';
    }

    const payload = {
      tenant_id: tenant.id,
      name: newProf.name.trim(),
      phone: newProf.phone ? newProf.phone.replace(/\D/g, '') : '',
      specialty: newProf.specialty ? newProf.specialty.trim() : '',
      avatar_url: cleanAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      photo_url: cleanAvatar,
      photo: cleanAvatar,
      instagram_url: newProf.instagram_url ? newProf.instagram_url.trim() : '',
      commission_percentage: parseFloat(newProf.commission_percentage || 50),
      work_days: newProf.work_days || [1, 2, 3, 4, 5, 6],
      pin: newProf.pin ? String(newProf.pin).trim() : '1234',
      bot_message_template: newProf.bot_message_template ? newProf.bot_message_template.trim() : '',
      active: true
    };

    const { error } = await supabase.from('professionals').insert([payload]);

    if (error) {
      console.error("Erro no Supabase ao adicionar profissional:", error);
      alert("Erro no Supabase ao cadastrar profissional: " + error.message);
    } else {
      alert("Profissional cadastrado com sucesso!");
      setNewProf({ name: '', phone: '', specialty: '', avatar_url: '', instagram_url: '', commission_percentage: '50', work_days: [1, 2, 3, 4, 5, 6], pin: '1234', bot_message_template: '' });
      fetchData();
    }
  };

  const handleUpdateProf = async (e) => {
    e.preventDefault();
    if (!editingProf.name || !editingProf.name.trim()) return alert("Digite o nome do profissional!");

    let cleanAvatar = (editingProf.avatar_url || '').trim();
    if (cleanAvatar.startsWith('blob:')) {
      cleanAvatar = '';
    }

    const { error } = await supabase.from('professionals').update({
      name: editingProf.name.trim(),
      phone: editingProf.phone ? editingProf.phone.replace(/\D/g, '') : '',
      specialty: editingProf.specialty ? editingProf.specialty.trim() : '',
      avatar_url: cleanAvatar,
      photo_url: cleanAvatar,
      photo: cleanAvatar,
      instagram_url: editingProf.instagram_url ? editingProf.instagram_url.trim() : '',
      commission_percentage: parseFloat(editingProf.commission_percentage || 50),
      work_days: editingProf.work_days || [1, 2, 3, 4, 5, 6],
      pin: editingProf.pin ? String(editingProf.pin).trim() : '1234',
      bot_message_template: editingProf.bot_message_template ? editingProf.bot_message_template.trim() : ''
    }).eq('id', editingProf.id);

    if (error) {
      console.error("Erro no Supabase ao atualizar profissional:", error);
      alert("Erro ao atualizar profissional: " + error.message);
    } else {
      setEditingProf(null);
      fetchData();
    }
  };

  const toggleDaySelection = (currentDays, dayId) => {
    const arr = [...(currentDays || [])];
    if (arr.includes(dayId)) {
      return arr.filter(d => d !== dayId);
    } else {
      return [...arr, dayId].sort();
    }
  };

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

  const profCommissionsMap = {};
  filteredApps.forEach(a => {
    const prof = professionals.find(p => p.id === a.professional_id);
    if (prof) {
      const commRate = Number(prof.commission_percentage || 50) / 100;
      const commValue = Number(a.total_price || 0) * commRate;
      profCommissionsMap[prof.name] = (profCommissionsMap[prof.name] || 0) + commValue;
    }
  });

  const handleUnlockGlobalFin = (e) => {
    e.preventDefault();
    if (tenant && (adminFinPass === tenant.admin_password || adminFinPass === 'master123')) {
      setIsGlobalFinUnlocked(true);
      setAdminFinPass('');
    } else {
      alert('Senha de Admin incorreta!');
    }
  };

  const handleUnlockProfFin = (e) => {
    e.preventDefault();
    const prof = professionals.find(p => String(p.id) === String(selectedProfForFin));
    if (!prof) return alert('Selecione um profissional.');

    if (prof.pin && String(prof.pin) === String(inputProfPin).trim()) {
      setIsProfFinUnlocked(true);
      setUnlockedProfData(prof);
    } else {
      alert('PIN / Senha do profissional incorreta!');
    }
  };

  const getShareLinkAndMsg = () => {
    const baseUrl = `https://agendamento.sinergemkt.com/${tenant?.slug || ''}`;
    const selectedProfObj = professionals.find(p => String(p.id) === String(selectedProfForLink));
    
    const finalLink = selectedProfObj ? `${baseUrl}?prof=${selectedProfObj.id}` : baseUrl;
    const profName = selectedProfObj ? selectedProfObj.name : 'Nossa Equipe';

    const customMsg = (tenant?.share_template || 'Olá! Agende seu horário no *{empresa}* com *{profissional}* acessando: {link}')
      .replace('{empresa}', tenant?.name || '')
      .replace('{profissional}', profName)
      .replace('{link}', finalLink);

    return { finalLink, customMsg };
  };

  const { finalLink, customMsg } = getShareLinkAndMsg();

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-sm text-gray-400">Carregando painel...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm space-y-4 shadow-2xl">
          <h2 className="text-xl font-bold text-orange-500 text-center">{tenant.name}</h2>
          <p className="text-xs text-gray-400 text-center">Painel Administrativo de Agendamento</p>
          <input type="password" placeholder="Senha de acesso..." className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500" onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl text-xs transition">Entrar no Painel 🚀</button>
        </form>
      </div>
    );
  }

  const profApps = unlockedProfData
    ? filteredApps.filter(a => String(a.professional_id) === String(unlockedProfData.id))
    : [];
  const profTotalRev = profApps.reduce((sum, a) => sum + Number(a.total_price || 0), 0);
  const profCommEarned = profTotalRev * (Number(unlockedProfData?.commission_percentage || 50) / 100);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto font-sans pb-12">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-prof-receipt, #print-prof-receipt * { visibility: visible !important; }
          #print-prof-receipt {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; color: #000 !important; background: #fff !important; padding: 15px !important; font-family: sans-serif !important;
          }
        }
      `}</style>

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

      {/* BARRA DE TABS */}
      <div className="flex space-x-1 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto">
        <button onClick={() => setActiveTab('services')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'services' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>💈 Serviços</button>
        <button onClick={() => setActiveTab('professionals')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'professionals' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>👨‍🔬 Equipe</button>
        <button onClick={() => setActiveTab('reports')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'reports' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>📊 Financeiro</button>
        <button onClick={() => setActiveTab('bot')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'bot' ? 'bg-green-600 text-white' : 'text-gray-400'}`}>🤖 Robô Zap</button>
        <button onClick={() => setActiveTab('links')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'links' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>🔗 Divulgação</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-2 px-2 rounded-lg whitespace-nowrap ${activeTab === 'settings' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>⚙️ Config</button>
      </div>

      {/* ABA 1: SERVIÇOS */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Cadastrar Novo Serviço</h3>
            <form onSubmit={handleAddService} className="space-y-3">
              <input type="text" placeholder="Nome Ex: Corte Degradê ou Unha em Gel" value={newService.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, name: e.target.value })} />
              
              <div className="flex space-x-2">
                <input type="text" placeholder="Preço R$" value={newService.price} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, price: e.target.value })} />
                <input type="number" placeholder="Duração (min)" value={newService.duration_minutes} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, duration_minutes: e.target.value })} />
                <input type="text" placeholder="Categoria" value={newService.category} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, category: e.target.value })} />
              </div>

              <input 
                type="text" 
                placeholder="URL da Foto do Serviço (Opcional)" 
                value={newService.image_url} 
                className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
                onChange={(e) => setNewService({ ...newService, image_url: e.target.value })} 
              />

              {professionals.length > 0 && (
                <div className="border-t border-gray-800 pt-2">
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">
                    Profissionais que realizam este serviço:
                  </label>
                  <p className="text-[10px] text-gray-500 mb-2">*(Se nenhum for marcado, toda a equipe fará)*</p>
                  
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                    {professionals.map(p => {
                      const isChecked = (newService.professional_ids || []).includes(p.id);
                      return (
                        <label key={p.id} className={`flex items-center space-x-2 p-2 rounded-lg text-xs cursor-pointer border transition ${isChecked ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              let currentArr = [...(newService.professional_ids || [])];
                              if (e.target.checked) currentArr.push(p.id);
                              else currentArr = currentArr.filter(id => id !== p.id);
                              setNewService({ ...newService, professional_ids: currentArr });
                            }}
                            className="accent-orange-500"
                          />
                          <span className="truncate font-semibold">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Salvar Serviço 🚀</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">📋 Catálogo de Serviços ({services.length})</h3>
            {services.map((s) => {
              const assignedProfIds = s.professional_ids || [];
              const assignedProfs = professionals.filter(p => assignedProfIds.includes(p.id));
              const serviceImg = s.image_url || s.image;

              return (
                <div key={s.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      {serviceImg && (
                        <img 
                          src={serviceImg} 
                          alt={s.name} 
                          className="w-12 h-12 rounded-lg object-cover border border-gray-700 bg-gray-800 shrink-0" 
                        />
                      )}
                      <div>
                        <span className={`font-bold text-xs block ${!s.active ? 'line-through text-gray-500' : 'text-white'}`}>{s.name} <span className="text-[10px] text-gray-500 font-normal">({s.category || 'Geral'})</span></span>
                        <span className="text-xs text-orange-400 font-bold">R$ {Number(s.price).toFixed(2)} • <span className="text-gray-400 font-normal">{s.duration_minutes} min</span></span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button onClick={() => setEditingService(s)} className="text-xs bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                      <button onClick={async () => { await supabase.from('services').update({ active: !s.active }).eq('id', s.id); fetchData(); }} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg ${s.active ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{s.active ? 'Ativo' : 'Pausado'}</button>
                      <button onClick={async () => { if (confirm("Excluir serviço?")) { await supabase.from('services').delete().eq('id', s.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 p-1.5 rounded-lg font-bold">🗑</button>
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-400 border-t border-gray-800/60 pt-1.5">
                    <span className="font-semibold text-gray-500">Realizado por: </span>
                    {assignedProfs.length > 0 ? (
                      <span className="text-purple-300 font-medium">{assignedProfs.map(p => p.name).join(', ')}</span>
                    ) : (
                      <span className="text-gray-400 italic">Toda a Equipe</span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ABA 2: EQUIPE */}
      {activeTab === 'professionals' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Novo Profissional da Equipe</h3>
            <form onSubmit={handleAddProf} className="space-y-3">
              <input type="text" placeholder="Nome Completo Ex: Lanna ou Janaia" value={newProf.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, name: e.target.value })} />
              
              <div>
                <label className="text-[10px] text-purple-400 font-bold block mb-1">💅 Especialidade / Descrição do Trabalho:</label>
                <input type="text" placeholder="Ex: Pé e Mão, Cabelos, Nail Designer..." value={newProf.specialty} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, specialty: e.target.value })} />
                <span className="text-[9px] text-gray-500 block mt-0.5">Aparece logo abaixo do nome na seleção do cliente.</span>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">WhatsApp Individual (Agendamentos diretos):</label>
                <input type="text" placeholder="Ex: 47999999999" value={newProf.phone} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, phone: e.target.value })} />
              </div>

              <div>
                <label className="text-[10px] text-purple-400 font-bold block mb-1">📸 Instagram do Profissional (Opcional):</label>
                <input type="text" placeholder="Ex: @ana_naildesigner ou URL" value={newProf.instagram_url} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, instagram_url: e.target.value })} />
                <span className="text-[9px] text-gray-500 block mt-0.5">Se preenchido, o botão do topo da página redireciona para este perfil.</span>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">PIN / Senha Secreta (Para extrato individual):</label>
                <input type="text" placeholder="Ex: 1234" value={newProf.pin} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, pin: e.target.value })} />
              </div>

              <div>
                <label className="text-[10px] text-green-400 font-bold block mb-1">🤖 Mensagem Personalizada do Robô para este Profissional (Opcional):</label>
                <textarea rows={2} placeholder="Ex: Olá {cliente}! Lembrete do seu horário comigo ({profissional}) amanhã..." value={newProf.bot_message_template} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none font-mono" onChange={(e) => setNewProf({ ...newProf, bot_message_template: e.target.value })} />
                <span className="text-[9px] text-gray-500 block mt-0.5">Se ficar vazio, o robô usará o modelo padrão geral do estabelecimento.</span>
              </div>

              <input type="text" placeholder="URL da Foto de Perfil (Avatar)" value={newProf.avatar_url} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, avatar_url: e.target.value })} />
              
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Porcentagem de Comissão (%):</label>
                <input type="number" value={newProf.commission_percentage} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, commission_percentage: e.target.value })} />
              </div>

              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-2">
                <label className="text-[11px] font-bold text-purple-400 block">📅 Dias de Atendimento / Trabalho:</label>
                <p className="text-[10px] text-gray-500">*(Desmarque os dias em que o profissional NÃO trabalha)*</p>

                <div className="grid grid-cols-7 gap-1">
                  {ALL_DAYS.map(day => {
                    const isSelected = (newProf.work_days || []).includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => setNewProf({ ...newProf, work_days: toggleDaySelection(newProf.work_days, day.id) })}
                        className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${isSelected ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-900 text-gray-500 border-gray-800'}`}>
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Cadastrar Profissional</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">💈 Equipe ({professionals.length})</h3>
            {professionals.map((p) => {
              const pWorkDays = p.work_days || [1, 2, 3, 4, 5, 6];
              const pWorkDaysLabels = ALL_DAYS.filter(d => pWorkDays.includes(d.id)).map(d => d.label).join(', ');

              return (
                <div key={p.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <img src={p.avatar_url || p.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} alt={p.name} className="w-9 h-9 rounded-full object-cover border border-gray-700" />
                      <div>
                        <span className="font-bold block text-white">
                          {p.name} {p.specialty && <span className="text-purple-400 text-[10px] font-normal">({p.specialty})</span>}
                        </span>
                        <span className="text-gray-400 text-[10px]">Comissão: <b className="text-green-400">{p.commission_percentage}%</b> {p.phone ? `• 📱 ${p.phone}` : '• Central'}</span>
                        {p.instagram_url && <span className="text-[10px] text-pink-400 block">📸 Insta: {p.instagram_url}</span>}
                        <span className="text-[10px] text-orange-400 block font-mono">PIN: {p.pin || '1234'}</span>
                      </div>
                    </div>
                    <div className="flex space-x-1.5">
                      <button onClick={() => setEditingProf({ ...p, work_days: p.work_days || [1, 2, 3, 4, 5, 6], pin: p.pin || '1234', instagram_url: p.instagram_url || '', specialty: p.specialty || '', bot_message_template: p.bot_message_template || '' })} className="bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                      <button onClick={async () => { if (confirm("Excluir profissional?")) { await supabase.from('professionals').delete().eq('id', p.id); fetchData(); } }} className="text-red-400 font-bold p-1.5">🗑</button>
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-400 border-t border-gray-800/60 pt-1.5 flex justify-between">
                    <div>
                      <span className="font-semibold text-gray-500">Dias que trabalha: </span>
                      <span className="text-purple-300 font-medium">{pWorkDaysLabels || 'Nenhum dia'}</span>
                    </div>
                    {p.bot_message_template && <span className="text-green-400 font-bold">🤖 Mensagem Própria Ativa</span>}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ABA 3: FINANCEIRO */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex space-x-2 bg-gray-900 p-1.5 rounded-xl border border-gray-800 text-xs font-bold">
            <button 
              onClick={() => { setFinViewMode('global'); setIsProfFinUnlocked(false); }} 
              className={`flex-1 py-2 rounded-lg transition ${finViewMode === 'global' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
              🌐 Visão Geral (Admin)
            </button>
            <button 
              onClick={() => { setFinViewMode('individual'); setIsGlobalFinUnlocked(false); }} 
              className={`flex-1 py-2 rounded-lg transition ${finViewMode === 'individual' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
              🔒 Extrato do Profissional (PIN)
            </button>
          </div>

          {finViewMode === 'global' && (
            <div className="space-y-4">
              {!isGlobalFinUnlocked ? (
                <form onSubmit={handleUnlockGlobalFin} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div>
                    <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider flex items-center space-x-1">
                      <span>🔒 Financeiro Geral Protegido</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Digite a senha de Admin do estabelecimento para visualizar o faturamento total e o repasse de comissões.
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Senha de Admin:</label>
                    <input
                      type="password"
                      placeholder="Sua senha de administrador..."
                      value={adminFinPass}
                      onChange={(e) => setAdminFinPass(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg">
                    Visualizar Financeiro Geral 🔓
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-gray-900/80 p-3 rounded-xl border border-gray-800">
                    <span className="text-xs font-bold text-green-400">🔓 Financeiro Desbloqueado</span>
                    <button
                      onClick={() => setIsGlobalFinUnlocked(false)}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3 py-1 rounded-lg text-xs font-bold transition">
                      🔒 Ocultar Dados
                    </button>
                  </div>

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
                      <span className="text-[11px] text-gray-400 block mb-1">Total Atendimentos</span>
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

                  <section className="bg-gray-900 p-4 rounded-xl border border-red-500/30 flex justify-between items-center mt-4">
                    <div>
                      <h4 className="font-bold text-xs text-red-400">🧹 Zerar Dados de Teste</h4>
                      <p className="text-[10px] text-gray-400">Apaga todo o histórico de agendamentos.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearFinancialData}
                      className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/40 px-3 py-2 rounded-xl text-xs font-bold transition">
                      🗑️ Limpar
                    </button>
                  </section>
                </div>
              )}
            </div>
          )}

          {finViewMode === 'individual' && (
            <div className="space-y-4">
              {!isProfFinUnlocked ? (
                <form onSubmit={handleUnlockProfFin} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4">
                  <div>
                    <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">🔒 Extrato do Profissional</h3>
                    <p className="text-[11px] text-gray-400 mt-1">Selecione seu perfil e digite seu PIN para abrir seu extrato privado.</p>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Selecione Seu Nome:</label>
                    <select
                      value={selectedProfForFin}
                      onChange={(e) => setSelectedProfForFin(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                    >
                      <option value="">-- Selecionar Profissional --</option>
                      {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">PIN / Senha de 4 Dígitos:</label>
                    <input
                      type="password"
                      placeholder="****"
                      value={inputProfPin}
                      onChange={(e) => setInputProfPin(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                    />
                  </div>

                  <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition">
                    Desbloquear Meu Extrato 🔓
                  </button>
                </form>
              ) : (
                <div id="print-prof-receipt" className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                    <div>
                      <h3 className="font-bold text-sm text-white">👤 Extrato — <span className="text-orange-400">{unlockedProfData.name}</span></h3>
                      <p className="text-[11px] text-gray-400">Comissão: {unlockedProfData.commission_percentage}%</p>
                    </div>

                    <div className="flex space-x-1.5">
                      <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs text-white transition">
                        🖨️ Imprimir
                      </button>
                      <button onClick={() => { setIsProfFinUnlocked(false); setInputProfPin(''); }} className="bg-gray-800 text-gray-300 font-bold px-3 py-1.5 rounded-lg text-xs">
                        🔒 Sair
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Atendido</span>
                      <span className="text-base font-bold text-white">R$ {profTotalRev.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-500 block">{profApps.length} serviços</span>
                    </div>

                    <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
                      <span className="text-[10px] font-bold text-green-400 uppercase block">Sua Comissão</span>
                      <span className="text-base font-bold text-green-400">R$ {profCommEarned.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-gray-300">Serviços Realizados:</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {profApps.length === 0 ? (
                        <p className="text-xs text-gray-500">Nenhum atendimento finalizado no período.</p>
                      ) : (
                        profApps.map(a => (
                          <div key={a.id} className="bg-gray-950 p-2.5 rounded-xl border border-gray-800/80 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-white block">{a.client_name || a.customer_name}</span>
                              <span className="text-[10px] text-gray-400">{a.service_name} • {a.appointment_date || a.date}</span>
                            </div>
                            <span className="font-bold text-green-400">R$ {Number(a.total_price || a.price || 0).toFixed(2)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA 4: ROBÔ WHATSAPP / LEMBRETES AUTOMÁTICOS */}
      {activeTab === 'bot' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-2xl border border-green-500/30 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-green-400 flex items-center space-x-1.5">
                  <span>🤖 Robô Lembrete de Agendamento</span>
                </h3>
                <p className="text-[11px] text-gray-400">Envia mensagens automáticas de lembrete 1 dia antes da agenda.</p>
              </div>

              <input
                type="checkbox"
                checked={tenant.bot_enabled || false}
                onChange={(e) => setTenant({ ...tenant, bot_enabled: e.target.checked })}
                className="w-5 h-5 accent-green-500 cursor-pointer"
              />
            </div>

            {tenant.bot_enabled && (
              <div className="space-y-4 pt-3 border-t border-gray-800">
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">⏰ Horário Diário de Disparo:</label>
                  <input
                    type="time"
                    value={tenant.bot_send_time || '08:00'}
                    onChange={(e) => setTenant({ ...tenant, bot_send_time: e.target.value })}
                    className="bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-500 block mt-1">Neste horário, o robô enviará mensagem para os clientes com horário marcado para amanhã.</span>
                </div>

                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">✍️ Modelo Padrão da Mensagem (Geral do Salão):</label>
                  <textarea
                    rows="4"
                    value={tenant.bot_message_template || ''}
                    onChange={(e) => setTenant({ ...tenant, bot_message_template: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none font-mono"
                    placeholder="Digite a mensagem padrão do robô..."
                  />
                  <div className="text-[10px] text-gray-400 mt-1 flex flex-wrap gap-1">
                    <span>Variáveis:</span>
                    <b className="text-green-400 font-mono">{'{cliente}'}</b>
                    <b className="text-green-400 font-mono">{'{servico}'}</b>
                    <b className="text-green-400 font-mono">{'{data}'}</b>
                    <b className="text-green-400 font-mono">{'{horario}'}</b>
                    <b className="text-green-400 font-mono">{'{empresa}'}</b>
                    <b className="text-green-400 font-mono">{'{profissional}'}</b>
                  </div>
                </div>

                <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-800 space-y-3">
                  <h4 className="font-bold text-xs text-green-400">🔑 Credenciais da API do WhatsApp (Gateway)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Instância / Session ID:</label>
                      <input
                        type="text"
                        placeholder="Ex: salao-lanna-wp"
                        value={tenant.bot_whatsapp_instance || ''}
                        onChange={(e) => setTenant({ ...tenant, bot_whatsapp_instance: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Token de Acesso (API Key):</label>
                      <input
                        type="password"
                        placeholder="Token do Gateway"
                        value={tenant.bot_whatsapp_token || ''}
                        onChange={(e) => setTenant({ ...tenant, bot_whatsapp_token: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-950 p-3 rounded-xl border border-gray-800/80">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    💡 <b className="text-white">Multi-Profissional:</b> Cada agendamento fica isolado por profissional. O robô substituirá automaticamente as variáveis <b className="text-green-400">{'{profissional}'}</b> com quem a cliente agendou. Além disso, você pode definir um texto exclusivo para cada profissional na aba <b>👨‍🔬 Equipe</b>.
                  </p>
                </div>
              </div>
            )}

            <button onClick={handleSaveTenantSettings} className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg">
              💾 Salvar Configurações do Robô
            </button>
          </section>
        </div>
      )}

      {/* ABA 5: DIVULGAÇÃO & LINKS PERSONALIZADOS */}
      {activeTab === 'links' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">✍️ Modelo de Mensagem de Divulgação</h3>
            <p className="text-[10px] text-gray-400">Variáveis automáticas: <b className="text-white">{'{empresa}'}</b>, <b className="text-white">{'{profissional}'}</b> e <b className="text-white">{'{link}'}</b>.</p>

            <textarea
              rows={3}
              value={tenant.share_template || ''}
              onChange={(e) => setTenant({ ...tenant, share_template: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none font-mono"
            />

            <button onClick={handleSaveTenantSettings} className="bg-green-600 font-bold px-4 py-2 rounded-lg text-xs text-white transition">
              💾 Salvar Modelo
            </button>
          </section>

          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-gray-200 uppercase tracking-wider">🔗 Gerar Link Individual por Profissional</h3>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Filtrar Link para um Profissional:</label>
              <select
                value={selectedProfForLink}
                onChange={(e) => setSelectedProfForLink(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
              >
                <option value="">-- Link Geral do Estabelecimento --</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Prévia da Mensagem:</span>
              <p className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{customMsg}</p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(customMsg);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex-1 bg-orange-500 hover:bg-orange-600 font-bold py-2.5 rounded-lg text-xs text-white transition"
              >
                {copiedLink ? '✓ Copiado!' : '📋 Copiar Mensagem + Link'}
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(customMsg)}`}
                target="_blank"
                rel="noreferrer"
                className="bg-green-600 hover:bg-green-700 font-bold px-3 py-2.5 rounded-lg text-xs text-white transition flex items-center"
              >
                💬 Zap
              </a>
            </div>
          </section>
        </div>
      )}

      {/* ABA 6: CONFIGURAÇÕES */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">⚙️ Configurações da Loja</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nome do Estabelecimento:</label>
                <input type="text" value={tenant.name || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Link do Instagram Geral do Salão:</label>
                <input 
                  type="text" 
                  placeholder="Ex: https://instagram.com/lanna_designer" 
                  value={tenant.instagram_url || ''} 
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
                  onChange={(e) => setTenant({ ...tenant, instagram_url: e.target.value })} 
                />
              </div>

              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <label className="text-[11px] font-bold text-orange-400 block">📆 Dias de Funcionamento da Loja:</label>
                  <div className="flex space-x-1 text-[10px]">
                    <button type="button" onClick={() => setTenant({ ...tenant, work_days: [1, 2, 3, 4, 5] })} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-bold">Seg-Sex</button>
                    <button type="button" onClick={() => setTenant({ ...tenant, work_days: [1, 2, 3, 4, 5, 6] })} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-bold">Seg-Sáb</button>
                    <button type="button" onClick={() => setTenant({ ...tenant, work_days: [0, 1, 2, 3, 4, 5, 6] })} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-bold">Todos</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {ALL_DAYS.map(day => {
                    const isSelected = (tenant.work_days || []).includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => setTenant({ ...tenant, work_days: toggleDaySelection(tenant.work_days, day.id) })}
                        className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${isSelected ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-900 text-gray-500 border-gray-800'}`}>
                        {day.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-800/80">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Horário de Abertura:</label>
                    <input type="time" value={tenant.opening_time || '08:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, opening_time: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Horário de Fechamento:</label>
                    <input type="time" value={tenant.closing_time || '20:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, closing_time: e.target.value })} />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Instrução Customizada no WhatsApp:</label>
                <input type="text" placeholder="Ex: Por favor, chegue com 5 minutos de antecedência." value={tenant.custom_message || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, custom_message: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">WhatsApp Geral de Recebimento:</label>
                <input type="text" value={tenant.whatsapp || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, whatsapp: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Senha de Admin:</label>
                <input type="text" value={tenant.admin_password || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, admin_password: e.target.value })} />
              </div>

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

      {/* MODAL EDIÇÃO DE SERVIÇO */}
      {editingService && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateService} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Serviço</h3>
            
            <input type="text" value={editingService.name} onChange={(e) => setEditingService({ ...editingService, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            
            <div className="flex space-x-2">
              <input type="text" value={editingService.price} onChange={(e) => setEditingService({ ...editingService, price: e.target.value })} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
              <input type="number" value={editingService.duration_minutes} onChange={(e) => setEditingService({ ...editingService, duration_minutes: e.target.value })} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
              <input type="text" value={editingService.category || 'Geral'} onChange={(e) => setEditingService({ ...editingService, category: e.target.value })} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />
            </div>

            <input 
              type="text" 
              placeholder="URL da Foto do Serviço (Opcional)" 
              value={editingService.image_url || editingService.image || ''} 
              onChange={(e) => setEditingService({ ...editingService, image_url: e.target.value })} 
              className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
            />

            {professionals.length > 0 && (
              <div className="border-t border-gray-800 pt-2">
                <label className="text-[11px] text-gray-400 font-bold block mb-1">
                  Profissionais que realizam este serviço:
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                  {professionals.map(p => {
                    const isChecked = (editingService.professional_ids || []).includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center space-x-2 p-2 rounded-lg text-xs cursor-pointer border transition ${isChecked ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let currentArr = [...(editingService.professional_ids || [])];
                            if (e.target.checked) currentArr.push(p.id);
                            else currentArr = currentArr.filter(id => id !== p.id);
                            setEditingService({ ...editingService, professional_ids: currentArr });
                          }}
                          className="accent-blue-500"
                        />
                        <span className="truncate font-semibold">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingService(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIÇÃO DE PROFISSIONAL */}
      {editingProf && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateProf} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Profissional</h3>
            <input type="text" value={editingProf.name} onChange={(e) => setEditingProf({ ...editingProf, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="Nome Completo" />
            <input type="text" value={editingProf.specialty || ''} onChange={(e) => setEditingProf({ ...editingProf, specialty: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="Especialidade (Ex: Pé e mão, Cabelos)" />
            <input type="text" value={editingProf.phone || ''} onChange={(e) => setEditingProf({ ...editingProf, phone: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="WhatsApp Individual" />
            <input type="text" value={editingProf.instagram_url || ''} onChange={(e) => setEditingProf({ ...editingProf, instagram_url: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="Instagram (Ex: @ana_designer)" />
            <input type="text" value={editingProf.pin || ''} onChange={(e) => setEditingProf({ ...editingProf, pin: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="PIN de 4 Dígitos" />
            
            <div>
              <label className="text-[10px] text-green-400 font-bold block mb-1">🤖 Mensagem Personalizada do Robô para este Profissional (Opcional):</label>
              <textarea rows={2} placeholder="Ex: Olá {cliente}! Lembrete do seu horário comigo ({profissional}) amanhã..." value={editingProf.bot_message_template || ''} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none font-mono" onChange={(e) => setEditingProf({ ...editingProf, bot_message_template: e.target.value })} />
            </div>

            <input type="text" value={editingProf.avatar_url || ''} onChange={(e) => setEditingProf({ ...editingProf, avatar_url: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="URL Avatar" />
            <input type="number" value={editingProf.commission_percentage || ''} onChange={(e) => setEditingProf({ ...editingProf, commission_percentage: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="% Comissão" />

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-2">
              <label className="text-[11px] font-bold text-purple-400 block">📅 Dias de Atendimento / Trabalho:</label>
              <div className="grid grid-cols-7 gap-1">
                {ALL_DAYS.map(day => {
                  const isSelected = (editingProf.work_days || []).includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setEditingProf({ ...editingProf, work_days: toggleDaySelection(editingProf.work_days, day.id) })}
                      className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${isSelected ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-900 text-gray-500 border-gray-800'}`}>
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex space-x-2">
              <button type="button" onClick={() => setEditingProf(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Atualizar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
