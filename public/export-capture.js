/**
 * export-capture.js
 * Pure logic module for capturing a MapLibre GL map canvas
 * and generating PNG/PDF exports.
 */

const CAPTURE_TIMEOUT_MS = 3000;
const MIN_BLOB_SIZE = 1024;
const MAX_CANVAS_DIM = 4096;
const OVERLAY_HEIGHT = 72;

/**
 * Capture the current MapLibre GL map canvas as a PNG blob.
 * Uses the render callback to grab the canvas before WebGL clears the buffer.
 * @param {import('maplibre-gl').Map} map - MapLibre GL map instance
 * @returns {Promise<Blob>} PNG image blob
 */
export function captureMapCanvas(map) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('キャプチャがタイムアウトしました'));
    }, CAPTURE_TIMEOUT_MS);

    map.once('render', () => {
      map.getCanvas().toBlob((blob) => {
        clearTimeout(timer);
        if (!blob || blob.size < MIN_BLOB_SIZE) {
          reject(new Error('地図の描画が取得できませんでした。もう一度お試しください'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });

    map.triggerRepaint();
  });
}

/**
 * Build a metadata overlay band at the bottom of the captured image.
 * @param {Blob} imageBlob - Source PNG blob
 * @param {{ date: string, time: string, location: string, shareUrl: string, disclaimer: string }} metadata
 * @returns {Promise<Blob>} PNG blob with overlay
 */
export function buildMetadataOverlay(imageBlob, metadata) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(imageBlob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        // Clamp for high-DPI / mobile memory safety
        if (width > MAX_CANVAS_DIM) {
          height = Math.round(height * (MAX_CANVAS_DIM / width));
          width = MAX_CANVAS_DIM;
        }
        if (height + OVERLAY_HEIGHT > MAX_CANVAS_DIM) {
          const scale = MAX_CANVAS_DIM / (height + OVERLAY_HEIGHT);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height + OVERLAY_HEIGHT;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Semi-transparent band
        const bandY = height;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, bandY, width, OVERLAY_HEIGHT);

        // Text
        ctx.fillStyle = 'rgba(255,255,255,0.9)';

        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(
          `日影シミュレータ  ${metadata.date} ${metadata.time}`,
          12,
          bandY + 20,
        );

        ctx.font = '11px sans-serif';
        ctx.fillText(
          `PLATEAU(国土交通省) CC BY 4.0 / ${metadata.disclaimer}`,
          12,
          bandY + 42,
        );
        ctx.fillText(metadata.shareUrl, 12, bandY + 60);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('オーバーレイ画像の生成に失敗しました'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };

    img.src = url;
  });
}

/**
 * Generate a landscape A4 PDF containing the image with metadata.
 * Requires jsPDF to be loaded globally (e.g. from CDN as UMD).
 * @param {Blob} imageBlob - Source PNG blob
 * @param {{ date: string, time: string, location: string, shareUrl: string, disclaimer: string }} metadata
 * @returns {Promise<Blob>} PDF blob
 */
export function generatePdf(imageBlob, metadata) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        if (!window.jspdf?.jsPDF) {
          reject(new Error('PDF生成ライブラリが読み込まれていません。ページを再読み込みしてください'));
          return;
        }
        const dataUrl = reader.result;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
        });

        // A4 landscape: 297 x 210 mm, 5mm margins
        doc.addImage(dataUrl, 'PNG', 5, 5, 287, 200);

        resolve(doc.output('blob'));
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('画像データの読み込みに失敗しました'));
    };

    reader.readAsDataURL(imageBlob);
  });
}

/**
 * Trigger a browser download for the given blob.
 * @param {Blob} blob - File content
 * @param {string} filename - Suggested filename
 * @returns {void}
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
