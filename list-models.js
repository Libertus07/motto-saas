require('dotenv').config({ path: '.env.local' });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key found in .env.local");
    return;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Error ${res.status}: ${errorText}`);
      return;
    }
    const data = await res.json();
    console.log("Available models:");
    data.models.forEach(m => {
      console.log(`- ${m.name} (Supported methods: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

listModels();
