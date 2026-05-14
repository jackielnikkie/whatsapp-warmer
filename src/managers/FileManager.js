const fs = require('fs');
const chalk = require('chalk');
const config = require('../../config.js');

class FileManager {
  static loadJSON(filePath, defaultValue = {}) {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        // Validate data structure for joined_groups.json
        if (filePath.includes('joined_groups') && data.groups && Array.isArray(data.groups)) {
          // Filter out invalid entries (strings instead of objects)
          const validGroups = data.groups.filter(g => g && typeof g === 'object' && (g.inviteCode || g.code || g.groupJid));
          if (validGroups.length !== data.groups.length) {
            console.log(chalk.yellow(`[WARN] Fixed ${data.groups.length - validGroups.length} invalid group entries in ${filePath}`));
            data.groups = validGroups;
            // Save fixed data
            FileManager.saveJSON(filePath, data);
          }
        }
        return data;
      }
    } catch (e) {
      console.log(chalk.red(`[ERROR] Gagal load ${filePath}: ${e.message}`));
      console.log(chalk.yellow(`[WARN] Using default value and backing up corrupted file`));
      // Backup corrupted file
      if (fs.existsSync(filePath)) {
        const backupPath = filePath + '.backup.' + Date.now();
        try {
          fs.renameSync(filePath, backupPath);
          console.log(chalk.green(`[INFO] Backed up corrupted file to ${backupPath}`));
        } catch (backupErr) {
          console.log(chalk.red(`[ERROR] Failed to backup: ${backupErr.message}`));
        }
      }
    }
    return defaultValue;
  }

  static saveJSON(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(chalk.red(`[ERROR] Gagal save ${filePath}: ${e.message}`));
    }
  }

  static loadTargetGroups() {
    try {
      if (!fs.existsSync(config.groups.targetFile)) return [];
      const content = fs.readFileSync(config.groups.targetFile, "utf-8");
      return content
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .filter(line => line.includes("chat.whatsapp.com"));
    } catch (e) {
      return [];
    }
  }
}

module.exports = FileManager;
