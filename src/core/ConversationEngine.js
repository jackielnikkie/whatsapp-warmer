const config = require('../../config');

class ConversationEngine {
  /**
   * Analyze message context (simplified - no topic detection)
   */
  static analyzeContext(text, messages = []) {
    const isQuestion = /\?|apa|siapa|gimana|kenapa|kapan|dimana|ada yang|tau ga|mau ga|lagi ngapain/i.test(text);
    
    // Detect sentiment (simple)
    const sentiment = this.detectSentiment(text);
    
    return { isQuestion, sentiment };
  }

  /**
   * Detect sentiment (simple)
   */
  static detectSentiment(text) {
    const positive = /bagus|enak|seru|keren|mantap|asik|seneng|happy/i;
    const negative = /jelek|buruk|parah|kesel|bete|males|capek/i;

    if (positive.test(text)) return 'positive';
    if (negative.test(text)) return 'negative';
    return 'neutral';
  }

  /**
   * Check if this specific bot should respond this turn
   * Uses deterministic selection based on message hash
   */
  static selectNextSpeaker(conversation, allBots, sessionRegistry, currentSender = null) {
    const maxReplies = config.interSession?.maxRepliesPerBot || 3;
    
    // Get candidates (exclude current sender & bots at max)
    const candidates = allBots.filter(bot => {
      if (currentSender && bot.name === currentSender) return false;
      const replyCount = conversation.replies[bot.name] || 0;
      if (replyCount >= maxReplies) return false;
      return true;
    });
    
    if (candidates.length === 0) return null;
    
    // Group by state (HIGH/MEDIUM)
    const high = candidates.filter(bot => (conversation.replies[bot.name] || 0) === 0);
    const medium = candidates.filter(bot => {
      const count = conversation.replies[bot.name] || 0;
      return count > 0 && count < maxReplies;
    });
    
    // Priority: HIGH > MEDIUM
    let pool = high.length > 0 ? high : medium;
    
    // Deterministic pick based on last message text hash
    const lastMsg = conversation.messages[conversation.messages.length - 1];
    const seed = lastMsg ? lastMsg.text.length : Date.now();
    const index = seed % pool.length;
    
    return pool[index];
  }
  
  /**
   * Get reply state label (HIGH/MEDIUM/LOW)
   */
  static getReplyState(botName, conversation) {
    const maxReplies = config.interSession?.maxRepliesPerBot || 3;
    const replyCount = conversation.replies[botName] || 0;
    
    if (replyCount === 0) return 'HIGH';
    if (replyCount >= maxReplies) return 'LOW';
    return 'MEDIUM';
  }

  /**
   * Calculate natural delay based on config
   */
  static calculateDelay(text, botName, conversation = null) {
    const delayConfig = config.interSession?.replyDelay || { min: 4, max: 8 };
    const minDelay = delayConfig.min * 1000;
    const maxDelay = delayConfig.max * 1000;
    
    return Math.round(minDelay + Math.random() * (maxDelay - minDelay));
  }

  /**
   * Check if conversation should reset
   */
  static shouldResetConversation(conversation, activeBots) {
    const maxReplies = config.interSession?.maxRepliesPerBot || 3;
    
    // Check if all bots reached max
    const allReachedMax = activeBots.every(bot => 
      (conversation.replies[bot.name] || 0) >= maxReplies
    );
    
    return allReachedMax;
  }

  /**
   * Smart stop condition - stop kalau semua bots reached max (LOW state)
   */
  static shouldStopConversation(conversation, activeBots, currentBotName = null) {
    const maxReplies = config.interSession?.maxRepliesPerBot || 3;
    
    // Check if all bots reached max (LOW state)
    const allLow = activeBots.every(bot => 
      (conversation.replies[bot.name] || 0) >= maxReplies
    );
    
    return allLow;
  }

  /**
   * Generate response style instruction based on dynamic personality
   */
  static getResponseStyleInstruction(botName, context = null, sessionRegistry = null) {
    // Get dynamic personality
    const personality = sessionRegistry?.getPersonality(botName) || {
      name: "normie_tongkrongan",
      style: "casual",
      traits: "biasa aja, relatable",
      speaking: "santai, everyday talk"
    };

    // Determine response length based on personality style
    const lengthGuide = this.getResponseLength(personality, context);
    
    // Random chance to switch topic (15%)
    const shouldSwitchTopic = Math.random() < 0.15;
    const topicSwitch = shouldSwitchTopic ? "\n\nBONUS: Ganti topik ke hal lain yang random/nyambung dikit." : "";
    
    let instruction = `Personality: ${personality.name}
Traits: ${personality.traits}
Speaking style: ${personality.speaking}

PANJANG RESPONSE: ${lengthGuide}

WAJIB:
- NO prefix "Bot:", "Response:", quotation marks
- NO markdown, NO narrator text
- Natural, lowercase friendly, typo OK
- Sesuai personality traits & speaking style
- Pake gw/lu, slang indo${topicSwitch}`;
    
    if (context && context.sentiment === 'negative') {
      instruction += "\n\nContext: Orang lagi bete/kesel. Sesuaikan response dengan personality.";
    } else if (context && context.sentiment === 'positive') {
      instruction += "\n\nContext: Orang lagi happy/excited. Ikut vibe-nya.";
    }
    
    if (context && context.isQuestion) {
      instruction += "\n\nIni pertanyaan — jawab dengan info/pendapat, boleh detail kalau personality-nya emang suka jelasin.";
    }
    
    return instruction;
  }

  /**
   * Determine response length based on personality and context
   */
  static getResponseLength(personality, context) {
    const style = personality.style;
    
    // Lurker/lazy types = super short
    if (style === 'lurker' || style === 'lazy') {
      return "SUPER PENDEK (1-5 kata aja)";
    }
    
    // Technical/overconfident types = bisa panjang, apalagi kalau ditanya
    if ((style === 'technical' || style === 'overconfident') && context?.isQuestion) {
      return "SEDANG-PANJANG (2-4 kalimat, jelasin detail)";
    }
    
    // Chaotic/dramatic = medium, expressive
    if (style === 'chaotic' || style === 'dramatic') {
      return "SEDANG (1-3 kalimat, ekspresif)";
    }
    
    // Enthusiast types = medium-long when on topic
    if (style === 'enthusiast') {
      return "SEDANG (2-3 kalimat, antusias)";
    }

    // Supportive/curious = medium
    if (style === 'supportive' || style === 'curious') {
      return "SEDANG (1-3 kalimat)";
    }
    
    // Default casual = variasi
    const roll = Math.random();
    if (roll < 0.3) return "PENDEK (1 kalimat)";
    if (roll < 0.7) return "SEDANG (1-2 kalimat)";
    return "SEDANG-PANJANG (2-3 kalimat)";
  }
}

module.exports = ConversationEngine;
