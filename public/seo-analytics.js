(() => {
  function getPagePath() {
    return window.location.pathname || '/';
  }

  function getPageType(path) {
    if (path.startsWith('/updates/')) return 'product_update';
    if (path.startsWith('/articles/')) return 'seo_article';
    return 'seo_landing';
  }

  function track(name, params) {
    if (!name) return;
    if (window.shadowAnalytics && typeof window.shadowAnalytics.track === 'function') {
      window.shadowAnalytics.track(name, params);
      return;
    }

    window.__shadowAnalyticsQueue = Array.isArray(window.__shadowAnalyticsQueue)
      ? window.__shadowAnalyticsQueue
      : [];
    window.__shadowAnalyticsQueue.push({ name, params });
  }

  function getTargetPath(link) {
    const url = new URL(link.getAttribute('href'), window.location.href);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function bindSeoAnalytics() {
    const pagePath = getPagePath();
    const pageType = getPageType(pagePath);

    track('seo_page_view', {
      page_path: pagePath,
      page_type: pageType,
    });

    document.querySelectorAll('a[data-seo-analytics-id]').forEach((link) => {
      link.addEventListener('click', () => {
        track('seo_cta_click', {
          page_path: pagePath,
          cta_id: link.dataset.seoAnalyticsId,
          target_path: getTargetPath(link),
          transport_type: 'beacon',
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSeoAnalytics, { once: true });
  } else {
    bindSeoAnalytics();
  }
})();
