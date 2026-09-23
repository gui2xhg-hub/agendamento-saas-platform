import React, { useState, useEffect } from 'react';

export default function PwaBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // 1. Verifica se já está rodando como App instalado (standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    // 2. Detecta se é iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(iosDevice);

    if (iosDevice) {
      // Exibe para iOS se não estiver instalado
      setShowBanner(true);
    } else {
      // 3. Para Android / Chrome Desktop, escuta o evento de instalação
      const handleBeforeInstall = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowBanner(true);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-gray-900 border border-orange-500/40 text-white p-4 rounded-2xl shadow-2xl flex flex-col space-y-3 font-sans">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <img src="/icon-192.png" alt="App Icon" className="w-10 h-10 rounded-xl border border-gray-700" />
          <div>
            <h4 className="font-bold text-xs text-orange-400">Instalar Aplicativo</h4>
            <p className="text-[11px] text-gray-300">Instale para acessar mais rápido e agendar seus horários!</p>
          </div>
        </div>
        <button 
          onClick={() => setShowBanner(false)} 
          className="text-gray-400 hover:text-white text-xs p-1">
          ✕
        </button>
      </div>

      {isIos ? (
        /* Instrução específica para iOS */
        <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-[11px] text-gray-300 leading-relaxed">
          📱 <b>No iPhone:</b> Toque no botão <b>Compartilhar <span className="text-orange-400">📤</span></b> do Safari e selecione <b>"Adicionar à Tela de Início"</b>.
        </div>
      ) : (
        /* Botão direto para Android / Windows */
        <button
          onClick={handleInstallClick}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-lg">
          📲 Instalar Agora
        </button>
      )}
    </div>
  );
}
