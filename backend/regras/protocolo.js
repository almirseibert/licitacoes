// Protocolo legível dos pedidos e solicitações: PREFIXO-ANO-000123. O ano é o da
// abertura e o número é o id (nunca repete). Suporte (SOL) e serviços (SRV) usam o mesmo.
function protocolo(prefixo, id, criadoEm) {
  const ano = new Date(criadoEm || Date.now()).getFullYear();
  return `${prefixo}-${ano}-${String(id).padStart(6, '0')}`;
}

module.exports = { protocolo };
