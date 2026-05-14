// ============================================
// INTER-SESSION MANAGER
// ============================================
// Central coordinator for all inter-session communication between bot sessions

const chalk = require('chalk');
const SessionRegistry = require('./SessionRegistry');
const ResponseLockManager = require('../managers/ResponseLockManager');
const ConversationChain = require('./ConversationChain');

class InterSessionManager {
  constructor() {
    // Registry of all bot session identifiers
    this.sessionRegistry = new SessionRegistry();
    
    // Active conversation chains per group
    // Map<groupJid, ConversationChain>
    this.conversationChains = new Map();
    
    // Response locks per group
    this.responseLocks = new ResponseLockManager();
    
    // Recent topics per group
    // Map<groupJid, Array<{topic, usedAt}>>
    this.recentTopics = new Map();
    
    // Metrics tracking
    this.metrics = {
      totalChains: 0,
      totalResponses: 0,
      averageDepth: 0,
      responseRate: 0
    };
    
    // Configuration
    this.config = null;
    
    // Initialization flag
    this.initialized = false;
  }

  /**
   * Initialize the InterSessionManager with bot sessions and configuration
   * @param {Array} sessions - Array of session objects with {name, jid, phoneNumber, enabled}
   * @param {Object} config - Configuration object from config.js (full config, not just interSession)
   * @throws {Error} - Throws error if configuration is invalid
   */
  initialize(sessions, config) {
    // Validate configuration first
    if (!this.validateConfig(config)) {
      console.log(chalk.red('[INTER-SESSION] Configuration validation failed, initialization aborted'));
      this.initialized = false;
      throw new Error('Invalid inter-session configuration');
    }

    // Store configuration
    this.config = config;

    // Register all sessions
    for (const session of sessions) {
      if (session.enabled) {
        const sessionConfig = config.interSession.sessionSettings[session.name] || { enabled: true, weight: 1 };
        const interSessionEnabled = sessionConfig.enabled && session.enabled;
        
        this.sessionRegistry.register(
          session.name,
          session.jid,
          session.phoneNumber,
          interSessionEnabled
        );
      }
    }

    this.initialized = true;
    console.log(chalk.green(`[INTER-SESSION] Initialized with ${sessions.length} sessions`));
  }

  /**
   * Validate the inter-session configuration
   * @param {Object} config - Configuration object to validate (full config with interSession property)
   * @returns {boolean} - True if configuration is valid, false otherwise
   */
  validateConfig(config) {
    const errors = [];

    // Check if config exists
    if (!config) {
      console.log(chalk.red('[INTER-SESSION] Configuration is missing'));
      return false;
    }

    // Check if interSession config exists
    if (!config.interSession) {
      console.log(chalk.red('[INTER-SESSION] interSession configuration is missing'));
      return false;
    }

    const interSession = config.interSession;

    // Validate responseProbability
    if (interSession.responseProbability) {
      const { initial, continuation } = interSession.responseProbability;
      
      if (typeof initial !== 'number' || initial < 0 || initial > 100) {
        errors.push('Initial response probability must be a number between 0 and 100');
      }
      
      if (typeof continuation !== 'number' || continuation < 0 || continuation > 100) {
        errors.push('Continuation response probability must be a number between 0 and 100');
      }
    } else {
      errors.push('responseProbability configuration is missing');
    }

    // Validate conversation settings
    if (interSession.conversation) {
      const { minDepth, maxDepth, cooldownMinutes, historySize } = interSession.conversation;
      
      if (typeof minDepth !== 'number' || minDepth < 1) {
        errors.push('Minimum depth must be a number >= 1');
      }
      
      if (typeof maxDepth !== 'number' || maxDepth < 1) {
        errors.push('Maximum depth must be a number >= 1');
      }
      
      if (minDepth > maxDepth) {
        errors.push('Maximum depth must be >= minimum depth');
      }
      
      if (typeof cooldownMinutes !== 'number' || cooldownMinutes < 0) {
        errors.push('Cooldown minutes must be a number >= 0');
      }
      
      if (typeof historySize !== 'number' || historySize < 1) {
        errors.push('History size must be a number >= 1');
      }
    } else {
      errors.push('conversation configuration is missing');
    }

    // Validate delays
    if (interSession.delays) {
      const { min, max } = interSession.delays;
      
      if (typeof min !== 'number' || min < 0) {
        errors.push('Minimum delay must be a number >= 0');
      }
      
      if (typeof max !== 'number' || max < 0) {
        errors.push('Maximum delay must be a number >= 0');
      }
      
      if (min > max) {
        errors.push('Minimum delay must be <= maximum delay');
      }
    } else {
      errors.push('delays configuration is missing');
    }

    // Validate topics
    if (interSession.topics) {
      if (!Array.isArray(interSession.topics) || interSession.topics.length === 0) {
        errors.push('topics must be a non-empty array');
      } else {
        // Validate each topic
        for (let i = 0; i < interSession.topics.length; i++) {
          const topic = interSession.topics[i];
          if (!topic.category || !topic.text || typeof topic.weight !== 'number') {
            errors.push(`Topic at index ${i} is missing required fields (category, text, weight)`);
          }
          if (topic.weight < 0) {
            errors.push(`Topic at index ${i} has invalid weight (must be >= 0)`);
          }
        }
      }
    } else {
      errors.push('topics configuration is missing');
    }

    // Validate sessionSettings
    if (interSession.sessionSettings) {
      if (typeof interSession.sessionSettings !== 'object') {
        errors.push('sessionSettings must be an object');
      }
    } else {
      errors.push('sessionSettings configuration is missing');
    }

    // Validate metrics
    if (interSession.metrics) {
      if (typeof interSession.metrics.enabled !== 'boolean') {
        errors.push('metrics.enabled must be a boolean');
      }
      if (typeof interSession.metrics.logInterval !== 'number' || interSession.metrics.logInterval < 0) {
        errors.push('metrics.logInterval must be a number >= 0');
      }
    } else {
      errors.push('metrics configuration is missing');
    }

    // Log all errors
    if (errors.length > 0) {
      console.log(chalk.red('[INTER-SESSION] Configuration validation errors:'));
      errors.forEach(error => {
        console.log(chalk.red(`  - ${error}`));
      });
      return false;
    }

    console.log(chalk.green('[INTER-SESSION] Configuration validation passed'));
    return true;
  }

  /**
   * Select a topic for a new conversation
   * @param {string} groupJid - The group JID
   * @returns {string} Selected topic
   */
  selectTopic(groupJid) {
    const topics = this.config.interSession.topics;
    
    if (!topics || topics.length === 0) {
      console.log('[INTER-SESSION] No topics configured, using default');
      return 'random_chat';
    }
    
    // Get recent topics for this group
    const recentTopics = this.recentTopics.get(groupJid) || [];
    
    // Calculate current time
    const now = Date.now();
    
    // Filter out topics used in the last 30 minutes
    const recentTopicTexts = recentTopics
      .filter(t => (now - t.usedAt) < 30 * 60 * 1000)
      .map(t => t.topic);
    
    // Separate topics into recent and non-recent
    const nonRecentTopics = topics.filter(t => !recentTopicTexts.includes(t.text));
    const availableTopics = nonRecentTopics.length > 0 ? nonRecentTopics : topics;
    
    // Calculate total weight
    const totalWeight = availableTopics.reduce((sum, topic) => sum + topic.weight, 0);
    
    // Weighted random selection
    let random = Math.random() * totalWeight;
    let selectedTopic = availableTopics[0].text; // Default fallback
    
    for (const topic of availableTopics) {
      random -= topic.weight;
      if (random <= 0) {
        selectedTopic = topic.text;
        break;
      }
    }
    
    // Record the selected topic
    this.recordTopic(groupJid, selectedTopic);
    
    console.log(`[INTER-SESSION] Selected topic: ${selectedTopic} for group ${groupJid}`);
    
    return selectedTopic;
  }

  /**
   * Record a topic usage for a group
   * @param {string} groupJid - The group JID
   * @param {string} topic - The topic that was used
   */
  recordTopic(groupJid, topic) {
    const recentTopics = this.recentTopics.get(groupJid) || [];
    
    // Add the new topic
    recentTopics.push({
      topic: topic,
      usedAt: Date.now()
    });
    
    // Keep only topics from the last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const filteredTopics = recentTopics.filter(t => t.usedAt > oneHourAgo);
    
    this.recentTopics.set(groupJid, filteredTopics);
  }

  /**
   * Get metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeChains: this.conversationChains.size
    };
  }

  /**
   * Check if the manager is initialized
   * @returns {boolean} - True if initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get the current configuration
   * @returns {Object|null} - Configuration object or null if not initialized
   */
  getConfig() {
    return this.config;
  }

  /**
   * Check if a message sender is a bot session
   * @param {string} senderJid - The JID of the message sender
   * @returns {boolean} - True if sender is a bot session, false otherwise
   */
  isBotMessage(senderJid) {
    if (!this.initialized) {
      return false;
    }

    const isBot = this.sessionRegistry.isBot(senderJid);
    
    if (isBot) {
      const session = this.sessionRegistry.getSessionByJid(senderJid);
      console.log(chalk.blue(`[INTER-SESSION] Bot message detected from ${session ? session.name : 'unknown'} (${senderJid})`));
    }
    
    return isBot;
  }

  /**
   * Get session information by JID
   * @param {string} jid - The WhatsApp JID to lookup
   * @returns {Object|null} - Session info object or null if not found
   */
  getSessionByJid(jid) {
    if (!this.initialized) {
      return null;
    }

    return this.sessionRegistry.getSessionByJid(jid);
  }

  /**
   * Determine if a bot should respond to a trigger message
   * @param {Object} triggerMessage - The message object that triggered the response check
   * @param {string} groupJid - The group JID where the message was sent
   * @param {Object} antiLoop - The AntiLoopManager instance for checking limits
   * @param {string} currentSessionName - The name of the current bot session
   * @returns {Object} Decision object with {shouldRespond: boolean, reason: string}
   */
  shouldRespond(triggerMessage, groupJid, antiLoop, currentSessionName) {
    // Check if manager is initialized
    if (!this.initialized) {
      console.log(chalk.yellow('[INTER-SESSION] Manager not initialized, skipping response'));
      return { shouldRespond: false, reason: 'not_initialized' };
    }

    // Check if inter-session is globally enabled
    if (!this.config.interSession.enabled) {
      console.log(chalk.yellow('[INTER-SESSION] Inter-session disabled globally, skipping response'));
      return { shouldRespond: false, reason: 'disabled' };
    }

    // Check if response lock is held for this group
    if (this.responseLocks.isLocked(groupJid)) {
      const lockedBy = this.responseLocks.getLockedBy(groupJid);
      console.log(chalk.yellow(`[INTER-SESSION] Group ${groupJid} locked by ${lockedBy}, skipping response`));
      return { shouldRespond: false, reason: 'locked' };
    }

    // Check if there's an active conversation chain
    const activeChain = this.conversationChains.get(groupJid);
    
    // Determine which probability to use (initial or continuation)
    let probability;
    if (activeChain && activeChain.state === 'active') {
      // Use continuation probability for existing chains
      probability = this.getGroupProbability(groupJid).continuation;
    } else if (activeChain && activeChain.state === 'completed') {
      // Check cooldown for completed chains
      const cooldownMs = this.config.interSession.conversation.cooldownMinutes * 60 * 1000;
      if (activeChain.isInCooldown(cooldownMs)) {
        console.log(chalk.yellow(`[INTER-SESSION] Group ${groupJid} in cooldown, skipping response`));
        return { shouldRespond: false, reason: 'cooldown' };
      }
      // Use initial probability for new chains after cooldown
      probability = this.getGroupProbability(groupJid).initial;
    } else {
      // Use initial probability for new chains
      probability = this.getGroupProbability(groupJid).initial;
    }

    // Check Response_Probability
    const random = Math.random() * 100;
    if (random > probability) {
      if (this.config.debug.interSession) {
        console.log(chalk.gray(`[INTER-SESSION-DEBUG] Probability check failed: ${random.toFixed(2)} > ${probability}`));
      }
      console.log(chalk.yellow(`[INTER-SESSION] Probability check failed (${random.toFixed(2)} > ${probability}), skipping response`));
      return { shouldRespond: false, reason: 'probability' };
    }

    if (this.config.debug.interSession) {
      console.log(chalk.gray(`[INTER-SESSION-DEBUG] Probability check passed: ${random.toFixed(2)} <= ${probability}`));
    }

    // Check Anti_Loop_System limits
    if (antiLoop && !antiLoop.canReplyToGroup(groupJid)) {
      console.log(chalk.yellow(`[INTER-SESSION] Anti-loop limits reached for ${groupJid}, skipping response`));
      return { shouldRespond: false, reason: 'anti_loop' };
    }

    // All checks passed
    console.log(chalk.green(`[INTER-SESSION] Response decision: RESPOND (probability: ${probability}%, random: ${random.toFixed(2)})`));
    return { shouldRespond: true, reason: 'approved' };
  }

  /**
   * Get the response probability for a specific group
   * @param {string} groupJid - The group JID
   * @returns {Object} Object with {initial, continuation} probability values
   */
  getGroupProbability(groupJid) {
    // Check if there's a group-specific probability override
    const groupOverride = this.config.interSession.groupProbability[groupJid];
    
    if (groupOverride) {
      return {
        initial: groupOverride.initial,
        continuation: groupOverride.continuation
      };
    }

    // Return global default probability
    return {
      initial: this.config.interSession.responseProbability.initial,
      continuation: this.config.interSession.responseProbability.continuation
    };
  }
}

module.exports = InterSessionManager;
