// backend/services/kubernetesMonitoringService.js
const cron = require('node-cron');
const emailService = require('./emailService');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');

class KubernetesMonitoringService {
  constructor() {
    this.podStatuses = new Map();
    this.nodeStatuses = new Map();
    this.emailSentStatus = new Map();
    this.isMonitoring = false;
    this.checkInterval = null;
    
    // Check every 2 minutes for pod failures
    this.checkFrequency = '*/2 * * * *';
    
    console.log('☸️ Kubernetes Monitoring Service initialized');
  }

  // Start continuous monitoring
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Kubernetes monitoring already running');
      return false;
    }

    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Cannot start Kubernetes monitoring - not configured');
      return false;
    }

    console.log(`☸️ Starting Kubernetes monitoring (checking every 2 minutes)`);
    
    // Use node-cron for reliable scheduling
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkPodHealth();
      await this.checkNodeHealth();
    }, {
      scheduled: false
    });

    // Start the cron job
    this.checkInterval.start();
    this.isMonitoring = true;

    // Perform initial check
    setTimeout(() => {
      this.checkPodHealth();
      this.checkNodeHealth();
    }, 5000);

    return true;
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Kubernetes monitoring not running');
      return false;
    }

    console.log('🛑 Stopping Kubernetes monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    this.isMonitoring = false;
    return true;
  }

  // Get monitoring status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      podCount: this.podStatuses.size,
      nodeCount: this.nodeStatuses.size,
      lastCheck: new Date()
    };
  }

  async checkPodHealth() {
    try {
      console.log('☸️ Checking Kubernetes pod health...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured || !config.emailGroupId) {
        return;
      }

      const pods = await kubernetesService.getAllPods();
      
      for (const pod of pods) {
        const podKey = `${pod.namespace}/${pod.name}`;
        const previousStatus = this.podStatuses.get(podKey);
        
        // Check for pod failure
        if (previousStatus && previousStatus.status !== 'Failed' && pod.status === 'Failed') {
          console.log(`🚨 Pod failure detected: ${podKey}`);
          await this.sendPodFailureAlert(pod, config.emailGroupId);
        }
        
        // Check for pod recovery
        if (previousStatus && previousStatus.status === 'Failed' && pod.status === 'Running') {
          console.log(`✅ Pod recovery detected: ${podKey}`);
          await this.sendPodRecoveryAlert(pod, config.emailGroupId);
        }
        
        this.podStatuses.set(podKey, {
          status: pod.status,
          timestamp: new Date(),
          restarts: pod.restarts
        });
      }
    } catch (error) {
      console.error('❌ Kubernetes pod health check failed:', error);
    }
  }

  async checkNodeHealth() {
    try {
      const nodes = await kubernetesService.getNodes();
      
      for (const node of nodes) {
        const previousStatus = this.nodeStatuses.get(node.name);
        
        // Check for node failure
        if (previousStatus && previousStatus.status === 'Ready' && node.status === 'NotReady') {
          console.log(`🚨 Node failure detected: ${node.name}`);
          // Could add node failure alerts here
        }
        
        this.nodeStatuses.set(node.name, {
          status: node.status,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('❌ Kubernetes node health check failed:', error);
    }
  }

  async sendPodFailureAlert(pod, emailGroupId) {
    try {
      const emailSentKey = `${pod.namespace}/${pod.name}/failure`;
      
      // Prevent duplicate emails for the same failure
      if (this.emailSentStatus.has(emailSentKey)) {
        return;
      }

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group for Kubernetes alerts');
        return false;
      }

      const currentTime = new Date();
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: `☸️ KUBERNETES ALERT: Pod Failed - ${pod.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES ALERT</h1>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #dc3545;">
              <h2 style="color: #dc3545; margin-top: 0;">Pod Status: FAILED</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; width: 30%;">Pod Name:</td>
                  <td style="padding: 8px;">${pod.name}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Namespace:</td>
                  <td style="padding: 8px;">${pod.namespace}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Status:</td>
                  <td style="padding: 8px; color: #dc3545;">🔴 FAILED</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Node:</td>
                  <td style="padding: 8px;">${pod.node || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Alert Time:</td>
                  <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Restart Count:</td>
                  <td style="padding: 8px;">${pod.restarts || 0}</td>
                </tr>
              </table>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #856404;">⚠️ ACTION REQUIRED</h3>
                <ul style="color: #856404; margin: 10px 0;">
                  <li>Check pod logs: <code>kubectl logs ${pod.name} -n ${pod.namespace}</code></li>
                  <li>Describe pod: <code>kubectl describe pod ${pod.name} -n ${pod.namespace}</code></li>
                  <li>Verify resource availability in the cluster</li>
                  <li>Check cluster node health</li>
                  <li>Review deployment configuration</li>
                </ul>
              </div>
            </div>
            
            <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
              <p style="margin: 0;">This alert was sent to: ${targetGroup.name}</p>
              <p style="margin: 5px 0 0 0;">Monitor your Kubernetes cluster for additional issues</p>
            </div>
          </div>
        `
      };

      await emailService.transporter.sendMail(mailOptions);
      
      // Mark email as sent to prevent duplicates
      this.emailSentStatus.set(emailSentKey, currentTime);
      
      console.log('📧 ✅ Kubernetes pod failure alert sent successfully');
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send Kubernetes alert:', error);
      return false;
    }
  }

  async sendPodRecoveryAlert(pod, emailGroupId) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        return false;
      }

      const currentTime = new Date();
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: `☸️ KUBERNETES RECOVERY: Pod Restored - ${pod.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES RECOVERY</h1>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #28a745;">
              <h2 style="color: #28a745; margin-top: 0;">Pod Status: RUNNING</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; width: 30%;">Pod Name:</td>
                  <td style="padding: 8px;">${pod.name}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Namespace:</td>
                  <td style="padding: 8px;">${pod.namespace}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Status:</td>
                  <td style="padding: 8px; color: #28a745;">🟢 RUNNING</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Recovery Time:</td>
                  <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
                </tr>
              </table>
              
              <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #0c5460;">ℹ️ STATUS UPDATE</h3>
                <ul style="color: #0c5460; margin: 10px 0;">
                  <li>Pod has been restored to running state</li>
                  <li>Application should be functioning normally</li>
                  <li>Monitor for any unusual behavior</li>
                </ul>
              </div>
            </div>
          </div>
        `
      };

      await emailService.transporter.sendMail(mailOptions);
      
      // Clear the failure email status since pod recovered
      const emailSentKey = `${pod.namespace}/${pod.name}/failure`;
      this.emailSentStatus.delete(emailSentKey);
      
      console.log('📧 ✅ Kubernetes pod recovery alert sent successfully');
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send Kubernetes recovery alert:', error);
      return false;
    }
  }
}

module.exports = new KubernetesMonitoringService();