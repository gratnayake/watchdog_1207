// backend/services/podLifecycleService.js
// New service to track pod lifecycle events

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
    
    this.knownPods = new Map();
    this.lastScan = null;
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
    if (disappearedPods.length >= 3) { // Threshold for "mass disappearance"
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
            type: 'mass_disappearance', // NEW change type
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
            severity: 'warning' // Mark as warning level
          });

          console.log(`🛑 Mass disappearance detected: ${pods.length} pods gone from ${namespace}`);
        }
      });
    }

    // Existing logic for individual pod changes...
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
        // Update existing pod logic...
        existingPod.lastSeen = now.toISOString();
        existingPod.isDeleted = false;
        
        if (existingPod.status !== pod.status) {
          existingPod.statusHistory.push({
            status: pod.status,
            timestamp: now.toISOString(),
            event: 'status_change',
            previousStatus: existingPod.status
          });
          
          changes.push({
            type: 'status_change',
            pod: existingPod,
            oldStatus: existingPod.status,
            newStatus: pod.status
          });
          
          existingPod.status = pod.status;
        }

        if (pod.restarts !== existingPod.restarts) {
          existingPod.statusHistory.push({
            status: pod.status,
            timestamp: now.toISOString(),
            event: 'restart',
            restartCount: pod.restarts
          });
          existingPod.restarts = pod.restarts;
        }
      }
    });

    // Update last known state with current pods
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
    this.saveLastKnownState(newLastKnownState);

    console.log(`✅ Pod lifecycle updated: ${changes.length} changes detected`);
    return changes;
  }

  // Rest of your existing methods remain the same...
}

module.exports = new PodLifecycleService();