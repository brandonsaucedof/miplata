/* ============================================
   MiPlata — OCR Module (Gemini AI Vision)
   ============================================ */

const MiPlataOCR = (() => {

  /* ── Process image via Serverless API (Gemini) ── */
  async function processImage(file, onProgress) {
    try {
      if (onProgress) onProgress('Subiendo imagen...', 0.3);

      const base64 = await createPreview(file);

      if (onProgress) onProgress('Analizando con IA...', 0.6);

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 })
      });

      if (!response.ok) {
        throw new Error('Error en la API');
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

  /* ── Create data-URL preview (shown to user and sent to API) ── */
  function createPreview(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function terminate() {
    // No longer needed for Gemini API, kept for compatibility
  }

  return { processImage, createPreview, terminate };
})();