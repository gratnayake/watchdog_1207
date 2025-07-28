// backend/services/kubernetesMonitoringService.js - COMPLETE ENHANCED VERSION
// Enhanced Workload Monitoring with Comprehensive Status Alerts

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
    
    
    this.isInitialized = false;
    this.initializationComplete = false;
    
    
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: [],
      stopped: [],     // For intentional stops (mtctl)
      started: []      // For intentional starts
    };
    this.alertBatchTimeout = null;
    this.batchDelayMs = 30000; // Wait 30 seconds before sending batch
    
    // Check every 2 minutes
    this.checkFrequency = '*/2 * * * *';
    
    console.log('☸️ Kubernetes Monitoring Service initialized (Enhanced with Comprehensive Alerts)');
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

    console.log(`☸️ Starting Kubernetes monitoring with baseline detection...`);
    
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkPodHealth();
      await this.checkNodeHealth();
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;

    // ENHANCED: Perform baseline initialization
    setTimeout(async () => {
      await this.performBaselineInitialization();
    }, 5000);

    return true;
  }

  async performBaselineInitialization() {
    try {
      console.log('🎯 Performing baseline initialization...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping baseline initialization');
        return;
      }

      // Get initial workload status
      const initialWorkloads = await this.getWorkloadStatus();
      
      console.log(`📊 Baseline: Found ${initialWorkloads.length} workloads`);

      // Store initial state without triggering alerts
      for (const workload of initialWorkloads) {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        
        this.workloadStatuses.set(workloadKey, {
          ...workload,
          lastSeen: new Date(),
          isBaseline: true  // Mark as baseline data
        });

        // Log baseline status for transparency
        const healthyPods = workload.pods.filter(p => p.ready && p.status === 'Running').length;
        const totalPods = workload.pods.length;
        
        console.log(`📋 Baseline: ${workloadKey} - ${healthyPods}/${totalPods} healthy - Status: ${workload.status}`);
      }

      // Mark initialization as complete after a grace period
      setTimeout(() => {
        this.initializationComplete = true;
        console.log('✅ Baseline initialization complete - monitoring active for changes only');
      }, 60000); // 1 minute grace period

      console.log('🎯 Baseline captured - will monitor for changes after 1 minute grace period');

    } catch (error) {
      console.error('❌ Baseline initialization failed:', error);
      // Continue monitoring anyway
      this.initializationComplete = true;
    }
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
      initializationComplete: this.initializationComplete,
      podCount: this.getTotalPodCount(),
      nodeCount: this.nodeStatuses.size,
      workloadCount: this.workloadStatuses.size,
      pendingAlerts: this.getTotalPendingAlerts(),
      lastCheck: new Date(),
      baselineWorkloads: Array.from(this.workloadStatuses.values()).filter(w => w.isBaseline).length
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

  resetMonitoringState() {
    console.log('🔄 Resetting Kubernetes monitoring state...');
    
    // Clear all cached workload statuses
    this.workloadStatuses.clear();
    
    // Clear all cached node statuses
    this.nodeStatuses.clear();
    
    // Clear all email sent statuses
    this.emailSentStatus.clear();
    
    // Clear any pending alerts
    this.clearPendingAlerts();
    
    console.log('✅ Monitoring state reset complete - fresh start');
  }

  async performBaselineCheck() {
    try {
      console.log('📊 Performing baseline health check (no alerts)...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping baseline check');
        return;
      }

      // Get current workload status
      const currentWorkloads = await this.getWorkloadStatus();
      
      // Store as baseline without triggering alerts
      for (const workload of currentWorkloads) {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        
        this.workloadStatuses.set(workloadKey, {
          ...workload,
          lastSeen: new Date(),
          isBaseline: true // Mark as baseline
        });
        
        console.log(`📋 Baseline: ${workloadKey} = ${workload.status} (${workload.readyReplicas}/${workload.desiredReplicas})`);
      }

      console.log(`✅ Baseline established for ${currentWorkloads.length} workloads`);

    } catch (error) {
      console.error('❌ Baseline check failed:', error);
    }
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

    // Get current workload status with filtering
    const currentWorkloads = await this.getWorkloadStatusWithInitialFilter();
    
    console.log(`✅ Retrieved ${currentWorkloads.length} workloads from cluster (unhealthy excluded from initial snapshot)`);

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
        console.log(`🆕 New healthy workload detected: ${workloadKey} (${workload.readyReplicas}/${workload.desiredReplicas})`);
      }
    }

    // Clean up old workload statuses
    this.cleanupDeletedWorkloads(currentWorkloads);

  } catch (error) {
    console.error('❌ Workload health check failed:', error);
  }
}

async getWorkloadStatusWithInitialFilter() {
  try {
    // Get all pods first
    const allPods = await kubernetesService.getAllPods();
    
    // Filter out unhealthy pods if this is initial startup
    const isInitialStartup = this.workloadStatuses.size === 0;
    let filteredPods = allPods;
    
    if (isInitialStartup) {
      console.log(`🔍 Initial startup detected - filtering unhealthy pods from snapshot`);
      
      const originalCount = allPods.length;
      
      filteredPods = allPods.filter(pod => {
        // ALWAYS exclude deleted pods
        if (pod.isDeleted) {
          console.log(`🗑️ Excluding deleted pod: ${pod.namespace}/${pod.name}`);
          return false;
        }
        
        // EXCLUDE pods that are not fully ready
        const isFullyReady = pod.ready && pod.status === 'Running';
        
        if (!isFullyReady) {
          console.log(`❌ Excluding unhealthy pod from initial snapshot: ${pod.namespace}/${pod.name} (Status: ${pod.status}, Ready: ${pod.ready})`);
          return false;
        }
        
        // INCLUDE healthy pods
        console.log(`✅ Including healthy pod in initial snapshot: ${pod.namespace}/${pod.name}`);
        return true;
      });
      
      const excludedCount = originalCount - filteredPods.length;
      console.log(`📊 Initial snapshot: ${filteredPods.length} healthy pods included, ${excludedCount} unhealthy pods excluded`);
    } else {
      // After initial startup, monitor all pods (but still exclude deleted ones)
      filteredPods = allPods.filter(pod => {
        if (pod.isDeleted) {
          return false; // Always exclude deleted pods
        }
        return true;
      });
      
      console.log(`📊 Regular monitoring: tracking ${filteredPods.length} pods (${allPods.length - filteredPods.length} deleted pods excluded)`);
    }
    
    // Group filtered pods by their owner (deployment/statefulset/etc)
    const workloads = this.groupPodsByWorkload(filteredPods);
    
    return workloads;
  } catch (error) {
    console.error('Failed to get filtered workload status:', error);
    return [];
  }
}

async handleInitialWorkloadDetection(workload, emailGroupId) {
  const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
  
  // Check if workload is healthy (all pods ready)
  const isHealthy = workload.readyReplicas === workload.desiredReplicas && workload.readyReplicas > 0;
  
  console.log(`🆕 Initial workload detection: ${workloadKey}`);
  console.log(`   Status: ${workload.status} (${workload.readyReplicas}/${workload.desiredReplicas})`);
  console.log(`   Is Healthy: ${isHealthy}`);
  
  if (isHealthy) {
    // Workload is healthy - add to monitoring normally
    console.log(`✅ Adding healthy workload to monitoring: ${workloadKey}`);
  } else {
    // Workload is unhealthy - add but mark as "ignored_initial"
    console.log(`⚠️ Ignoring unhealthy workload in initial snapshot: ${workloadKey}`);
    console.log(`   Reason: Only ${workload.readyReplicas}/${workload.desiredReplicas} pods ready`);
    
    // Mark this workload as initially unhealthy so we don't alert on its recovery
    const enhancedWorkload = {
      ...workload,
      lastSeen: new Date(),
      ignoredInitial: true, // Mark as ignored in initial snapshot
      initialState: 'unhealthy',
      initialDetectionTime: new Date()
    };
    
    this.workloadStatuses.set(workloadKey, enhancedWorkload);
    
    // Don't send any alerts for initially unhealthy workloads
    return;
  }
}

   async detectSignificantChangesFromBaseline(current, baseline, emailGroupId) {
    const workloadKey = `${current.type}/${current.name}/${current.namespace}`;

    const currentHealthyPods = current.pods.filter(p => p.ready && p.status === 'Running').length;
    const baselineHealthyPods = baseline.pods ? baseline.pods.filter(p => p.ready && p.status === 'Running').length : 0;

    console.log(`🔍 Baseline check: ${workloadKey} - Baseline: ${baselineHealthyPods} → Current: ${currentHealthyPods}`);

    // Only alert if there's a SIGNIFICANT improvement from a bad baseline state
    // Don't alert for existing problems or minor changes
    
    if (baselineHealthyPods === 0 && currentHealthyPods > 0) {
      console.log(`✅ RECOVERY from baseline: ${workloadKey} (was 0 healthy, now ${currentHealthyPods} healthy)`);
      this.addToBatchAlert('recovered', current, emailGroupId, {
        previousHealthy: baselineHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload recovered from baseline failed state'
      });
    } else if (currentHealthyPods > baselineHealthyPods && baselineHealthyPods > 0) {
      console.log(`✅ IMPROVEMENT from baseline: ${workloadKey} (${baselineHealthyPods} → ${currentHealthyPods} healthy)`);
      this.addToBatchAlert('recovered', current, emailGroupId, {
        previousHealthy: baselineHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload improved from baseline state'
      });
    } else if (currentHealthyPods < baselineHealthyPods) {
      console.log(`⚠️ DEGRADATION from baseline: ${workloadKey} (${baselineHealthyPods} → ${currentHealthyPods} healthy)`);
      this.addToBatchAlert('degraded', current, emailGroupId, {
        previousHealthy: baselineHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload degraded from baseline state'
      });
    } else {
      console.log(`📊 STABLE from baseline: ${workloadKey} (${currentHealthyPods} healthy, no significant change)`);
      // Don't alert for stable states, even if they're in a failed condition
      // This prevents false alarms for workloads that were already broken
    }
  }
  // NEW: Detect missing workloads before cleanup
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

  // ENHANCED: Detection logic to catch MTCTL stops and more
 async detectWorkloadChanges(current, previous, emailGroupId) {
  const workloadKey = `${current.type}/${current.name}/${current.namespace}`;

  // Get current status
  const currentHealthyPods = current.pods.filter(p => p.ready && p.status === 'Running').length;
  const currentDesiredReplicas = current.desiredReplicas || current.pods.length;
  
  // Get previous status
  const previousHealthyPods = previous.pods ? 
    previous.pods.filter(p => p.ready && p.status === 'Running').length : 0;
  const previousDesiredReplicas = previous.desiredReplicas || previous.pods?.length || 0;

  console.log(`🔍 Workload change check: ${workloadKey}`);
  console.log(`   Current: ${currentHealthyPods}/${currentDesiredReplicas} healthy`);
  console.log(`   Previous: ${previousHealthyPods}/${previousDesiredReplicas} healthy`);

  // SCENARIO 1: Workload degraded (was healthy, now has issues)
  if (currentHealthyPods < currentDesiredReplicas && previousHealthyPods >= previousDesiredReplicas) {
    console.log(`⚠️ Workload DEGRADED: ${workloadKey} (${currentHealthyPods}/${currentDesiredReplicas} healthy)`);
    this.addToBatchAlert('degraded', current, emailGroupId);
    return;
  }

  // SCENARIO 2: Workload completely failed (all pods down)
  if (currentHealthyPods === 0 && previousHealthyPods > 0) {
    console.log(`💥 Workload FAILED: ${workloadKey}`);
    this.addToBatchAlert('failed', current, emailGroupId);
    return;
  }

  // SCENARIO 3: Workload recovered (was degraded, now healthy)
  if (currentHealthyPods === currentDesiredReplicas && previousHealthyPods < previousDesiredReplicas) {
    console.log(`✅ Workload RECOVERED: ${workloadKey} (${currentHealthyPods}/${currentDesiredReplicas} healthy)`);
    this.addToBatchAlert('recovered', current, emailGroupId);
    return;
  }

  // SCENARIO 4: New pods added to existing workload (scaling up)
  if (currentDesiredReplicas > previousDesiredReplicas) {
    console.log(`📈 Workload SCALED UP: ${workloadKey} (${previousDesiredReplicas} → ${currentDesiredReplicas} pods)`);
    // Don't alert on scaling up unless there are failures
    if (currentHealthyPods < currentDesiredReplicas) {
      console.log(`⚠️ Scaling up but some pods failed: ${workloadKey}`);
      this.addToBatchAlert('degraded', current, emailGroupId);
    }
    return;
  }

  // Log no significant change
  console.log(`➡️ No significant change for ${workloadKey}`);
}


  // Enhanced method to collect alerts for batching
  addToBatchAlert(alertType, workload, emailGroupId, reason = 'unknown') {
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for workload alerts');
      return;
    }

    // Add to pending alerts with enhanced context
    this.pendingAlerts[alertType].push({
      workload: workload,
      timestamp: new Date(),
      emailGroupId: emailGroupId,
      reason: reason // Add reason for better email context
    });

    console.log(`📝 Added ${alertType} alert for ${workload.name} to batch (reason: ${reason}) - ${this.getTotalPendingAlerts()} total pending`);

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

  // ENHANCED: Send comprehensive batch alert with full cluster status
  async sendBatchAlert(emailGroupId) {
  try {
    const totalAlerts = this.getTotalPendingAlerts();
    
    if (totalAlerts === 0) {
      console.log('📧 No pending alerts to send');
      return;
    }

    console.log(`📧 Sending batch alert with ${totalAlerts} workload changes...`);

    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) {
      console.log('❌ Email group not found or disabled');
      this.clearPendingAlerts();
      return;
    }

    // Categorize alerts
    const failed = this.pendingAlerts.failed;
    const degraded = this.pendingAlerts.degraded;
    const recovered = this.pendingAlerts.recovered;
    
    // Generate enhanced email with recovery context
    const subject = `☸️ Kubernetes Alert: ${totalAlerts} pod changes detected`;
    const now = new Date();
    const totalChanges = failed.length + degraded.length + recovered.length;

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: ${failed.length > 0 ? 
            '#dc3545' : degraded.length > 0 ? '#ff7f00' : '#28a745'}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES ALERT</h1>
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

            ${this.generateEnhancedAlertSection('🚨 Failed Pods', failed, '#dc3545')}
            ${this.generateEnhancedAlertSection('⚠️ Degraded Pods', degraded, '#ff7f00')}
            ${this.generateEnhancedAlertSection('✅ Recovered Pods', recovered, '#28a745')}

            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">ℹ️ Recovery Context</h3>
              <ul style="color: #0c5460; margin: 10px 0;">
                <li><strong>Initial Recovery:</strong> Pods that were unhealthy when monitoring started</li>
                <li><strong>Normal Recovery:</strong> Pods that failed and then recovered during monitoring</li>
                <li><strong>Monitoring:</strong> Ignores initially unhealthy pods to prevent false alerts</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">Generated at: ${now.toLocaleString()}</p>
          </div>
        </div>
      `
    };

    try {
      await emailService.transporter.sendMail(mailOptions);
      console.log('📧 ✅ Enhanced batch alert sent successfully');
      
      // Clear pending alerts after successful send
      this.clearPendingAlerts();
      
    } catch (error) {
      console.error('📧 ❌ Failed to send batch alert:', error);
    }

  } catch (error) {
    console.error('❌ Batch alert generation failed:', error);
  }
}
generateEnhancedAlertSection(title, alerts, color) {
  if (alerts.length === 0) return '';

  return `
    <div style="margin: 20px 0;">
      <h3 style="color: ${color}; margin-bottom: 15px;">${title}</h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: ${color}; color: white;">
            <th style="padding: 12px; text-align: left;">Workload</th>
            <th style="padding: 12px; text-align: left;">Namespace</th>
            <th style="padding: 12px; text-align: left;">Pods</th>
            <th style="padding: 12px; text-align: left;">Context</th>
            <th style="padding: 12px; text-align: left;">Time</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map((alert, index) => `
            <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
              <td style="padding: 12px; font-weight: bold;">${alert.workload.name}</td>
              <td style="padding: 12px;">${alert.workload.namespace}</td>
              <td style="padding: 12px;">${alert.workload.readyReplicas}/${alert.workload.desiredReplicas}</td>
              <td style="padding: 12px; font-size: 11px;">
                ${alert.reason === 'initial_recovery' ? '🔄 Initial Recovery' : 
                  alert.reason === 'normal_recovery' ? '✅ Normal Recovery' : 
                  alert.reason === 'normal_degradation' ? '⚠️ Degradation' : 
                  alert.reason === 'normal_failure' ? '💥 Failure' : 
                  alert.reason || 'Unknown'}
              </td>
              <td style="padding: 12px; font-size: 11px; color: #666;">${alert.timestamp.toLocaleTimeString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
  // NEW: Generate comprehensive cluster overview
  generateClusterOverview(currentWorkloads) {
    const overview = {
      total: currentWorkloads.length,
      healthy: 0,
      degraded: 0,
      failed: 0,
      unknown: 0,
      byNamespace: {},
      healthyWorkloads: [],
      degradedWorkloads: [],
      failedWorkloads: [],
      unknownWorkloads: []
    };

    currentWorkloads.forEach(workload => {
      // Count by status
      switch (workload.status) {
        case 'healthy':
          overview.healthy++;
          overview.healthyWorkloads.push(workload);
          break;
        case 'degraded':
        case 'warning':
          overview.degraded++;
          overview.degradedWorkloads.push(workload);
          break;
        case 'critical':
          overview.failed++;
          overview.failedWorkloads.push(workload);
          break;
        default:
          overview.unknown++;
          overview.unknownWorkloads.push(workload);
      }

      // Count by namespace
      if (!overview.byNamespace[workload.namespace]) {
        overview.byNamespace[workload.namespace] = {
          total: 0,
          healthy: 0,
          degraded: 0,
          failed: 0
        };
      }
      overview.byNamespace[workload.namespace].total++;
      if (workload.status === 'healthy') overview.byNamespace[workload.namespace].healthy++;
      else if (workload.status === 'degraded' || workload.status === 'warning') overview.byNamespace[workload.namespace].degraded++;
      else if (workload.status === 'critical') overview.byNamespace[workload.namespace].failed++;
    });

    return overview;
  }

  // ENHANCED: Generate comprehensive alert subject
  getComprehensiveAlertSubject(clusterOverview) {
    const failed = this.pendingAlerts.failed.length;
    const degraded = this.pendingAlerts.degraded.length;
    const recovered = this.pendingAlerts.recovered.length;
    const stopped = this.pendingAlerts.stopped?.length || 0;
    const started = this.pendingAlerts.started?.length || 0;
    
    // Include current cluster status in subject
    const clusterHealth = clusterOverview.failed > 0 ? 'CRITICAL' : 
                        clusterOverview.degraded > 0 ? 'DEGRADED' : 'HEALTHY';
    
    if (failed > 0 || clusterOverview.failed > 0) {
      return `🚨 ${clusterHealth}: ${failed} new failures, ${clusterOverview.failed} total failed, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    } else if (stopped > 0) {
      return `🛑 ${clusterHealth}: ${stopped} stopped, ${started} started, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    } else if (degraded > 0 || clusterOverview.degraded > 0) {
      return `⚠️ ${clusterHealth}: ${degraded} new degraded, ${clusterOverview.degraded} total degraded, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    } else if (recovered > 0 || started > 0) {
      return `✅ ${clusterHealth}: ${recovered + started} recovered/started, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    }
    
    return `☸️ ${clusterHealth}: ${clusterOverview.healthy}/${clusterOverview.total} Pods healthy`;
  }

  // ENHANCED: Generate comprehensive alert content with full cluster status
  getComprehensiveAlertContent(groupName, clusterOverview) {
    const now = new Date();
    const failed = this.pendingAlerts.failed;
    const degraded = this.pendingAlerts.degraded;
    const recovered = this.pendingAlerts.recovered;
    const stopped = this.pendingAlerts.stopped || [];
    const started = this.pendingAlerts.started || [];
    
    const totalChanges = failed.length + degraded.length + recovered.length + stopped.length + started.length;
    const overallHealth = clusterOverview.failed > 0 ? 'critical' : 
                         clusterOverview.degraded > 0 ? 'warning' : 'healthy';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
        <!-- Header -->
        <div style="background-color: ${overallHealth === 'critical' ? '#dc3545' : overallHealth === 'warning' ? '#ff7f00' : '#28a745'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES COMPREHENSIVE ALERT</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">${totalChanges} changes detected • Full cluster status included</p>
        </div>
        
        <!-- Cluster Overview Dashboard -->
        <div style="background-color: #f8f9fa; padding: 20px; border-bottom: 3px solid #dee2e6;">
          <h2 style="margin-top: 0; color: #333; text-align: center;">🎯 CURRENT CLUSTER STATUS</h2>
          <div style="display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap;">
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #28a745;">${clusterOverview.healthy}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">HEALTHY</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #ff7f00;">${clusterOverview.degraded}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">DEGRADED</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #dc3545;">${clusterOverview.failed}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">FAILED</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #6c757d;">${clusterOverview.total}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">TOTAL</div>
            </div>
          </div>

          <!-- Namespace Breakdown -->
          <div style="margin-top: 20px;">
            <h3 style="color: #333; margin-bottom: 10px;">📂 By Namespace</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
              ${Object.entries(clusterOverview.byNamespace).map(([namespace, stats]) => `
                <div style="background: white; padding: 10px; border-radius: 6px; border-left: 4px solid ${stats.failed > 0 ? '#dc3545' : stats.degraded > 0 ? '#ff7f00' : '#28a745'}; min-width: 140px;">
                  <div style="font-weight: bold; font-size: 14px; color: #333;">${namespace}</div>
                  <div style="font-size: 12px; color: #666;">
                    ✅ ${stats.healthy} • ⚠️ ${stats.degraded} • ❌ ${stats.failed}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <!-- Changes Section -->
        <div style="background-color: #f8f9fa; padding: 20px;">
          <h2 style="margin-top: 0; color: #333;">📊 Recent Changes (${totalChanges} total)</h2>
          <div style="display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap;">
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${failed.length}</div>
              <div style="font-size: 11px; color: #666;">New Failed</div>
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

          ${this.generateAlertSection('🚨 New Failures', failed, '#dc3545')}
          ${this.generateAlertSection('🛑 Stopped Pods', stopped, '#6f42c1')}
          ${this.generateAlertSection('⚠️ New Degraded', degraded, '#ff7f00')}
          ${this.generateAlertSection('🚀 Started Pods', started, '#17a2b8')}
          ${this.generateAlertSection('✅ Recovered Pods', recovered, '#28a745')}

          <!-- Current Status Sections -->
          ${this.generateCurrentStatusSection('❌ Currently Failed Pods', clusterOverview.failedWorkloads, '#dc3545')}
          ${this.generateCurrentStatusSection('⚠️ Currently Degraded Pods', clusterOverview.degradedWorkloads, '#ff7f00')}
          ${this.generateCurrentStatusSection('✅ Currently Healthy Pods', clusterOverview.healthyWorkloads, '#28a745')}

          <div style="background-color: ${overallHealth === 'critical' ? '#f8d7da' : overallHealth === 'warning' ? '#fff3cd' : '#d4edda'}; border: 1px solid ${overallHealth === 'critical' ? '#f5c6cb' : overallHealth === 'warning' ? '#ffeaa7' : '#c3e6cb'}; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: ${overallHealth === 'critical' ? '#721c24' : overallHealth === 'warning' ? '#856404' : '#155724'};">📋 Recommended Actions</h3>
            <ul style="color: ${overallHealth === 'critical' ? '#721c24' : overallHealth === 'warning' ? '#856404' : '#155724'}; margin: 10px 0;">
              ${clusterOverview.failed > 0 ? '<li><strong>Critical:</strong> Investigate failed Pods immediately</li>' : ''}
              ${failed.length > 0 ? '<li><strong>New failures:</strong> Check logs and restart if necessary</li>' : ''}
              ${stopped.length > 0 ? '<li><strong>Stopped Pods:</strong> Restart when ready (likely MTCTL stop)</li>' : ''}
              ${clusterOverview.degraded > 0 ? '<li><strong>Degraded Pods:</strong> Monitor for auto-recovery</li>' : ''}
              ${degraded.length > 0 ? '<li><strong>New degraded:</strong> Monitor for auto-recovery or manual intervention</li>' : ''}
              ${started.length > 0 || recovered.length > 0 ? '<li><strong>Started/Recovered:</strong> Verify functionality and monitor stability</li>' : ''}
              <li>Dashboard: Check the pods real time status through the monitoring tool</li>
              <li>Uptime WatchDog by Tsunami Solutions - Enterprise Monitoring Platform</li>
            </ul>
          </div>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Comprehensive alert sent to: ${groupName}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${now.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Kubernetes Enhanced Monitoring System • Full Cluster Status Included</p>
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
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.metadata?.reason || 'Status change detected'}</td>
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.timestamp.toLocaleTimeString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // NEW: Generate current status section for workloads currently in a specific state
  generateCurrentStatusSection(title, workloads, color) {
    if (workloads.length === 0) return '';

    return `
      <div style="margin: 20px 0;">
        <h3 style="color: ${color}; margin-bottom: 15px;">${title} (${workloads.length})</h3>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: ${color}; color: white;">
              <th style="padding: 10px; text-align: left; font-size: 12px;">Workload</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Namespace</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Pods</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${workloads.slice(0, 10).map((workload, index) => `
              <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                <td style="padding: 8px; font-size: 12px; font-weight: bold;">${workload.name}</td>
                <td style="padding: 8px; font-size: 12px;">${workload.namespace}</td>
                <td style="padding: 8px; font-size: 12px;">${workload.readyReplicas || 0}/${workload.desiredReplicas || 0}</td>
                <td style="padding: 8px; font-size: 11px;">
                  <span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 3px;">
                    ${workload.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            `).join('')}
            ${workloads.length > 10 ? `
              <tr style="background-color: #f8f9fa;">
                <td colspan="4" style="padding: 8px; text-align: center; font-style: italic; color: #666; font-size: 12px;">
                  ... and ${workloads.length - 10} more
                </td>
              </tr>
            ` : ''}
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
          desiredReplicas: 0, // Will be calculated based on actual pods
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

    // Convert map to array and calculate health based on INCLUDED pods only
    return Array.from(workloadMap.values()).map(workload => {
      // For filtered workloads, desired replicas = actual pods we're tracking
      workload.desiredReplicas = workload.pods.length;
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