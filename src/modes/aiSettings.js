const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { Select } = require('enquirer');
const config = require('../../config');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function aiSettingsMode(showMenu) {
  console.clear();
  console.log(chalk.bgCyan.bold("\n  🤖 AI SETTINGS  \n"));

  const currentProvider = config.ai.provider || "google";
  console.log(chalk.gray(`Current provider: ${chalk.bold(currentProvider)}\n`));

  const prompt = new Select({
    name: "provider",
    message: "Pilih AI Provider:",
    choices: [
      { name: "google", message: "🔵 Google Gemini (default)" },
      { name: "cerebras", message: "🟣 Cerebras (Llama 3.1)" },
      { name: "mistral", message: "🟠 Mistral AI" },
      { name: "mix", message: "🌈 Mix (Google → Cerebras fallback)" },
      { name: "back", message: "← Kembali" },
    ],
  });

  try {
    const choice = await prompt.run();
    
    if (choice === "back") {
      await showMenu();
      return;
    }

    // Update config
    config.ai.provider = choice;
    
    // Save to config.js
    const configPath = path.join(__dirname, '../../config.js');
    let configContent = fs.readFileSync(configPath, 'utf-8');
    
    // Replace provider value
    configContent = configContent.replace(
      /provider:\s*["'].*?["']/,
      `provider: "${choice}"`
    );
    
    fs.writeFileSync(configPath, configContent);
    
    console.log(chalk.green(`\n✅ AI Provider changed to: ${chalk.bold(choice)}`));
    
    // Show info
    if (choice === "google") {
      console.log(chalk.gray("Models: gemini-2.0-flash-exp, gemini-1.5-flash, etc."));
    } else if (choice === "cerebras") {
      console.log(chalk.gray("Model: llama3.1-8b (1M tokens/day free)"));
      console.log(chalk.yellow("⚠️  Make sure CEREBRAS_API_KEY is set in .env"));
    } else if (choice === "mistral") {
      console.log(chalk.gray(`Model: ${config.ai.mistralModel || "mistral-small-latest"}`));
      console.log(chalk.yellow("⚠️  Make sure MISTRAL_API_KEY is set in .env"));
    } else {
      console.log(chalk.gray("Will try Google first, fallback to Cerebras if rate limited"));
    }
    
    // Test AI
    console.log(chalk.cyan("\n🧪 Testing AI..."));
    const AIManager = require('../managers/AIManager.js');
    
    try {
      const testPrompt = "Say 'Hello' in one word";
      const result = await AIManager.generateWithProvider(testPrompt, 50);
      
      if (result) {
        console.log(chalk.green(`✅ Test successful!`));
        console.log(chalk.gray(`Response: "${result}"`));
      } else {
        console.log(chalk.red(`❌ Test failed - no response`));
      }
    } catch (e) {
      console.log(chalk.red(`❌ Test failed: ${e.message}`));
    }
    
    await delay(3000);
    await showMenu();
    
  } catch (e) {
    await showMenu();
  }
}

module.exports = { aiSettingsMode };
