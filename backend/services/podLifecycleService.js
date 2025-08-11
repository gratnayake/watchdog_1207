// backend/services/podLifecycleService.js - FIXED VERSION
// This service should take an INITIAL SNAPSHOT and compare everything against it

const fs = require('fs');
const path = require('path');

class PodLifecycleService {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.podHistoryFile = path.join(this.dataDir, 'pod-history.json');
    this.snapshotFile = path.join(this.dataDir, 'pod-snapshot.json');
    this.ensureDataDirectory();
    this.initialSnapshot = null;
    this.isInitialized = false;
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Take initial snapshot when server starts
  async takeInitialSnapshot(pods) {
    console.log('📸 Taking initial pod snapshot...');
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      pods: pods.map(pod => ({
        name: pod.name,
        namespace: pod.namespace,
        status: pod.status,
        ready: pod.ready,
        restarts: pod.restarts || 0,
        node: pod.node,
        readyContainers: pod.readyContainers || 0,
        totalContainers: pod.totalContainers || 1,
        snapshotStatus: 'initial'
      }))
    };
    
    // Save snapshot to file
    fs.writeFileSync(this.snapshotFile, JSON.stringify(snapshot, null, 2));
    this.initialSnapshot = snapshot;
    this.isInitialized = true;
    
    console.log(`✅ Initial snapshot taken with ${snapshot.pods.length} pods`);
    return snapshot;
  }

  // Load the initial snapshot
  loadSnapshot() {
    try {
      if (fs.existsSync(this.snapshotFile)) {
        const data = fs.readFileSync(this.snapshotFile, 'utf8');
        this.initialSnapshot = JSON.parse(data);
        this.isInitialized = true;
        console.log(`📸 Loaded snapshot from ${this.initialSnapshot.timestamp}`);
        return this.initialSnapshot;
      }
    } catch (error) {
      console.error('Failed to load snapshot:', error);
    }
    return null;
  }

  // Get comprehensive pod list comparing current state with initial snapshot
  getComprehensivePodList(currentPods = []) {
    if (!this.initialSnapshot) {
      this.loadSnapshot();
      if (!this.initialSnapshot) {
        console.warn('⚠️ No initial snapshot available');
        return currentPods;
      }
    }

    const result = [];
    const currentPodMap = new Map();
    
    // Map current pods for quick lookup
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      currentPodMap.set(key, pod);
    });

    // Check all pods from initial snapshot
    this.initialSnapshot.pods.forEach(snapshotPod => {
      const key = `${snapshotPod.namespace}/${snapshotPod.name}`;
      const currentPod = currentPodMap.get(key);
      
      if (currentPod) {
        // Pod still exists - use current state
        result.push({
          ...currentPod,
          wasInSnapshot: true,
          snapshotStatus: snapshotPod.status
        });
      } else {
        // Pod was in snapshot but not in current - mark as deleted
        result.push({
          ...snapshotPod,
          isDeleted: true,
          status: 'Deleted',
          wasInSnapshot: true,
          deletedSinceSnapshot: true
        });
      }
    });

    // Check for new pods not in snapshot
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      const wasInSnapshot = this.initialSnapshot.pods.some(
        sp => sp.namespace === pod.namespace && sp.name === pod.name
      );
      
      if (!wasInSnapshot) {
        result.push({
          ...pod,
          wasInSnapshot: false,
          isNew: true,
          createdAfterSnapshot: true
        });
      }
    });

    return result;
  }

  // Get statistics comparing to snapshot
  getSnapshotStatistics(currentPods = []) {
    if (!this.initialSnapshot) {
      return {
        snapshotPods: 0,
        currentPods: currentPods.length,
        deletedPods: 0,
        newPods: 0
      };
    }

    const comprehensive = this.getComprehensivePodList(currentPods);
    
    return {
      snapshotTime: this.initialSnapshot.timestamp,
      snapshotPods: this.initialSnapshot.pods.length,
      currentPods: comprehensive.filter(p => !p.isDeleted).length,
      deletedPods: comprehensive.filter(p => p.deletedSinceSnapshot).length,
      newPods: comprehensive.filter(p => p.createdAfterSnapshot).length,
      total: comprehensive.length
    };
  }
}

module.exports = new PodLifecycleService();