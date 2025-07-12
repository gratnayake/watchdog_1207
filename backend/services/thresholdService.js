const fs = require('fs');
const path = require('path');

class ThresholdService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/threshold-config.json');
    this.ensureConfigFile();
  }

  ensureConfigFile() {
    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        dbSizeThreshold: {
          enabled: false,
          minSizeGB: 10,
          emailGroupId: null,
          lastAlertSent: null
        },
        tablespaceThresholds: {
          enabled: false,
          maxUsagePercent: 90,
          emailGroupId: null
        },
        lastUpdated: new Date().toISOString()
      };
      this.saveConfig(defaultConfig);
    }
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading threshold config:', error);
      return { dbSizeThreshold: { enabled: false } };
    }
  }

  saveConfig(config) {
    try {
      const configToSave = {
        ...config,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.configFile, JSON.stringify(configToSave, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving threshold config:', error);
      return false;
    }
  }

  updateDbSizeThreshold(settings) {
    const config = this.loadConfig();
    config.dbSizeThreshold = {
      ...config.dbSizeThreshold,
      ...settings
    };
    return this.saveConfig(config);
  }

  getDbSizeThreshold() {
    const config = this.loadConfig();
    return config.dbSizeThreshold;
  }
}

module.exports = new ThresholdService();