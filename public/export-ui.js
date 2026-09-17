// public/export-ui.js — PDF/PNG export UI integration

import { captureMapCanvas, buildMetadataOverlay, generatePdf, downloadBlob } from './export-capture.js';
import { el } from './state.js';
import { updateUrlFromState } from './url-params.js';

function gatherMetadata(map) {
  const date = el('dateInput')?.value || '';
  const time = el('timeInput')?.value || '';
  const center = map.getCenter();
  const location = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  updateUrlFromState(map);
  const shareUrl = globalThis.location?.href || '';
  const disclaimer = '\u203B\u53C2\u8003\u5024\u3067\u3059\u3002\u5B9F\u969B\u306E\u65E5\u5F71\u3068\u306F\u7570\u306A\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059';
  return { date, time, location, shareUrl, disclaimer };
}

export function bindExportButtons(map) {
  const pngBtn = el('exportPngButton');
  const pdfBtn = el('exportPdfButton');
  if (!pngBtn || !pdfBtn) return;
  globalThis.__shadowExportAvailable = Boolean(map);
  if (!map) return;

  pngBtn.addEventListener('click', async () => {
    pngBtn.disabled = true;
    pngBtn.textContent = '\u4FDD\u5B58\u4E2D...';
    try {
      const metadata = gatherMetadata(map);
      const canvasBlob = await captureMapCanvas(map);
      const overlayBlob = await buildMetadataOverlay(canvasBlob, metadata);
      const filename = `shadow-sim-${metadata.date}-${metadata.time}.png`;
      downloadBlob(overlayBlob, filename);
      window.shadowAnalytics?.track('export_png', { format: 'png' });
    } catch (err) {
      console.warn('[export-ui] PNG export failed:', err);
      alert(err.message);
    } finally {
      pngBtn.textContent = '\uD83D\uDCF7';
      pngBtn.disabled = false;
    }
  });

  pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true;
    pdfBtn.textContent = '\u4FDD\u5B58\u4E2D...';
    try {
      const metadata = gatherMetadata(map);
      const canvasBlob = await captureMapCanvas(map);
      const overlayBlob = await buildMetadataOverlay(canvasBlob, metadata);
      const pdfBlob = await generatePdf(overlayBlob, metadata);
      const filename = `shadow-sim-${metadata.date}-${metadata.time}.pdf`;
      downloadBlob(pdfBlob, filename);
      window.shadowAnalytics?.track('export_pdf', { format: 'pdf' });
    } catch (err) {
      console.warn('[export-ui] PDF export failed:', err);
      alert(err.message);
    } finally {
      pdfBtn.textContent = 'PDF';
      pdfBtn.disabled = false;
    }
  });
}
