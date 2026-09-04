import React from 'react';

export default function HomeAgendamento() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4 font-sans text-center">
      <div className="bg-gray-900 p-8 rounded-3xl border border-purple-500/30 max-w-sm w-full space-y-3 shadow-2xl">
        <span className="text-5xl block mb-2">📅</span>
        <h1 className="text-xl font-bold text-purple-400">Plataforma de Agendamento</h1>
        <p className="text-xs text-gray-400">
          Acesse a URL do seu estabelecimento para realizar ou gerenciar agendamentos (ex: <code className="text-purple-300">/sua-loja</code>).
        </p>
      </div>
    </div>
  );
}
