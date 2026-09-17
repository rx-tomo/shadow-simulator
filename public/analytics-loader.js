(() => {
  const testConfig = window.__shadowAnalyticsTestConfig || null;
  const queuedEvents = Array.isArray(window.__shadowAnalyticsQueue)
    ? window.__shadowAnalyticsQueue
    : [];
  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const forceEnable = Boolean(testConfig?.forceEnable);
  const measurementId = testConfig?.measurementId || '__GA_MEASUREMENT_ID__';
  const placeholderMeasurementId = 'GA_MEASUREMENT_ID_PLACEHOLDER';
  const isEnabled = !isLocalhost || forceEnable;
  const hasValidMeasurementId = Boolean(measurementId) && measurementId !== placeholderMeasurementId;

  function recordTestEvent(name, params) {
    if (!testConfig || !Array.isArray(window.__shadowAnalyticsEvents)) return;
    window.__shadowAnalyticsEvents.push({ name, params });
  }

  function getCommonParams() {
    const search = new URLSearchParams(window.location.search);
    return {
      page_path: window.location.pathname || '/',
      source: search.get('utm_source') || '(none)',
      source_medium: search.get('utm_medium') || '(none)',
      source_campaign: search.get('utm_campaign') || '(none)',
      source_content: search.get('utm_content') || '(none)',
    };
  }

  function enrichParams(params) {
    return Object.assign(getCommonParams(), params || {});
  }

  function bindInquiryTracking() {
    if (window.__shadowInquiryTrackingBound) return;
    window.__shadowInquiryTrackingBound = true;
    document.addEventListener('click', (event) => {
      const link = event.target?.closest?.('a[data-inquiry-channel]');
      if (!link) return;
      let destinationHost = '(invalid)';
      try {
        destinationHost = new URL(link.href, window.location.href).hostname;
      } catch {
        // Keep a non-identifying invalid marker. Never send the raw destination.
      }
      window.shadowAnalytics?.track?.('inquiry_outbound_click', {
        channel: link.dataset.inquiryChannel || 'unknown',
        link_location: link.dataset.inquiryLocation || link.id || 'unknown',
        destination_host: destinationHost,
        transport_type: 'beacon',
      });
    });
  }

  window.__shadowAnalyticsQueue = queuedEvents;

  window.shadowAnalytics = {
    isEnabled: isEnabled && hasValidMeasurementId,
    track(name, params = {}) {
      if (!name) return;
      queuedEvents.push({ name, params: enrichParams(params) });
    },
  };

  bindInquiryTracking();

  if (!isEnabled || !hasValidMeasurementId) return;

  const gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(gtagScript);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  gtag('js', new Date());
  gtag('config', measurementId);

  window.shadowAnalytics = {
    isEnabled: true,
    track(name, params = {}) {
      if (!name) return;
      const enriched = enrichParams(params);
      gtag('event', name, enriched);
      recordTestEvent(name, enriched);
    },
  };

  while (queuedEvents.length > 0) {
    const event = queuedEvents.shift();
    if (!event || !event.name) continue;
    window.shadowAnalytics.track(event.name, event.params || {});
  }
})();
