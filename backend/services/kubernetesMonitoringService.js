const emailService = require('./emailService');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');

class KubernetesMonitoringService {
  constructor() {
    this.podStatuses = new Map();
    this.nodeStatuses = new Map();
    this.emailSentStatus = new Map();
  }

  async checkPodHealth() {
    try {
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured || !config.emailGroupId) {
        return;
      }

      const pods = await kubernetesService.getAllPods();
      
      for (const pod of pods) {
        const podKey = `${pod.namespace}/${pod.name}`;
        const previousStatus = this.podStatuses.get(podKey);
        
        if (previousStatus && previousStatus.status !== 'Failed' && pod.status === 'Failed') {
          // Pod went from healthy to failed
          await this.sendPodFailureAlert(pod, config.emailGroupId);
        }
        
        this.podStatuses.set(podKey, {
          status: pod.status,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Kubernetes pod health check failed:', error);
    }
  }

  async sendPodFailureAlert(pod, emailGroupId) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group for Kubernetes alerts');
        return false;
      }

      const currentTime = new Date();
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: `☸️ KUBERNETES ALERT: Pod Failed - ${pod.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES ALERT</h1>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #dc3545;">
              <h2 style="color: #dc3545; margin-top: 0;">Pod Status: FAILED</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; width: 30%;">Pod Name:</td>
                  <td style="padding: 8px;">${pod.name}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Namespace:</td>
                  <td style="padding: 8px;">${pod.namespace}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Status:</td>
                  <td style="padding: 8px; color: #dc3545;">🔴 FAILED</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Node:</td>
                  <td style="padding: 8px;">${pod.node || 'Unknown'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Alert Time:</td>
                  <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold;">Alert Group:</td>
                  <td style="padding: 8px;">${targetGroup.name}</td>
                </tr>
              </table>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #856404;">⚠️ ACTION REQUIRED</h3>
                <ul style="color: #856404; margin: 10px 0;">
                  <li>Check pod logs: kubectl logs ${pod.name} -n ${pod.namespace}</li>
                  <li>Verify resource availability</li>
                  <li>Check cluster node health</li>
                  <li>Review deployment configuration</li>
                </ul>
              </div>
            </div>
            
            <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
              <p style="margin: 0;">This alert was sent to: ${targetGroup.name}</p>
              <p style="margin: 5px 0 0 0;">Monitor your Kubernetes cluster for additional issues</p>
            </div>
          </div>
        `
      };

      await emailService.transporter.sendMail(mailOptions);
      console.log('📧 ✅ Kubernetes pod failure alert sent successfully');
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send Kubernetes alert:', error);
      return false;
    }
  }
}

module.exports = new KubernetesMonitoringService();