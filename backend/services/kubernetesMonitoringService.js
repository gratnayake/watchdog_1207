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

      // Get current workload status using enhanced kubernetesService
      const currentWorkloads = await this.getWorkloadStatus();
      
      console.log(`✅ Retrieved ${currentWorkloads.length} workloads from cluster`);

      // Skip alerts during initialization period
      if (!this.initializationComplete) {
        console.log('⏳ Still in initialization grace period - updating baseline only');
        
        // Update baseline without alerts
        for (const workload of currentWorkloads) {
          const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
          this.workloadStatuses.set(workloadKey, {
            ...workload,
            lastSeen: new Date(),
            isBaseline: true
          });
        }
        
        return;
      }

      // CRITICAL: Detect missing workloads BEFORE processing current ones
      await this.detectMissingWorkloads(currentWorkloads, config.emailGroupId);

      // Compare with previous state and detect changes
      for (const workload of currentWorkloads) {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        const previousStatus = this.workloadStatuses.get(workloadKey);
        
        // Store current status
        this.workloadStatuses.set(workloadKey, {
          ...workload,
          lastSeen: new Date(),
          isBaseline: false  // No longer baseline data
        });

        // Check for status changes (only after initialization)
        if (previousStatus && !previousStatus.isBaseline) {
          await this.detectWorkloadChanges(workload, previousStatus, config.emailGroupId);
        } else if (previousStatus && previousStatus.isBaseline) {
          // First real check after baseline - only alert on significant issues
          await this.detectSignificantChangesFromBaseline(workload, previousStatus, config.emailGroupId);
        } else {
          console.log(`🆕 New workload detected after baseline: ${workloadKey}`);
          // This is a genuinely new workload, so we can alert about it
          this.addToBatchAlert('started', workload, config.emailGroupId, {
            reason: 'New workload appeared after monitoring started'
          });
        }
      }

      // Clean up old workload statuses AFTER detecting missing ones
      this.cleanupDeletedWorkloads(currentWorkloads);

    } catch (error) {
      console.error('❌ Workload health check failed:', error);
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
  
  // Get previous status - handle missing/corrupt data
  const previousHealthyPods = previous.pods ? 
    previous.pods.filter(p => p.ready && p.status === 'Running').length : 0;
  const previousDesiredReplicas = previous.desiredReplicas || previous.pods?.length || 0;

  console.log(`🔍 Workload change check: ${workloadKey}`);
  console.log(`   Current: ${currentHealthyPods}/${currentDesiredReplicas} healthy`);
  console.log(`   Previous: ${previousHealthyPods}/${previousDesiredReplicas} healthy`);

  // SCENARIO 1: Workload was down/critical and is now healthy (RECOVERY)
  if (currentHealthyPods === currentDesiredReplicas && 
      currentHealthyPods > 0 && 
      (previousHealthyPods === 0 || previous.status === 'critical')) {
    
    console.log(`✅ Workload RECOVERED: ${workloadKey} (${currentHealthyPods}/${currentDesiredReplicas} healthy)`);
    this.addToBatchAlert('recovered', current, emailGroupId);
    return;
  }

  // SCENARIO 2: Workload was healthy and is now degraded
  if (currentHealthyPods < currentDesiredReplicas && 
      currentHealthyPods > 0 && 
      previousHealthyPods >= previousDesiredReplicas) {
    
    console.log(`⚠️ Workload DEGRADED: ${workloadKey} (${currentHealthyPods}/${currentDesiredReplicas} healthy)`);
    this.addToBatchAlert('degraded', current, emailGroupId);
    return;
  }

  // SCENARIO 3: Workload was running and is now completely failed
  if (currentHealthyPods === 0 && 
      currentDesiredReplicas > 0 && 
      previousHealthyPods > 0) {
    
    console.log(`💥 Workload FAILED: ${workloadKey}`);
    this.addToBatchAlert('failed', current, emailGroupId);
    return;
  }

  // SCENARIO 4: Handle initial snapshot case (first time seeing this workload)
  if (!previous.lastSeen || !previous.pods) {
    console.log(`🆕 Initial workload detection: ${workloadKey} - Status: ${current.status}`);
    
    // Only alert if workload is currently unhealthy on first detection
    if (current.status === 'critical' && currentHealthyPods === 0) {
      console.log(`🚨 New workload detected as CRITICAL: ${workloadKey}`);
      this.addToBatchAlert('failed', current, emailGroupId);
    }
    return;
  }

  // Log no change detected
  console.log(`➡️ No significant change for ${workloadKey}`);
}


  // Enhanced method to collect alerts for batching
  addToBatchAlert(alertType, workload, emailGroupId, metadata = {}) {
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for workload alerts');
      return;
    }

    // Skip alerts during initialization
    if (!this.initializationComplete) {
      console.log('⏳ Skipping alert during initialization period');
      return;
    }

    // Add to pending alerts with enhanced metadata
    this.pendingAlerts[alertType].push({
      workload: workload,
      timestamp: new Date(),
      emailGroupId: emailGroupId,
      metadata: {
        ...metadata,
        postBaseline: true  // Mark as post-baseline alert
      }
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

  // ENHANCED: Send comprehensive batch alert with full cluster status
  async sendBatchAlert(emailGroupId) {
    try {
      const totalAlerts = this.getTotalPendingAlerts();
      
      if (totalAlerts === 0) {
        console.log('📧 No pending alerts to send');
        return;
      }

      console.log(`📧 Sending COMPREHENSIVE batch alert with ${totalAlerts} workload changes...`);

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group found for batch alerts');
        this.clearPendingAlerts();
        return;
      }

      // GET CURRENT CLUSTER STATUS for comprehensive overview
      const currentWorkloads = await this.getWorkloadStatus();
      const clusterOverview = this.generateClusterOverview(currentWorkloads);

      const subject = this.getComprehensiveAlertSubject(clusterOverview);
      const htmlContent = this.getComprehensiveAlertContent(targetGroup.name, clusterOverview);

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: subject,
        html: htmlContent
      };

      await emailService.transporter.sendMail(mailOptions);
      
      console.log(`📧 ✅ COMPREHENSIVE batch alert sent successfully with ${totalAlerts} changes + cluster overview`);
      
      // Clear pending alerts after successful send
      this.clearPendingAlerts();

    } catch (error) {
      console.error(`📧 ❌ Failed to send batch alert:`, error);
      // Don't clear alerts on failure - they'll be retried next cycle
    }
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
    
    return `☸️ ${clusterHealth}: ${clusterOverview.healthy}/${clusterOverview.total} workloads healthy`;
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
          ${this.generateAlertSection('🛑 Stopped Workloads', stopped, '#6f42c1')}
          ${this.generateAlertSection('⚠️ New Degraded', degraded, '#ff7f00')}
          ${this.generateAlertSection('🚀 Started Workloads', started, '#17a2b8')}
          ${this.generateAlertSection('✅ Recovered Workloads', recovered, '#28a745')}

          <!-- Current Status Sections -->
          ${this.generateCurrentStatusSection('❌ Currently Failed Workloads', clusterOverview.failedWorkloads, '#dc3545')}
          ${this.generateCurrentStatusSection('⚠️ Currently Degraded Workloads', clusterOverview.degradedWorkloads, '#ff7f00')}
          ${this.generateCurrentStatusSection('✅ Currently Healthy Workloads', clusterOverview.healthyWorkloads, '#28a745')}

          <div style="background-color: ${overallHealth === 'critical' ? '#f8d7da' : overallHealth === 'warning' ? '#fff3cd' : '#d4edda'}; border: 1px solid ${overallHealth === 'critical' ? '#f5c6cb' : overallHealth === 'warning' ? '#ffeaa7' : '#c3e6cb'}; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: ${overallHealth === 'critical' ? '#721c24' : overallHealth === 'warning' ? '#856404' : '#155724'};">📋 Recommended Actions</h3>
            <ul style="color: ${overallHealth === 'critical' ? '#721c24' : overallHealth === 'warning' ? '#856404' : '#155724'}; margin: 10px 0;">
              ${clusterOverview.failed > 0 ? '<li><strong>Critical:</strong> Investigate failed workloads immediately</li>' : ''}
              ${failed.length > 0 ? '<li><strong>New failures:</strong> Check logs and restart if necessary</li>' : ''}
              ${stopped.length > 0 ? '<li><strong>Stopped workloads:</strong> Restart when ready (likely MTCTL stop)</li>' : ''}
              ${clusterOverview.degraded > 0 ? '<li><strong>Degraded workloads:</strong> Monitor for auto-recovery</li>' : ''}
              ${degraded.length > 0 ? '<li><strong>New degraded:</strong> Monitor for auto-recovery or manual intervention</li>' : ''}
              ${started.length > 0 || recovered.length > 0 ? '<li><strong>Started/Recovered:</strong> Verify functionality and monitor stability</li>' : ''}
              <li>Dashboard: Access your monitoring dashboard for real-time status</li>
              <li>Tools: Use kubectl or MTCTL for manual intervention if needed</li>
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

  // Enhanced Kubernetes Monitoring Service - Database-Style Detailed Monitoring
// ADD these enhanced methods to your existing kubernetesMonitoringService.js

// Enhanced workload health calculation with detailed metrics
calculateDetailedWorkloadHealth(workload) {
  const totalPods = workload.pods.length;
  const readyPods = workload.readyReplicas;
  const runningPods = workload.pods.filter(p => p.status === 'Running').length;
  const crashLoopPods = workload.pods.filter(p => p.restarts > 5).length;
  const pendingPods = workload.pods.filter(p => p.status === 'Pending').length;
  const failedPods = workload.pods.filter(p => p.status === 'Failed').length;

  // Calculate health score (0-100)
  let healthScore = 0;
  if (totalPods > 0) {
    const readyScore = (readyPods / totalPods) * 60;      // 60% weight for ready pods
    const runningScore = (runningPods / totalPods) * 30;  // 30% weight for running pods
    const crashPenalty = (crashLoopPods / totalPods) * 20; // 20% penalty for crash loops
    
    healthScore = Math.max(0, readyScore + runningScore - crashPenalty);
  }

  // Determine detailed status
  let detailedStatus = 'unknown';
  let severity = 'info';
  
  if (totalPods === 0) {
    detailedStatus = 'no-pods';
    severity = 'warning';
  } else if (readyPods === 0) {
    detailedStatus = 'critical';
    severity = 'critical';
  } else if (crashLoopPods > 0) {
    detailedStatus = 'crash-loop';
    severity = 'critical';
  } else if (readyPods < totalPods * 0.5) {
    detailedStatus = 'degraded';
    severity = 'warning';
  } else if (readyPods < totalPods) {
    detailedStatus = 'partial';
    severity = 'warning';
  } else if (pendingPods > 0) {
    detailedStatus = 'scaling';
    severity = 'info';
  } else {
    detailedStatus = 'healthy';
    severity = 'success';
  }

  return {
    status: detailedStatus,
    severity: severity,
    healthScore: Math.round(healthScore),
    metrics: {
      totalPods,
      readyPods,
      runningPods,
      crashLoopPods,
      pendingPods,
      failedPods,
      readyPercentage: totalPods > 0 ? Math.round((readyPods / totalPods) * 100) : 0
    }
  };
}

// Enhanced workload checking with detailed pod analysis
async checkDetailedWorkloadHealth() {
  try {
    console.log('☸️ Performing detailed Kubernetes workload health check...');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('⚠️ Kubernetes not configured - skipping detailed health check');
      return;
    }

    // Get enhanced workload data
    const currentWorkloads = await this.getEnhancedWorkloadStatus();
    
    console.log(`✅ Analyzed ${currentWorkloads.length} workloads with detailed metrics`);

    // Track workload changes with enhanced detection
    for (const workload of currentWorkloads) {
      const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
      const previousStatus = this.workloadStatuses.get(workloadKey);
      
      // Enhanced status with timestamps and health history
      const enhancedWorkload = {
        ...workload,
        lastSeen: new Date(),
        checkCount: previousStatus ? (previousStatus.checkCount || 0) + 1 : 1,
        healthHistory: previousStatus ? [...(previousStatus.healthHistory || []).slice(-9), workload.health.healthScore] : [workload.health.healthScore],
        firstSeen: previousStatus ? previousStatus.firstSeen : new Date(),
        statusDuration: previousStatus && previousStatus.health.status === workload.health.status ? 
          (previousStatus.statusDuration || 0) + 2 : 0 // 2 minutes per check
      };
      
      this.workloadStatuses.set(workloadKey, enhancedWorkload);

      // Enhanced change detection
      if (previousStatus) {
        await this.detectEnhancedWorkloadChanges(enhancedWorkload, previousStatus, config.emailGroupId);
      } else {
        console.log(`🆕 New workload detected: ${workloadKey} - Initial health: ${workload.health.healthScore}%`);
        
        // Alert on initially unhealthy workloads (but only if they've been unhealthy for more than 5 minutes)
        if (workload.health.severity === 'critical') {
          setTimeout(async () => {
            const currentStatus = this.workloadStatuses.get(workloadKey);
            if (currentStatus && currentStatus.health.severity === 'critical') {
              console.log(`🚨 New workload is persistently critical: ${workloadKey}`);
              this.addToEnhancedBatchAlert('failed', currentStatus, config.emailGroupId, 'persistent_critical_new_workload');
            }
          }, 5 * 60 * 1000); // 5 minutes
        }
      }
    }

    // Enhanced cleanup with grace period
    this.cleanupDeletedWorkloadsWithGrace(currentWorkloads);

    // Generate health report
    this.generateHealthSummaryReport(currentWorkloads);

  } catch (error) {
    console.error('❌ Enhanced workload health check failed:', error);
    
    // Alert on monitoring system failure
    if (this.consecutiveFailures === undefined) this.consecutiveFailures = 0;
    this.consecutiveFailures++;
    
    if (this.consecutiveFailures >= 3) {
      console.log('🚨 Kubernetes monitoring system is failing repeatedly');
      // Could send alert about monitoring system itself being down
    }
  }
}

// Enhanced workload status with detailed pod and resource analysis
async getEnhancedWorkloadStatus() {
  try {
    // Get comprehensive data
    const [pods, deployments, nodes] = await Promise.allSettled([
      kubernetesService.getAllPods(),
      kubernetesService.getDeployments(), // You may need to implement this
      kubernetesService.getNodes()
    ]);

    const podsData = pods.status === 'fulfilled' ? pods.value : [];
    const deploymentsData = deployments.status === 'fulfilled' ? deployments.value : [];
    const nodesData = nodes.status === 'fulfilled' ? nodes.value : [];

    // Group pods by workload with enhanced analysis
    const workloads = this.groupPodsWithEnhancedAnalysis(podsData, deploymentsData, nodesData);
    
    return workloads;
  } catch (error) {
    console.error('Failed to get enhanced workload status:', error);
    return [];
  }
}

// Enhanced pod grouping with resource and deployment info
groupPodsWithEnhancedAnalysis(pods, deployments, nodes) {
  const workloadMap = new Map();

  pods.forEach(pod => {
    const workloadInfo = this.extractWorkloadInfo(pod);
    
    if (!workloadMap.has(workloadInfo.key)) {
      // Find matching deployment for desired replica count
      const deployment = deployments.find(d => 
        d.metadata.name === workloadInfo.name && 
        d.metadata.namespace === workloadInfo.namespace
      );
      
      workloadMap.set(workloadInfo.key, {
        type: workloadInfo.type,
        name: workloadInfo.name,
        namespace: workloadInfo.namespace,
        pods: [],
        desiredReplicas: deployment ? deployment.spec.replicas : 1,
        actualReplicas: 0,
        readyReplicas: 0,
        deployment: deployment || null,
        nodeDistribution: new Map(),
        resourceIssues: [],
        events: []
      });
    }

    const workload = workloadMap.get(workloadInfo.key);
    
    // Enhanced pod info
    const enhancedPod = {
      name: pod.name,
      status: pod.status,
      ready: pod.ready,
      restarts: pod.restarts || 0,
      age: pod.age,
      node: pod.node,
      
      // Additional detailed info
      phase: pod.phase || pod.status,
      startTime: pod.startTime,
      lastRestartTime: pod.lastRestartTime,
      containerStatuses: pod.containerStatuses || [],
      conditions: pod.conditions || [],
      resources: pod.resources || {},
      
      // Health indicators
      isHealthy: pod.ready && pod.status === 'Running' && (pod.restarts || 0) < 5,
      hasResourceIssues: this.checkPodResourceIssues(pod),
      isStuck: this.checkIfPodIsStuck(pod)
    };
    
    workload.pods.push(enhancedPod);
    workload.actualReplicas++;
    
    if (enhancedPod.ready && enhancedPod.status === 'Running') {
      workload.readyReplicas++;
    }
    
    // Track node distribution
    if (enhancedPod.node) {
      const nodeCount = workload.nodeDistribution.get(enhancedPod.node) || 0;
      workload.nodeDistribution.set(enhancedPod.node, nodeCount + 1);
    }
    
    // Collect resource issues
    if (enhancedPod.hasResourceIssues) {
      workload.resourceIssues.push({
        pod: enhancedPod.name,
        issues: this.getPodResourceIssues(pod)
      });
    }
  });

  // Convert to array and calculate enhanced health
  return Array.from(workloadMap.values()).map(workload => {
    workload.health = this.calculateDetailedWorkloadHealth(workload);
    workload.analysis = this.analyzeWorkloadPatterns(workload);
    return workload;
  });
}

// Check for pod resource issues (OOMKilled, resource limits, etc.)
checkPodResourceIssues(pod) {
  if (!pod.containerStatuses) return false;
  
  return pod.containerStatuses.some(container => {
    const lastState = container.lastTerminationState || {};
    return (
      lastState.reason === 'OOMKilled' ||
      lastState.reason === 'OutOfMemory' ||
      container.restartCount > 5 ||
      (container.state && container.state.waiting && container.state.waiting.reason === 'CrashLoopBackOff')
    );
  });
}

// Check if pod is stuck in a bad state
checkIfPodIsStuck(pod) {
  const stuckStates = ['Pending', 'ContainerCreating', 'ImagePullBackOff', 'ErrImagePull'];
  return stuckStates.includes(pod.status) && this.getPodAgeInMinutes(pod) > 10;
}

// Get pod age in minutes
getPodAgeInMinutes(pod) {
  if (!pod.startTime) return 0;
  const startTime = new Date(pod.startTime);
  const now = new Date();
  return Math.floor((now - startTime) / (1000 * 60));
}

// Analyze workload patterns for insights
analyzeWorkloadPatterns(workload) {
  const analysis = {
    stability: 'unknown',
    scalingPattern: 'static',
    nodeAffinity: 'distributed',
    riskLevel: 'low',
    insights: []
  };

  // Stability analysis
  const totalRestarts = workload.pods.reduce((sum, pod) => sum + (pod.restarts || 0), 0);
  const avgRestarts = workload.pods.length > 0 ? totalRestarts / workload.pods.length : 0;
  
  if (avgRestarts > 5) {
    analysis.stability = 'unstable';
    analysis.riskLevel = 'high';
    analysis.insights.push(`High restart rate: ${avgRestarts.toFixed(1)} avg restarts per pod`);
  } else if (avgRestarts > 2) {
    analysis.stability = 'moderate';
    analysis.riskLevel = 'medium';
    analysis.insights.push(`Moderate restart rate: ${avgRestarts.toFixed(1)} avg restarts per pod`);
  } else {
    analysis.stability = 'stable';
  }

  // Scaling pattern
  if (workload.actualReplicas !== workload.desiredReplicas) {
    if (workload.actualReplicas < workload.desiredReplicas) {
      analysis.scalingPattern = 'scaling-up';
      analysis.insights.push(`Scaling up: ${workload.actualReplicas}/${workload.desiredReplicas} pods`);
    } else {
      analysis.scalingPattern = 'scaling-down';
      analysis.insights.push(`Scaling down: ${workload.actualReplicas}/${workload.desiredReplicas} pods`);
    }
  }

  // Node distribution analysis
  const nodeCount = workload.nodeDistribution.size;
  const podCount = workload.pods.length;
  
  if (nodeCount === 1 && podCount > 1) {
    analysis.nodeAffinity = 'single-node';
    analysis.riskLevel = analysis.riskLevel === 'low' ? 'medium' : 'high';
    analysis.insights.push(`Single point of failure: all ${podCount} pods on one node`);
  } else if (nodeCount > 0) {
    analysis.nodeAffinity = 'distributed';
    analysis.insights.push(`Well distributed: ${podCount} pods across ${nodeCount} nodes`);
  }

  return analysis;
}

// Enhanced change detection with more sophisticated logic
async detectEnhancedWorkloadChanges(current, previous, emailGroupId) {
  const workloadKey = `${current.type}/${current.name}/${current.namespace}`;
  
  // Compare health scores and trends
  const currentHealth = current.health.healthScore;
  const previousHealth = previous.health ? previous.health.healthScore : 100;
  const healthDelta = currentHealth - previousHealth;
  
  // Compare severity levels
  const currentSeverity = current.health.severity;
  const previousSeverity = previous.health ? previous.health.severity : 'success';
  
  console.log(`🔍 Enhanced change check: ${workloadKey}`);
  console.log(`   Health: ${previousHealth}% → ${currentHealth}% (Δ${healthDelta > 0 ? '+' : ''}${healthDelta}%)`);
  console.log(`   Severity: ${previousSeverity} → ${currentSeverity}`);
  console.log(`   Duration in current state: ${current.statusDuration} minutes`);

  // CRITICAL DEGRADATION: Severity got worse
  if (this.getSeverityLevel(currentSeverity) > this.getSeverityLevel(previousSeverity)) {
    console.log(`🚨 CRITICAL: Workload severity degraded from ${previousSeverity} to ${currentSeverity}`);
    this.addToEnhancedBatchAlert('failed', current, emailGroupId, 'severity_degradation');
    return;
  }

  // RECOVERY: Severity improved
  if (this.getSeverityLevel(currentSeverity) < this.getSeverityLevel(previousSeverity)) {
    console.log(`✅ RECOVERY: Workload severity improved from ${previousSeverity} to ${currentSeverity}`);
    this.addToEnhancedBatchAlert('recovered', current, emailGroupId, 'severity_improvement');
    return;
  }

  // HEALTH SCORE SIGNIFICANT CHANGE
  if (Math.abs(healthDelta) >= 20) {
    if (healthDelta < 0) {
      console.log(`⚠️ DEGRADATION: Health score dropped by ${Math.abs(healthDelta)}%`);
      this.addToEnhancedBatchAlert('degraded', current, emailGroupId, 'health_score_drop');
    } else {
      console.log(`📈 IMPROVEMENT: Health score improved by ${healthDelta}%`);
      this.addToEnhancedBatchAlert('recovered', current, emailGroupId, 'health_score_improvement');
    }
    return;
  }

  // PERSISTENT ISSUES: Been in bad state for too long
  if (currentSeverity === 'critical' && current.statusDuration >= 10) {
    console.log(`🚨 PERSISTENT: Workload critical for ${current.statusDuration} minutes`);
    this.addToEnhancedBatchAlert('failed', current, emailGroupId, 'persistent_critical');
    return;
  }

  // Log no significant change
  console.log(`➡️ No significant change for ${workloadKey}`);
}

// Convert severity to numeric level for comparison
getSeverityLevel(severity) {
  const levels = { 'success': 0, 'info': 1, 'warning': 2, 'critical': 3 };
  return levels[severity] || 1;
}

// Enhanced batch alert with more context
addToEnhancedBatchAlert(alertType, workload, emailGroupId, reason = 'unknown') {
  if (!emailGroupId) {
    console.log('⚠️ No email group configured for workload alerts');
    return;
  }

  // Add enhanced alert with more context
  this.pendingAlerts[alertType].push({
    workload: workload,
    timestamp: new Date(),
    emailGroupId: emailGroupId,
    reason: reason,
    healthScore: workload.health.healthScore,
    severity: workload.health.severity,
    analysis: workload.analysis,
    checkCount: workload.checkCount || 1
  });

  console.log(`📝 Enhanced ${alertType} alert: ${workload.name} (${reason}) - Health: ${workload.health.healthScore}% (${this.getTotalPendingAlerts()} total pending)`);

  // Schedule batch send
  this.scheduleBatchAlert(emailGroupId);
}

// Generate health summary report
generateHealthSummaryReport(workloads) {
  const summary = {
    total: workloads.length,
    healthy: workloads.filter(w => w.health.severity === 'success').length,
    warning: workloads.filter(w => w.health.severity === 'warning').length,
    critical: workloads.filter(w => w.health.severity === 'critical').length,
    averageHealth: workloads.length > 0 ? 
      Math.round(workloads.reduce((sum, w) => sum + w.health.healthScore, 0) / workloads.length) : 0
  };

  console.log(`📊 Cluster Health Summary:`);
  console.log(`   Total Workloads: ${summary.total}`);
  console.log(`   🟢 Healthy: ${summary.healthy} (${Math.round(summary.healthy/summary.total*100)}%)`);
  console.log(`   🟡 Warning: ${summary.warning} (${Math.round(summary.warning/summary.total*100)}%)`);
  console.log(`   🔴 Critical: ${summary.critical} (${Math.round(summary.critical/summary.total*100)}%)`);
  console.log(`   📈 Avg Health Score: ${summary.averageHealth}%`);

  // Store summary for API access
  this.lastHealthSummary = {
    ...summary,
    timestamp: new Date(),
    clusterHealth: summary.averageHealth >= 90 ? 'excellent' : 
                  summary.averageHealth >= 75 ? 'good' : 
                  summary.averageHealth >= 50 ? 'fair' : 'poor'
  };
}

// API method to get health summary
getHealthSummary() {
  return this.lastHealthSummary || {
    total: 0,
    healthy: 0,
    warning: 0,
    critical: 0,
    averageHealth: 0,
    clusterHealth: 'unknown',
    timestamp: new Date()
  };
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