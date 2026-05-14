const chalk = require('chalk');
const config = require('../../config.js');
const { GoogleGenAI } = require('@google/genai');

const googleAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const debugLog = {
  ai: (msg) => config?.debug?.ai && console.log(chalk.blue(`[AI] ${msg}`))
};

class AIManager {
  static async callCerebras(prompt, maxTokens = 200) {
    const model = config?.ai?.cerebrasModel || "llama3.1-8b";
    
    if (!process.env.CEREBRAS_API_KEY) {
      throw new Error('CEREBRAS_API_KEY not found in environment');
    }
    
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: maxTokens,
        temperature: 0.9, // Higher = more creative/varied
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cerebras API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from Cerebras API');
    }
    
    return data.choices[0].message.content;
  }

  static async callMistral(prompt, maxTokens = 200) {
    const model = config?.ai?.mistralModel || "mistral-small-latest";
    
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY not found in environment');
    }
    
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.9,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mistral API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from Mistral API');
    }
    
    return data.choices[0].message.content;
  }

  static async generateWithProvider(prompt, maxTokens = 200) {
    const provider = config?.ai?.provider || "google";
    debugLog.ai(`🤖 Using provider: ${provider}`);
    
    if (provider === "cerebras") {
      try {
        debugLog.ai(`Using Cerebras: llama3.1-8b`);
        const text = await this.callCerebras(prompt, maxTokens);
        debugLog.ai(`✅ Success with Cerebras`);
        return text.trim();
      } catch (e) {
        debugLog.ai(`⚠️ Cerebras failed: ${e.message}`);
        return null;
      }
    } else if (provider === "mistral") {
      try {
        const model = config?.ai?.mistralModel || "mistral-small-latest";
        debugLog.ai(`Using Mistral: ${model}`);
        const text = await this.callMistral(prompt, maxTokens);
        debugLog.ai(`✅ Success with Mistral`);
        return text.trim();
      } catch (e) {
        debugLog.ai(`⚠️ Mistral failed: ${e.message}`);
        return null;
      }
    } else if (provider === "mix") {
      const googleModels = config?.ai?.googleModels || ["gemini-2.0-flash-exp"];
      
      for (const model of googleModels) {
        try {
          debugLog.ai(`Trying Google: ${model}`);
          const result = await googleAI.models.generateContent({ model, contents: prompt });
          if (result?.text) {
            debugLog.ai(`✅ Success with Google ${model}`);
            return result.text.trim();
          }
        } catch (e) {
          const isRateLimit = e.message?.includes('429') || e.message?.includes('quota');
          if (isRateLimit) {
            debugLog.ai(`⚠️ Google ${model} rate limited`);
            continue;
          }
        }
      }
      
      try {
        debugLog.ai(`Fallback to Cerebras: llama3.1-8b`);
        const text = await this.callCerebras(prompt, maxTokens);
        debugLog.ai(`✅ Success with Cerebras`);
        return text.trim();
      } catch (e) {
        debugLog.ai(`⚠️ Cerebras failed: ${e.message}`);
      }
    } else {
      const models = config?.ai?.googleModels || ["gemini-2.0-flash-exp"];
      for (const model of models) {
        try {
          debugLog.ai(`Trying Google: ${model}`);
          const result = await googleAI.models.generateContent({ model, contents: prompt });
          if (result?.text) {
            debugLog.ai(`✅ Success with Google ${model}`);
            return result.text.trim();
          }
        } catch (e) {
          const isRateLimit = e.message?.includes('429') || e.message?.includes('quota');
          if (isRateLimit && models.indexOf(model) < models.length - 1) {
            debugLog.ai(`⚠️ Google ${model} rate limited, trying next...`);
            continue;
          }
        }
      }
    }
    
    return null;
  }

  static fallbackMessages = {
    groupChat: [
      "eh btw lu lg ngapain? gw bosen nih",
      "absen dulu yg lg online",
      "ada yg tau info menarik ga?",
      "gw lg pengen ngobrol nih wkwk",
      "siapa yg udh makan?",
      "lg pd sibuk apaan nih?",
      "ada rekomendasi film/series ga?",
      "gw baru bangun tidur, msh ngantuk bgt",
      "siapa yg kerjanya shift malem?",
      "lg pengen jalan2 tp mager",
      "ada yg main game ga? rekomendasi dong",
      "gw lg nyari tmpat mkn enak nih",
      "siapa yg udh weekend? iri deng",
      "lg pd ngapain aja tuh?",
      "gw lg dengerin lagu enak nih",
    ],
    dm: [
      "eh kenalan yuk, gw agus",
      "hai, gw agus. lu siapa?",
      "yo gw agus, salam kenal",
      "eh gw agus btw, save ya",
      "gw agus, lu dari mana?",
      "kenalan dong, nama gw agus",
      "hai gw agus, lg ngapain?",
      "gw agus nih, boleh kenalan?",
    ],
    reply: [
      "wah gw blm pernah coba sih",
      "oh iya? gw malah beda pengalaman",
      "serius? gw baru tau",
      "gw pernah denger itu, katanya bagus",
      "lu udh coba yg lain blm?",
      "gw lbh suka yg X sih",
      "kayaknya menarik, nanti gw coba",
      "gw jg lg nyari info soal itu",
      "wah boleh jg tuh idenya",
      "gw setuju, tp menurut gw...",
    ],
    status: [
      "lg santai aja hari ini",
      "mager level max",
      "kerja dulu guys",
      "butuh kopi",
      "lg dengerin musik",
      "hari ini full ngantuk",
      "pengen jalan tp mager",
      "lg baca berita",
      "sibuk bgt hari ini",
      "weekend msh lama",
    ],
  };

  static getRandomFallback(type, botName = null) {
    const messages = this.fallbackMessages[type] || this.fallbackMessages.groupChat;
    let msg = messages[Math.floor(Math.random() * messages.length)];
    if (type === "dm" && botName) {
      msg = msg.replace("agus", botName.toLowerCase());
    }
    return msg;
  }

  static async generateGenZChat(topic = "random") {
    const topics = {
      kerjaan: "tanya tentang kerjaan atau ngeluh kerjaan",
      hiburan: "tanya rekomendasi hiburan, film, game, atau musik",
      makanan: "tanya makanan favorit atau rekomendasi tempat makan",
      random_life: "tanya tentang kehidupan sehari-hari",
      teknologi: "tanya tentang teknologi atau gadget",
      cuaca: "ngomongin cuaca atau aktivitas hari ini",
    };

    const topicDesc = topics[topic] || topics.random_life;
    debugLog.ai(`generateGenZChat called with topic: ${topic}`);

    const prompt = `Tulis SATU chat WA grup singkat tentang: ${topicDesc}

Rules:
- Bahasa casual anak muda indo (boleh pake gw/lu, kalian, guys, pada, dll)
- Slang natural (anjir, njir, wkwk, bgt, ga, sm, dong, sih)
- CUMA 1 kalimat pendek
- Ajak ngobrol/nanya ke grup
- NO emoji, NO tanda kutip
- Langsung tulis pesannya aja

Contoh output yang benar:
eh kalian udah makan belum
pada ngapain nih wkwk
ada yg tau tmpat mkn enak ga guys
anjir gw bosen bgt ada rekomendasi film ga`;

    const result = await this.generateWithProvider(prompt);
    
    // Clean up - ambil cuma baris pertama
    let cleaned = result || this.getRandomFallback("groupChat");
    cleaned = cleaned.replace(/^(Contoh|Berikut|Pesan|Output|Chat).*?:\s*/i, '');
    cleaned = cleaned.replace(/^["']|["']$/g, '');
    cleaned = cleaned.split('\n')[0].trim(); // Ambil baris pertama aja
    
    return cleaned;
  }

  static async generateDM(topic = "kenalan", botName = "Raka") {
    const topics = {
      kenalan: `kenalan, sebut nama lu "${botName}", dan minta save kontak`,
      nanya_kerjaan: "nanya kerjaan atau aktivitas dia",
      random_chat: "random chat ajak ngobrol",
      ajak_ngobrol: "ajak ngobrol santai",
      curhat: "curhat singkat tentang hari lu atau kerjaan, cerita dikit",
      nanya_pendapat: "nanya pendapat dia soal sesuatu random",
    };

    const topicDesc = topics[topic] || topics.random_chat;
    debugLog.ai(`generateDM called with topic: ${topic}, name: ${botName}`);

    // Random style: pendek (pertanyaan) atau agak panjang (curhat)
    const isCurhat = topic === 'curhat' || Math.random() < 0.3;
    const lengthGuide = isCurhat 
      ? "Boleh 2-3 kalimat, cerita dikit baru nanya/ajak ngobrol" 
      : "Singkat 1 kalimat aja";

    const prompt = `Lu anak muda nama ${botName}, mau DM orang yang belum kenal.
Tujuan: ${topicDesc}
Panjang: ${lengthGuide}
Style: casual, pake gw/lu atau kalian, slang indo, NO emoji, NO tanda kutip.
Langsung tulis pesannya:`;

    const result = await this.generateWithProvider(prompt);
    return result || this.getRandomFallback("dm", botName);
  }

  static async generateReply(userText) {
    debugLog.ai(`generateReply called for: "${userText.substring(0, 50)}..."`);

    // Check if this is a conversation context (multi-line with names)
    const isConversation = userText.includes('\n') && userText.includes(':');
    
    let prompt;
    if (isConversation) {
      prompt = `${userText}

Bales dengan natural. Pake gw/lu, slang indo, tanpa emoji, tanpa tanda kutip. Pilih SATU poin aja buat dibales. Panjang sesuai personality yang dikasih.`;
    } else {
      prompt = `Bales chat ini: "${userText}"

Rules:
- Pake gw/lu, slang (anjir, njir, wkwk, bgt, ga)
- Kasih pendapat/info spesifik atau tanya balik
- NO emoji, NO tanda kutip
- Jangan cuma "iya sih" / "bener juga"
- Panjang natural (boleh 1 kalimat, boleh 2-3 kalau emang perlu jelasin)`;
    }

    const result = await this.generateWithProvider(prompt);
    let cleaned = result || this.getRandomFallback("reply");
    cleaned = cleaned.replace(/^["']|["']$/g, '');
    cleaned = cleaned.trim();
    return cleaned;
  }

  static async generateStatus() {
    debugLog.ai(`generateStatus called`);
    const genzPrompt = config?.ai?.genzPrompt || "Lu anak muda biasa usia 20-an, pake 'gw/lu', santai, gak formal, singkat, tanpa emoji.";
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${genzPrompt}

Buat status WA singkat tentang aktivitas atau perasaan.
Max 100 karakter.
Natural, tanpa emoji.`
      });

      const text = result.text.trim().slice(0, 100);
      debugLog.ai(`Generated status: "${text}"`);
      return text;
    } catch (e) {
      debugLog.ai(`Status generation failed, using fallback`);
      return this.getRandomFallback("status");
    }
  }
}

module.exports = AIManager;
