// backend/services/kubernetesMonitoringService.js - FIXED VERSION
// Enhanced to detect MTCTL stops and intentional scaling to zero

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
    
    // Batch alert system - ENHANCED with new alert types
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: [],
      stopped: [],     // NEW: For intentional stops (mtctl)
      started: []      // NEW: For intentional starts
    };
    this.alertBatchTimeout = null;
    this.batchDelayMs = 30000; // Wait 30 seconds before sending batch
    
    // Check every 2 minutes
    this.checkFrequency = '*/2 * * * *';
    
    console.log('☸️ Kubernetes Monitoring Service initialized (ENHANCED for MTCTL detection)');
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

    console.log(`☸️ Starting Kubernetes monitoring (ENHANCED with MTCTL detection, checking every 2 minutes)`);
    
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

  async detectMissingWorkloads(currentWorkloads, emailGroupId) {
  const currentKeys = new Set(
    currentWorkloads.map(w => `${w.type}/${w.name}/${w.namespace}`)
  );

  // Check for workloads that existed before but are now missing
  for (const [key, previousWorkload] of this.workloadStatuses) {
    if (!currentKeys.has(key)) {
      // This workload existed before but is now completely gone
      const wasHealthy = previousWorkload.pods && 
                        previousWorkload.pods.filter(p => p.ready && p.status === 'Running').length > 0;
      
      if (wasHealthy) {
        console.log(`🛑 MISSING WORKLOAD detected: ${key} (was healthy, now completely gone - likely MTCTL stop)`);
        
        // Create a synthetic workload object for the alert
        const syntheticWorkload = {
          type: previousWorkload.type,
          name: previousWorkload.name,
          namespace: previousWorkload.namespace,
          pods: [], // No pods now
          readyReplicas: 0,
          desiredReplicas: 0,
          status: 'stopped'
        };
        
        // Add to batch alert with stop reason
        this.addToBatchAlert('stopped', syntheticWorkload, emailGroupId, {
          previousHealthy: previousWorkload.pods ? 
            previousWorkload.pods.filter(p => p.ready && p.status === 'Running').length : 0,
          reason: 'Workload completely removed (likely MTCTL stop or scaling to zero)'
        });
      }
    }
  }
}

 
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

    // CRITICAL: Detect missing workloads BEFORE processing current ones
    await this.detectMissingWorkloads(currentWorkloads, config.emailGroupId);

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

    // Clean up old workload statuses AFTER detecting missing ones
    this.cleanupDeletedWorkloads(currentWorkloads);

  } catch (error) {
    console.error('❌ Workload health check failed:', error);
  }
}

  // FIXED: Enhanced detection logic to catch MTCTL stops
  async detectWorkloadChanges(current, previous, emailGroupId) {
    const workloadKey = `${current.type}/${current.name}/${current.namespace}`;

    // Calculate pod counts
    const currentHealthyPods = current.pods.filter(p => p.ready && p.status === 'Running').length;
    const currentTotalPods = current.pods.length;
    const previousHealthyPods = previous.pods ? previous.pods.filter(p => p.ready && p.status === 'Running').length : 0;
    const previousTotalPods = previous.pods ? previous.pods.length : 0;

    console.log(`🔍 Analyzing ${workloadKey}: ${previousHealthyPods}→${currentHealthyPods} healthy, ${previousTotalPods}→${currentTotalPods} total`);

    // ENHANCED DETECTION LOGIC

    // 1. INTENTIONAL STOP DETECTION (MTCTL case)
    // When all pods go from running to completely gone
    if (previousHealthyPods > 0 && currentTotalPods === 0 && previousTotalPods > 0) {
      console.log(`🛑 INTENTIONAL STOP detected: ${workloadKey} (was ${previousHealthyPods} healthy, now completely stopped)`);
      this.addToBatchAlert('stopped', current, emailGroupId, {
        previousHealthy: previousHealthyPods,
        previousTotal: previousTotalPods,
        reason: 'Intentional stop (likely MTCTL or scaling to zero)'
      });
    }

    // 2. INTENTIONAL START DETECTION  
    // When pods appear from nothing
    else if (previousTotalPods === 0 && currentHealthyPods > 0) {
      console.log(`🚀 INTENTIONAL START detected: ${workloadKey} (started with ${currentHealthyPods} healthy pods)`);
      this.addToBatchAlert('started', current, emailGroupId, {
        currentHealthy: currentHealthyPods,
        currentTotal: currentTotalPods,
        reason: 'Workload started from zero'
      });
    }

    // 3. PARTIAL DEGRADATION (Original logic, but enhanced)
    // Some pods still running but fewer than before
    else if (currentHealthyPods < previousHealthyPods && currentHealthyPods > 0) {
      console.log(`⚠️ DEGRADATION detected: ${workloadKey} (${currentHealthyPods}/${current.desiredReplicas} healthy, was ${previousHealthyPods})`);
      this.addToBatchAlert('degraded', current, emailGroupId, {
        previousHealthy: previousHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Partial pod failure or scaling down'
      });
    }

    // 4. COMPLETE FAILURE (pods exist but none are healthy)
    // Pods are present but all unhealthy
    else if (currentTotalPods > 0 && currentHealthyPods === 0 && previousHealthyPods > 0) {
      console.log(`💥 FAILURE detected: ${workloadKey} (${currentTotalPods} pods present but 0 healthy)`);
      this.addToBatchAlert('failed', current, emailGroupId, {
        previousHealthy: previousHealthyPods,
        currentTotal: currentTotalPods,
        reason: 'All pods unhealthy but deployment still exists'
      });
    }

    // 5. RECOVERY DETECTION
    // More healthy pods than before
    else if (currentHealthyPods > previousHealthyPods) {
      console.log(`✅ RECOVERY detected: ${workloadKey} (${currentHealthyPods} healthy, was ${previousHealthyPods})`);
      this.addToBatchAlert('recovered', current, emailGroupId, {
        previousHealthy: previousHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload recovered or scaled up'
      });
    }

    // 6. STABLE STATE (no significant change)
    else {
      console.log(`✔️ STABLE: ${workloadKey} (${currentHealthyPods} healthy pods, no significant change)`);
    }
  }

  // Enhanced method to collect alerts for batching
  addToBatchAlert(alertType, workload, emailGroupId, metadata = {}) {
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for workload alerts');
      return;
    }

    // Add to pending alerts with enhanced metadata
    this.pendingAlerts[alertType].push({
      workload: workload,
      timestamp: new Date(),
      emailGroupId: emailGroupId,
      metadata: metadata  // Additional context for alert
    });

    console.log(`📝 Added ${alertType.toUpperCase()} alert for ${workload.name} to batch (${this.getTotalPendingAlerts()} total pending)`);

    // Schedule batch send (or reset timer if already scheduled)
    this.scheduleBatchAlert(emailGroupId);
  }

  // Get total pending alerts count - ENHANCED
  getTotalPendingAlerts() {
    return this.pendingAlerts.failed.length + 
           this.pendingAlerts.degraded.length + 
           this.pendingAlerts.recovered.length +
           this.pendingAlerts.stopped.length +    // NEW
           this.pendingAlerts.started.length;     // NEW
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

  // ENHANCED: Send consolidated batch alert with new alert types
  async sendBatchAlert(emailGroupId) {
    try {
      const totalAlerts = this.getTotalPendingAlerts();
      
      if (totalAlerts === 0) {
        console.log('📧 No pending alerts to send');
        return;
      }

      console.log(`📧 Sending ENHANCED batch alert with ${totalAlerts} workload changes...`);

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
      
      console.log(`📧 ✅ ENHANCED batch alert sent successfully with ${totalAlerts} workload changes`);
      
      // Clear pending alerts after successful send
      this.clearPendingAlerts();

    } catch (error) {
      console.error(`📧 ❌ Failed to send batch alert:`, error);
      // Don't clear alerts on failure - they'll be retried next cycle
    }
  }

  // ENHANCED: Generate batch alert subject with new alert types
  getBatchAlertSubject() {
    const failed = this.pendingAlerts.failed.length;
    const degraded = this.pendingAlerts.degraded.length;
    const recovered = this.pendingAlerts.recovered.length;
    const stopped = this.pendingAlerts.stopped.length;    // NEW
    const started = this.pendingAlerts.started.length;    // NEW
    
    // Prioritize alerts by severity
    if (failed > 0) {
      return `🚨 Kubernetes Alert: ${failed} workload${failed > 1 ? 's' : ''} failed, ${degraded} degraded, ${stopped} stopped, ${started} started, ${recovered} recovered`;
    } else if (stopped > 0) {
      return `🛑 Kubernetes Alert: ${stopped} workload${stopped > 1 ? 's' : ''} stopped (MTCTL/scaling), ${degraded} degraded, ${started} started, ${recovered} recovered`;
    } else if (degraded > 0) {
      return `⚠️ Kubernetes Alert: ${degraded} workload${degraded > 1 ? 's' : ''} degraded, ${started} started, ${recovered} recovered`;
    } else if (started > 0) {
      return `🚀 Kubernetes Alert: ${started} workload${started > 1 ? 's' : ''} started, ${recovered} recovered`;
    } else if (recovered > 0) {
      return `✅ Kubernetes Recovery: ${recovered} workload${recovered > 1 ? 's' : ''} recovered`;
    }
    
    return '☸️ Kubernetes Workload Status Update';
  }

  // ENHANCED: Generate batch alert content with new alert types
  getBatchAlertContent(groupName) {
    const now = new Date();
    const failed = this.pendingAlerts.failed;
    const degraded = this.pendingAlerts.degraded;
    const recovered = this.pendingAlerts.recovered;
    const stopped = this.pendingAlerts.stopped;      // NEW
    const started = this.pendingAlerts.started;      // NEW
    
    const totalChanges = failed.length + degraded.length + recovered.length + stopped.length + started.length;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: ${failed.length > 0 ? '#dc3545' : stopped.length > 0 ? '#6f42c1' : degraded.length > 0 ? '#ff7f00' : started.length > 0 ? '#17a2b8' : '#28a745'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES ENHANCED ALERT</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">${totalChanges} workload changes detected</p>
          <p style="margin: 4px 0 0 0; font-size: 14px;">Including MTCTL stops and intentional scaling</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          <h2 style="margin-top: 0; color: #333;">Enhanced Summary</h2>
          <div style="display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap;">
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${failed.length}</div>
              <div style="font-size: 11px; color: #666;">Failed</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #6f42c1;">${stopped.length}</div>
              <div style="font-size: 11px; color: #666;">Stopped</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #ff7f00;">${degraded.length}</div>
              <div style="font-size: 11px; color: #666;">Degraded</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #17a2b8;">${started.length}</div>
              <div style="font-size: 11px; color: #666;">Started</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #28a745;">${recovered.length}</div>
              <div style="font-size: 11px; color: #666;">Recovered</div>
            </div>
          </div>

          ${this.generateAlertSection('🚨 Failed Workloads', failed, '#dc3545')}
          ${this.generateAlertSection('🛑 Stopped Workloads (MTCTL/Scaling)', stopped, '#6f42c1')}
          ${this.generateAlertSection('⚠️ Degraded Workloads', degraded, '#ff7f00')}
          ${this.generateAlertSection('🚀 Started Workloads', started, '#17a2b8')}
          ${this.generateAlertSection('✅ Recovered Workloads', recovered, '#28a745')}

          <div style="background-color: ${stopped.length > 0 ? '#e7e3ff' : '#fff3cd'}; border: 1px solid ${stopped.length > 0 ? '#b794f6' : '#ffeaa7'}; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: ${stopped.length > 0 ? '#553c9a' : '#856404'};">📋 Recommended Actions</h3>
            <ul style="color: ${stopped.length > 0 ? '#553c9a' : '#856404'}; margin: 10px 0;">
              ${failed.length > 0 ? '<li><strong>Failed workloads:</strong> Check logs and restart immediately</li>' : ''}
              ${stopped.length > 0 ? '<li><strong>Stopped workloads:</strong> Intentional stop detected (MTCTL or scaling). Restart when ready or verify this was planned</li>' : ''}
              ${degraded.length > 0 ? '<li><strong>Degraded workloads:</strong> Monitor for auto-recovery or manual intervention</li>' : ''}
              ${started.length > 0 ? '<li><strong>Started workloads:</strong> Monitor startup progress and verify functionality</li>' : ''}
              ${recovered.length > 0 ? '<li><strong>Recovered workloads:</strong> Verify functionality and monitor stability</li>' : ''}
              <li>Access your monitoring dashboard for real-time status</li>
              <li>Use kubectl or MTCTL for manual intervention if needed</li>
            </ul>
          </div>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Enhanced alert sent to: ${groupName}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${now.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Kubernetes Enhanced Workload Monitoring System v2.0</p>
          <p style="margin: 5px 0 0 0;">Now detecting MTCTL stops and intentional scaling events</p>
        </div>
      </div>
    `;
  }

  // ENHANCED: Generate section for each alert type with metadata
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
              <th style="padding: 12px; text-align: left;">Reason</th>
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
                    ${alert.workload.status ? alert.workload.status.toUpperCase() : 'UNKNOWN'}
                  </span>
                </td>
                <td style="padding: 12px;">${alert.workload.readyReplicas || 0}/${alert.workload.desiredReplicas || 0}</td>
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.metadata.reason || 'Status change detected'}</td>
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.timestamp.toLocaleTimeString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Clear pending alerts - ENHANCED
  clearPendingAlerts() {
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: [],
      stopped: [],     // NEW
      started: []      // NEW
    };
    
    if (this.alertBatchTimeout) {
      clearTimeout(this.alertBatchTimeout);
      this.alertBatchTimeout = null;
    }
    
    console.log('🗑️ Cleared all pending alerts (including new stop/start alerts)');
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