/* ============================================
   MiPlata — OCR Module (Gemini AI Vision)
   ============================================ */

const MiPlataOCR = (() => {

  /* ── Process image via Serverless API (Gemini) ── */
  async function processImage(file, onProgress) {
    try {
      if (onProgress) onProgress('Preparando imagen...', 0.2);

      const base64 = await resizeAndCompressImage(file);

      if (onProgress) onProgress('Analizando con IA...', 0.5);

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API responded with error:', response.status, errorData);
        throw new Error(`Error en la API: ${response.status} - ${errorData.details || errorData.error || ''}`);
      }

      const data = await response.json();
      
      if (onProgress) onProgress('Listo', 1);

      return {
        rawText: '',
        amounts: data.amount ? [data.amount] : [],
        bestAmount: data.amount || 0,
        confidence: data.amount ? 100 : 0
      };
    } catch (err) {
      console.error('[OCR] Error usando IA:', err);
      if (onProgress) onProgress('Error de IA, ingreso manual', 1);
      
      // Fallback: Si falla o hay límite, devuelve 0 para que el usuario ponga el monto manual.
      return {
        rawText: '',
        amounts: [],
        bestAmount: 0,
        confidence: 0
      };
    }
  }

  /* ── Resize and compress image to avoid Payload Too Large errors ── */
  function resizeAndCompressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const MAX_SIZE = 1200; // Gemini is smart enough, 1200px is plenty
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
        
        // Convert to highly compressed JPEG to ensure < 4MB payload
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(base64);
      };

      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = url;
    });
  }

  /* ── Create data-URL preview (only used for displaying to user) ── */
  function createPreview(file) {
    return resizeAndCompressImage(file);
  }

  async function terminate() {
    // No longer needed for Gemini API, kept for compatibility
  }

  return { processImage, createPreview, terminate };
})();