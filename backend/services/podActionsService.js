// backend/services/podActionsService.js
const kubernetesService = require('./kubernetesService');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class PodActionsService {
  constructor() {
    console.log('🎮 Pod Actions Service initialized');
  }

  // Check if Kubernetes is configured
  isKubernetesConfigured() {
    return kubernetesService.isConfigured;
  }

  // Restart a pod by deleting it (Kubernetes will recreate it)
  async restartPod(namespace, podName) {
    try {
      console.log(`🔄 Restarting pod: ${namespace}/${podName}`);
      
      if (!this.isKubernetesConfigured()) {
        throw new Error('Kubernetes not configured');
      }

      // Delete the pod - Kubernetes will recreate it automatically
      const result = await this.executeKubectl(`delete pod ${podName} -n ${namespace}`);
      
      console.log(`✅ Pod restart initiated: ${namespace}/${podName}`);
      return {
        success: true,
        message: `Pod ${podName} restart initiated successfully`,
        output: result.stdout,
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
      
      if (!this.isKubernetesConfigured()) {
        throw new Error('Kubernetes not configured');
      }

      const forceFlag = force ? ' --force --grace-period=0' : '';
      const result = await this.executeKubectl(`delete pod ${podName} -n ${namespace}${forceFlag}`);
      
      console.log(`✅ Pod deleted: ${namespace}/${podName}`);
      return {
        success: true,
        message: `Pod ${podName} deleted successfully`,
        output: result.stdout,
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

  // Get pod logs
  async getPodLogs(namespace, podName, container = null, lines = 100, follow = false) {
    try {
      console.log(`📝 Getting logs for pod: ${namespace}/${podName}`);
      
      if (!this.isKubernetesConfigured()) {
        throw new Error('Kubernetes not configured');
      }

      let command = `logs ${podName} -n ${namespace} --tail=${lines}`;
      if (container) {
        command += ` -c ${container}`;
      }
      if (follow) {
        command += ' -f';
      }

      const result = await this.executeKubectl(command);
      
      console.log(`✅ Retrieved logs for pod: ${namespace}/${podName}`);
      return {
        success: true,
        logs: result.stdout || 'No logs available',
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

  // Execute command in pod
  async execInPod(namespace, podName, container = null, command = '/bin/bash') {
    try {
      console.log(`⚡ Executing command in pod: ${namespace}/${podName}`);
      
      if (!this.isKubernetesConfigured()) {
        throw new Error('Kubernetes not configured');
      }

      let execCommand = `exec -it ${podName} -n ${namespace}`;
      if (container) {
        execCommand += ` -c ${container}`;
      }
      execCommand += ` -- ${command}`;

      // For exec commands, we'll return the command to be executed
      // The actual execution should be handled by a terminal session
      return {
        success: true,
        message: `Exec session ready for pod ${podName}`,
        execCommand: `kubectl ${execCommand}`,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to create exec session for pod ${namespace}/${podName}:`, error);
      return {
        success: false,
        message: `Failed to create exec session: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Scale deployment (affects pods)
  async scaleDeployment(namespace, deploymentName, replicas) {
    try {
      console.log(`📏 Scaling deployment: ${namespace}/${deploymentName} to ${replicas} replicas`);
      
      if (!this.isKubernetesConfigured()) {
        throw new Error('Kubernetes not configured');
      }

      const result = await this.executeKubectl(`scale deployment ${deploymentName} -n ${namespace} --replicas=${replicas}`);
      
      console.log(`✅ Deployment scaled: ${namespace}/${deploymentName} to ${replicas} replicas`);
      return {
        success: true,
        message: `Deployment ${deploymentName} scaled to ${replicas} replicas`,
        output: result.stdout,
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
      
      if (!this.isKubernetesConfigured()) {
        throw new Error('Kubernetes not configured');
      }

      const result = await this.executeKubectl(`describe pod ${podName} -n ${namespace}`);
      
      console.log(`✅ Pod description retrieved: ${namespace}/${podName}`);
      return {
        success: true,
        description: result.stdout,
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

  // Get deployment info for a pod
  async getDeploymentInfo(namespace, podName) {
    try {
      // Try to find the deployment that owns this pod
      const result = await this.executeKubectl(`get pod ${podName} -n ${namespace} -o jsonpath='{.metadata.ownerReferences[0].name}'`);
      
      if (result.stdout) {
        const ownerName = result.stdout.trim();
        // Get the deployment info
        const deploymentResult = await this.executeKubectl(`get deployment ${ownerName} -n ${namespace} -o json`);
        
        if (deploymentResult.stdout) {
          const deployment = JSON.parse(deploymentResult.stdout);
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

  // Execute kubectl command
  async executeKubectl(command) {
    try {
      const fullCommand = `kubectl ${command}`;
      console.log(`🔧 Executing: ${fullCommand}`);
      
      const result = await execAsync(fullCommand, { 
        timeout: 30000,  // 30 second timeout
        env: { ...process.env }
      });
      
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr
      };

    } catch (error) {
      console.error(`❌ kubectl command failed: ${error.message}`);
      throw new Error(`kubectl command failed: ${error.message}`);
    }
  }

  // Get list of containers in a pod
  async getPodContainers(namespace, podName) {
    try {
      const result = await this.executeKubectl(`get pod ${podName} -n ${namespace} -o jsonpath='{.spec.containers[*].name}'`);
      
      if (result.stdout) {
        const containers = result.stdout.trim().split(' ').filter(name => name);
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
}

module.exports = new PodActionsService();