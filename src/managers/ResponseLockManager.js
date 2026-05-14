const chalk = require('chalk');

/**
 * ResponseLockManager
 * 
 * Purpose: Prevent concurrent responses in the same group
 * 
 * This class manages response locks to ensure only one bot session
 * can respond to messages in a group at a time, preventing chaotic
 * conversations with multiple simultaneous responses.
 */
class ResponseLockManager {
  constructor() {
    this.locks = new Map(); // Map<groupJid, LockInfo>
    this.lockTimeout = 30000; // 30 seconds
  }

  /**
   * Acquire a response lock for a group
   * @param {string} groupJid - The group JID
   * @param {string} sessionName - The session attempting to acquire the lock
   * @returns {Promise<boolean>} - True if lock acquired, false if already locked
   */
  async acquireLock(groupJid, sessionName) {
    const existing = this.locks.get(groupJid);
    
    // Check if lock exists and is still valid
    if (existing) {
      const lockAge = Date.now() - existing.lockedAt;
      
      // Auto-release if timeout exceeded
      if (lockAge > this.lockTimeout) {
        console.log(chalk.yellow(`[LOCK] Auto-releasing expired lock for ${groupJid}`));
        this.releaseLock(groupJid);
      } else {
        return false; // Lock held by another session
      }
    }
    
    // Acquire lock
    this.locks.set(groupJid, {
      locked: true,
      lockedBy: sessionName,
      lockedAt: Date.now()
    });
    
    return true;
  }

  /**
   * Release a response lock for a group
   * @param {string} groupJid - The group JID
   */
  releaseLock(groupJid) {
    this.locks.delete(groupJid);
  }

  /**
   * Check if a group is currently locked
   * @param {string} groupJid - The group JID
   * @returns {boolean} - True if locked, false otherwise
   */
  isLocked(groupJid) {
    const lock = this.locks.get(groupJid);
    if (!lock) return false;
    
    const lockAge = Date.now() - lock.lockedAt;
    if (lockAge > this.lockTimeout) {
      this.releaseLock(groupJid);
      return false;
    }
    
    return true;
  }

  /**
   * Get the session name that currently holds the lock
   * @param {string} groupJid - The group JID
   * @returns {string|null} - Session name or null if not locked
   */
  getLockedBy(groupJid) {
    const lock = this.locks.get(groupJid);
    return lock ? lock.lockedBy : null;
  }
}

module.exports = ResponseLockManager;
