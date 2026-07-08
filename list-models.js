require('dotenv').config({path: '.env.local'});
const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    console.log("Available models:");
    if (data.models) {
        data.models.forEach(m => {
            console.log(m.name, m.supportedGenerationMethods);
        });
    } else {
        console.log(data);
    }
}

listModels();
