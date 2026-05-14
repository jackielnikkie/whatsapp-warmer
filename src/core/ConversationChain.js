// ============================================
// CONVERSATION CHAIN CLASS
// ============================================
// Represents an active conversation between bot sessions in a group

class ConversationChain {
  /**
   * Create a new conversation chain
   * @param {string} groupJid - The group JID where the conversation is happening
   * @param {string} initiatorSession - The bot session that initiated the conversation
   * @param {string} topic - The conversation topic
   * @param {number} maxDepth - Maximum depth for this chain (default: 5)
   */
  constructor(groupJid, initiatorSession, topic, maxDepth = 5) {
    this.groupJid = groupJid;
    this.initiatorSession = initiatorSession;
    this.topic = topic;
    this.depth = 0;
    this.maxDepth = maxDepth;
    this.state = 'active'; // 'active' | 'paused' | 'completed'
    this.startedAt = Date.now();
    this.lastMessageAt = Date.now();
    this.completedAt = null;
    this.messages = []; // Last 5 messages for context
    this.participants = new Set(); // Bot sessions involved
  }

  /**
   * Add a message to the conversation chain
   * @param {string} message - The message content
   * @param {string} senderSession - The bot session that sent the message
   */
  addMessage(message, senderSession) {
    this.messages.push({
      content: message,
      sender: senderSession,
      timestamp: Date.now()
    });

    // Keep only last 5 messages
    if (this.messages.length > 5) {
      this.messages.shift();
    }

    this.participants.add(senderSession);
    this.depth++;
    this.lastMessageAt = Date.now();
  }

  /**
   * Check if the conversation chain should terminate
   * @returns {boolean} True if the chain should terminate
   */
  shouldTerminate() {
    return this.depth >= this.maxDepth;
  }

  /**
   * Mark the conversation chain as completed
   */
  complete() {
    this.state = 'completed';
    this.completedAt = Date.now();
  }

  /**
   * Get the conversation history as a formatted string
   * @returns {string} Formatted conversation history
   */
  getHistory() {
    return this.messages.map(m => `${m.sender}: ${m.content}`).join('\n');
  }

  /**
   * Check if the conversation chain is in cooldown period
   * @param {number} cooldownMs - Cooldown period in milliseconds
   * @returns {boolean} True if the chain is in cooldown
   */
  isInCooldown(cooldownMs) {
    if (!this.completedAt) return false;
    return (Date.now() - this.completedAt) < cooldownMs;
  }
}

module.exports = ConversationChain;
