const fs = require('fs');
const path = require('path');

class DatabaseConfigService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/db-config.json');
    this.ensureConfigFile();
  }

  ensureConfigFile() {
    if (!fs.existsSync(this.configFile)) {
      // Create default config
      const defaultConfig = {
        host: '',
        port: 1521,
        serviceName: '',
        username: '',
        password: '',
        isConfigured: false,
        lastUpdated: new Date().toISOString()
      };
      this.saveConfig(defaultConfig);
      console.log('📊 Created default database config file');
    }
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading database config:', error);
      return {
        host: '',
        port: 1521,
        serviceName: '',
        username: '',
        password: '',
        isConfigured: false
      };
    }
  }

  saveConfig(config) {
    try {
      const configToSave = {
        ...config,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.configFile, JSON.stringify(configToSave, null, 2));
      console.log('💾 Database config saved');
      return true;
    } catch (error) {
      console.error('Error saving database config:', error);
      return false;
    }
  }

  updateConfig(newConfig) {
    const currentConfig = this.loadConfig();
    const updatedConfig = {
      ...currentConfig,
      ...newConfig,
      isConfigured: true
    };
    
    return this.saveConfig(updatedConfig);
  }

  getConfig() {
    return this.loadConfig();
  }

  // Get config without sensitive data (for frontend)
  getPublicConfig() {
    const config = this.loadConfig();
    return {
      host: config.host,
      port: config.port,
      serviceName: config.serviceName,
      username: config.username,
      isConfigured: config.isConfigured,
      lastUpdated: config.lastUpdated
    };
  }

  clearConfig() {
    const emptyConfig = {
      host: '',
      port: 1521,
      serviceName: '',
      username: '',
      password: '',
      isConfigured: false
    };
    return this.saveConfig(emptyConfig);
  }
}

module.exports = new DatabaseConfigService();