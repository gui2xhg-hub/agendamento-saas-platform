import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function AgendaTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProfFilter, setSelectedProfFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (tenant?.id) fetchAppointments();
  }, [tenant?.id, selectedDate, selectedProfFilter]);

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

  const fetchAppointments = async () => {
    let query = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', selectedDate)
      .order('start_time', { ascending: true });

    if (selectedProfFilter !== 'ALL') {
      query = query.eq('professional_id', selectedProfFilter);
    }

    const { data } = await query;
    if (data) setAppointments(data);
  };

  const updateStatus = async (appId, newStatus) => {
    await supabase.from('appointments').update({ status: newStatus }).eq('id', appId);
    fetchAppointments();
  };

  const togglePayment = async (appId, currentPaid) => {
    await supabase.from('appointments').update({ is_paid: !currentPaid }).eq('id', appId);
    fetchAppointments();
  };

  if (loading) return <div className="p-4 text-white text-center font-sans">Carregando Agenda...</div>;
  if (!tenant) return <div className="p-4 text-white text-center font-sans">Estabelecimento não encontrado.</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 font-sans max-w-6xl mx-auto pb-12">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6">
        <div>
          <h1 className="font-bold text-xl text-orange-500">📅 Agenda do Dia — {tenant.name}</h1>
          <p className="text-xs text-gray-400">Painel de Atendimentos da Equipe</p>
        </div>
        <button onClick={fetchAppointments} className="bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl text-xs font-bold transition">
          🔄 Atualizar
        </button>
      </header>

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

        <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto pb-1">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {appointments.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500 text-sm">
            Nenhum agendamento para esta data.
          </div>
        ) : (
          appointments.map(app => {
            const prof = professionals.find(p => p.id === app.professional_id);
            const servicesList = Array.isArray(app.services_json) ? app.services_json : [];

            return (
              <div key={app.id} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl space-y-3 shadow-lg">
                <div className="flex justify-between items-start border-b border-gray-800 pb-2">
                  <div>
                    <span className="text-xs font-bold text-orange-400">⏰ {app.start_time} - {app.end_time}</span>
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

                <div className="flex space-x-1 pt-1 text-[10px] font-bold">
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
                  <button onClick={() => updateStatus(app.id, 'cancelado')} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1.5 rounded-lg border border-red-500/30">
                    ❌ Cancelar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
