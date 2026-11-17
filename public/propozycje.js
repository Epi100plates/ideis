// Strona zgłoszeń (/propozycje) — osobny plik, bo CSP nie pozwala na inline
// <script>. Token moderacji czytamy z adresu; treść wstawiamy przez textContent.

(function () {
  var API = '/api/feedback';
  // Token z adresu (`/propozycje?token=…`) włącza usuwanie wpisów — sam token
  // sprawdza serwer, więc strona nie musi nic wiedzieć o koncie.
  var token = new URLSearchParams(location.search).get('token') || '';
  var listEl = document.getElementById('list');
  var statusEl = document.getElementById('status');
  var form = document.getElementById('form');
  var messageEl = document.getElementById('message');
  var kindEl = document.getElementById('kind');
  var countEl = document.getElementById('count');
  var sendEl = document.getElementById('send');
  var totalEl = document.getElementById('total');
  var refreshEl = document.getElementById('refresh');

  if (token) {
    document.getElementById('moderator').textContent = '· tryb moderacji (usuwanie włączone)';
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function stamp(iso) {
    try {
      return new Date(iso).toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return iso || ''; }
  }

  // Wszystko wstawiamy przez textContent — treść zgłoszeń jest od użytkowników,
  // więc nie może trafić do innerHTML.
  function itemNode(item) {
    var li = document.createElement('li');
    li.className = 'item';

    var meta = document.createElement('div');
    meta.className = 'meta';

    var badge = document.createElement('span');
    badge.className = 'badge ' + (item.kind === 'bug' ? 'bug' : 'idea');
    badge.textContent = item.kind === 'bug' ? 'błąd' : 'propozycja';
    meta.appendChild(badge);

    var when = document.createElement('span');
    when.textContent = stamp(item.createdAt);
    meta.appendChild(when);

    if (item.version) {
      var ver = document.createElement('span');
      ver.textContent = '· ' + item.version;
      meta.appendChild(ver);
    }
    if (item.platform) {
      var plat = document.createElement('span');
      plat.textContent = '· ' + item.platform;
      meta.appendChild(plat);
    }

    if (token) {
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = 'Usuń';
      remove.addEventListener('click', function () { removeItem(item.id, li); });
      meta.appendChild(remove);
    }

    var message = document.createElement('p');
    message.className = 'message';
    message.textContent = item.message;

    li.appendChild(meta);
    li.appendChild(message);
    return li;
  }

  function removeItem(id, node) {
    if (!confirm('Usunąć to zgłoszenie?')) return;
    fetch(API + '/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'x-feedback-token': token },
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body && res.body.error ? res.body.error : 'Nie udało się usunąć.');
        node.remove();
        load();
      })
      .catch(function (err) { alert(err.message); });
  }

  function render(items) {
    listEl.textContent = '';
    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Brak zgłoszeń. Bądź pierwszy!';
      listEl.appendChild(empty);
      return;
    }
    items.forEach(function (item) { listEl.appendChild(itemNode(item)); });
  }

  function load() {
    return fetch(API + '?limit=200', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.ok) throw new Error(body && body.error ? body.error : 'Błąd wczytywania.');
        render(body.items || []);
        totalEl.textContent = body.count ? body.count + ' szt.' : '';
      })
      .catch(function () {
        listEl.textContent = '';
        var err = document.createElement('li');
        err.className = 'empty';
        err.textContent = 'Nie udało się wczytać zgłoszeń. Odśwież stronę.';
        listEl.appendChild(err);
      });
  }

  messageEl.addEventListener('input', function () {
    countEl.textContent = messageEl.value.length + ' / 2000';
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var message = messageEl.value.trim();
    if (message.length < 3) {
      setStatus('Napisz kilka słów.', 'error');
      messageEl.focus();
      return;
    }
    sendEl.disabled = true;
    setStatus('Wysyłam…');
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: kindEl.value, message: message, platform: 'web' }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body && res.body.error ? res.body.error : 'Nie udało się wysłać.');
        messageEl.value = '';
        countEl.textContent = '0 / 2000';
        setStatus('Dziękuję! Zgłoszenie jest na liście.', 'ok');
        load();
      })
      .catch(function (err) { setStatus(err.message, 'error'); })
      .finally(function () { sendEl.disabled = false; });
  });

  refreshEl.addEventListener('click', function () { load(); });

  load();
  setInterval(load, 30000);
})();
