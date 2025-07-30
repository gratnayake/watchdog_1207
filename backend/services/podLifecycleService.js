// COMPLETELY REPLACE your backend/services/podLifecycleService.js with this enhanced version:

const fs = require('fs');
const path = require('path');

class PodLifecycleService {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.podHistoryFile = path.join(this.dataDir, 'pod-history.json');
    this.lastKnownStateFile = path.join(this.dataDir, 'last-known-pods.json'); // NEW
    this.ensureDataDirectory();
    this.ensureHistoryFile();
    this.ensureLastKnownStateFile(); // NEW
    
    // In-memory tracking
    this.knownPods = new Map();
    this.lastScan = null;
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  ensureHistoryFile() {
    if (!fs.existsSync(this.podHistoryFile)) {
      const defaultHistory = {
        pods: [],
        lastUpdated: new Date().toISOString()
      };
      this.saveHistory(defaultHistory);
      console.log('📝 Created pod history file');
    }
  }

  // NEW: Ensure last known state file exists
  ensureLastKnownStateFile() {
    if (!fs.existsSync(this.lastKnownStateFile)) {
      const defaultState = {
        pods: [],
        lastUpdated: new Date().toISOString(),
        totalPods: 0
      };
      this.saveLastKnownState(defaultState);
      console.log('📝 Created last known pods state file');
    }
  }

  loadHistory() {
    try {
      const data = fs.readFileSync(this.podHistoryFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load pod history:', error);
      return { pods: [], lastUpdated: new Date().toISOString() };
    }
  }

  saveHistory(history) {
    try {
      fs.writeFileSync(this.podHistoryFile, JSON.stringify(history, null, 2));
      return true;
    } catch (error) {
      console.error('Failed to save pod history:', error);
      return false;
    }
  }

  // NEW: Load last known state
  loadLastKnownState() {
    try {
      const data = fs.readFileSync(this.lastKnownStateFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load last known state:', error);
      return { pods: [], lastUpdated: new Date().toISOString(), totalPods: 0 };
    }
  }

  // NEW: Save last known state
  saveLastKnownState(state) {
    try {
      fs.writeFileSync(this.lastKnownStateFile, JSON.stringify(state, null, 2));
      return true;
    } catch (error) {
      console.error('Failed to save last known state:', error);
      return false;
    }
  }

  // ENHANCED: updatePodLifecycle method with disappearance detection
  async updatePodLifecycle(currentPods) {
    const now = new Date();
    const history = this.loadHistory();
    const lastKnownState = this.loadLastKnownState();
    let changes = [];

    console.log(`🔍 Comparing current pods (${currentPods.length}) with last known state (${lastKnownState.totalPods})`);

    // Create maps for easier comparison
    const currentPodMap = new Map();
    currentPods.forEach(pod => {
      const podKey = `${pod.namespace}/${pod.name}`;
      currentPodMap.set(podKey, pod);
    });

    const lastKnownPodMap = new Map();
    lastKnownState.pods.forEach(pod => {
      const podKey = `${pod.namespace}/${pod.name}`;
      lastKnownPodMap.set(podKey, pod);
    });

    // NEW: Detect mass disappearances (pods that were running but are now gone)
    const disappearedPods = [];
    lastKnownPodMap.forEach((lastPod, podKey) => {
      if (!currentPodMap.has(podKey)) {
        // This pod was running before but is now gone
        disappearedPods.push({
          ...lastPod,
          disappearedAt: now.toISOString()
        });
      }
    });

    // NEW: Detect if this is a "mass disappearance" (likely a stop operation)
    if (disappearedPods.length >= 2) { // Lower threshold for better detection
      // Group by namespace to create meaningful alerts
      const namespaceGroups = {};
      disappearedPods.forEach(pod => {
        if (!namespaceGroups[pod.namespace]) {
          namespaceGroups[pod.namespace] = [];
        }
        namespaceGroups[pod.namespace].push(pod);
      });

      // Create disappearance alerts for each affected namespace
      Object.keys(namespaceGroups).forEach(namespace => {
        const pods = namespaceGroups[namespace];
        if (pods.length >= 2) { // At least 2 pods disappeared in this namespace
          changes.push({
            type: 'mass_disappearance',
            namespace: namespace,
            podCount: pods.length,
            timestamp: now.toISOString(),
            message: `${pods.length} pods stopped/disappeared in namespace '${namespace}'`,
            pods: pods.map(p => ({ 
              name: p.name, 
              namespace: p.namespace, 
              status: p.status || 'Running',
              lastSeen: p.lastSeen || now.toISOString()
            })),
            severity: 'warning'
          });

          console.log(`🛑 Mass disappearance detected: ${pods.length} pods gone from ${namespace}`);
        }
      });
    }

    // Check for new pods or status changes
    currentPodMap.forEach((pod, podKey) => {
      const existingPod = history.pods.find(p => 
        p.namespace === pod.namespace && p.name === pod.name
      );

      if (!existingPod) {
        // New pod discovered
        const newPodEntry = {
          name: pod.name,
          namespace: pod.namespace,
          status: pod.status,
          firstSeen: now.toISOString(),
          lastSeen: now.toISOString(),
          statusHistory: [{
            status: pod.status,
            timestamp: now.toISOString(),
            event: 'created'
          }],
          isDeleted: false,
          restarts: pod.restarts || 0,
          node: pod.node || 'unknown'
        };
        
        history.pods.push(newPodEntry);
        changes.push({
          type: 'created',
          pod: newPodEntry
        });
        
        console.log(`🆕 New pod discovered: ${podKey}`);
      } else {
        // Update existing pod
        existingPod.lastSeen = now.toISOString();
        existingPod.isDeleted = false;
        
        // Check for status change
        if (existingPod.status !== pod.status) {
          existingPod.statusHistory.push({
            status: pod.status,
            timestamp: now.toISOString(),
            event: 'status_change',
            previousStatus: existingPod.status
          });
          
          console.log(`🔄 Status change for ${podKey}: ${existingPod.status} → ${pod.status}`);
          
          changes.push({
            type: 'status_change',
            pod: existingPod,
            oldStatus: existingPod.status,
            newStatus: pod.status
          });
          
          existingPod.status = pod.status;
        }
        
        // Update restart count
        if (pod.restarts !== existingPod.restarts) {
          existingPod.statusHistory.push({
            status: pod.status,
            timestamp: now.toISOString(),
            event: 'restart',
            restartCount: pod.restarts
          });
          existingPod.restarts = pod.restarts;
        }
        
        // Update node if changed
        if (pod.node && pod.node !== existingPod.node) {
          existingPod.node = pod.node;
        }
      }
    });

    // Mark pods as deleted if they're no longer present
    history.pods.forEach(historyPod => {
      const podKey = `${historyPod.namespace}/${historyPod.name}`;
      if (!currentPodMap.has(podKey) && !historyPod.isDeleted) {
        historyPod.isDeleted = true;
        historyPod.deletedAt = now.toISOString();
        historyPod.statusHistory.push({
          status: 'Deleted',
          timestamp: now.toISOString(),
          event: 'deleted'
        });
      }
    });

    // CRITICAL: Update last known state with current pods (THIS FIXES THE ISSUE!)
    const newLastKnownState = {
      pods: currentPods.map(pod => ({
        name: pod.name,
        namespace: pod.namespace,
        status: pod.status,
        lastSeen: now.toISOString()
      })),
      lastUpdated: now.toISOString(),
      totalPods: currentPods.length
    };

    // Save updated data
    history.lastUpdated = now.toISOString();
    this.saveHistory(history);
    this.saveLastKnownState(newLastKnownState); // THIS IS THE KEY FIX!

    console.log(`✅ Pod lifecycle updated: ${changes.length} changes detected`);
    console.log(`💾 Last known state updated: ${newLastKnownState.totalPods} pods`);
    
    return changes;
  }

  // Calculate pod age
  calculateAge(firstSeen) {
    if (!firstSeen) return 'Unknown';
    
    const now = new Date();
    const created = new Date(firstSeen);
    const diffMs = now - created;
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d${hours}h`;
    if (hours > 0) return `${hours}h${minutes}m`;
    return `${minutes}m`;
  }

  // Calculate status duration
  calculateStatusDuration(statusHistory, currentStatus) {
    if (!statusHistory || statusHistory.length === 0) return 'Unknown';
    
    // Find the last time the status changed to current status
    const statusEvents = statusHistory.filter(event => event.status === currentStatus);
    if (statusEvents.length === 0) return 'Unknown';
    
    const lastStatusChange = statusEvents[statusEvents.length - 1];
    return this.calculateAge(lastStatusChange.timestamp);
  }

  // Get comprehensive pod list with filtering and sorting
  getComprehensivePodList(options = {}) {
    const {
      includeDeleted = true,
      namespace = null,
      maxAge = null,
      sortBy = 'lastSeen'
    } = options;

    const history = this.loadHistory();
    let pods = [...history.pods];

    // Filter by deleted status
    if (!includeDeleted) {
      pods = pods.filter(pod => !pod.isDeleted);
    }

    // Filter by namespace
    if (namespace) {
      pods = pods.filter(pod => pod.namespace === namespace);
    }

    // Filter by age
    if (maxAge) {
      const cutoffTime = new Date(Date.now() - (maxAge * 60 * 60 * 1000));
      pods = pods.filter(pod => new Date(pod.lastSeen) > cutoffTime);
    }

    // Add calculated fields
    pods = pods.map(pod => ({
      ...pod,
      age: this.calculateAge(pod.firstSeen),
      statusDuration: this.calculateStatusDuration(pod.statusHistory, pod.status)
    }));

    // Sort pods
    pods.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'namespace':
          return a.namespace.localeCompare(b.namespace);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'firstSeen':
          return new Date(b.firstSeen) - new Date(a.firstSeen);
        case 'lastSeen':
        default:
          return new Date(b.lastSeen) - new Date(a.lastSeen);
      }
    });

    return pods;
  }

  // Get pod statistics
  getPodStatistics(namespace = null) {
    const pods = this.getComprehensivePodList({ 
      includeDeleted: true, 
      namespace,
      maxAge: 24 // Last 24 hours
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));

    const stats = {
      total: pods.filter(p => !p.isDeleted).length,
      running: pods.filter(p => p.status === 'Running' && !p.isDeleted).length,
      pending: pods.filter(p => p.status === 'Pending' && !p.isDeleted).length,
      failed: pods.filter(p => p.status === 'Failed' && !p.isDeleted).length,
      succeeded: pods.filter(p => p.status === 'Succeeded' && !p.isDeleted).length,
      deleted: pods.filter(p => p.isDeleted).length,
      recentlyCreated: pods.filter(p => 
        new Date(p.firstSeen) > oneHourAgo && !p.isDeleted
      ).length,
      recentlyDeleted: pods.filter(p => 
        p.isDeleted && p.deletedAt && new Date(p.deletedAt) > oneHourAgo
      ).length,
      restartEvents: pods.reduce((total, pod) => {
        if (pod.statusHistory) {
          return total + pod.statusHistory.filter(event => event.event === 'restart').length;
        }
        return total;
      }, 0)
    };

    return stats;
  }

  // Clear old history
  clearOldHistory(maxAgeHours = 168) { // Default 7 days
    const history = this.loadHistory();
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    
    const originalCount = history.pods.length;
    history.pods = history.pods.filter(pod => 
      new Date(pod.lastSeen) > cutoffTime
    );
    
    const removedCount = originalCount - history.pods.length;
    if (removedCount > 0) {
      this.saveHistory(history);
      console.log(`🧹 Cleaned up ${removedCount} old pod entries`);
    }
    
    return removedCount;
  }
}

module.exports = new PodLifecycleService();