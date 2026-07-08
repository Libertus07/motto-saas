require('dotenv').config({path: '.env.local'});
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log("No API key");
        return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    
    try {
        console.log("Testing gemini-1.5-flash...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const res = await model.generateContent("Hello");
        console.log("Response:", res.response.text());
    } catch (e) {
        console.error("Error with gemini-1.5-flash:", e.message);
    }

    try {
        console.log("Testing gemini-1.5-flash-latest...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const res = await model.generateContent("Hello");
        console.log("Response:", res.response.text());
    } catch (e) {
        console.error("Error with gemini-1.5-flash-latest:", e.message);
    }
}

test();
