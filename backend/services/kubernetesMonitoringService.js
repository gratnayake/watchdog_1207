// backend/services/kubernetesMonitoringService.js - Enhanced Workload Monitoring
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
    
    // Check every 2 minutes
    this.checkFrequency = '*/2 * * * *';
    
    console.log('☸️ Kubernetes Monitoring Service initialized (Workload-based)');
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

    console.log(`☸️ Starting Kubernetes monitoring (workload-based, checking every 2 minutes)`);
    
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
    
    this.isMonitoring = false;
    return true;
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      podCount: this.getTotalPodCount(), // Calculate from workloads
      nodeCount: this.nodeStatuses.size,
      workloadCount: this.workloadStatuses.size,
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

    // Alert only if healthy pod count drops significantly
    if (currentHealthyPods < previousHealthyPods && currentHealthyPods < current.desiredReplicas) {
      console.log(`🚨 Workload degraded: ${workloadKey} (${currentHealthyPods}/${current.desiredReplicas} healthy)`);
      await this.sendWorkloadAlert(current, 'degraded', emailGroupId);
    }

    // Alert on complete failures
    if (currentHealthyPods === 0 && current.desiredReplicas > 0 && previousHealthyPods > 0) {
      console.log(`💥 Workload failed: ${workloadKey}`);
      await this.sendWorkloadAlert(current, 'failed', emailGroupId);
    }

    // Alert on recovery
    if (currentHealthyPods === current.desiredReplicas && previousHealthyPods < previous.desiredReplicas) {
      console.log(`✅ Workload recovered: ${workloadKey}`);
      await this.sendWorkloadAlert(current, 'recovered', emailGroupId);
    }
  }

  async sendWorkloadAlert(workload, alertType, emailGroupId) {
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for workload alerts');
      return false;
    }

    const alertKey = `${workload.type}/${workload.name}/${workload.namespace}/${alertType}`;
    const now = new Date();
    const lastAlert = this.emailSentStatus.get(alertKey);

    // Prevent duplicate alerts within 10 minutes
    if (lastAlert && (now - lastAlert) < 10 * 60 * 1000) {
      return false;
    }

    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group found for workload alerts');
        return false;
      }

      const subject = this.getAlertSubject(workload, alertType);
      const htmlContent = this.getAlertContent(workload, alertType, targetGroup.name);

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: subject,
        html: htmlContent
      };

      await emailService.transporter.sendMail(mailOptions);
      this.emailSentStatus.set(alertKey, now);
      
      console.log(`📧 ✅ Workload ${alertType} alert sent for ${workload.name}`);
      return true;

    } catch (error) {
      console.error(`📧 ❌ Failed to send workload alert:`, error);
      return false;
    }
  }

  getAlertSubject(workload, alertType) {
    const typeEmoji = {
      'degraded': '⚠️',
      'failed': '🚨',
      'recovered': '✅'
    };

    return `${typeEmoji[alertType]} Kubernetes ${workload.type}: ${workload.name} ${alertType.toUpperCase()}`;
  }

  getAlertContent(workload, alertType, groupName) {
    const statusColor = {
      'degraded': '#ff7f00',
      'failed': '#dc3545',
      'recovered': '#28a745'
    };

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${statusColor[alertType]}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES WORKLOAD ALERT</h1>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid ${statusColor[alertType]};">
          <h2 style="color: ${statusColor[alertType]}; margin-top: 0;">${workload.type}: ${alertType.toUpperCase()}</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 30%;">Workload:</td>
              <td style="padding: 8px;">${workload.type}/${workload.name}</td>
            </tr>
            <tr style="background-color: #ffffff;">
              <td style="padding: 8px; font-weight: bold;">Namespace:</td>
              <td style="padding: 8px;">${workload.namespace}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Status:</td>
              <td style="padding: 8px; color: ${statusColor[alertType]};">${workload.status.toUpperCase()}</td>
            </tr>
            <tr style="background-color: #ffffff;">
              <td style="padding: 8px; font-weight: bold;">Healthy Pods:</td>
              <td style="padding: 8px;">${workload.readyReplicas}/${workload.desiredReplicas}</td>
            </tr>
          </table>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #856404;">📋 Pod Details</h3>
            <ul style="color: #856404; margin: 10px 0;">
              ${workload.pods.map(pod => 
                `<li><strong>${pod.name}:</strong> ${pod.status} (${pod.ready ? 'Ready' : 'Not Ready'}) - ${pod.restarts} restarts</li>`
              ).join('')}
            </ul>
          </div>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Alert sent to: ${groupName}</p>
          <p style="margin: 5px 0 0 0;">Kubernetes Workload Monitoring System</p>
        </div>
      </div>
    `;
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