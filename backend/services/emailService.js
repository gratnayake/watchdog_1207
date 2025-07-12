const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const emailConfigService = require('./emailConfigService');

class EmailService {
  constructor() {
    this.emailListFile = path.join(__dirname, '../data/email-list.json');
    this.ensureEmailListFile();
    this.transporter = null;
    this.isConfigured = false;
    this.setupTransporter();
  }

  setupTransporter() {
  try {
    const emailConfig = emailConfigService.getConfig();
    
    if (emailConfig.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: parseInt(emailConfig.port) || 587,
        secure: false,
        auth: {
          user: emailConfig.user,
          pass: emailConfig.password
        },
        tls: {
          rejectUnauthorized: false
        }
      });
      this.isConfigured = true;
      console.log('📧 Email service configured from JSON file');
    } else {
      console.log('⚠️ Email service not configured - missing settings in JSON file');
    }
  } catch (error) {
    console.error('❌ Error setting up email service:', error);
    this.isConfigured = false;
  }
}

  ensureEmailListFile() {
  if (!fs.existsSync(this.emailListFile)) {
    const defaultEmailList = {
      groups: [
        {
          id: 1,
          name: 'Database Administrators',
          description: 'Primary DBA team for critical alerts',
          emails: ['dba@company.com'],
          enabled: true,
          alertTypes: ['down', 'up'],
          createdAt: new Date().toISOString()
        },
        {
          id: 2,
          name: 'Operations Team',
          description: 'Operations team for monitoring',
          emails: ['ops@company.com'],
          enabled: true,
          alertTypes: ['down', 'up'],
          createdAt: new Date().toISOString()
        }
      ],
      lastUpdated: new Date().toISOString()
    };
    this.saveEmailList(defaultEmailList);
    console.log('📧 Created default email groups');
  }
}
  loadEmailList() {
    try {
      const data = fs.readFileSync(this.emailListFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading email list:', error);
      return { emails: [], lastUpdated: new Date().toISOString() };
    }
  }

  saveEmailList(emailData) {
    try {
      fs.writeFileSync(this.emailListFile, JSON.stringify(emailData, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving email list:', error);
      return false;
    }
  }

  // Get all groups
getEmailGroups() {
  const data = this.loadEmailList();
  return data.groups || [];
}

// Create new group
createGroup(groupData) {
  const data = this.loadEmailList();
  const newGroup = {
    id: Date.now(),
    name: groupData.name,
    description: groupData.description || '',
    emails: groupData.emails || [],
    enabled: groupData.enabled !== false,
    alertTypes: groupData.alertTypes || ['down', 'up'],
    createdAt: new Date().toISOString()
  };
  
  data.groups = data.groups || [];
  data.groups.push(newGroup);
  data.lastUpdated = new Date().toISOString();
  
  return this.saveEmailList(data) ? newGroup : null;
}

// Update group
updateGroup(groupId, groupData) {
  const data = this.loadEmailList();
  const groupIndex = data.groups.findIndex(g => g.id === parseInt(groupId));
  
  if (groupIndex === -1) return null;
  
  data.groups[groupIndex] = {
    ...data.groups[groupIndex],
    ...groupData,
    updatedAt: new Date().toISOString()
  };
  data.lastUpdated = new Date().toISOString();
  
  return this.saveEmailList(data) ? data.groups[groupIndex] : null;
}

// Delete group
deleteGroup(groupId) {
  const data = this.loadEmailList();
  const groupIndex = data.groups.findIndex(g => g.id === parseInt(groupId));
  
  if (groupIndex === -1) return false;
  
  data.groups.splice(groupIndex, 1);
  data.lastUpdated = new Date().toISOString();
  
  return this.saveEmailList(data);
}

// Get all emails from enabled groups
getAllEnabledEmails() {
  const groups = this.getEmailGroups();
  const allEmails = [];
  
  groups.forEach(group => {
    if (group.enabled) {
      allEmails.push(...group.emails);
    }
  });
  
  return [...new Set(allEmails)]; // Remove duplicates
}

getEmailConfig() {
  const emailConfigService = require('./emailConfigService');
  return emailConfigService.getConfig();
}

  async sendDownAlert(error = null) {
    if (!this.isConfigured) {
      console.log('❌ Email service not configured');
      return false;
    }

    const allEmails = this.getAllEnabledEmails();
    
    if (allEmails.length === 0) {
      console.log('⚠️ No enabled email groups configured for alerts');
      return false;
    }

    const currentTime = new Date();
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailList.emails.join(','),
      subject: '🚨 CRITICAL ALERT: Oracle Database is DOWN',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🚨 DATABASE ALERT</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #dc3545;">
            <h2 style="color: #dc3545; margin-top: 0;">Database Status: DOWN</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">Status:</td>
                <td style="padding: 8px; color: #dc3545;">🔴 OFFLINE</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Alert Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Timestamp:</td>
                <td style="padding: 8px;">${currentTime.toISOString()}</td>
              </tr>
              ${error ? `
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Error:</td>
                <td style="padding: 8px; color: #dc3545;">${error}</td>
              </tr>
              ` : ''}
            </table>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ IMMEDIATE ACTION REQUIRED</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check database server status immediately</li>
                <li>Verify network connectivity to database host</li>
                <li>Review database error logs</li>
                <li>Contact system administrator if needed</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This is an automated alert from the Oracle Database Monitoring System</p>
            <p style="margin: 5px 0 0 0;">You will receive another email when the database is back online</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('📧 ✅ DOWN alert email sent successfully to:', emailList.emails.join(', '));
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send DOWN alert email:', error);
      return false;
    }
  }

  async sendUpAlert(downtime = 'Unknown') {
    if (!this.isConfigured) {
      console.log('❌ Email service not configured - cannot send up alert');
      return false;
    }

    const emailList = this.loadEmailList();
    
    if (emailList.emails.length === 0) {
      console.log('⚠️ No email addresses configured for alerts');
      return false;
    }

    const currentTime = new Date();
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailList.emails.join(','),
      subject: '✅ RESOLVED: Oracle Database is ONLINE',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">✅ DATABASE RECOVERY</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #28a745;">
            <h2 style="color: #28a745; margin-top: 0;">Database Status: ONLINE</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">Status:</td>
                <td style="padding: 8px; color: #28a745;">🟢 ONLINE</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Recovery Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Total Downtime:</td>
                <td style="padding: 8px; color: #dc3545; font-weight: bold;">${downtime}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Timestamp:</td>
                <td style="padding: 8px;">${currentTime.toISOString()}</td>
              </tr>
            </table>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">ℹ️ STATUS UPDATE</h3>
              <ul style="color: #0c5460; margin: 10px 0;">
                <li>Database connection has been restored</li>
                <li>All services should be functioning normally</li>
                <li>Monitor the database for any unusual activity</li>
                <li>Review logs to determine the cause of the outage</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This is an automated recovery notification from the Oracle Database Monitoring System</p>
            <p style="margin: 5px 0 0 0;">Monitoring will continue automatically</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('📧 ✅ UP alert email sent successfully to:', emailList.emails.join(', '));
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send UP alert email:', error);
      return false;
    }
  }

  // Test email configuration
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Send test email
  async sendTestEmail() {
    if (!this.isConfigured) {
      return { success: false, message: 'Email service not configured' };
    }

    const emailList = this.loadEmailList();
    
    if (emailList.emails.length === 0) {
      return { success: false, message: 'No email addresses configured' };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailList.emails.join(','),
      subject: '🧪 Test Email - Oracle Database Monitoring System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🧪 Test Email</h1>
          </div>
          <div style="padding: 20px;">
            <p>This is a test email from your Oracle Database Monitoring System.</p>
            <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
            <p>If you received this email, your email configuration is working correctly!</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Get email list
  getEmailList() {
    return this.loadEmailList();
  }

  // Update email list
  updateEmailList(emails) {
    const emailData = {
      emails: emails,
      lastUpdated: new Date().toISOString()
    };
    
    const saved = this.saveEmailList(emailData);
    return saved;
  }

  // Add email to list
  addEmail(email) {
    const emailList = this.loadEmailList();
    
    if (!emailList.emails.includes(email)) {
      emailList.emails.push(email);
      emailList.lastUpdated = new Date().toISOString();
      return this.saveEmailList(emailList);
    }
    
    return false; // Email already exists
  }

  // Remove email from list
  removeEmail(email) {
    const emailList = this.loadEmailList();
    const index = emailList.emails.indexOf(email);
    
    if (index > -1) {
      emailList.emails.splice(index, 1);
      emailList.lastUpdated = new Date().toISOString();
      return this.saveEmailList(emailList);
    }
    
    return false; // Email not found
  }
}

module.exports = new EmailService();