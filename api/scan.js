export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64 } = req.body;
  
  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  
  if (!API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
  }

  // Strip data URL prefix if present
  let base64Data = imageBase64;
  let mimeType = 'image/jpeg'; // default
  
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  }

  try {
    const prompt = "Eres un lector de comprobantes bancarios. Extrae SOLO el monto total o monto transferido de esta imagen. Devuélvelo como un número decimal usando el punto como separador de decimales (ejemplo: 10.50, 1500.00). NO devuelvas ningún otro texto, ni la moneda, ni letras. Si no encuentras ningún monto, devuelve la palabra 'null'.";

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errText = await response.text();
      let availableModels = 'Could not fetch models';
      
      if (response.status === 404) {
        try {
          const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
          const modelsData = await modelsRes.json();
          availableModels = modelsData.models ? modelsData.models.map(m => m.name).join(', ') : 'No models list found';
        } catch (e) {
          availableModels = e.toString();
        }
      }
      
      console.error('Gemini API Error:', errText, 'Available models:', availableModels);
      return res.status(500).json({ error: 'Error calling Gemini API', details: errText, availableModels });
    }

    const data = await response.json();
    
    // Parse response
    let amountText = 'null';
    if (data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content.parts;
      if (parts && parts.length > 0) {
        amountText = parts[0].text.trim();
      }
    }

    if (amountText === 'null' || amountText === '') {
      return res.status(200).json({ amount: null });
    }

    // Clean up just in case Gemini returns something like "Bs 10,50" despite instructions
    amountText = amountText.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const amount = parseFloat(amountText);

    if (isNaN(amount)) {
      return res.status(200).json({ amount: null });
    }

    return res.status(200).json({ amount: amount });

  } catch (error) {
    console.error('Scan Error:', error);
    return res.status(500).json({ error: 'Internal server error during scanning' });
  }
}
