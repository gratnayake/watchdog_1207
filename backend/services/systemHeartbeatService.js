// backend/services/systemHeartbeatService.js
const cron = require('node-cron');
const emailService = require('./emailService');
const dbConfigService = require('./dbConfigService');
const kubernetesConfigService = require('./kubernetesConfigService');
const realOracleService = require('./realOracleService');
const kubernetesService = require('./kubernetesService');
const fs = require('fs');
const path = require('path');

class SystemHeartbeatService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/heartbeat-config.json');
    this.isRunning = false;
    this.cronJob = null;
    this.lastHeartbeat = null;
    this.heartbeatCount = 0;
    
    this.ensureConfigFile();
    console.log('💓 System Heartbeat Service initialized');
  }

  ensureConfigFile() {
    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        enabled: false,
        intervalMinutes: 60, // Default: every hour
        emailGroupId: null,
        lastSent: null,
        includeSystemStats: true,
        includeHealthSummary: true,
        customMessage: '',
        alertThresholds: {
          maxResponseTime: 5000, // 5 seconds
          minUptimeMinutes: 5,    // 5 minutes
          criticalMemoryMB: 1000, // 1GB
          maxErrorCount: 5
        }
      };
      this.saveConfig(defaultConfig);
    }
  }

  getConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading heartbeat config:', error);
      return this.getDefaultConfig();
    }
  }

  saveConfig(config) {
    try {
      config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving heartbeat config:', error);
      return false;
    }
  }

  getDefaultConfig() {
    return {
      enabled: false,
      intervalMinutes: 60,
      emailGroupId: null,
      lastSent: null,
      includeSystemStats: true,
      includeHealthSummary: true,
      customMessage: '',
      alertThresholds: {
        maxResponseTime: 5000,
        minUptimeMinutes: 5,
        criticalMemoryMB: 1000,
        maxErrorCount: 5
      }
    };
  }

  async startHeartbeat() {
    const config = this.getConfig();
    
    if (!config.enabled) {
      console.log('💓 Heartbeat disabled in configuration');
      return false;
    }

    if (!config.emailGroupId) {
      console.log('💓 No email group configured for heartbeat');
      return false;
    }

    if (this.isRunning) {
      console.log('💓 Heartbeat already running');
      return false;
    }

    console.log(`💓 Starting system heartbeat - sending every ${config.intervalMinutes} minutes`);
    
    // Create cron expression based on interval
    const cronExpression = this.getCronExpression(config.intervalMinutes);
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.sendHeartbeat();
    }, {
      scheduled: false
    });

    this.cronJob.start();
    this.isRunning = true;

    // Send initial heartbeat
    setTimeout(() => {
      this.sendHeartbeat();
    }, 5000); // 5 seconds after start

    return true;
  }

  stopHeartbeat() {
    if (!this.isRunning) {
      console.log('💓 Heartbeat not running');
      return false;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.isRunning = false;
    console.log('💓 System heartbeat stopped');
    return true;
  }

  getCronExpression(intervalMinutes) {
    if (intervalMinutes < 60) {
      // For intervals less than 1 hour, use minute-based cron
      return `*/${intervalMinutes} * * * *`;
    } else {
      // For hour-based intervals
      const hours = Math.floor(intervalMinutes / 60);
      return `0 */${hours} * * *`;
    }
  }

  async sendHeartbeat() {
    try {
      console.log('💓 Sending system heartbeat...');
      
      const config = this.getConfig();
      const systemStats = await this.collectSystemStats();
      const healthSummary = await this.collectHealthSummary();
      
      // Check if system meets thresholds
      const thresholdCheck = this.checkThresholds(systemStats, config.alertThresholds);
      
      const subject = thresholdCheck.allGood ? 
        '💓 System Heartbeat: All Systems Operational' : 
        '⚠️ System Heartbeat: Issues Detected';

      const htmlContent = this.generateHeartbeatEmail(
        systemStats, 
        healthSummary, 
        config, 
        thresholdCheck
      );

      // Get email group
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == config.emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('💓 Email group not found or disabled');
        return false;
      }

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails,
        subject: subject,
        html: htmlContent
      };

      await emailService.transporter.sendMail(mailOptions);
      
      this.heartbeatCount++;
      this.lastHeartbeat = new Date();
      
      // Update config with last sent time
      config.lastSent = this.lastHeartbeat.toISOString();
      this.saveConfig(config);

      console.log(`💓 Heartbeat sent successfully to ${targetGroup.emails.length} recipients`);
      return true;

    } catch (error) {
      console.error('💓 Failed to send heartbeat:', error);
      return false;
    }
  }

  async collectSystemStats() {
    const stats = {
      timestamp: new Date(),
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
      heartbeatCount: this.heartbeatCount,
      environment: process.env.NODE_ENV || 'development'
    };

    // Convert memory to MB
    stats.memoryMB = {
      rss: Math.round(stats.memory.rss / 1024 / 1024),
      heapUsed: Math.round(stats.memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(stats.memory.heapTotal / 1024 / 1024),
      external: Math.round(stats.memory.external / 1024 / 1024)
    };

    return stats;
  }

  async collectHealthSummary() {
    const summary = {
      database: { status: 'unknown', error: null },
      kubernetes: { status: 'unknown', error: null },
      monitoring: { active: false, error: null }
    };

    // Check database
    try {
      const dbConfig = dbConfigService.getConfig();
      if (dbConfig.isConfigured) {
        const connectionCheck = await realOracleService.checkConnection();
        summary.database = {
          status: connectionCheck.isConnected ? 'connected' : 'disconnected',
          responseTime: connectionCheck.responseTime,
          error: connectionCheck.error
        };
      } else {
        summary.database.status = 'not_configured';
      }
    } catch (error) {
      summary.database = { status: 'error', error: error.message };
    }

    // Check Kubernetes
    try {
      const kubeConfig = kubernetesConfigService.getConfig();
      if (kubeConfig.isConfigured) {
        const pods = await kubernetesService.getAllPods();
        summary.kubernetes = {
          status: 'connected',
          podCount: pods.length,
          error: null
        };
      } else {
        summary.kubernetes.status = 'not_configured';
      }
    } catch (error) {
      summary.kubernetes = { status: 'error', error: error.message };
    }

    // Check monitoring services
    try {
      const monitoringService = require('./monitoringService');
      summary.monitoring = {
        active: monitoringService.isMonitoring || false,
        error: null
      };
    } catch (error) {
      summary.monitoring = { status: 'error', error: error.message };
    }

    return summary;
  }

  checkThresholds(systemStats, thresholds) {
    const issues = [];
    
    // Check memory usage
    if (systemStats.memoryMB.rss > thresholds.criticalMemoryMB) {
      issues.push(`High memory usage: ${systemStats.memoryMB.rss}MB (threshold: ${thresholds.criticalMemoryMB}MB)`);
    }

    // Check uptime
    const uptimeMinutes = Math.floor(systemStats.uptime / 60);
    if (uptimeMinutes < thresholds.minUptimeMinutes) {
      issues.push(`Low uptime: ${uptimeMinutes} minutes (threshold: ${thresholds.minUptimeMinutes} minutes)`);
    }

    return {
      allGood: issues.length === 0,
      issues: issues,
      checkedAt: new Date()
    };
  }

  generateHeartbeatEmail(systemStats, healthSummary, config, thresholdCheck) {
    const formatUptime = (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      if (days > 0) return `${days}d ${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    const statusColor = thresholdCheck.allGood ? '#28a745' : '#ffc107';
    const statusText = thresholdCheck.allGood ? 'ALL SYSTEMS OPERATIONAL' : 'ISSUES DETECTED';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${statusColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">💓 SYSTEM HEARTBEAT</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">${statusText}</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          <h2 style="margin-top: 0; color: #333;">System Status</h2>
          
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px; font-weight: bold;">Timestamp</td>
              <td style="padding: 12px;">${systemStats.timestamp.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">Uptime</td>
              <td style="padding: 12px;">${formatUptime(systemStats.uptime)}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold;">Memory Usage</td>
              <td style="padding: 12px;">${systemStats.memoryMB.rss}MB RSS, ${systemStats.memoryMB.heapUsed}MB Heap</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">Heartbeat Count</td>
              <td style="padding: 12px;">${systemStats.heartbeatCount}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px; font-weight: bold;">Environment</td>
              <td style="padding: 12px;">${systemStats.environment} (Node ${systemStats.nodeVersion})</td>
            </tr>
          </table>

          <h3 style="color: #333;">Service Health</h3>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
            <tr style="background-color: #e9ecef;">
              <td style="padding: 12px; font-weight: bold;">Service</td>
              <td style="padding: 12px; font-weight: bold;">Status</td>
              <td style="padding: 12px; font-weight: bold;">Details</td>
            </tr>
            <tr>
              <td style="padding: 12px;">Database</td>
              <td style="padding: 12px;">
                <span style="color: ${healthSummary.database.status === 'connected' ? '#28a745' : '#dc3545'};">
                  ${healthSummary.database.status.toUpperCase()}
                </span>
              </td>
              <td style="padding: 12px;">${healthSummary.database.responseTime || healthSummary.database.error || 'N/A'}</td>
            </tr>
            <tr style="background-color: #f8f9fa;">
              <td style="padding: 12px;">Kubernetes</td>
              <td style="padding: 12px;">
                <span style="color: ${healthSummary.kubernetes.status === 'connected' ? '#28a745' : '#dc3545'};">
                  ${healthSummary.kubernetes.status.toUpperCase()}
                </span>
              </td>
              <td style="padding: 12px;">${healthSummary.kubernetes.podCount ? `${healthSummary.kubernetes.podCount} pods` : healthSummary.kubernetes.error || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 12px;">Monitoring</td>
              <td style="padding: 12px;">
                <span style="color: ${healthSummary.monitoring.active ? '#28a745' : '#dc3545'};">
                  ${healthSummary.monitoring.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </td>
              <td style="padding: 12px;">${healthSummary.monitoring.error || 'Running normally'}</td>
            </tr>
          </table>

          ${!thresholdCheck.allGood ? `
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ Issues Detected</h3>
              <ul style="color: #856404; margin: 10px 0;">
                ${thresholdCheck.issues.map(issue => `<li>${issue}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${config.customMessage ? `
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">📝 Custom Message</h3>
              <p style="color: #0c5460; margin: 0;">${config.customMessage}</p>
            </div>
          ` : ''}
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">System Heartbeat Alert | Uptime Watchdog</p>
          <p style="margin: 5px 0 0 0;">Next heartbeat in ${config.intervalMinutes} minutes</p>
        </div>
      </div>
    `;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.getConfig(),
      lastHeartbeat: this.lastHeartbeat,
      heartbeatCount: this.heartbeatCount
    };
  }
}

module.exports = new SystemHeartbeatService();