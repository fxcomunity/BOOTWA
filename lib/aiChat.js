const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config.json");

let genAI = null;
let model = null;

if (config.geminiApiKey && config.geminiApiKey !== "") {
  try {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  } catch (error) {
    console.error("❌ Error inisialisasi Gemini AI:", error.message);
  }
}

/**
 * Fungsi untuk bertanya ke Gemini AI
 * @param {string} prompt Pertanyaan dari user
 * @param {string} senderName Nama pengirim
 * @returns {Promise<string>} Jawaban AI
 */
async function askGemini(prompt, senderName) {
  if (!model) return "⚠️ Fitur AI Chatbot saat ini dinonaktifkan karena API Key Gemini belum dikonfigurasi di config.json.";
  
  try {
    // Memberikan persona (instruksi) ke AI
    const systemInstruction = `Kamu adalah 'FX Bot', asisten pintar untuk grup FX Community. Jawablah dengan gaya bahasa yang santai, asik, profesional, dan sedikit gaul layaknya seorang trader. Hindari memberikan saran investasi atau sinyal trading yang pasti (berikan disclaimer bahwa ini hanya opini atau edukasi). Selalu ramah dan suportif terhadap trader pemula.`;
    
    const fullPrompt = `${systemInstruction}\n\nPesan dari ${senderName}:\n${prompt}`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("❌ Error Gemini AI:", error?.message || error);
    return "⚠️ Maaf, AI saat ini sedang sibuk atau terjadi kesalahan sistem.";
  }
}

module.exports = { askGemini };
