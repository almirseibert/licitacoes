// Os quatro kits do seed (seção 17.3), para o perfil ME.
//
// O item guarda o **código** do catálogo, não o id do documento: assim, quando
// você sobe uma certidão nova no cofre, o kit passa a usar a versão nova sem
// precisar ser reconfigurado. O `documento_id` da tabela existe para quando
// você quiser fixar uma peça específica.
//
// `so_se_exigido` é o que evita mandar papel à toa: o item só entra no envio
// quando o edital daquela licitação pede aquele código.
module.exports = [
  {
    nome: 'Kit padrão ME',
    descricao: 'Habilitação jurídica, regularidade fiscal e as declarações de praxe.',
    padrao: 1,
    itens: [
      { codigo: 'ato_constitutivo', obrigatorio: 1 },
      { codigo: 'cnpj', obrigatorio: 1 },
      { codigo: 'federal', obrigatorio: 1 },
      { codigo: 'estadual', obrigatorio: 1 },
      { codigo: 'municipal', obrigatorio: 1 },
      { codigo: 'fgts', obrigatorio: 1 },
      { codigo: 'cndt', obrigatorio: 1 },
      { codigo: 'falencia', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'simples', obrigatorio: 0 },
      // Declarações: o gerador é a Fase 5.1. Até lá, entram como peça do cofre
      // se você subir o PDF assinado.
      { codigo: 'menor', obrigatorio: 1 },
      { codigo: 'pcd', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'degradante', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'proposta_indep', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'vinculo_servidor', obrigatorio: 0, so_se_exigido: 1 },
    ],
  },
  {
    nome: 'Kit pregão com qualificação econômica',
    descricao: 'O padrão mais balanço, índices contábeis e o comprovante do Simples.',
    itens: [
      { codigo: 'ato_constitutivo', obrigatorio: 1 },
      { codigo: 'cnpj', obrigatorio: 1 },
      { codigo: 'federal', obrigatorio: 1 },
      { codigo: 'estadual', obrigatorio: 1 },
      { codigo: 'municipal', obrigatorio: 1 },
      { codigo: 'fgts', obrigatorio: 1 },
      { codigo: 'cndt', obrigatorio: 1 },
      { codigo: 'falencia', obrigatorio: 1 },
      // Lei 14.133, art. 65, §1º: no primeiro exercício, o balanço de abertura
      // substitui as demonstrações contábeis — o checklist mostra a base legal.
      { codigo: 'balanco', obrigatorio: 1 },
      { codigo: 'indices', obrigatorio: 1 },
      { codigo: 'simples', obrigatorio: 1 },
      { codigo: 'menor', obrigatorio: 1 },
      { codigo: 'pcd', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'degradante', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'proposta_indep', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'vinculo_servidor', obrigatorio: 0, so_se_exigido: 1 },
    ],
  },
  {
    nome: 'Kit dispensa eletrônica',
    descricao: 'Versão enxuta, para dispensa de pequeno valor.',
    itens: [
      { codigo: 'ato_constitutivo', obrigatorio: 1 },
      { codigo: 'cnpj', obrigatorio: 1 },
      { codigo: 'federal', obrigatorio: 1 },
      { codigo: 'fgts', obrigatorio: 1 },
      { codigo: 'cndt', obrigatorio: 1 },
      { codigo: 'menor', obrigatorio: 1 },
      { codigo: 'estadual', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'municipal', obrigatorio: 0, so_se_exigido: 1 },
    ],
  },
  {
    nome: 'Kit com qualificação técnica',
    descricao: 'O padrão mais atestados e catálogo técnico.',
    itens: [
      { codigo: 'ato_constitutivo', obrigatorio: 1 },
      { codigo: 'cnpj', obrigatorio: 1 },
      { codigo: 'federal', obrigatorio: 1 },
      { codigo: 'estadual', obrigatorio: 1 },
      { codigo: 'municipal', obrigatorio: 1 },
      { codigo: 'fgts', obrigatorio: 1 },
      { codigo: 'cndt', obrigatorio: 1 },
      { codigo: 'atestado', obrigatorio: 1 },
      { codigo: 'catalogo', obrigatorio: 0 },
      { codigo: 'fabricante', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'anatel', obrigatorio: 0, so_se_exigido: 1 },
      { codigo: 'menor', obrigatorio: 1 },
      { codigo: 'proposta_indep', obrigatorio: 0, so_se_exigido: 1 },
    ],
  },
];
