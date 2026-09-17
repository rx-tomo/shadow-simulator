import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('export-capture.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    // Mock URL.createObjectURL / revokeObjectURL
    globalThis.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    };
  });

  describe('captureMapCanvas', () => {
    it('captures canvas via render event', async () => {
      const mockBlob = new Blob(['x'.repeat(2000)], { type: 'image/png' });
      const mockCanvas = {
        toBlob: vi.fn((cb, type) => cb(mockBlob)),
      };
      const map = {
        once: vi.fn((event, cb) => cb()),
        triggerRepaint: vi.fn(),
        getCanvas: vi.fn(() => mockCanvas),
      };

      const { captureMapCanvas } = await import('../public/export-capture.js');
      const result = await captureMapCanvas(map);

      expect(map.once).toHaveBeenCalledWith('render', expect.any(Function));
      expect(map.triggerRepaint).toHaveBeenCalled();
      expect(result).toBe(mockBlob);
    });

    it('rejects on small blob (blank canvas)', async () => {
      const tinyBlob = new Blob(['x'], { type: 'image/png' }); // < 1024 bytes
      const map = {
        once: vi.fn((event, cb) => cb()),
        triggerRepaint: vi.fn(),
        getCanvas: vi.fn(() => ({
          toBlob: vi.fn((cb) => cb(tinyBlob)),
        })),
      };

      const { captureMapCanvas } = await import('../public/export-capture.js');
      await expect(captureMapCanvas(map)).rejects.toThrow('地図の描画が取得できませんでした');
    });

    it('rejects on null blob', async () => {
      const map = {
        once: vi.fn((event, cb) => cb()),
        triggerRepaint: vi.fn(),
        getCanvas: vi.fn(() => ({
          toBlob: vi.fn((cb) => cb(null)),
        })),
      };

      const { captureMapCanvas } = await import('../public/export-capture.js');
      await expect(captureMapCanvas(map)).rejects.toThrow('地図の描画が取得できませんでした');
    });

    it('rejects on timeout', async () => {
      vi.useFakeTimers();
      const map = {
        once: vi.fn(), // Never calls callback
        triggerRepaint: vi.fn(),
        getCanvas: vi.fn(),
      };

      const { captureMapCanvas } = await import('../public/export-capture.js');
      const promise = captureMapCanvas(map);

      vi.advanceTimersByTime(3100);
      await expect(promise).rejects.toThrow('タイムアウト');
      vi.useRealTimers();
    });
  });

  describe('downloadBlob', () => {
    it('creates link, clicks, and revokes URL', async () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      globalThis.document = {
        createElement: vi.fn(() => mockLink),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        getElementById: vi.fn(),
      };

      const { downloadBlob } = await import('../public/export-capture.js');
      const blob = new Blob(['test']);
      downloadBlob(blob, 'test.png');

      expect(globalThis.document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.href).toBe('blob:mock-url');
      expect(mockLink.download).toBe('test.png');
      expect(mockLink.click).toHaveBeenCalled();
      expect(globalThis.document.body.appendChild).toHaveBeenCalledWith(mockLink);
    });
  });

  describe('buildMetadataOverlay', () => {
    it('creates canvas with overlay band', async () => {
      // Mock Image with naturalWidth/naturalHeight
      const mockImg = {
        naturalWidth: 800,
        naturalHeight: 600,
        set src(val) {
          setTimeout(() => this.onload?.(), 0);
        },
        onload: null,
        onerror: null,
      };
      globalThis.Image = vi.fn(() => mockImg);

      // Mock canvas context
      const mockCtx = {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        fillStyle: '',
        font: '',
      };

      // Mock canvas element
      const mockCanvas = {
        getContext: vi.fn(() => mockCtx),
        width: 0,
        height: 0,
        toBlob: vi.fn((cb) => cb(new Blob(['overlay'], { type: 'image/png' }))),
      };
      globalThis.document = {
        createElement: vi.fn(() => mockCanvas),
        getElementById: vi.fn(),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      };

      const { buildMetadataOverlay } = await import('../public/export-capture.js');
      const blob = new Blob(['image data'], { type: 'image/png' });
      const metadata = {
        date: '2026-04-03',
        time: '15:00',
        location: '35.6810, 139.7670',
        shareUrl: 'https://example.com',
        disclaimer: '※参考値です',
      };

      const result = await buildMetadataOverlay(blob, metadata);
      expect(result).toBeInstanceOf(Blob);
      expect(mockCtx.drawImage).toHaveBeenCalled();
      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.fillText).toHaveBeenCalled();
      expect(mockCanvas.width).toBe(800);
      expect(mockCanvas.height).toBe(672); // 600 + 72 overlay
    });

    it('rejects when image fails to load', async () => {
      const mockImg = {
        naturalWidth: 0,
        naturalHeight: 0,
        set src(val) {
          setTimeout(() => this.onerror?.(), 0);
        },
        onload: null,
        onerror: null,
      };
      globalThis.Image = vi.fn(() => mockImg);

      const { buildMetadataOverlay } = await import('../public/export-capture.js');
      const blob = new Blob(['bad'], { type: 'image/png' });
      const metadata = {
        date: '2026-04-03',
        time: '15:00',
        location: '0,0',
        shareUrl: 'https://example.com',
        disclaimer: '※参考値です',
      };

      await expect(buildMetadataOverlay(blob, metadata)).rejects.toThrow('画像の読み込みに失敗しました');
    });

    it('rejects when toBlob returns null', async () => {
      const mockImg = {
        naturalWidth: 800,
        naturalHeight: 600,
        set src(val) {
          setTimeout(() => this.onload?.(), 0);
        },
        onload: null,
        onerror: null,
      };
      globalThis.Image = vi.fn(() => mockImg);

      const mockCtx = {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        fillStyle: '',
        font: '',
      };
      const mockCanvas = {
        getContext: vi.fn(() => mockCtx),
        width: 0,
        height: 0,
        toBlob: vi.fn((cb) => cb(null)),
      };
      globalThis.document = {
        createElement: vi.fn(() => mockCanvas),
        getElementById: vi.fn(),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
      };

      const { buildMetadataOverlay } = await import('../public/export-capture.js');
      const blob = new Blob(['data'], { type: 'image/png' });
      const metadata = {
        date: '2026-04-03',
        time: '15:00',
        location: '0,0',
        shareUrl: 'https://example.com',
        disclaimer: '※参考値です',
      };

      await expect(buildMetadataOverlay(blob, metadata)).rejects.toThrow('オーバーレイ画像の生成に失敗しました');
    });
  });

  describe('generatePdf', () => {
    it('generates a PDF blob via jsPDF', async () => {
      const mockPdfBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      const mockDoc = {
        addImage: vi.fn(),
        output: vi.fn(() => mockPdfBlob),
      };
      globalThis.window = globalThis.window || globalThis;
      globalThis.window.jspdf = {
        jsPDF: vi.fn(() => mockDoc),
      };

      // Mock FileReader
      const mockReader = {
        onload: null,
        onerror: null,
        result: 'data:image/png;base64,abc123',
        readAsDataURL: vi.fn(function () {
          setTimeout(() => this.onload?.(), 0);
        }),
      };
      globalThis.FileReader = vi.fn(() => mockReader);

      const { generatePdf } = await import('../public/export-capture.js');
      const blob = new Blob(['image'], { type: 'image/png' });
      const metadata = {
        date: '2026-04-03',
        time: '15:00',
        location: '0,0',
        shareUrl: 'https://example.com',
        disclaimer: '※参考値です',
      };

      const result = await generatePdf(blob, metadata);
      expect(result).toBe(mockPdfBlob);
      expect(mockDoc.addImage).toHaveBeenCalledWith(
        'data:image/png;base64,abc123',
        'PNG',
        5, 5, 287, 200,
      );
      expect(mockDoc.output).toHaveBeenCalledWith('blob');
    });

    it('rejects when FileReader fails', async () => {
      globalThis.window = globalThis.window || globalThis;
      globalThis.window.jspdf = { jsPDF: vi.fn() };

      const mockReader = {
        onload: null,
        onerror: null,
        result: null,
        readAsDataURL: vi.fn(function () {
          setTimeout(() => this.onerror?.(), 0);
        }),
      };
      globalThis.FileReader = vi.fn(() => mockReader);

      const { generatePdf } = await import('../public/export-capture.js');
      const blob = new Blob(['bad'], { type: 'image/png' });
      const metadata = {
        date: '2026-04-03',
        time: '15:00',
        location: '0,0',
        shareUrl: 'https://example.com',
        disclaimer: '※参考値です',
      };

      await expect(generatePdf(blob, metadata)).rejects.toThrow('画像データの読み込みに失敗しました');
    });
  });
});
