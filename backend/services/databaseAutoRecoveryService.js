// backend/services/databaseAutoRecoveryService.js
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class DatabaseAutoRecoveryService {
  constructor() {
    this.isRecoveryInProgress = false;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
    this.recoveryLog = [];
    this.configFile = path.join(__dirname, '../data/autoRecoveryConfig.json');
    
    // Load saved configuration
    this.loadConfig();
    
    console.log('🔧 Database Auto-Recovery Service initialized');
    console.log(`🔧 Auto-recovery status: ${this.isAutoRecoveryEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // Load configuration from file
  loadConfig() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.configFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load config file if it exists
      if (fs.existsSync(this.configFile)) {
        const configData = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(configData);
        
        this.isAutoRecoveryEnabled = config.enabled || false;
        this.maxRecoveryAttempts = config.maxAttempts || 3;
        
        console.log('📋 Loaded auto-recovery config from file');
      } else {
        // Create default config
        this.isAutoRecoveryEnabled = false;
        this.saveConfig();
        console.log('📋 Created default auto-recovery config');
      }
    } catch (error) {
      console.error('❌ Error loading auto-recovery config:', error);
      this.isAutoRecoveryEnabled = false;
    }
  }

  // Save configuration to file
  saveConfig() {
    try {
      const config = {
        enabled: this.isAutoRecoveryEnabled,
        maxAttempts: this.maxRecoveryAttempts,
        waitAfterStop: 5000,
        waitAfterRestart: 10000,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      console.log('💾 Auto-recovery config saved to file');
    } catch (error) {
      console.error('❌ Error saving auto-recovery config:', error);
    }
  }

  // Get configuration (simplified)
  getConfig() {
    return {
      enabled: this.isAutoRecoveryEnabled,
      maxAttempts: this.maxRecoveryAttempts,
      waitAfterStop: 5000,
      waitAfterRestart: 10000
    };
  }

  // Enable or disable auto recovery
  setAutoRecoveryEnabled(enabled) {
    this.isAutoRecoveryEnabled = enabled;
    console.log(`🔄 Auto-recovery ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (!enabled) {
      this.recoveryAttempts = 0;
      this.isRecoveryInProgress = false;
    }
    
    // Save to file immediately
    this.saveConfig();
    
    return this.isAutoRecoveryEnabled;
  }

  // Get current auto recovery status
  getAutoRecoveryStatus() {
    const stopScript = this.findScriptByName('Stop Pods');
    const startScript = this.findScriptByName('Start Pods');
    
    return {
      enabled: this.isAutoRecoveryEnabled || false,
      inProgress: this.isRecoveryInProgress,
      attempts: this.recoveryAttempts,
      maxAttempts: this.maxRecoveryAttempts,
      log: this.recoveryLog.slice(-10), // Last 10 entries
      config: {
        stopScriptFound: !!stopScript,
        startScriptFound: !!startScript,
        stopScriptName: stopScript ? stopScript.name : 'Not Found',
        startScriptName: startScript ? startScript.name : 'Not Found'
      }
    };
  }

  // Main method called when database goes down
  async handleDatabaseDown() {
    const config = this.getConfig();
    
    if (!config.enabled) {
      console.log('📋 Auto-recovery is disabled, skipping recovery');
      return false;
    }

    if (this.isRecoveryInProgress) {
      console.log('🔄 Recovery already in progress, skipping');
      return false;
    }

    if (this.recoveryAttempts >= config.maxAttempts) {
      console.log(`🚫 Maximum recovery attempts (${config.maxAttempts}) reached`);
      this.logRecovery('MAX_ATTEMPTS_REACHED', 'Maximum recovery attempts exceeded');
      return false;
    }

    console.log('🚨 Starting automatic database recovery...');
    this.isRecoveryInProgress = true;
    this.recoveryAttempts++;

    try {
      // Step 1: Run "Stop Pods" script
      console.log('📋 Step 1: Running "Stop Pods" script...');
      const stopResult = await this.runScriptByName('Stop Pods');
      
      if (!stopResult.success) {
        throw new Error(`Stop Pods script failed: ${stopResult.error}`);
      }
      
      // Wait after stop
      console.log(`⏳ Step 2: Waiting ${config.waitAfterStop}ms after stop...`);
      await this.sleep(config.waitAfterStop);
      
      // Step 3: Try to restart the database
      console.log('🔄 Step 3: Attempting to restart database...');
      const restartSuccess = await this.restartDatabase();
      
      if (restartSuccess) {
        // Step 4: Wait for database to come up
        console.log(`⏳ Step 4: Waiting ${config.waitAfterRestart}ms for database to start...`);
        await this.sleep(config.waitAfterRestart);
        
        // Step 5: Check if database is really up
        const isUp = await this.checkDatabaseStatus();
        
        if (isUp) {
          // Step 6: Run "Start Pods" script
          console.log('✅ Step 5: Database is up, running "Start Pods" script...');
          const startResult = await this.runScriptByName('Start Pods');
          
          if (!startResult.success) {
            console.log('⚠️ Start Pods script failed, but database is up');
            this.logRecovery('PARTIAL_SUCCESS', 'Database recovered but Start Pods script failed');
          } else {
            console.log('🎉 Database recovery completed successfully!');
            this.logRecovery('SUCCESS', 'Database recovered successfully');
          }
          
          this.recoveryAttempts = 0; // Reset attempts on success
          this.isRecoveryInProgress = false;
          return true;
        } else {
          console.log('❌ Database failed to start after restart attempt');
          this.logRecovery('FAILED', 'Database failed to start after restart');
        }
      } else {
        console.log('❌ Database restart command failed');
        this.logRecovery('RESTART_FAILED', 'Database restart command failed');
      }
      
    } catch (error) {
      console.error('❌ Error during database recovery:', error);
      this.logRecovery('ERROR', `Recovery failed: ${error.message}`);
    }

    this.isRecoveryInProgress = false;
    return false;
  }

  // Find script by exact name
  findScriptByName(scriptName) {
    try {
      const scriptService = require('./scriptService');
      const allScripts = scriptService.getAllScripts();
      
      const script = allScripts.find(s => s.name === scriptName);
      
      if (script) {
        console.log(`📋 Found script: "${scriptName}" (ID: ${script.id})`);
        return script;
      } else {
        console.log(`⚠️ Script not found: "${scriptName}"`);
        console.log(`📋 Available scripts: ${allScripts.map(s => s.name).join(', ')}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error finding script "${scriptName}":`, error);
      return null;
    }
  }

  // Run script by exact name
  async runScriptByName(scriptName) {
    try {
      const script = this.findScriptByName(scriptName);
      
      if (!script) {
        throw new Error(`Script "${scriptName}" not found. Please create a script named exactly "${scriptName}" in your Script Manager.`);
      }
      
      console.log(`🔧 Running script "${script.name}"`);
      console.log(`📋 Script path: ${script.scriptPath}`);
      console.log(`📋 Arguments: ${script.arguments || 'None'}`);
      
      const scriptService = require('./scriptService');
      const result = await scriptService.runScript(script);
      
      if (result.success) {
        console.log(`✅ Script "${script.name}" completed successfully`);
        console.log(`📋 Output: ${result.output}`);
        return { success: true, output: result.output };
      } else {
        console.error(`❌ Script "${script.name}" failed`);
        console.error(`📋 Error: ${result.error}`);
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      console.error(`❌ Failed to run script "${scriptName}":`, error);
      return { success: false, error: error.message };
    }
  }

  // Restart the database (you'll need to customize this for your database)
  async restartDatabase() {
    return new Promise((resolve) => {
      console.log('🔄 Attempting to restart Oracle database...');
      
      // For Windows Oracle restart
      const restartCommand = 'net stop OracleServiceXE && timeout /t 5 && net start OracleServiceXE';
      
      // For Linux/Mac Oracle restart (uncomment if needed):
      // const restartCommand = 'sudo systemctl restart oracle-xe';
      
      exec(restartCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Database restart error: ${error.message}`);
          resolve(false);
          return;
        }
        
        if (stderr) {
          console.error(`❌ Database restart stderr: ${stderr}`);
        }
        
        console.log(`📋 Database restart output: ${stdout}`);
        console.log('✅ Database restart command completed');
        resolve(true);
      });
    });
  }

  // Check if database is up (simple connection test)
  async checkDatabaseStatus() {
    try {
      // Import your existing database service
      const realOracleService = require('./realOracleService');
      const result = await realOracleService.testConnection();
      return result.success;
    } catch (error) {
      console.error('❌ Database status check failed:', error);
      return false;
    }
  }

  // Helper method to sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Log recovery attempts
  logRecovery(status, message) {
    const logEntry = {
      timestamp: new Date(),
      attempt: this.recoveryAttempts,
      status,
      message
    };
    
    this.recoveryLog.push(logEntry);
    
    // Keep only last 50 entries
    if (this.recoveryLog.length > 50) {
      this.recoveryLog = this.recoveryLog.slice(-50);
    }
    
    console.log(`📝 Recovery log: ${status} - ${message}`);
  }

  // Reset recovery attempts (useful for manual reset)
  resetRecoveryAttempts() {
    this.recoveryAttempts = 0;
    this.isRecoveryInProgress = false;
    console.log('🔄 Recovery attempts reset');
  }
}

module.exports = new DatabaseAutoRecoveryService();