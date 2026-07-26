(() => {
  const canRegister = 'serviceWorker' in navigator
    && (
      location.protocol === 'https:'
      || location.hostname === 'localhost'
      || location.hostname === '127.0.0.1'
      || location.hostname === '[::1]'
    );

  function ensureNetworkBanner() {
    let banner = document.getElementById('inkheronNetworkStatus');
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = 'inkheronNetworkStatus';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    Object.assign(banner.style, {
      position: 'fixed',
      zIndex: '10000',
      left: '12px',
      right: '12px',
      bottom: '12px',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      maxWidth: '560px',
      margin: '0 auto',
      padding: '11px 14px',
      borderRadius: '10px',
      background: '#141412',
      color: '#fff',
      boxShadow: '0 10px 30px rgba(20,20,18,.18)',
      font: '700 13px/1.35 Inter, -apple-system, system-ui, sans-serif'
    });

    const message = document.createElement('span');
    message.dataset.networkMessage = 'true';
    banner.appendChild(message);

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => location.reload());
    Object.assign(retry.style, {
      minHeight: '38px',
      padding: '0 12px',
      border: '1px solid rgba(255,255,255,.45)',
      borderRadius: '8px',
      background: '#fff',
      color: '#141412',
      font: '800 13px Inter, -apple-system, system-ui, sans-serif',
      cursor: 'pointer'
    });
    banner.appendChild(retry);
    document.body.appendChild(banner);
    return banner;
  }

  function showOffline() {
    const banner = ensureNetworkBanner();
    banner.querySelector('[data-network-message]').textContent = 'You are offline. Changes cannot be saved until you reconnect.';
    banner.style.background = '#141412';
    banner.style.display = 'flex';
  }

  function showOnline() {
    const banner = document.getElementById('inkheronNetworkStatus');
    if (!banner || banner.style.display === 'none') return;
    banner.querySelector('[data-network-message]').textContent = 'Back online. Saving is available again.';
    banner.style.background = '#246343';
    const retry = banner.querySelector('button');
    if (retry) retry.style.display = 'none';
    window.setTimeout(() => {
      banner.style.display = 'none';
      if (retry) retry.style.display = '';
    }, 2400);
  }

  window.addEventListener('offline', showOffline);
  window.addEventListener('online', showOnline);
  if (!navigator.onLine) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showOffline, { once: true });
    } else {
      showOffline();
    }
  }

  if (canRegister) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => registration.update())
        .catch(() => {});
    }, { once: true });
  }
})();
