// backend/services/podActionsService.js - Fixed version with better error handling

const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class PodActionsService {
  constructor() {
    console.log('🎮 Pod Actions Service initialized');
  }

  // Check if Kubernetes is configured and accessible
  async checkKubernetesAvailability() {
    try {
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        return {
          available: false,
          message: 'Kubernetes not configured. Please configure kubeconfig path first.',
          configured: false
        };
      }

      // Test basic connectivity
      const testResult = await kubernetesService.testConnection();
      return {
        available: testResult.success,
        message: testResult.success ? 'Kubernetes cluster accessible' : testResult.error,
        configured: true,
        error: testResult.error
      };
    } catch (error) {
      return {
        available: false,
        message: `Error checking Kubernetes: ${error.message}`,
        configured: true,
        error: error.message
      };
    }
  }

  // Restart a pod by deleting it (Kubernetes will recreate it)
  async restartPod(namespace, podName) {
    try {
      console.log(`🔄 Restarting pod: ${namespace}/${podName}`);
      
      const availability = await this.checkKubernetesAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }

      // Validate inputs
      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      // Try using Node.js Kubernetes client first
      try {
        const result = await this.restartPodViaClient(namespace, podName);
        if (result.success) {
          return result;
        }
      } catch (clientError) {
        console.log(`Node.js client failed: ${clientError.message}, trying kubectl...`);
      }

      // Fallback to kubectl with better error handling
      const result = await this.executeKubectlSafe(`delete pod ${podName} -n ${namespace}`, 'restart');
      
      console.log(`✅ Pod restart initiated: ${namespace}/${podName}`);
      return {
        success: true,
        message: `Pod ${podName} restart initiated successfully`,
        output: result.output,
        method: 'kubectl',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to restart pod ${namespace}/${podName}:`, error);
      return {
        success: false,
        message: `Failed to restart pod: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Delete a pod permanently
  async deletePod(namespace, podName, force = false) {
    try {
      console.log(`🗑️ Deleting pod: ${namespace}/${podName} (force: ${force})`);
      
      const availability = await this.checkKubernetesAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }

      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      // Try Node.js client first
      try {
        const result = await this.deletePodViaClient(namespace, podName, force);
        if (result.success) {
          return result;
        }
      } catch (clientError) {
        console.log(`Node.js client failed: ${clientError.message}, trying kubectl...`);
      }

      // Fallback to kubectl
      const forceFlag = force ? ' --force --grace-period=0' : '';
      const result = await this.executeKubectlSafe(`delete pod ${podName} -n ${namespace}${forceFlag}`, 'delete');
      
      console.log(`✅ Pod deleted: ${namespace}/${podName}`);
      return {
        success: true,
        message: `Pod ${podName} deleted successfully`,
        output: result.output,
        method: 'kubectl',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to delete pod ${namespace}/${podName}:`, error);
      return {
        success: false,
        message: `Failed to delete pod: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Restart pod via Node.js Kubernetes client
  async restartPodViaClient(namespace, podName) {
    try {
      if (!kubernetesService.isConfigured) {
        throw new Error('Kubernetes client not configured');
      }

      // Use the existing kubernetesService to delete the pod
      const k8sApi = kubernetesService.k8sApi;
      await k8sApi.deleteNamespacedPod(podName, namespace);
      
      return {
        success: true,
        message: `Pod ${podName} restart initiated via Node.js client`,
        method: 'nodejs_client'
      };
    } catch (error) {
      throw new Error(`Node.js client restart failed: ${error.message}`);
    }
  }

  // Delete pod via Node.js Kubernetes client
  async deletePodViaClient(namespace, podName, force = false) {
    try {
      if (!kubernetesService.isConfigured) {
        throw new Error('Kubernetes client not configured');
      }

      const k8sApi = kubernetesService.k8sApi;
      
      const deleteOptions = force ? {
        gracePeriodSeconds: 0,
        propagationPolicy: 'Foreground'
      } : undefined;

      await k8sApi.deleteNamespacedPod(podName, namespace, undefined, undefined, deleteOptions);
      
      return {
        success: true,
        message: `Pod ${podName} deleted via Node.js client`,
        method: 'nodejs_client'
      };
    } catch (error) {
      throw new Error(`Node.js client delete failed: ${error.message}`);
    }
  }

  // Get pod logs with better error handling
  async getPodLogs(namespace, podName, container = null, lines = 100, follow = false) {
    try {
      console.log(`📝 Getting logs for pod: ${namespace}/${podName}`);
      
      const availability = await this.checkKubernetesAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }

      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      // Try Node.js client first
      try {
        const result = await this.getPodLogsViaClient(namespace, podName, container, lines);
        if (result.success) {
          return result;
        }
      } catch (clientError) {
        console.log(`Node.js client logs failed: ${clientError.message}, trying kubectl...`);
      }

      // Fallback to kubectl
      let command = `logs ${podName} -n ${namespace} --tail=${lines}`;
      if (container) {
        command += ` -c ${container}`;
      }

      const result = await this.executeKubectlSafe(command, 'logs');
      
      console.log(`✅ Retrieved logs for pod: ${namespace}/${podName}`);
      return {
        success: true,
        logs: result.output || 'No logs available',
        method: 'kubectl',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to get logs for pod ${namespace}/${podName}:`, error);
      return {
        success: false,
        logs: `Error retrieving logs: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Get pod logs via Node.js client
  async getPodLogsViaClient(namespace, podName, container = null, lines = 100) {
    try {
      if (!kubernetesService.isConfigured) {
        throw new Error('Kubernetes client not configured');
      }

      const k8sApi = kubernetesService.k8sApi;
      
      const logOptions = {
        follow: false,
        tailLines: lines,
        timestamps: false
      };

      if (container) {
        logOptions.container = container;
      }

      const logResponse = await k8sApi.readNamespacedPodLog(
        podName, 
        namespace, 
        container,
        false, // follow
        undefined, // limitBytes
        undefined, // pretty
        undefined, // previous
        undefined, // sinceSeconds
        lines, // tailLines
        false // timestamps
      );

      return {
        success: true,
        logs: logResponse.body || 'No logs available',
        method: 'nodejs_client'
      };
    } catch (error) {
      throw new Error(`Node.js client logs failed: ${error.message}`);
    }
  }

  // Execute kubectl command with better error handling and certificate issues
  async executeKubectlSafe(command, operation) {
    try {
      const config = kubernetesConfigService.getConfig();
      let kubeconfigFlag = '';
      
      if (config.kubeconfigPath) {
        kubeconfigFlag = `--kubeconfig="${config.kubeconfigPath}"`;
      }

      // Add insecure flag if we're having certificate issues
      const fullCommand = `kubectl ${kubeconfigFlag} ${command} --insecure-skip-tls-verify=true`;
      
      console.log(`🔧 Executing kubectl command for ${operation}: ${command}`);
      
      const result = await execAsync(fullCommand, { 
        timeout: 60000,  // 60 second timeout
        env: { ...process.env }
      });
      
      return {
        success: true,
        output: result.stdout || `${operation} completed successfully`,
        stderr: result.stderr
      };

    } catch (error) {
      // Handle specific kubectl errors
      if (error.message.includes('x509') || error.message.includes('certificate')) {
        throw new Error(`Kubernetes certificate error: ${error.message}. Consider updating your kubeconfig or using --insecure-skip-tls-verify flag.`);
      } else if (error.message.includes('Unable to connect')) {
        throw new Error(`Cannot connect to Kubernetes cluster: ${error.message}. Check if the cluster is accessible.`);
      } else if (error.message.includes('not found')) {
        throw new Error(`Resource not found: ${error.message}`);
      } else {
        throw new Error(`kubectl ${operation} failed: ${error.message}`);
      }
    }
  }

  // Scale deployment (affects pods)
  async scaleDeployment(namespace, deploymentName, replicas) {
    try {
      console.log(`📏 Scaling deployment: ${namespace}/${deploymentName} to ${replicas} replicas`);
      
      const availability = await this.checkKubernetesAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }

      if (!namespace || !deploymentName || replicas === undefined) {
        throw new Error('Namespace, deployment name, and replica count are required');
      }

      const result = await this.executeKubectlSafe(`scale deployment ${deploymentName} -n ${namespace} --replicas=${replicas}`, 'scale');
      
      console.log(`✅ Deployment scaled: ${namespace}/${deploymentName} to ${replicas} replicas`);
      return {
        success: true,
        message: `Deployment ${deploymentName} scaled to ${replicas} replicas`,
        output: result.output,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to scale deployment ${namespace}/${deploymentName}:`, error);
      return {
        success: false,
        message: `Failed to scale deployment: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Get pod description/details
  async describePod(namespace, podName) {
    try {
      console.log(`📋 Describing pod: ${namespace}/${podName}`);
      
      const availability = await this.checkKubernetesAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }

      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      const result = await this.executeKubectlSafe(`describe pod ${podName} -n ${namespace}`, 'describe');
      
      console.log(`✅ Pod description retrieved: ${namespace}/${podName}`);
      return {
        success: true,
        description: result.output,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to describe pod ${namespace}/${podName}:`, error);
      return {
        success: false,
        description: `Error describing pod: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Execute command in pod
  async execInPod(namespace, podName, container = null, command = '/bin/bash') {
    try {
      console.log(`⚡ Generating exec command for pod: ${namespace}/${podName}`);
      
      const availability = await this.checkKubernetesAvailability();
      if (!availability.available) {
        throw new Error(availability.message);
      }

      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      const config = kubernetesConfigService.getConfig();
      let kubeconfigFlag = '';
      
      if (config.kubeconfigPath) {
        kubeconfigFlag = `--kubeconfig="${config.kubeconfigPath}"`;
      }

      let execCommand = `kubectl ${kubeconfigFlag} exec -it ${podName} -n ${namespace}`;
      if (container) {
        execCommand += ` -c ${container}`;
      }
      execCommand += ` -- ${command}`;

      return {
        success: true,
        message: `Exec command ready for pod ${podName}`,
        execCommand: execCommand,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to create exec command for pod ${namespace}/${podName}:`, error);
      return {
        success: false,
        message: `Failed to create exec command: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Get list of containers in a pod
  async getPodContainers(namespace, podName) {
    try {
      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      const result = await this.executeKubectlSafe(`get pod ${podName} -n ${namespace} -o jsonpath='{.spec.containers[*].name}'`, 'get-containers');
      
      if (result.output && result.output.trim()) {
        const containers = result.output.trim().split(' ').filter(name => name);
        return {
          success: true,
          containers: containers
        };
      }
      
      return {
        success: false,
        message: 'No containers found'
      };

    } catch (error) {
      return {
        success: false,
        message: `Error getting containers: ${error.message}`,
        error: error.message
      };
    }
  }

  // Get deployment info for a pod
  async getDeploymentInfo(namespace, podName) {
    try {
      if (!namespace || !podName) {
        throw new Error('Namespace and pod name are required');
      }

      // Try to find the deployment that owns this pod
      const result = await this.executeKubectlSafe(`get pod ${podName} -n ${namespace} -o jsonpath='{.metadata.ownerReferences[0].name}'`, 'get-owner');
      
      if (result.output && result.output.trim()) {
        const ownerName = result.output.trim();
        
        // Get the deployment info
        const deploymentResult = await this.executeKubectlSafe(`get deployment ${ownerName} -n ${namespace} -o json`, 'get-deployment');
        
        if (deploymentResult.output) {
          try {
            const deployment = JSON.parse(deploymentResult.output);
            return {
              success: true,
              deployment: {
                name: deployment.metadata.name,
                namespace: deployment.metadata.namespace,
                replicas: deployment.spec.replicas,
                readyReplicas: deployment.status.readyReplicas || 0,
                availableReplicas: deployment.status.availableReplicas || 0
              }
            };
          } catch (parseError) {
            throw new Error('Failed to parse deployment JSON');
          }
        }
      }
      
      return {
        success: false,
        message: 'No deployment found for this pod'
      };

    } catch (error) {
      return {
        success: false,
        message: `Error getting deployment info: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = new PodActionsService();