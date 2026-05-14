// ============================================
// SESSION REGISTRY
// ============================================
const chalk = require('chalk');
const config = require('../../config');

class SessionRegistry {
  constructor() {
    this.sessions = new Map(); // Map<sessionName, SessionInfo>
    this.assignedPersonalities = new Map(); // Track assigned personalities
  }

  /**
   * Assign random personality from pool
   */
  assignPersonality(sessionName) {
    const pool = config.interSession?.personalityPool || [];
    if (pool.length === 0) {
      // Fallback default
      return {
        name: "normie_tongkrongan",
        style: "casual",
        chance: 0.7,
        traits: "biasa aja, relatable",
        speaking: "santai, everyday talk"
      };
    }
    
    // Random pick from pool
    const personality = pool[Math.floor(Math.random() * pool.length)];
    this.assignedPersonalities.set(sessionName, personality);
    
    return personality;
  }

  /**
   * Get personality for session
   */
  getPersonality(sessionName) {
    if (!this.assignedPersonalities.has(sessionName)) {
      return this.assignPersonality(sessionName);
    }
    return this.assignedPersonalities.get(sessionName);
  }

  /**
   * Register a bot session in the registry
   * @param {string} sessionName - Name of the session (e.g., 'bot1')
   * @param {string} jid - WhatsApp JID of the session
   * @param {string} phoneNumber - Phone number of the session
   * @param {boolean} enabled - Whether the session is enabled
   * @param {string} lid - Linked ID (optional)
   */
  register(sessionName, jid, phoneNumber, enabled, lid = null) {
    // Auto-assign personality if not exists
    const personality = this.getPersonality(sessionName);
    
    this.sessions.set(sessionName, {
      name: sessionName,
      jid: jid,
      phoneNumber: phoneNumber,
      lid: lid,
      enabled: enabled,
      interSessionEnabled: true,
      registeredAt: Date.now(),
      personality: personality
    });
    console.log(chalk.green(`[SESSION-REGISTRY] Registered: ${sessionName} (${phoneNumber}${lid ? ', LID: ' + lid : ''}) - ${personality.name}`));
  }

  /**
   * Unregister a bot session from the registry
   * @param {string} sessionName - Name of the session to unregister
   */
  unregister(sessionName) {
    if (this.sessions.has(sessionName)) {
      this.sessions.delete(sessionName);
      console.log(chalk.yellow(`[SESSION-REGISTRY] Unregistered session: ${sessionName}`));
    }
  }

  /**
   * Extract phone number from JID (handle @s.whatsapp.net dan @lid)
   * @param {string} jid - WhatsApp JID
   * @returns {string} - Phone number
   */
  extractPhone(jid) {
    if (!jid) return '';
    // Remove @s.whatsapp.net, @lid, atau @g.us dan ambil angka sebelum :
    return jid.split(':')[0].split('@')[0];
  }

  /**
   * Check if a JID belongs to a registered bot session
   * @param {string} jid - WhatsApp JID to check
   * @returns {boolean} - True if JID belongs to a bot session
   */
  isBot(jid) {
    const targetPhone = this.extractPhone(jid);
    for (const [name, info] of this.sessions) {
      // Compare phone numbers (handle berbagai format JID)
      if (info.phoneNumber === targetPhone) {
        return true;
      }
      // Juga cek LID jika ada
      if (info.lid && this.extractPhone(info.lid) === targetPhone) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get session info by JID
   * @param {string} jid - WhatsApp JID to lookup
   * @returns {Object|null} - Session info or null if not found
   */
  getSessionByJid(jid) {
    const targetPhone = this.extractPhone(jid);
    for (const [name, info] of this.sessions) {
      if (info.phoneNumber === targetPhone) {
        return info;
      }
    }
    return null;
  }

  /**
   * Get all available sessions (enabled and inter-session enabled)
   * @param {string} excludeSession - Session name to exclude from results
   * @returns {Array} - Array of available session info objects
   */
  getAvailableSessions(excludeSession) {
    const available = [];
    for (const [name, info] of this.sessions) {
      if (name !== excludeSession && info.enabled && info.interSessionEnabled) {
        available.push(info);
      }
    }
    return available;
  }

  /**
   * Get all registered sessions
   * @returns {Array} - Array of all session info objects
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

module.exports = SessionRegistry;
