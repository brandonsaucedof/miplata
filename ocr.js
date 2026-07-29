/* ============================================
   MiPlata — OCR Module (Tesseract.js v5)
   ============================================ */

const MiPlataOCR = (() => {
  let worker = null;
  let isLoaded = false;

  /* ── Load Tesseract worker lazily ── */
  async function loadWorker(onProgress) {
    if (isLoaded && worker) return worker;

    if (onProgress) onProgress('Cargando motor OCR...', 0.05);

    if (!window.Tesseract) {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    worker = await Tesseract.createWorker(['spa', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          const pct = Math.round(m.progress * 100);
          onProgress(`Analizando imagen... ${pct}%`, 0.2 + m.progress * 0.7);
        }
      }
    });

    // NO char whitelist — it hurts more than helps on mixed receipts
    // Only keep preserve_interword_spaces
    await worker.setParameters({
      preserve_interword_spaces: '1'
    });

    isLoaded = true;
    return worker;
  }

  /* ── Helper: load external script ── */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }

  /* ── Pre-process: grayscale + mild contrast (NO hard binarization) ──
     Binarization destroys Yape receipts because of the watermark pattern.
     Grayscale + moderate contrast is what works best for Tesseract.       */
  async function preprocessImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const MAX_SIZE = 2000;
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w > MAX_SIZE || h > MAX_SIZE) {
          const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);

        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        for (let i = 0; i < d.length; i += 4) {
          // Luminance-weighted grayscale
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

          // Mild contrast boost (factor 1.6 — not aggressive)
          let c = 1.6 * (gray - 128) + 128;
          c = Math.max(0, Math.min(255, c));

          d[i] = d[i + 1] = d[i + 2] = c;
          // alpha untouched
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => resolve(blob || file), 'image/png');
      };

      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* ── Run Tesseract on a given blob/file ── */
  async function runOCR(source, onProgress) {
    const w = await loadWorker(onProgress);
    const { data } = await w.recognize(source);
    return data;
  }

  /* ── Process: try preprocessed first, fall back to original ── */
  async function processImage(file, onProgress) {
    if (onProgress) onProgress('Preparando imagen...', 0.08);

    const processed = await preprocessImage(file);

    if (onProgress) onProgress('Leyendo texto...', 0.15);

    let data = await runOCR(processed, onProgress);
    let rawText = data.text || '';

    // If processed image gave poor confidence or no amounts, try original too
    let amounts = extractAmounts(rawText);
    console.log('[OCR] Preprocessed text:', rawText);
    console.log('[OCR] Preprocessed confidence:', data.confidence);
    console.log('[OCR] Preprocessed amounts:', amounts);

    if (amounts.length === 0 || data.confidence < 40) {
      if (onProgress) onProgress('Reintentando con imagen original...', 0.85);
      console.log('[OCR] Trying original image as fallback...');
      const dataOrig = await runOCR(file, onProgress);
      const origText = dataOrig.text || '';
      const origAmounts = extractAmounts(origText);
      console.log('[OCR] Original text:', origText);
      console.log('[OCR] Original amounts:', origAmounts);

      // Keep whichever gave more / better amounts
      if (origAmounts.length > amounts.length) {
        rawText = origText;
        amounts = origAmounts;
        data = dataOrig;
      }
    }

    if (onProgress) onProgress('Listo', 1);

    return {
      rawText,
      amounts,
      bestAmount: amounts.length > 0 ? amounts[0] : null,
      confidence: data.confidence
    };
  }

  /* ── Extract monetary amounts from OCR text ── */
  function extractAmounts(text) {
    if (!text) return [];

    // ── Normalize common OCR errors ──
    let t = text
      .replace(/\r\n/g, '\n')
      .replace(/\bBs\s*\.\s*/g, 'Bs ')   // "Bs . 10" → "Bs 10"
      .replace(/\bbs\s*\.\s*/g, 'Bs ')
      .replace(/[|¡]/g, '')
      .replace(/\s{2,}/g, ' ');

    console.log('[OCR] Normalized:', t);

    const found = new Map(); // value → true (deduplicate)

    // ─── Pattern set — decimals OPTIONAL ───────────────────────────────
    const patterns = [
      // #1 HIGH: "Bs 10", "Bs10", "Bs. 100", "Bs 1,500.50"
      /Bs\.?\s*(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/gi,

      // #2 HIGH: "10 Bs", "100.50Bs", "150BOB"
      /(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:Bs\.?|BOB)/gi,

      // #3 MED: Yape-style keywords (crédito, enviaste, recargaste…)
      /(?:cr[eé]dito|recargaste|enviaste|recibiste|pagaste|monto|total|importe|subtotal)[^0-9\n]{0,40}(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/gi,

      // #4 MED: generic label + amount
      /(?:valor|precio|costo|saldo|cobr\w+|pag\w+)[^0-9\n]{0,30}(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/gi,

      // #5 LOW: standalone decimals only (too risky without currency marker)
      /\b(\d{1,4}[.,]\d{2})\b/g
    ];

    for (const re of patterns) {
      let m;
      while ((m = re.exec(t)) !== null) {
        const raw = m[1];
        if (!raw) continue;

        // Skip obvious non-amounts
        if (/^\d{7,}$/.test(raw)) continue;           // phone / tx IDs
        if (/^\d{8,}$/.test(raw)) continue;
        if (/^\d{4}$/.test(raw) && +raw >= 1990 && +raw <= 2100) continue; // years

        const value = normalize(raw);
        if (value !== null && !found.has(value)) {
          found.set(value, true);
        }
      }
    }

    return [...found.keys()].sort((a, b) => b - a);
  }

  /* ── Normalize a raw matched string to a float ── */
  function normalize(raw) {
    let n = raw;

    if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw)) {
      n = raw.replace(/\./g, '').replace(',', '.');        // 1.234,56 → 1234.56
    } else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(raw)) {
      n = raw.replace(/,/g, '');                           // 1,234.56 → 1234.56
    } else if (/^\d{1,3}\.\d{3}$/.test(raw)) {
      n = raw.replace('.', '');                            // 1.500 → 1500 (Bolivia)
    } else if (/^\d+,\d{1,2}$/.test(raw)) {
      n = raw.replace(',', '.');                           // 10,50 → 10.50
    }
    // "10", "100", "10.50" → already fine

    const v = parseFloat(n);
    return (!isNaN(v) && v > 0 && v < 1000000) ? v : null;
  }

  /* ── Create data-URL preview (shown to user, NOT sent to Tesseract) ── */
  function createPreview(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  async function terminate() {
    if (worker) { await worker.terminate(); worker = null; isLoaded = false; }
  }

  return { processImage, preprocessImage, createPreview, extractAmounts, terminate };
})();
