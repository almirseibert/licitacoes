import { useEffect, useState } from 'react';
import { restante } from '../servicos/formato';

/** Contagem regressiva em mono, destacada quando faltar menos de 24 h (seção 15). */
export default function Contagem({ fim, className = '' }) {
  const [info, setInfo] = useState(() => restante(fim));

  useEffect(() => {
    setInfo(restante(fim));
    const relogio = setInterval(() => setInfo(restante(fim)), 60000);
    return () => clearInterval(relogio);
  }, [fim]);

  const cor = info.encerrado
    ? 'text-texto-suave/60'
    : info.critico
      ? 'text-erro'
      : info.horas !== null && info.horas < 72
        ? 'text-atencao'
        : 'text-texto';

  return <span className={`font-mono text-xs ${cor} ${className}`}>{info.texto}</span>;
}
