// backend/services/podLifecycleService.js
// New service to track pod lifecycle events

const fs = require('fs');
const path = require('path');

class PodLifecycleService {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.podHistoryFile = path.join(this.dataDir, 'pod-history.json');
    this.ensureDataDirectory();
    this.ensureHistoryFile();
    
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

  // Track pod lifecycle changes
  async updatePodLifecycle(currentPods) {
    const now = new Date();
    const history = this.loadHistory();
    let changes = [];

    // Create a map of current pods for easy lookup
    const currentPodMap = new Map();
    currentPods.forEach(pod => {
      const podKey = `${pod.namespace}/${pod.name}`;
      currentPodMap.set(podKey, pod);
    });

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

    // Check for deleted pods (pods that were there before but not now)
    const deletionThreshold = 30000; // 30 seconds
    history.pods.forEach(historicalPod => {
      const podKey = `${historicalPod.namespace}/${historicalPod.name}`;
      
      if (!currentPodMap.has(podKey) && !historicalPod.isDeleted) {
        // Pod is missing from current scan and not marked as deleted
        const timeSinceLastSeen = now - new Date(historicalPod.lastSeen);
        
        if (timeSinceLastSeen > deletionThreshold) {
          // Mark as deleted
          historicalPod.isDeleted = true;
          historicalPod.deletedAt = now.toISOString();
          historicalPod.statusHistory.push({
            status: 'Deleted',
            timestamp: now.toISOString(),
            event: 'deleted'
          });
          
          console.log(`🗑️ Pod marked as deleted: ${podKey}`);
          
          changes.push({
            type: 'deleted',
            pod: historicalPod
          });
        }
      }
    });

    // Save updated history
    history.lastUpdated = now.toISOString();
    this.saveHistory(history);
    this.lastScan = now;

    return changes;
  }

  // Get comprehensive pod list including deleted ones
  getComprehensivePodList(options = {}) {
    const {
      includeDeleted = true,
      namespace = null,
      maxAge = null, // in hours
      sortBy = 'lastSeen'
    } = options;

    const history = this.loadHistory();
    let pods = [...history.pods];

    // Filter by namespace if specified
    if (namespace && namespace !== 'all') {
      pods = pods.filter(pod => pod.namespace === namespace);
    }

    // Filter by age if specified
    if (maxAge) {
      const cutoffTime = new Date(Date.now() - (maxAge * 60 * 60 * 1000));
      pods = pods.filter(pod => new Date(pod.lastSeen) > cutoffTime);
    }

    // Filter deleted pods if not included
    if (!includeDeleted) {
      pods = pods.filter(pod => !pod.isDeleted);
    }

    // Add computed fields
    pods = pods.map(pod => ({
      ...pod,
      age: this.calculateAge(pod.firstSeen),
      timeSinceLastSeen: this.calculateAge(pod.lastSeen),
      lifecycleStage: this.getLifecycleStage(pod),
      statusDuration: this.getStatusDuration(pod)
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

  calculateAge(timestamp) {
    const now = new Date();
    const created = new Date(timestamp);
    const diffMs = now - created;
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  getLifecycleStage(pod) {
    if (pod.isDeleted) return 'deleted';
    if (pod.status === 'Running') return 'stable';
    if (pod.status === 'Pending') return 'starting';
    if (pod.status === 'Failed') return 'failed';
    if (pod.status === 'Succeeded') return 'completed';
    return 'unknown';
  }

  getStatusDuration(pod) {
    if (pod.statusHistory.length === 0) return '0m';
    
    const lastStatusChange = pod.statusHistory[pod.statusHistory.length - 1];
    return this.calculateAge(lastStatusChange.timestamp);
  }

  // Get pod statistics
  getPodStatistics(namespace = null) {
    const pods = this.getComprehensivePodList({ 
      namespace, 
      includeDeleted: true,
      maxAge: 24 // Last 24 hours
    });

    const stats = {
      total: pods.length,
      running: 0,
      pending: 0,
      failed: 0,
      succeeded: 0,
      deleted: 0,
      recentlyCreated: 0, // Last hour
      recentlyDeleted: 0, // Last hour
      restartEvents: 0
    };

    const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));

    pods.forEach(pod => {
      // Count by current status
      if (pod.isDeleted) {
        stats.deleted++;
        if (pod.deletedAt && new Date(pod.deletedAt) > oneHourAgo) {
          stats.recentlyDeleted++;
        }
      } else {
        switch (pod.status) {
          case 'Running': stats.running++; break;
          case 'Pending': stats.pending++; break;
          case 'Failed': stats.failed++; break;
          case 'Succeeded': stats.succeeded++; break;
        }
      }

      // Count recent creations
      if (new Date(pod.firstSeen) > oneHourAgo) {
        stats.recentlyCreated++;
      }

      // Count restart events
      stats.restartEvents += pod.statusHistory.filter(h => h.event === 'restart').length;
    });

    return stats;
  }

  // Clear old history (cleanup)
  cleanupOldHistory(maxAgeDays = 30) {
    const history = this.loadHistory();
    const cutoffTime = new Date(Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000));
    
    const initialCount = history.pods.length;
    history.pods = history.pods.filter(pod => 
      new Date(pod.lastSeen) > cutoffTime
    );
    
    const removedCount = initialCount - history.pods.length;
    
    if (removedCount > 0) {
      history.lastUpdated = new Date().toISOString();
      this.saveHistory(history);
      console.log(`🧹 Cleaned up ${removedCount} old pod records`);
    }
    
    return removedCount;
  }
}

module.exports = new PodLifecycleService();