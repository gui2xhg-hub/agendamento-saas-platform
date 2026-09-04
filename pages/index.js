import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function HomeApp() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [mode, setMode] = useState('admin'); // 'admin', 'equipe' ou 'cliente'

  useEffect(() => {
    // Se o lojista já salvou o slug no celular antes, redireciona direto!
    const savedSlug = localStorage.getItem('sinerge_tenant_slug');
    const savedMode = localStorage.getItem('sinerge_tenant_mode') || 'admin';
    if (savedSlug) {
      redirectToPanel(savedSlug, savedMode);
    }
  }, []);

  const redirectToPanel = (targetSlug, targetMode) => {
    const cleanSlug = targetSlug.toLowerCase().trim();
    if (targetMode === 'admin') router.push(`/${cleanSlug}/admin`);
    else if (targetMode === 'equipe') router.push(`/${cleanSlug}/equipe`);
    else router.push(`/${cleanSlug}`);
  };

  const handleAccess = (e) => {
    e.preventDefault();
    if (!slug.trim()) return alert("Digite o identificador (slug) do estabelecimento!");
    
    const cleanSlug = slug.toLowerCase().trim();
    localStorage.setItem('sinerge_tenant_slug', cleanSlug);
    localStorage.setItem('sinerge_tenant_mode', mode);
    
    redirectToPanel(cleanSlug, mode);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-sm space-y-5 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold border border-orange-500/30">
            📅
          </div>
          <h1 className="text-lg font-bold text-white pt-2">Sinerge Agendamento</h1>
          <p className="text-xs text-gray-400">Acesse o painel do seu estabelecimento</p>
        </div>

        <form onSubmit={handleAccess} className="space-y-4">
          <div>
            <label className="text-xs text-gray-300 font-bold block mb-1">Identificador da Loja (Slug):</label>
            <input
              type="text"
              required
              placeholder="Ex: lannanaildesigner ou riqueteste"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-300 font-bold block mb-1">Área de Acesso:</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none">
              <option value="admin">Painel Administrativo (Gestão)</option>
              <option value="equipe">Agenda da Equipe / Profissional</option>
              <option value="cliente">Página de Agendamento (Cliente)</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg">
            Acessar Meu Painel 🚀
          </button>
        </form>

        <p className="text-[10px] text-gray-500 text-center">
          O aplicativo salvará sua loja para acesso automático nos próximos acessos.
        </p>
      </div>
    </div>
  );
}
