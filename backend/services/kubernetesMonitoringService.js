// backend/services/kubernetesMonitoringService.js - Enhanced Workload Monitoring with Batch Alerts
const cron = require('node-cron');
const emailService = require('./emailService');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');

class KubernetesMonitoringService {
  constructor() {
    // Replace pod tracking with workload tracking
    this.workloadStatuses = new Map(); // Track workloads instead of individual pods
    this.nodeStatuses = new Map();
    this.emailSentStatus = new Map();
    this.isMonitoring = false;
    this.checkInterval = null;
    
    // Batch alert system
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: []
    };
    this.alertBatchTimeout = null;
    this.batchDelayMs = 30000; // Wait 30 seconds before sending batch
    
    // Check every 2 minutes
    this.checkFrequency = '*/2 * * * *';
    
    console.log('☸️ Kubernetes Monitoring Service initialized (Workload-based with Batch Alerts)');
  }

  // Keep existing method signatures for compatibility
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

    console.log(`☸️ Starting Kubernetes monitoring (workload-based with batch alerts, checking every 2 minutes)`);
    
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkPodHealth(); // Keep method name but change implementation
      await this.checkNodeHealth();
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;

    // Perform initial check
    setTimeout(() => {
      this.checkPodHealth();
      this.checkNodeHealth();
    }, 5000);

    return true;
  }

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
    
    // Clear any pending batch alerts
    this.clearPendingAlerts();
    
    this.isMonitoring = false;
    return true;
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      podCount: this.getTotalPodCount(), // Calculate from workloads
      nodeCount: this.nodeStatuses.size,
      workloadCount: this.workloadStatuses.size,
      pendingAlerts: this.getTotalPendingAlerts(),
      lastCheck: new Date()
    };
  }

  getTotalPodCount() {
    let totalPods = 0;
    for (const [key, workload] of this.workloadStatuses) {
      if (workload.pods) {
        totalPods += workload.pods.length;
      }
    }
    return totalPods;
  }

  // Enhanced checkPodHealth - now monitors workloads
  async checkPodHealth() {
    try {
      console.log('☸️ Checking Kubernetes workload health...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping workload health check');
        return;
      }

      // Get current workload status using enhanced kubernetesService
      const currentWorkloads = await this.getWorkloadStatus();
      
      console.log(`✅ Retrieved ${currentWorkloads.length} workloads from cluster`);

      // Compare with previous state and detect changes
      for (const workload of currentWorkloads) {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        const previousStatus = this.workloadStatuses.get(workloadKey);
        
        // Store current status
        this.workloadStatuses.set(workloadKey, {
          ...workload,
          lastSeen: new Date()
        });

        // Check for status changes
        if (previousStatus) {
          await this.detectWorkloadChanges(workload, previousStatus, config.emailGroupId);
        } else {
          console.log(`🆕 New workload detected: ${workloadKey}`);
        }
      }

      // Clean up old workload statuses
      this.cleanupDeletedWorkloads(currentWorkloads);

    } catch (error) {
      console.error('❌ Workload health check failed:', error);
    }
  }

  // Get comprehensive workload status
  async getWorkloadStatus() {
    try {
      // Get all pods first
      const pods = await kubernetesService.getAllPods();
      
      // Group pods by their owner (deployment/statefulset/etc)
      const workloads = this.groupPodsByWorkload(pods);
      
      return workloads;
    } catch (error) {
      console.error('Failed to get workload status:', error);
      return [];
    }
  }

  // Group pods by their controlling workload
  groupPodsByWorkload(pods) {
    const workloadMap = new Map();

    pods.forEach(pod => {
      const workloadInfo = this.extractWorkloadInfo(pod);
      
      if (!workloadMap.has(workloadInfo.key)) {
        workloadMap.set(workloadInfo.key, {
          type: workloadInfo.type,
          name: workloadInfo.name,
          namespace: workloadInfo.namespace,
          pods: [],
          desiredReplicas: 0, // Will be calculated
          readyReplicas: 0,
          status: 'unknown'
        });
      }

      const workload = workloadMap.get(workloadInfo.key);
      workload.pods.push({
        name: pod.name,
        status: pod.status,
        ready: pod.ready,
        restarts: pod.restarts,
        age: pod.age,
        node: pod.node
      });

      // Count ready replicas
      if (pod.ready && pod.status === 'Running') {
        workload.readyReplicas++;
      }
    });

    // Convert map to array and calculate health
    return Array.from(workloadMap.values()).map(workload => {
      workload.desiredReplicas = workload.pods.length; // For now, assume current count is desired
      workload.status = this.calculateWorkloadHealth(workload);
      return workload;
    });
  }

  // Extract workload information from pod name and labels
  extractWorkloadInfo(pod) {
    // Handle different pod naming patterns
    let workloadName = pod.name;
    let workloadType = 'Pod'; // Default for standalone pods

    // Pattern: deployment-name-replicaset-hash-pod-hash
    if (pod.name.includes('-')) {
      const parts = pod.name.split('-');
      if (parts.length >= 3) {
        // Remove last 2 parts (replicaset hash + pod hash)
        workloadName = parts.slice(0, -2).join('-');
        workloadType = 'Deployment';
      }
    }

    const key = `${workloadType}/${workloadName}/${pod.namespace}`;
    
    return {
      key,
      type: workloadType,
      name: workloadName,
      namespace: pod.namespace
    };
  }

  calculateWorkloadHealth(workload) {
    const totalPods = workload.pods.length;
    const readyPods = workload.readyReplicas;
    const runningPods = workload.pods.filter(p => p.status === 'Running').length;

    if (readyPods === 0 && totalPods > 0) return 'critical';
    if (readyPods < totalPods * 0.5) return 'degraded';
    if (runningPods < totalPods) return 'warning';
    return 'healthy';
  }

  async detectWorkloadChanges(current, previous, emailGroupId) {
    const workloadKey = `${current.type}/${current.name}/${current.namespace}`;

    // Only alert on significant changes, not normal pod restarts
    const currentHealthyPods = current.pods.filter(p => p.ready && p.status === 'Running').length;
    const previousHealthyPods = previous.pods ? previous.pods.filter(p => p.ready && p.status === 'Running').length : 0;

    // Collect alerts instead of sending immediately
    if (currentHealthyPods < previousHealthyPods && currentHealthyPods < current.desiredReplicas) {
      console.log(`🚨 Workload degraded: ${workloadKey} (${currentHealthyPods}/${current.desiredReplicas} healthy)`);
      this.addToBatchAlert('degraded', current, emailGroupId);
    }

    if (currentHealthyPods === 0 && current.desiredReplicas > 0 && previousHealthyPods > 0) {
      console.log(`💥 Workload failed: ${workloadKey}`);
      this.addToBatchAlert('failed', current, emailGroupId);
    }

    if (currentHealthyPods === current.desiredReplicas && previousHealthyPods < previous.desiredReplicas) {
      console.log(`✅ Workload recovered: ${workloadKey}`);
      this.addToBatchAlert('recovered', current, emailGroupId);
    }
  }

  // New method to collect alerts for batching
  addToBatchAlert(alertType, workload, emailGroupId) {
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for workload alerts');
      return;
    }

    // Add to pending alerts
    this.pendingAlerts[alertType].push({
      workload: workload,
      timestamp: new Date(),
      emailGroupId: emailGroupId
    });

    console.log(`📝 Added ${alertType} alert for ${workload.name} to batch (${this.getTotalPendingAlerts()} total pending)`);

    // Schedule batch send (or reset timer if already scheduled)
    this.scheduleBatchAlert(emailGroupId);
  }

  // Get total pending alerts count
  getTotalPendingAlerts() {
    return this.pendingAlerts.failed.length + 
           this.pendingAlerts.degraded.length + 
           this.pendingAlerts.recovered.length;
  }

  // Schedule batch alert sending
  scheduleBatchAlert(emailGroupId) {
    // Clear existing timeout
    if (this.alertBatchTimeout) {
      clearTimeout(this.alertBatchTimeout);
    }

    // Schedule new batch send
    this.alertBatchTimeout = setTimeout(async () => {
      await this.sendBatchAlert(emailGroupId);
    }, this.batchDelayMs);

    console.log(`⏰ Batch alert scheduled to send in ${this.batchDelayMs/1000} seconds`);
  }

  // Send consolidated batch alert
  async sendBatchAlert(emailGroupId) {
    try {
      const totalAlerts = this.getTotalPendingAlerts();
      
      if (totalAlerts === 0) {
        console.log('📧 No pending alerts to send');
        return;
      }

      console.log(`📧 Sending batch alert with ${totalAlerts} workload changes...`);

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group found for batch alerts');
        this.clearPendingAlerts();
        return;
      }

      const subject = this.getBatchAlertSubject();
      const htmlContent = this.getBatchAlertContent(targetGroup.name);

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: subject,
        html: htmlContent
      };

      await emailService.transporter.sendMail(mailOptions);
      
      console.log(`📧 ✅ Batch alert sent successfully with ${totalAlerts} workload changes`);
      
      // Clear pending alerts after successful send
      this.clearPendingAlerts();

    } catch (error) {
      console.error(`📧 ❌ Failed to send batch alert:`, error);
      // Don't clear alerts on failure - they'll be retried next cycle
    }
  }

  // Generate batch alert subject
  getBatchAlertSubject() {
    const failed = this.pendingAlerts.failed.length;
    const degraded = this.pendingAlerts.degraded.length;
    const recovered = this.pendingAlerts.recovered.length;
    
    if (failed > 0) {
      return `🚨 Kubernetes Alert: ${failed} workload${failed > 1 ? 's' : ''} failed, ${degraded} degraded, ${recovered} recovered`;
    } else if (degraded > 0) {
      return `⚠️ Kubernetes Alert: ${degraded} workload${degraded > 1 ? 's' : ''} degraded, ${recovered} recovered`;
    } else if (recovered > 0) {
      return `✅ Kubernetes Recovery: ${recovered} workload${recovered > 1 ? 's' : ''} recovered`;
    }
    
    return '☸️ Kubernetes Workload Status Update';
  }

  // Generate batch alert content
  getBatchAlertContent(groupName) {
    const now = new Date();
    const failed = this.pendingAlerts.failed;
    const degraded = this.pendingAlerts.degraded;
    const recovered = this.pendingAlerts.recovered;
    
    const totalChanges = failed.length + degraded.length + recovered.length;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: ${failed.length > 0 ? '#dc3545' : degraded.length > 0 ? '#ff7f00' : '#28a745'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES BATCH ALERT</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">${totalChanges} workload changes detected</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          <h2 style="margin-top: 0; color: #333;">Summary</h2>
          <div style="display: flex; justify-content: space-around; margin: 20px 0;">
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
              <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${failed.length}</div>
              <div style="font-size: 12px; color: #666;">Failed</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
              <div style="font-size: 24px; font-weight: bold; color: #ff7f00;">${degraded.length}</div>
              <div style="font-size: 12px; color: #666;">Degraded</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
              <div style="font-size: 24px; font-weight: bold; color: #28a745;">${recovered.length}</div>
              <div style="font-size: 12px; color: #666;">Recovered</div>
            </div>
          </div>

          ${this.generateAlertSection('🚨 Failed Workloads', failed, '#dc3545')}
          ${this.generateAlertSection('⚠️ Degraded Workloads', degraded, '#ff7f00')}
          ${this.generateAlertSection('✅ Recovered Workloads', recovered, '#28a745')}

          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #856404;">📋 Recommended Actions</h3>
            <ul style="color: #856404; margin: 10px 0;">
              ${failed.length > 0 ? '<li><strong>Failed workloads:</strong> Check logs and restart if necessary</li>' : ''}
              ${degraded.length > 0 ? '<li><strong>Degraded workloads:</strong> Monitor for auto-recovery or manual intervention</li>' : ''}
              ${recovered.length > 0 ? '<li><strong>Recovered workloads:</strong> Verify functionality and monitor stability</li>' : ''}
              <li>Access your monitoring dashboard for real-time status</li>
              <li>Use kubectl or MTCTL for manual intervention if needed</li>
            </ul>
          </div>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Alert sent to: ${groupName}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${now.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Kubernetes Workload Monitoring System</p>
        </div>
      </div>
    `;
  }

  // Generate section for each alert type
  generateAlertSection(title, alerts, color) {
    if (alerts.length === 0) return '';

    return `
      <div style="margin: 20px 0;">
        <h3 style="color: ${color}; margin-bottom: 15px;">${title}</h3>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: ${color}; color: white;">
              <th style="padding: 12px; text-align: left;">Workload</th>
              <th style="padding: 12px; text-align: left;">Namespace</th>
              <th style="padding: 12px; text-align: left;">Status</th>
              <th style="padding: 12px; text-align: left;">Pods</th>
              <th style="padding: 12px; text-align: left;">Time</th>
            </tr>
          </thead>
          <tbody>
            ${alerts.map((alert, index) => `
              <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                <td style="padding: 12px; font-weight: bold;">${alert.workload.name}</td>
                <td style="padding: 12px;">${alert.workload.namespace}</td>
                <td style="padding: 12px;">
                  <span style="background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                    ${alert.workload.status.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 12px;">${alert.workload.readyReplicas}/${alert.workload.desiredReplicas}</td>
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.timestamp.toLocaleTimeString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Clear pending alerts
  clearPendingAlerts() {
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: []
    };
    
    if (this.alertBatchTimeout) {
      clearTimeout(this.alertBatchTimeout);
      this.alertBatchTimeout = null;
    }
    
    console.log('🗑️ Cleared all pending alerts');
  }

  cleanupDeletedWorkloads(currentWorkloads) {
    const currentKeys = new Set(
      currentWorkloads.map(w => `${w.type}/${w.name}/${w.namespace}`)
    );

    for (const [key] of this.workloadStatuses) {
      if (!currentKeys.has(key)) {
        console.log(`🗑️ Cleaning up deleted workload: ${key}`);
        this.workloadStatuses.delete(key);
      }
    }
  }

  // Keep existing checkNodeHealth method
  async checkNodeHealth() {
    try {
      console.log('☸️ Checking Kubernetes node health...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping node health check');
        return;
      }

      const nodes = await kubernetesService.getNodes();
      
      nodes.forEach(node => {
        const nodeKey = `node/${node.name}`;
        const previousStatus = this.nodeStatuses.get(nodeKey);
        
        if (previousStatus && previousStatus.status !== node.status) {
          console.log(`🖥️ Node status changed: ${node.name} ${previousStatus.status} → ${node.status}`);
          // Could send node alerts here if needed
        }
        
        this.nodeStatuses.set(nodeKey, {
          name: node.name,
          status: node.status,
          lastSeen: new Date()
        });
      });

      console.log(`✅ Node health check completed - ${nodes.length} nodes checked`);

    } catch (error) {
      console.error('❌ Node health check failed:', error);
    }
  }
}

module.exports = new KubernetesMonitoringService();