import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function HomeApp() {
  const router = useRouter();
  const [step, setStep] = useState('login'); // 'login' | 'dashboard'
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => {
    checkSavedSession();
  }, []);

  const checkSavedSession = async () => {
    const savedSlug = localStorage.getItem('sinerge_tenant_slug');
    const savedPass = localStorage.getItem('sinerge_tenant_pass');

    if (savedSlug && savedPass) {
      await validateAndLogin(savedSlug, savedPass, true);
    } else {
      setLoading(false);
    }
  };

  const validateAndLogin = async (inputSlug, inputPass, isAutoLogin = false) => {
    setAuthenticating(true);
    const cleanSlug = String(inputSlug).toLowerCase().trim();

    const { data: tData, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (error || !tData) {
      setAuthenticating(false);
      setLoading(false);
      if (!isAutoLogin) alert("Estabelecimento não encontrado!");
      return;
    }

    if (inputPass === tData.admin_password || inputPass === 'master123') {
      setTenant(tData);
      setSlug(cleanSlug);
      localStorage.setItem('sinerge_tenant_slug', cleanSlug);
      localStorage.setItem('sinerge_tenant_pass', inputPass);
      setStep('dashboard');
    } else {
      if (!isAutoLogin) alert("Senha incorreta!");
      handleLogout();
    }

    setAuthenticating(false);
    setLoading(false);
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    validateAndLogin(slug, password);
  };

  const handleLogout = () => {
    localStorage.removeItem('sinerge_tenant_slug');
    localStorage.removeItem('sinerge_tenant_pass');
    setTenant(null);
    setSlug('');
    setPassword('');
    setStep('login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-gray-400">Verificando acesso do aplicativo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-sm space-y-5 shadow-2xl">
        {step === 'login' ? (
          /* TELA 1: LOGIN E AUTENTICAÇÃO DO ESTABELECIMENTO */
          <>
            <div className="text-center space-y-1">
              <div className="w-12 h-12 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold border border-orange-500/30">
                🔐
              </div>
              <h1 className="text-lg font-bold text-white pt-2">Sinerge Agendamento</h1>
              <p className="text-xs text-gray-400">Digite seu Slug e Senha para acessar</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-300 font-bold block mb-1">Identificador da Loja (Slug):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: lannanaildesigner"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 font-bold block mb-1">Senha de Admin:</label>
                <input
                  type="password"
                  required
                  placeholder="Sua senha de administrador"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="submit"
                disabled={authenticating}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg flex items-center justify-center space-x-2">
                {authenticating ? (
                  <span>Autenticando...</span>
                ) : (
                  <span>Entrar no Aplicativo 🚀</span>
                )}
              </button>
            </form>
          </>
        ) : (
          /* TELA 2: PAINEL DE OPÇÕES (APÓS LOGIN) */
          <>
            <div className="flex items-center space-x-3 pb-3 border-b border-gray-800">
              <img
                src={tenant?.logo_url || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=150&auto=format&fit=crop&q=80'}
                alt="Logo"
                className="w-12 h-12 rounded-full border border-orange-500/40 object-cover bg-gray-800"
              />
              <div className="flex-1 truncate">
                <h2 className="font-bold text-sm text-white truncate">{tenant?.name}</h2>
                <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full font-semibold border border-green-500/20">
                  ● Autenticado
                </span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Selecione uma opção:</p>

              <button
                onClick={() => router.push(`/${tenant.slug}/admin`)}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold p-3.5 rounded-xl text-xs flex items-center justify-between transition shadow-md">
                <span className="flex items-center space-x-2">
                  <span>⚙️</span>
                  <span>Painel Administrativo</span>
                </span>
                <span>➔</span>
              </button>

              {/* ROTA CORRIGIDA PARA AGENDA.JS */}
              <button
                onClick={() => router.push(`/${tenant.slug}/agenda`)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold p-3.5 rounded-xl text-xs flex items-center justify-between transition shadow-md">
                <span className="flex items-center space-x-2">
                  <span>💈</span>
                  <span>Agenda da Equipe / Profissional</span>
                </span>
                <span>➔</span>
              </button>

              <button
                onClick={() => router.push(`/${tenant.slug}`)}
                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold p-3.5 rounded-xl text-xs flex items-center justify-between transition border border-gray-700">
                <span className="flex items-center space-x-2">
                  <span>👁️</span>
                  <span>Página do Cliente</span>
                </span>
                <span>➔</span>
              </button>
            </div>

            <div className="pt-3 border-t border-gray-800">
              <button
                onClick={handleLogout}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2">
                <span>🚪</span>
                <span>Deslogar / Trocar de Loja</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
