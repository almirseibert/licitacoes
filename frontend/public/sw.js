// Service worker do Painel de Licitações — só o push do navegador (Seção 9).
// Não faz cache de nada: o painel é dado vivo, e cache aqui viraria tela velha.
self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : '' };
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || 'Painel de Licitações', {
      body: dados.corpo || '',
      tag: 'licitacoes-aviso',
      renotify: true,
      data: { url: dados.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = (evento.notification.data && evento.notification.data.url) || '/';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) if ('focus' in j) return j.focus();
      return self.clients.openWindow(url);
    })
  );
});
