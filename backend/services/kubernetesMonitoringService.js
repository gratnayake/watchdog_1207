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