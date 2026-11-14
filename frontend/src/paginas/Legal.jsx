import TextoLegal from '../componentes/TextoLegal';

/** Termos e política abertos sem login: /termos e /privacidade (o cadastro aponta para cá). */
export default function Legal({ aba }) {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-xs text-texto-suave hover:text-texto">← voltar ao painel</a>
        <h1 className="font-titulo text-2xl mt-3 mb-5">Termos e privacidade</h1>
        <TextoLegal abaInicial={aba} />
      </div>
    </div>
  );
}
