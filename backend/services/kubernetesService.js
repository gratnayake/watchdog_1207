const k8s = require('@kubernetes/client-node');
const kubernetesConfigService = require('./kubernetesConfigService');

class KubernetesService {
  constructor() {
    this.kc = new k8s.KubeConfig();
    this.k8sApi = null;
    this.isConfigured = false;
    this.setupKubernetesClient();
  }

  setupKubernetesClient() {
    try {
      const config = kubernetesConfigService.getConfig();
      
      if (!config.isConfigured || !config.kubeconfigPath) {
        console.log('⚠️ Kubernetes config path not set');
        this.isConfigured = false;
        return;
      }

      console.log(`☸️ Loading Kubernetes config from: ${config.kubeconfigPath}`);
      
      // Check if file exists
      const fs = require('fs');
      if (!fs.existsSync(config.kubeconfigPath)) {
        throw new Error(`Config file not found at: ${config.kubeconfigPath}`);
      }
      
      // Load from the specified config file
      this.kc.loadFromFile(config.kubeconfigPath);
      
      // Log context info
      console.log('Current context:', this.kc.getCurrentContext());
      console.log('Current cluster:', this.kc.getCurrentCluster());
      
      this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.isConfigured = true;
      
      console.log('☸️ Kubernetes client configured successfully');
      
    } catch (error) {
      console.log('⚠️ Kubernetes configuration failed:', error.message);
      this.isConfigured = false;
    }
  }


  // Add method to reload configuration without waiting for test
// Add method to reload configuration without waiting for test
reloadConfigAsync() {
  console.log('🔄 Reloading Kubernetes configuration asynchronously...');
  this.setupKubernetesClient();
  
  // Test connection in background (don't wait for it)
  if (this.isConfigured) {
    setTimeout(() => {
      this.testConnection().then(result => {
        if (result.success) {
          console.log('✅ Background Kubernetes connection test successful');
        } else {
          console.log('❌ Background Kubernetes connection test failed:', result.error);
        }
      }).catch(error => {
        console.log('❌ Background connection test error:', error.message);
      });
    }, 1000);
  }
  
  return this.isConfigured;
}
  // Add method to reload configuration
  reloadConfig() {
    console.log('🔄 Reloading Kubernetes configuration...');
    this.setupKubernetesClient();
    return this.isConfigured;
  }

async testConnectionWithClient() {
  if (!this.isConfigured) {
    return { success: false, error: 'Kubernetes client not configured' };
  }

  try {
    console.log('🧪 Testing Kubernetes connection...');
    console.log('Config context:', this.kc.getCurrentContext());
    
    // Use the client directly without complex response handling
    const response = await this.k8sApi.listNode();
    
    console.log('Raw response structure:', {
      hasResponse: !!response,
      responseType: typeof response,
      hasBody: !!response?.body,
      hasData: !!response?.data,
      bodyType: typeof response?.body,
      responseKeys: Object.keys(response || {})
    });
    
    // Try different ways to access the data
    let nodeData = null;
    
    if (response?.body?.items) {
      nodeData = response.body.items;
      console.log('Found nodes in response.body.items');
    } else if (response?.data?.items) {
      nodeData = response.data.items;
      console.log('Found nodes in response.data.items');
    } else if (response?.items) {
      nodeData = response.items;
      console.log('Found nodes in response.items');
    } else {
      // Log the actual response to see its structure
      console.log('Full response:', JSON.stringify(response, null, 2));
      throw new Error('Could not find nodes data in response');
    }
    
    const nodeCount = nodeData ? nodeData.length : 0;
    console.log(`☸️ Successfully found ${nodeCount} nodes`);
    
    return {
      success: true,
      message: `Connected successfully to MicroK8s cluster with ${nodeCount} nodes`,
      nodeCount: nodeCount
    };
    
  } catch (error) {
    console.error('⚠️ Kubernetes test error:', error.message);
    
    // Specific error handling for common MicroK8s issues
    let friendlyError = error.message;
    
    if (error.message.includes('ECONNREFUSED')) {
      friendlyError = 'Cannot connect to MicroK8s cluster. Is MicroK8s running?';
    } else if (error.message.includes('ENOTFOUND')) {
      friendlyError = 'MicroK8s cluster hostname not found. Check network connectivity.';
    } else if (error.response?.statusCode === 401) {
      friendlyError = 'Authentication failed. Try: microk8s config > ~/.kube/config';
    } else if (error.response?.statusCode === 403) {
      friendlyError = 'Permission denied. Check RBAC permissions.';
    }
    
    return {
      success: false,
      error: friendlyError,
      originalError: error.message
    };
  }
}

async testConnection() {
  // Try Node.js client first
  const clientResult = await this.testConnectionWithClient();
  if (clientResult.success) {
    return clientResult;
  }
  
  console.log('Node.js client failed, trying kubectl fallback...');
  return await this.testConnectionWithKubectl();
}

async testConnectionWithKubectl() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    const config = require('./kubernetesConfigService').getConfig();
    const command = `kubectl --kubeconfig="${config.kubeconfigPath}" get nodes -o json`;
    
    console.log('Testing with kubectl command...');
    const { stdout } = await execAsync(command, { timeout: 15000 });
    
    const result = JSON.parse(stdout);
    const nodeCount = result.items ? result.items.length : 0;
    
    return {
      success: true,
      message: `kubectl connection successful - found ${nodeCount} nodes`,
      nodeCount: nodeCount,
      method: 'kubectl'
    };
  } catch (error) {
    return {
      success: false,
      error: `kubectl test failed: ${error.message}`,
      method: 'kubectl'
    };
  }
}

async getPods(namespace = 'default') {
  if (!this.isConfigured) {
    throw new Error('Kubernetes client not configured');
  }

  try {
    const response = await this.k8sApi.listNamespacedPod(namespace);
    
    // Use the same pattern as testConnection
    let podData = response.items || response.body?.items || response.data?.items;
    
    if (!podData) {
      console.log('Pod response structure:', Object.keys(response));
      return [];
    }

    return podData.map(pod => ({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      status: pod.status.phase,
      ready: this.getPodReadyStatus(pod),
      restarts: this.getPodRestarts(pod),
      age: this.calculateAge(pod.metadata.creationTimestamp),
      node: pod.spec.nodeName,
      containers: pod.spec.containers.map(container => ({
        name: container.name,
        image: container.image,
        ready: this.getContainerStatus(pod, container.name)
      }))
    }));
  } catch (error) {
    console.error('Failed to get pods:', error);
    throw error;
  }
}

  async getAllPods() {
  if (!this.isConfigured) {
    throw new Error('Kubernetes client not configured');
  }

  try {
    const response = await this.k8sApi.listPodForAllNamespaces();
    
    let podData = response.items || response.body?.items || response.data?.items;
    
    if (!podData) {
      console.log('All pods response structure:', Object.keys(response));
      return [];
    }

    return podData.map(pod => ({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      status: pod.status.phase,
      ready: this.getPodReadyStatus(pod),
      restarts: this.getPodRestarts(pod),
      age: this.calculateAge(pod.metadata.creationTimestamp),
      node: pod.spec.nodeName,
      labels: pod.metadata.labels || {}
    }));
  } catch (error) {
    console.error('Failed to get all pods:', error);
    throw error;
  }
}

  async getNamespaces() {
    if (!this.isConfigured) {
      throw new Error('Kubernetes client not configured');
    }

    try {
      const response = await this.k8sApi.listNamespace();
      
      let namespaceData = response.items || response.body?.items || response.data?.items;
      
      if (!namespaceData) {
        console.log('Namespace response structure:', Object.keys(response));
        return [];
      }
      
      return namespaceData.map(ns => ({
        name: ns.metadata.name,
        status: ns.status.phase,
        age: this.calculateAge(ns.metadata.creationTimestamp)
      }));
    } catch (error) {
      console.error('Failed to get namespaces:', error);
      throw error;
    }
  }

  async getNodes() {
    if (!this.isConfigured) {
      throw new Error('Kubernetes client not configured');
    }

    try {
      const response = await this.k8sApi.listNode();
      
      let nodeData = response.items || response.body?.items || response.data?.items;
      
      if (!nodeData) {
        console.log('Node response structure:', Object.keys(response));
        return [];
      }
      
      return nodeData.map(node => ({
        name: node.metadata.name,
        status: this.getNodeStatus(node),
        roles: this.getNodeRoles(node),
        version: node.status.nodeInfo.kubeletVersion,
        age: this.calculateAge(node.metadata.creationTimestamp),
        capacity: {
          cpu: node.status.capacity.cpu,
          memory: node.status.capacity.memory,
          pods: node.status.capacity.pods
        }
      }));
    } catch (error) {
      console.error('Failed to get nodes:', error);
      throw error;
    }
  }

  getPodReadyStatus(pod) {
    const conditions = pod.status.conditions || [];
    const readyCondition = conditions.find(c => c.type === 'Ready');
    return readyCondition ? readyCondition.status === 'True' : false;
  }

  getPodRestarts(pod) {
    const containerStatuses = pod.status.containerStatuses || [];
    return containerStatuses.reduce((total, status) => total + status.restartCount, 0);
  }

  getContainerStatus(pod, containerName) {
    const containerStatuses = pod.status.containerStatuses || [];
    const status = containerStatuses.find(s => s.name === containerName);
    return status ? status.ready : false;
  }

  getNodeStatus(node) {
    const conditions = node.status.conditions || [];
    const readyCondition = conditions.find(c => c.type === 'Ready');
    return readyCondition && readyCondition.status === 'True' ? 'Ready' : 'NotReady';
  }

  getNodeRoles(node) {
    const labels = node.metadata.labels || {};
    const roles = [];
    
    if (labels['node-role.kubernetes.io/master'] !== undefined || 
        labels['node-role.kubernetes.io/control-plane'] !== undefined) {
      roles.push('master');
    }
    if (labels['node-role.kubernetes.io/worker'] !== undefined) {
      roles.push('worker');
    }
    
    return roles.length > 0 ? roles : ['worker'];
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

  async getClusterInfo() {
    if (!this.isConfigured) {
      return { configured: false, error: 'Kubernetes client not configured. Please set the kubeconfig path first.' };
    }

    try {
      const [pods, nodes, namespaces] = await Promise.all([
        this.getAllPods(),
        this.getNodes(),
        this.getNamespaces()
      ]);

      const podStats = {
        total: pods.length,
        running: pods.filter(p => p.status === 'Running').length,
        pending: pods.filter(p => p.status === 'Pending').length,
        failed: pods.filter(p => p.status === 'Failed').length,
        succeeded: pods.filter(p => p.status === 'Succeeded').length
      };

      const nodeStats = {
        total: nodes.length,
        ready: nodes.filter(n => n.status === 'Ready').length,
        notReady: nodes.filter(n => n.status === 'NotReady').length
      };

      return {
        configured: true,
        timestamp: new Date(),
        pods: podStats,
        nodes: nodeStats,
        namespaces: namespaces.length
      };
    } catch (error) {
      console.error('Failed to get cluster info:', error);
      return { configured: false, error: error.message };
    }
  }
}

module.exports = new KubernetesService();