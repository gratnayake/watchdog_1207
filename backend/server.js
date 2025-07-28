require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const monitoringService = require('./services/monitoringService');
const emailService = require('./services/emailService');
const logService = require('./services/logService');
const systemMonitoringService = require('./services/systemMonitoringService');
const emailConfigService = require('./services/emailConfigService');
const kubernetesService = require('./services/kubernetesService');
const urlMonitoringService = require('./services/urlMonitoringService');
const kubernetesConfigService = require('./services/kubernetesConfigService');
const thresholdService = require('./services/thresholdService');
const databaseOperationsService = require('./services/databaseOperationsService');
const podActionsService = require('./services/podActionsService');
const kubernetesMonitoringService = require('./services/kubernetesMonitoringService');
const podLifecycleService = require('./services/podLifecycleService');
const scriptService = require('./services/scriptService');


const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');


const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Import services
const userService = require('./services/userService');
const dbConfigService = require('./services/dbConfigService');
const realOracleService = require('./services/realOracleService');
const execAsync = util.promisify(exec);


// Function to load Kubernetes config
const loadKubernetesConfig = () => {
  try {
    const configPath = path.join(__dirname, 'data', 'kubernetes-config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return config;
    }
    return null;
  } catch (error) {
    console.error('Failed to load Kubernetes config:', error);
    return null;
  }
};


// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Oracle Monitor API with Real Database Connection!',
    timestamp: new Date(),
    status: 'OK',
    userCount: userService.getUserCount(),
    dbConfigured: dbConfigService.getConfig().isConfigured
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    userCount: userService.getUserCount(),
    dbConfigured: dbConfigService.getConfig().isConfigured
  });
});

// AUTH ROUTES
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = userService.authenticateUser(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// USER ROUTES (keeping existing user management)
app.get('/api/users', (req, res) => {
  try {
    const users = userService.getAllUsers();
    console.log(`📋 Fetched ${users.length} users`);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const { username, password, firstName, lastName, email, role, status } = req.body;

    console.log('📝 Creating user:', { username, firstName, lastName, email, role, status });

    if (!username || !password || !firstName || !lastName || !email) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Username, password, first name, last name, and email are required' 
      });
    }

    const userData = {
      username, password, firstName, lastName, email,
      role: role || 'user',
      status: status || 'active'
    };

    const newUser = userService.createUser(userData);
    console.log('✅ User created successfully:', newUser.username);
    
    res.status(201).json({ 
      success: true, 
      user: newUser,
      message: 'User created successfully' 
    });
  } catch (error) {
    console.error('❌ Create user error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstName, lastName, email, role, status } = req.body;

    console.log('🔄 Updating user:', id, { username, firstName, lastName, email, role, status });

    const userData = { username, firstName, lastName, email, role, status };

    if (password && password.trim() !== '') {
      userData.password = password;
    }

    Object.keys(userData).forEach(key => 
      userData[key] === undefined && delete userData[key]
    );

    const updatedUser = userService.updateUser(id, userData);
    console.log('✅ User updated successfully:', updatedUser.username);
    
    res.json({ 
      success: true, 
      user: updatedUser,
      message: 'User updated successfully' 
    });
  } catch (error) {
    console.error('❌ Update user error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Deleting user:', id);
    
    userService.deleteUser(id);
    console.log('✅ User deleted successfully');
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Delete user error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DATABASE CONFIGURATION ROUTES
app.get('/api/database/config', (req, res) => {
  try {
    const config = dbConfigService.getPublicConfig();
    console.log('📄 Sending database config (with email group):', {
      isConfigured: config.isConfigured,
      host: config.host,
      emailGroupId: config.emailGroupId
    });
    
    res.json({ 
      success: true, 
      config: config 
    });
  } catch (error) {
    console.error('❌ Get database config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/email-config', (req, res) => {
  try {
    const emailGroupId = dbConfigService.getEmailGroupForAlerts();
    const isConfigured = dbConfigService.isEmailAlertsConfigured();
    
    res.json({
      success: true,
      emailGroupId: emailGroupId,
      isConfigured: isConfigured
    });
  } catch (error) {
    console.error('❌ Get database email config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/database/config', (req, res) => {
  try {
    const { host, port, serviceName, username, password, emailGroupId } = req.body;

    console.log('💾 Saving database config with data:', {
      host,
      port,
      serviceName,
      username,
      emailGroupId: emailGroupId || 'none',
      password: password ? '***' : 'empty'
    });

    // Validate required fields
    if (!host || !port || !serviceName || !username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'All database connection fields are required' 
      });
    }

    // Prepare config data including email group
    const configData = { 
      host, 
      port, 
      serviceName, 
      username, 
      password,
      emailGroupId: emailGroupId || null // Include email group ID
    };
    
    const saved = dbConfigService.updateConfig(configData);
    
    if (saved) {
      console.log('✅ Database config saved successfully with email group');
      res.json({ 
        success: true, 
        message: 'Database configuration saved successfully',
        config: dbConfigService.getPublicConfig()
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to save database configuration' 
      });
    }
  } catch (error) {
    console.error('❌ Save database config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/database/test-connection', async (req, res) => {
  try {
    const { host, port, serviceName, username, password } = req.body;

    console.log('🧪 Testing database connection:', { host, port, serviceName, username });

    if (!host || !port || !serviceName || !username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'All connection fields are required for testing' 
      });
    }

    const connectionDetails = { host, port, serviceName, username, password };
    const testResult = await realOracleService.testConnection(connectionDetails);
    
    if (testResult.success) {
      console.log('✅ Database connection test successful');
      res.json({ 
        success: true, 
        message: 'Connection test successful!',
        details: testResult
      });
    } else {
      console.log('❌ Database connection test failed:', testResult.message);
      res.status(400).json({ 
        success: false,
        error: testResult.message,
        details: testResult
      });
    }
  } catch (error) {
    console.error('❌ Test connection error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DATABASE MONITORING ROUTES - REAL-TIME
app.get('/api/database/status', async (req, res) => {
  try {
    const status = realOracleService.getConnectionStatus();
    
    if (status.isConfigured) {
      const connectionCheck = await realOracleService.checkConnection();
      
      res.json({
        success: true,
        status: connectionCheck.isConnected ? 'UP' : 'DOWN',
        timestamp: new Date(),
        isDown: !connectionCheck.isConnected,
        responseTime: connectionCheck.responseTime || 'N/A',
        connectionStatus: status,
        configured: true,
        error: connectionCheck.error || null
      });
    } else {
      res.json({
        success: true,
        status: 'NOT_CONFIGURED',
        timestamp: new Date(),
        isDown: true,
        configured: false,
        message: 'Database connection not configured'
      });
    }
  } catch (error) {
    console.error('❌ Database status error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/dashboard', async (req, res) => {
  try {
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    console.log('📊 Fetching real-time dashboard data...');
    const dashboardData = await realOracleService.getRealtimeDashboardData();
    
    res.json({ 
      success: true, 
      data: dashboardData,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Dashboard data error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/tablespace', async (req, res) => {
  try {
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const tablespaceData = await realOracleService.getTablespaceInfo();
    console.log(`📊 Retrieved tablespace data for ${tablespaceData.length} tablespaces`);
    
    res.json({ success: true, data: tablespaceData });
  } catch (error) {
    console.error('❌ Tablespace data error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/info', async (req, res) => {
  try {
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const [versionInfo, instanceInfo, sessionInfo] = await Promise.allSettled([
      realOracleService.getDatabaseVersion(),
      realOracleService.getInstanceInfo(),
      realOracleService.getSessionInfo()
    ]);

    const dbInfo = {
      version: versionInfo.status === 'fulfilled' ? versionInfo.value : { version: 'Unknown' },
      instance: instanceInfo.status === 'fulfilled' ? instanceInfo.value : null,
      sessions: sessionInfo.status === 'fulfilled' ? sessionInfo.value : null
    };
    
    console.log('📊 Retrieved database info');
    res.json({ success: true, data: dbInfo });
  } catch (error) {
    console.error('❌ Database info error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// MONITORING ROUTES
app.get('/api/monitoring/status', (req, res) => {
  try {
    const status = monitoringService.getMonitoringStatus();
    console.log('📊 Monitoring status requested');
    res.json({ success: true, status });
  } catch (error) {
    console.error('❌ Get monitoring status error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/monitoring/start', (req, res) => {
  try {
    const started = monitoringService.startMonitoring();
    
    if (started) {
      console.log('🚀 Monitoring started via API');
      res.json({ 
        success: true, 
        message: 'Database monitoring started successfully',
        status: monitoringService.getMonitoringStatus()
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Failed to start monitoring (already running or database not configured)' 
      });
    }
  } catch (error) {
    console.error('❌ Start monitoring error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/monitoring/stop', (req, res) => {
  try {
    const stopped = monitoringService.stopMonitoring();
    
    if (stopped) {
      console.log('🛑 Monitoring stopped via API');
      res.json({ 
        success: true, 
        message: 'Database monitoring stopped successfully',
        status: monitoringService.getMonitoringStatus()
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Monitoring was not running' 
      });
    }
  } catch (error) {
    console.error('❌ Stop monitoring error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/monitoring/force-check', async (req, res) => {
  try {
    console.log('🔍 Manual check requested');
    const result = await monitoringService.forceCheck();
    
    res.json({ 
      success: true, 
      message: 'Manual check completed',
      result: result,
      status: monitoringService.getMonitoringStatus()
    });
  } catch (error) {
    console.error('❌ Force check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/monitoring/history', (req, res) => {
  try {
    const history = monitoringService.getMonitoringHistory();
    console.log(`📊 Retrieved ${history.length} monitoring checks`);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('❌ Get monitoring history error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DOWNTIME LOGS ROUTES
app.get('/api/logs/downtime', async (req, res) => {
  try {
    const logs = await logService.getDowntimeLogs();
    console.log(`📝 Retrieved ${logs.length} downtime log entries`);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('❌ Get downtime logs error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// EMAIL MANAGEMENT ROUTES
app.get('/api/email/list', (req, res) => {
  try {
    const emailList = emailService.getEmailList();
    console.log('📧 Email list requested');
    res.json({ success: true, data: emailList });
  } catch (error) {
    console.error('❌ Get email list error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/email/list', (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid email array is required' 
      });
    }
    
    const updated = emailService.updateEmailList(emails);
    
    if (updated) {
      console.log('📧 Email list updated');
      res.json({ 
        success: true, 
        message: 'Email list updated successfully',
        data: emailService.getEmailList()
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to update email list' 
      });
    }
  } catch (error) {
    console.error('❌ Update email list error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/email/test', async (req, res) => {
  try {
    console.log('📧 Test email requested');
    const result = await emailService.sendTestEmail();
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Test email sent successfully!'
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: result.message 
      });
    }
  } catch (error) {
    console.error('❌ Send test email error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/email/config/test', async (req, res) => {
  try {
    const result = await emailService.testEmailConfiguration();
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Email configuration is valid'
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: result.message 
      });
    }
  } catch (error) {
    console.error('❌ Test email config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});


// SYSTEM MONITORING ROUTES
app.get('/api/system/metrics', async (req, res) => {
  try {
    const metrics = await systemMonitoringService.getSystemMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('❌ System metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// EMAIL CONFIG ROUTES
app.get('/api/email/config', (req, res) => {
  try {
    const config = emailConfigService.getPublicConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/email/config', (req, res) => {
  try {
    const { host, port, user, password } = req.body;
    
    if (!host || !user || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Host, user, and password are required' 
      });
    }

    const configData = { host, port, user, password };
    const saved = emailConfigService.updateConfig(configData);
    
    if (saved) {
      // Reinitialize email service with new config
      emailService.setupTransporter();
      res.json({ 
        success: true, 
        message: 'Email configuration saved successfully',
        config: emailConfigService.getPublicConfig()
      });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save email configuration' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// EMAIL GROUP ROUTES
app.get('/api/email/groups', (req, res) => {
  try {
    const groups = emailService.getEmailGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/email/groups', (req, res) => {
  try {
    const group = emailService.createGroup(req.body);
    if (group) {
      res.json({ success: true, data: group });
    } else {
      res.status(500).json({ success: false, error: 'Failed to create group' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/email/groups/:id', (req, res) => {
  try {
    const group = emailService.updateGroup(req.params.id, req.body);
    if (group) {
      res.json({ success: true, data: group });
    } else {
      res.status(404).json({ success: false, error: 'Group not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/email/groups/:id', (req, res) => {
  try {
    const deleted = emailService.deleteGroup(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Group deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Group not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// KUBERNETES ROUTES
app.get('/api/kubernetes/pods', async (req, res) => {
  try {
    let namespace = req.query.namespace || 'default';
    
    // Validate namespace parameter
    if (!namespace || namespace === 'null' || namespace === 'undefined') {
      namespace = 'default';
    }

    console.log(`🔍 Getting pods for namespace: ${namespace}`);
    
    const pods = await kubernetesService.getPods(namespace);
    res.json({ 
      success: true, 
      data: pods,
      namespace: namespace,
      count: pods.length
    });
  } catch (error) {
    console.error('❌ Get pods error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      namespace: req.query.namespace || 'default'
    });
  }
});

app.get('/api/kubernetes/pods/all', async (req, res) => {
  try {
    console.log('🔍 Getting all pods from all namespaces...');
    const pods = await kubernetesService.getAllPods();
    res.json({ 
      success: true, 
      data: pods,
      count: pods.length
    });
  } catch (error) {
    console.error('❌ Get all pods error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/kubernetes/namespaces', async (req, res) => {
  try {
    const namespaces = await kubernetesService.getNamespaces();
    res.json({ success: true, data: namespaces });
  } catch (error) {
    console.error('❌ Get namespaces error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/nodes', async (req, res) => {
  try {
    const nodes = await kubernetesService.getNodes();
    res.json({ success: true, data: nodes });
  } catch (error) {
    console.error('❌ Get nodes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/cluster-info', async (req, res) => {
  try {
    const clusterInfo = await kubernetesService.getClusterInfo();
    res.json({ success: true, data: clusterInfo });
  } catch (error) {
    console.error('❌ Get cluster info error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Kubernetes monitoring endpoints
app.get('/api/kubernetes/monitoring/status', (req, res) => {
  try {
    // Since we haven't implemented the enhanced monitoring service yet,
    // return a basic status
    const config = kubernetesConfigService.getConfig();
    const monitoringStatus = kubernetesMonitoringService.getStatus();
    const status = {
      isMonitoring: monitoringStatus.isMonitoring,
      isConfigured: config.isConfigured,
      emailGroupId: config.emailGroupId,
      podCount: monitoringStatus.podCount,
      nodeCount: monitoringStatus.nodeCount,
      lastCheck: monitoringStatus.lastCheck
    };

    res.json({
      success: true,
      status: status,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Kubernetes monitoring status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/monitoring/start', (req, res) => {
  try {
    const config = kubernetesConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured. Please configure kubeconfig path first.'
      });
    }

    // TODO: Implement kubernetesMonitoringService.startMonitoring() later
    const started = kubernetesMonitoringService.startMonitoring();

    if (started) {
      res.json({
        success: true,
        message: 'Kubernetes monitoring started successfully',
        status: kubernetesMonitoringService.getStatus()
      });
    } else {
      res.json({
        success: false,
        message: 'Monitoring is already running or failed to start',
        status: kubernetesMonitoringService.getStatus()
      });
    }
  } catch (error) {
    console.error('❌ Start Kubernetes monitoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/monitoring/stop', (req, res) => {
  try {
    const stopped = kubernetesMonitoringService.stopMonitoring();
    res.json({
      success: true,
      message: stopped ? 'Kubernetes monitoring stopped' : 'Monitoring was not running',
      status: kubernetesMonitoringService.getStatus()
    });
  } catch (error) {
    console.error('❌ Stop Kubernetes monitoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/monitoring/force-check', async (req, res) => {
  try {
    console.log('🔍 Manual Kubernetes health check requested');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    await kubernetesMonitoringService.checkPodHealth();
    await kubernetesMonitoringService.checkNodeHealth();

    res.json({
      success: true,
      message: 'Manual health check completed',
      timestamp: new Date(),
      status: kubernetesMonitoringService.getStatus()
    });
  } catch (error) {
    console.error('❌ Manual Kubernetes check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// URL MONITORING ROUTES
app.get('/api/urls', (req, res) => {
  try {
    const urls = urlMonitoringService.getAllUrls();
    res.json({ success: true, data: urls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/urls', (req, res) => {
  try {
    const newUrl = urlMonitoringService.addUrl(req.body);
    if (newUrl) {
      res.json({ success: true, data: newUrl });
    } else {
      res.status(500).json({ success: false, error: 'Failed to add URL' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/urls/:id', (req, res) => {
  try {
    const updatedUrl = urlMonitoringService.updateUrl(req.params.id, req.body);
    if (updatedUrl) {
      res.json({ success: true, data: updatedUrl });
    } else {
      res.status(404).json({ success: false, error: 'URL not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/urls/:id', (req, res) => {
  try {
    const deleted = urlMonitoringService.deleteUrl(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'URL deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'URL not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/urls/statuses', (req, res) => {
  try {
    const statuses = urlMonitoringService.getUrlStatuses();
    res.json({ success: true, data: statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/urls/stats', (req, res) => {
  try {
    const stats = urlMonitoringService.getMonitoringStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/urls/check/:id', async (req, res) => {
  try {
    const urls = urlMonitoringService.getAllUrls();
    const url = urls.find(u => u.id === parseInt(req.params.id));
    
    if (!url) {
      return res.status(404).json({ success: false, error: 'URL not found' });
    }
    
    const result = await urlMonitoringService.checkUrl(url);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// KUBERNETES CONFIG ROUTES
app.get('/api/kubernetes/config', (req, res) => {
  try {
    const config = kubernetesConfigService.getPublicConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/kubernetes/config', (req, res) => {
  try {
    const { kubeconfigPath, emailGroupId } = req.body;

    console.log('💾 Saving Kubernetes config with data:', {
      kubeconfigPath: kubeconfigPath || 'empty',
      emailGroupId: emailGroupId || 'none'
    });

    // Validate kubeconfig path if provided and not empty
    if (kubeconfigPath && kubeconfigPath.trim() !== '') {
      console.log('🔍 Validating kubeconfig path...');
      const validation = kubernetesConfigService.validateConfigPath(kubeconfigPath);
      if (!validation.valid) {
        console.log('❌ Validation failed:', validation.error);
        return res.status(400).json({ 
          success: false,
          error: validation.error 
        });
      }
    } else {
      console.log('✅ Empty path - clearing configuration');
    }

    // Prepare config data including email group
    const configData = { 
      kubeconfigPath: kubeconfigPath || '',
      emailGroupId: emailGroupId || null // Include email group ID
    };
    
    const saved = kubernetesConfigService.updateConfig(configData);
    
    if (saved) {
      console.log('✅ Kubernetes config saved successfully with email group');
      
      // Reinitialize Kubernetes service with new config
      kubernetesService.refreshConfiguration();
      
      res.json({ 
        success: true, 
        message: 'Kubernetes configuration saved successfully',
        config: kubernetesConfigService.getPublicConfig()
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to save Kubernetes configuration' 
      });
    }
  } catch (error) {
    console.error('❌ Save Kubernetes config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/kubernetes/email-config', (req, res) => {
  try {
    const emailGroupId = kubernetesConfigService.getEmailGroupForAlerts();
    const isConfigured = kubernetesConfigService.isEmailAlertsConfigured();
    
    res.json({
      success: true,
      emailGroupId: emailGroupId,
      isConfigured: isConfigured
    });
  } catch (error) {
    console.error('❌ Get Kubernetes email config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/config/test', async (req, res) => {
  try {
    const { kubeconfigPath } = req.body;
    
    if (!kubeconfigPath) {
      return res.status(400).json({ 
        success: false,
        error: 'Kubeconfig path is required for testing' 
      });
    }

    // Create a temporary config to test without saving
    const tempConfig = { kubeconfigPath, isConfigured: true };
    kubernetesConfigService.saveConfig(tempConfig);
    
    // Reload and test
    kubernetesService.setupKubernetesClient();
    const testResult = await kubernetesService.testConnection();
    
    res.json({ 
      success: testResult.success, 
      message: testResult.message || testResult.error,
      details: testResult
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/env-status', async (req, res) => {
  try {
    const config = kubernetesConfigService.getConfig();
    const envStatus = {
      kubeconfigPath: config.kubeconfigPath,
      kubeconfigExists: config.kubeconfigPath ? require('fs').existsSync(config.kubeconfigPath) : false,
      kubeconfigEnvSet: !!process.env.KUBECONFIG,
      kubeconfigEnvValue: process.env.KUBECONFIG,
      isConfigured: config.isConfigured,
      serviceConfigured: kubernetesService.isConfigured,
      lastError: kubernetesService.lastError
    };

    console.log('📊 Kubernetes environment status:', envStatus);
    
    res.json({
      success: true,
      envStatus: envStatus
    });
  } catch (error) {
    console.error('❌ Kubernetes env status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/refresh-config', async (req, res) => {
  try {
    console.log('🔄 Refreshing Kubernetes configuration...');
    
    // Refresh the Kubernetes service configuration
    kubernetesService.refreshConfiguration();
    
    // Test the new configuration
    const testResult = await kubernetesService.testConnection();
    
    if (testResult.success) {
      console.log('✅ Kubernetes configuration refreshed successfully');
      res.json({
        success: true,
        message: 'Kubernetes configuration refreshed successfully',
        testResult: testResult
      });
    } else {
      console.log('❌ Kubernetes configuration refresh failed');
      res.status(400).json({
        success: false,
        error: 'Configuration refresh failed: ' + testResult.error,
        testResult: testResult
      });
    }
  } catch (error) {
    console.error('❌ Kubernetes refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// THRESHOLD ROUTES
app.get('/api/thresholds/db-size', (req, res) => {
  try {
    const threshold = thresholdService.getDbSizeThreshold();
    res.json({ success: true, data: threshold });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/thresholds/db-size', (req, res) => {
  try {
    const saved = thresholdService.updateDbSizeThreshold(req.body);
    if (saved) {
      res.json({ success: true, message: 'Threshold settings saved' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ENHANCED SCRIPT EXECUTION ROUTE WITH KUBECONFIG SUPPORT
app.post('/api/execute-script', async (req, res) => {
  try {
    const { scriptPath, arguments: args, name } = req.body;
    
    console.log('🏃 Script execution request:', { name, scriptPath, args });
    
    // Basic validation
    if (!scriptPath) {
      return res.status(400).json({
        success: false,
        error: 'Script path is required'
      });
    }

    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
      return res.status(400).json({
        success: false,
        error: `Script file not found: ${scriptPath}`
      });
    }

    // Load Kubernetes configuration
    const kubeConfig = loadKubernetesConfig();
    
    // Prepare environment variables
    const env = { ...process.env }; // Start with system environment
    
    // Add KUBECONFIG if configured and file exists
    if (kubeConfig && kubeConfig.kubeconfigPath && kubeConfig.isConfigured) {
      if (fs.existsSync(kubeConfig.kubeconfigPath)) {
        env.KUBECONFIG = kubeConfig.kubeconfigPath;
        console.log(`🔧 Using KUBECONFIG: ${kubeConfig.kubeconfigPath}`);
      } else {
        console.warn(`⚠️ KUBECONFIG file not found: ${kubeConfig.kubeconfigPath}`);
      }
    }

    // Build command
    let command = `"${scriptPath}"`;
    if (args && args.trim()) {
      command += ` ${args.trim()}`;
    }

    console.log('🖥️ Executing command:', command);
    console.log('🌍 Environment variables:', Object.keys(env).filter(key => key.includes('KUBE')));
    
    const startTime = Date.now();
    
    try {
      // Execute the script with enhanced environment
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5 minutes
        maxBuffer: 1024 * 1024 * 10, // 10MB
        windowsHide: true,
        shell: true,
        cwd: path.dirname(scriptPath), // Run from script's directory
        env: env // Use enhanced environment with KUBECONFIG
      });

      const executionTime = Date.now() - startTime;
      
      // Build output with environment info
      let output = `Script: ${scriptPath}\n`;
      output += `Arguments: ${args || 'None'}\n`;
      output += `Execution time: ${executionTime}ms\n`;
      output += `Started: ${new Date(startTime).toLocaleString()}\n`;
      
      // Show environment info
      if (env.KUBECONFIG) {
        output += `KUBECONFIG: ${env.KUBECONFIG}\n`;
      }
      output += `\n`;
      
      if (stdout && stdout.trim()) {
        output += `STDOUT:\n${stdout.trim()}\n\n`;
      }
      
      if (stderr && stderr.trim()) {
        output += `STDERR:\n${stderr.trim()}\n\n`;
      }
      
      if (!stdout && !stderr) {
        output += 'Script completed successfully (no output)\n';
      }
      
      output += `--- Execution completed with exit code 0 ---`;

      console.log('✅ Script executed successfully');
      
      res.json({
        success: true,
        output: output,
        executionTime: executionTime,
        executedAt: new Date().toISOString(),
        kubeconfigUsed: !!env.KUBECONFIG
      });

    } catch (execError) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Script execution failed:', execError);

      // Build error output with environment info
      let errorOutput = `Script: ${scriptPath}\n`;
      errorOutput += `Arguments: ${args || 'None'}\n`;
      errorOutput += `Execution time: ${executionTime}ms\n`;
      errorOutput += `Started: ${new Date(startTime).toLocaleString()}\n`;
      
      if (env.KUBECONFIG) {
        errorOutput += `KUBECONFIG: ${env.KUBECONFIG}\n`;
      }
      errorOutput += `\nERROR: ${execError.message}\n`;
      
      if (execError.code) {
        errorOutput += `Exit code: ${execError.code}\n`;
      }
      
      if (execError.stdout && execError.stdout.trim()) {
        errorOutput += `\nSTDOUT:\n${execError.stdout.trim()}\n`;
      }
      
      if (execError.stderr && execError.stderr.trim()) {
        errorOutput += `\nSTDERR:\n${execError.stderr.trim()}\n`;
      }

      // Handle specific errors with suggestions
      if (execError.code === 'ENOENT') {
        errorOutput += `\n💡 File not found. Check if the path is correct.`;
      } else if (execError.code === 'EACCES') {
        errorOutput += `\n💡 Permission denied. Check file permissions.`;
      } else if (execError.signal === 'SIGTERM') {
        errorOutput += `\n💡 Script was terminated (timeout).`;
      } else if (execError.stderr && execError.stderr.includes('certificate')) {
        errorOutput += `\n💡 Certificate error detected.`;
        if (!env.KUBECONFIG) {
          errorOutput += `\n💡 Try configuring KUBECONFIG in Kubernetes settings.`;
        }
      } else if (execError.stderr && execError.stderr.includes('Unable to connect')) {
        errorOutput += `\n💡 Connection error detected.`;
        errorOutput += `\n💡 Check if your Kubernetes cluster is accessible.`;
      }

      errorOutput += `\n--- Execution failed ---`;

      res.status(400).json({
        success: false,
        error: execError.message,
        output: errorOutput,
        executionTime: executionTime,
        executedAt: new Date().toISOString(),
        kubeconfigUsed: !!env.KUBECONFIG
      });
    }

  } catch (error) {
    console.error('💥 Script execution route error:', error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

// Optional: Add route to check current Kubernetes config
app.get('/api/kubernetes-script-config', (req, res) => {
  try {
    const kubeConfig = loadKubernetesConfig();
    
    if (!kubeConfig) {
      return res.json({
        configured: false,
        message: 'No Kubernetes configuration found'
      });
    }

    const kubeconfigExists = kubeConfig.kubeconfigPath ? 
      fs.existsSync(kubeConfig.kubeconfigPath) : false;

    res.json({
      configured: kubeConfig.isConfigured,
      kubeconfigPath: kubeConfig.kubeconfigPath,
      kubeconfigExists: kubeconfigExists,
      message: kubeconfigExists ? 
        'KUBECONFIG will be automatically used for scripts' : 
        'KUBECONFIG file not found - scripts may fail'
    });

  } catch (error) {
    res.status(500).json({
      error: `Failed to check Kubernetes config: ${error.message}`
    });
  }
});

// SCRIPT PATH VALIDATION ROUTE
app.post('/api/validate-script-path', (req, res) => {
  try {
    const { scriptPath } = req.body;
    
    if (!scriptPath) {
      return res.json({
        valid: false,
        error: 'Script path is required'
      });
    }

    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
      return res.json({
        valid: false,
        error: `File not found: ${scriptPath}`
      });
    }

    // Check if it's a file
    const stats = fs.statSync(scriptPath);
    if (!stats.isFile()) {
      return res.json({
        valid: false,
        error: 'Path must point to a file'
      });
    }

    // Check file extension
    const ext = path.extname(scriptPath).toLowerCase();
    if (!['.bat', '.cmd', '.exe', '.ps1'].includes(ext)) {
      return res.json({
        valid: true,
        warning: `Unusual file extension: ${ext}. Make sure this is executable.`
      });
    }

    res.json({
      valid: true,
      message: 'Script path is valid'
    });

  } catch (error) {
    res.json({
      valid: false,
      error: `Error validating path: ${error.message}`
    });
  }
});

// Get database operations status
app.get('/api/database/operations/status', async (req, res) => {
  try {
    const status = await databaseOperationsService.getStatus(); 
    res.json(status);
  } catch (error) {
    console.error('❌ Database operations status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SHUTDOWN IMMEDIATE operation
app.post('/api/database/operations/shutdown', async (req, res) => {
  try {
    console.log('🛑 Database SHUTDOWN IMMEDIATE requested...');
    
    const result = await databaseOperationsService.shutdownImmediate();
    
    // ALWAYS return 200 status, let frontend handle success/failure
    console.log('📤 Shutdown result:', { success: result.success, message: result.message });
    res.json({ 
      success: result.success, 
      message: result.message,
      output: result.output,
      timestamp: result.timestamp,
      error: result.error || null
    });
    
  } catch (error) {
    console.error('❌ Database shutdown error:', error);
    // Even for exceptions, return 200 with error info
    res.json({ 
      success: false,
      error: error.message,
      message: `Shutdown failed: ${error.message}`,
      output: `Error: ${error.message}`,
      timestamp: new Date()
    });
  }
});

// STARTUP operation
app.post('/api/database/operations/startup', async (req, res) => {
  try {
    console.log('🚀 Database STARTUP requested...');
    
    const result = await databaseOperationsService.startup();
    
    // ALWAYS return 200 status, let frontend handle success/failure
    console.log('📤 Startup result:', { success: result.success, message: result.message });
    res.json({ 
      success: result.success, 
      message: result.message,
      output: result.output,
      timestamp: result.timestamp,
      error: result.error || null
    });
    
  } catch (error) {
    console.error('❌ Database startup error:', error);
    // Even for exceptions, return 200 with error info
    res.json({ 
      success: false,
      error: error.message,
      message: `Startup failed: ${error.message}`,
      output: `Error: ${error.message}`,
      timestamp: new Date()
    });
  }
});

app.post('/api/database/operations/restart', async (req, res) => {
  try {
    console.log('🔄 Database restart requested via API');
    const result = await databaseOperationsService.restart(); // ✅ Correct method name
    res.json(result);
  } catch (error) {
    console.error('❌ Database restart error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/database/operations/test-connection', async (req, res) => {
  try {
    console.log('🧪 Database SYS connection test requested');
    const result = await databaseOperationsService.testConnection(); // ✅ Correct method name
    res.json(result);
  } catch (error) {
    console.error('❌ Database connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/database/operations/config', (req, res) => {
  try {
    const validation = databaseOperationsService.validateConfig(); // ✅ Correct method name
    res.json({
      success: true,
      ...validation
    });
  } catch (error) {
    console.error('❌ Database operations config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this route to your backend/server.js file
// Place it after your existing database operations routes

// Database privilege checker route
app.get('/api/database/check-privileges', async (req, res) => {
  try {
    console.log('🔍 Checking database privileges for current user...');
    
    const config = dbConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const connection = realOracleService.connection;
    if (!connection) {
      return res.status(400).json({
        success: false,
        error: 'No active database connection'
      });
    }

    let privilegeInfo = {
      user: config.username,
      timestamp: new Date().toISOString(),
      environment: {},
      privileges: {},
      recommendations: []
    };

    // Check environment (PDB vs CDB)
    try {
      const envQuery = `
        SELECT 
          SYS_CONTEXT('USERENV', 'CON_NAME') as container_name,
          SYS_CONTEXT('USERENV', 'CON_ID') as container_id,
          (SELECT CDB FROM v$database) as is_cdb
        FROM dual
      `;
      
      const envResult = await connection.execute(envQuery);
      if (envResult.rows.length > 0) {
        const [containerName, containerId, isCdb] = envResult.rows[0];
        privilegeInfo.environment = {
          container_name: containerName,
          container_id: containerId,
          is_cdb: isCdb === 'YES',
          is_pdb: containerId > 1
        };
      }
    } catch (envError) {
      privilegeInfo.environment.error = envError.message;
    }

    // Check system privileges
    try {
      const sysPrivQuery = `
        SELECT privilege FROM user_sys_privs 
        WHERE privilege IN (
          'SYSDBA', 'SYSOPER', 'ALTER SYSTEM', 'ALTER DATABASE',
          'CREATE SESSION', 'ALTER PLUGGABLE DATABASE'
        )
        ORDER BY privilege
      `;
      
      const sysPrivResult = await connection.execute(sysPrivQuery);
      privilegeInfo.privileges.system = sysPrivResult.rows.map(row => row[0]);
    } catch (privError) {
      privilegeInfo.privileges.system_error = privError.message;
    }

    // Check role privileges
    try {
      const roleQuery = `
        SELECT granted_role FROM user_role_privs 
        WHERE granted_role IN ('DBA', 'RESOURCE', 'CONNECT')
        ORDER BY granted_role
      `;
      
      const roleResult = await connection.execute(roleQuery);
      privilegeInfo.privileges.roles = roleResult.rows.map(row => row[0]);
    } catch (roleError) {
      privilegeInfo.privileges.role_error = roleError.message;
    }

    // Check for SYSDBA in password file
    try {
      const sysdbaQuery = `
        SELECT username FROM v$pwfile_users 
        WHERE username = '${config.username.toUpperCase()}'
      `;
      
      const sysdbaResult = await connection.execute(sysdbaQuery);
      privilegeInfo.privileges.sysdba_in_pwfile = sysdbaResult.rows.length > 0;
    } catch (sysdbaError) {
      privilegeInfo.privileges.sysdba_check_error = sysdbaError.message;
    }

    // Generate recommendations
    const hasSystemPrivs = privilegeInfo.privileges.system || [];
    const hasRoles = privilegeInfo.privileges.roles || [];
    
    if (!privilegeInfo.privileges.sysdba_in_pwfile && !hasSystemPrivs.includes('SYSDBA') && !hasSystemPrivs.includes('SYSOPER')) {
      privilegeInfo.recommendations.push({
        type: 'CRITICAL',
        message: `User '${config.username}' needs SYSDBA or SYSOPER privileges for database shutdown`,
        command: `GRANT SYSDBA TO ${config.username};`,
        explanation: 'Required for SHUTDOWN IMMEDIATE and STARTUP operations'
      });
    }

    if (privilegeInfo.environment.is_pdb && !hasSystemPrivs.includes('ALTER PLUGGABLE DATABASE')) {
      privilegeInfo.recommendations.push({
        type: 'INFO',
        message: 'For PDB-specific operations, consider granting ALTER PLUGGABLE DATABASE',
        command: `GRANT ALTER PLUGGABLE DATABASE TO ${config.username};`,
        explanation: 'Allows opening/closing pluggable databases'
      });
    }

    if (hasSystemPrivs.length === 0 && hasRoles.length === 0) {
      privilegeInfo.recommendations.push({
        type: 'WARNING',
        message: 'User has minimal privileges - consider granting RESOURCE role for basic operations',
        command: `GRANT RESOURCE TO ${config.username};`,
        explanation: 'Provides basic database object creation privileges'
      });
    }

    if (privilegeInfo.privileges.sysdba_in_pwfile) {
      privilegeInfo.recommendations.push({
        type: 'SUCCESS',
        message: `User '${config.username}' has SYSDBA privileges in password file`,
        explanation: 'Should be able to perform shutdown/startup operations'
      });
    }

    console.log('✅ Privilege check completed');
    res.json({ 
      success: true, 
      data: privilegeInfo
    });

  } catch (error) {
    console.error('❌ Privilege check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Restart a pod
app.post('/api/kubernetes/pods/:namespace/:podName/restart', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    console.log(`🔄 Restart pod requested: ${namespace}/${podName}`);
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    // Delete the pod (it will be recreated by deployment)
    const result = await podActionsService.deletePod(namespace, podName, false);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Pod ${podName} restart initiated`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to restart pod'
      });
    }
  } catch (error) {
    console.error('❌ Restart pod error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a pod
app.delete('/api/kubernetes/pods/:namespace/:podName', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    const { force } = req.query;
    
    // Validate parameters
    if (!namespace || !podName) {
      return res.status(400).json({
        success: false,
        error: 'Namespace and pod name are required'
      });
    }

    console.log(`🗑️ Pod deletion requested: ${namespace}/${podName}, force: ${force}`);
    
    const result = await podActionsService.deletePod(namespace, podName, force === 'true');
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        output: result.output,
        method: result.method,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod deletion error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pod logs
app.get('/api/kubernetes/pods/:namespace/:podName/logs', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    const { container, lines = 100 } = req.query;
    
    // Validate parameters
    if (!namespace || !podName) {
      return res.status(400).json({
        success: false,
        error: 'Namespace and pod name are required'
      });
    }

    console.log(`📝 Pod logs requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.getPodLogs(
      namespace, 
      podName, 
      container, 
      parseInt(lines) || 100
    );
    
    if (result.success) {
      res.json({
        success: true,
        logs: result.logs,
        method: result.method,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        logs: result.logs,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod logs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add health check route
app.get('/api/kubernetes/health', async (req, res) => {
  try {
    const availability = await podActionsService.checkKubernetesAvailability();
    res.json({
      success: true,
      kubernetes: availability
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute command in pod
app.post('/api/kubernetes/pods/:namespace/:podName/exec', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    const { container, command = '/bin/bash' } = req.body;
    console.log(`⚡ Pod exec requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.execInPod(namespace, podName, container, command);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        execCommand: result.execCommand,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod exec error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Scale deployment
app.post('/api/kubernetes/deployments/:namespace/:deploymentName/scale', async (req, res) => {
  try {
    const { namespace, deploymentName } = req.params;
    const { replicas } = req.body;
    
    console.log(`📊 Scale deployment requested: ${namespace}/${deploymentName} to ${replicas} replicas`);
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    const result = await podActionsService.scaleDeployment(namespace, deploymentName, replicas);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Deployment ${deploymentName} scaled to ${replicas} replicas`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to scale deployment'
      });
    }
  } catch (error) {
    console.error('❌ Scale deployment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Describe pod
app.get('/api/kubernetes/pods/:namespace/:podName/describe', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    console.log(`📋 Pod describe requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.describePod(namespace, podName);
    
    if (result.success) {
      res.json({
        success: true,
        description: result.description,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        description: result.description,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod describe error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pod containers
app.get('/api/kubernetes/pods/:namespace/:podName/containers', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    console.log(`📦 Pod containers requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.getPodContainers(namespace, podName);
    
    if (result.success) {
      res.json({
        success: true,
        containers: result.containers
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('❌ Pod containers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get deployment info for pod
  app.get('/api/kubernetes/pods/:namespace/:podName/deployment', async (req, res) => {
    try {
      const { namespace, podName } = req.params;
      
      const deploymentInfo = await podActionsService.getDeploymentInfo(namespace, podName);
      
      if (deploymentInfo.success) {
        res.json({
          success: true,
          data: deploymentInfo.deployment
        });
      } else {
        res.status(404).json({
          success: false,
          error: deploymentInfo.message || 'Deployment info not found'
        });
      }
    } catch (error) {
      console.error('❌ Get deployment info error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

app.get('/api/kubernetes/pods/enhanced', async (req, res) => {
  try {
    const { 
      namespace = 'default', 
      includeDeleted = 'true',
      maxAge,
      sortBy = 'lastSeen'
    } = req.query;
    
    console.log(`🔍 Enhanced pods request: namespace=${namespace}, includeDeleted=${includeDeleted}`);
    
    // Get current pods from Kubernetes with container details
    let currentPods = [];
    try {
      if (namespace === 'all') {
        currentPods = await kubernetesService.getAllPodsWithContainers(); // Use new method
      } else {
        // You might want to create a getPodsWithContainers method for specific namespace too
        currentPods = await kubernetesService.getPods(namespace);
      }
    } catch (k8sError) {
      console.log('⚠️ Could not fetch current pods from K8s:', k8sError.message);
      // Continue with lifecycle service data only
    }
    
    // Update lifecycle tracking with current pods
    const changes = await podLifecycleService.updatePodLifecycle(currentPods);
    
    // Get comprehensive pod list including historical data
    const comprehensivePods = podLifecycleService.getComprehensivePodList({
      includeDeleted: includeDeleted === 'true',
      namespace: namespace === 'all' ? null : namespace,
      maxAge: maxAge ? parseInt(maxAge) : null,
      sortBy
    });
    
    // Merge current pod data (with container info) with lifecycle data
    const enrichedPods = comprehensivePods.map(lifecyclePod => {
      const currentPod = currentPods.find(cp => 
        cp.name === lifecyclePod.name && cp.namespace === lifecyclePod.namespace
      );
      
      if (currentPod) {
        // Merge current pod data with lifecycle data
        return {
          ...lifecyclePod,
          containers: currentPod.containers,
          readyContainers: currentPod.readyContainers,
          totalContainers: currentPod.totalContainers,
          readinessRatio: currentPod.readinessRatio
        };
      }
      
      // For deleted pods or when current data is not available
      return {
        ...lifecyclePod,
        containers: [],
        readyContainers: 0,
        totalContainers: 1, // Assume single container for deleted pods
        readinessRatio: lifecyclePod.isDeleted ? '0/1' : '0/1'
      };
    });
    
    // Get statistics
    const stats = podLifecycleService.getPodStatistics(namespace === 'all' ? null : namespace);
    
    console.log(`✅ Enhanced pods response: ${enrichedPods.length} pods with container details`);
    
    res.json({
      success: true,
      data: {
        pods: enrichedPods,
        statistics: stats,
        changes: changes,
        timestamp: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Enhanced pods error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/kubernetes/pods/:namespace/:podName/history', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    
    const pods = podLifecycleService.getComprehensivePodList({
      includeDeleted: true,
      namespace
    });
    
    const pod = pods.find(p => p.name === podName && p.namespace === namespace);
    
    if (!pod) {
      return res.status(404).json({
        success: false,
        error: 'Pod not found in history'
      });
    }
    
    res.json({
      success: true,
      data: {
        pod: pod,
        statusHistory: pod.statusHistory,
        lifecycle: {
          firstSeen: pod.firstSeen,
          lastSeen: pod.lastSeen,
          isDeleted: pod.isDeleted,
          deletedAt: pod.deletedAt,
          age: pod.age,
          statusDuration: pod.statusDuration
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Pod history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/kubernetes/pods/statistics', async (req, res) => {
  try {
    const { namespace = 'all', timeRange = 24 } = req.query;
    
    const stats = podLifecycleService.getPodStatistics(
      namespace === 'all' ? null : namespace
    );
    
    // Add time-based statistics
    const pods = podLifecycleService.getComprehensivePodList({
      includeDeleted: true,
      namespace: namespace === 'all' ? null : namespace,
      maxAge: parseInt(timeRange)
    });
    
    // Calculate trends
    const now = new Date();
    const intervals = {
      '1h': new Date(now - 60 * 60 * 1000),
      '6h': new Date(now - 6 * 60 * 60 * 1000),
      '24h': new Date(now - 24 * 60 * 60 * 1000)
    };
    
    const trends = {};
    Object.entries(intervals).forEach(([period, cutoff]) => {
      const recentPods = pods.filter(p => new Date(p.firstSeen) > cutoff);
      const deletedPods = pods.filter(p => p.isDeleted && p.deletedAt && new Date(p.deletedAt) > cutoff);
      
      trends[period] = {
        created: recentPods.length,
        deleted: deletedPods.length,
        netChange: recentPods.length - deletedPods.length
      };
    });
    
    res.json({
      success: true,
      data: {
        current: stats,
        trends: trends,
        timeRange: `${timeRange}h`,
        namespace: namespace
      }
    });
    
  } catch (error) {
    console.error('❌ Pod statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/pods/cleanup', async (req, res) => {
  try {
    const { maxAgeDays = 30 } = req.body;
    
    const removedCount = podLifecycleService.cleanupOldHistory(maxAgeDays);
    
    res.json({
      success: true,
      message: `Cleaned up ${removedCount} old pod records`,
      removedCount: removedCount
    });
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SCRIPT MANAGEMENT ROUTES
app.get('/api/scripts', (req, res) => {
  try {
    const scripts = scriptService.getAllScripts();
    res.json({ success: true, data: scripts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scripts', (req, res) => {
  try {
    const newScript = scriptService.addScript(req.body);
    if (newScript) {
      res.json({ success: true, data: newScript });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save script' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/scripts/:id', (req, res) => {
  try {
    const updatedScript = scriptService.updateScript(req.params.id, req.body);
    if (updatedScript) {
      res.json({ success: true, data: updatedScript });
    } else {
      res.status(404).json({ success: false, error: 'Script not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/scripts/:id', (req, res) => {
  try {
    const deleted = scriptService.deleteScript(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Script deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Script not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADD these endpoints to your server.js file

// Reset Kubernetes monitoring state
app.post('/api/kubernetes/monitoring/reset', (req, res) => {
  try {
    console.log('🔄 Monitoring reset requested');
    
    // Reset the monitoring service state
    kubernetesMonitoringService.resetMonitoringState();
    
    res.json({
      success: true,
      message: 'Kubernetes monitoring state reset successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Reset monitoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Perform baseline check
app.post('/api/kubernetes/monitoring/baseline', async (req, res) => {
  try {
    console.log('📊 Baseline check requested');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }
    
    // Perform baseline check
    await kubernetesMonitoringService.performBaselineCheck();
    
    res.json({
      success: true,
      message: 'Baseline check completed successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Baseline check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current monitoring statistics
app.get('/api/kubernetes/monitoring/stats', (req, res) => {
  try {
    const status = kubernetesMonitoringService.getStatus();
    
    // Add additional debug info
    const stats = {
      ...status,
      workloadStatusCount: kubernetesMonitoringService.workloadStatuses.size,
      nodeStatusCount: kubernetesMonitoringService.nodeStatuses.size,
      emailSentStatusCount: kubernetesMonitoringService.emailSentStatus.size
    };
    
    res.json({
      success: true,
      stats: stats,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Get monitoring stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ADD these enhanced API endpoints to your server.js file

// Enhanced Kubernetes monitoring endpoints - Database-style detail
app.get('/api/kubernetes/monitoring/health-summary', (req, res) => {
  try {
    const healthSummary = kubernetesMonitoringService.getHealthSummary();
    
    res.json({
      success: true,
      data: healthSummary,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get health summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enhanced workload status with detailed metrics
app.get('/api/kubernetes/workloads/detailed', async (req, res) => {
  try {
    const { namespace, severity, sortBy = 'health' } = req.query;
    
    console.log(`📊 Detailed workloads request: namespace=${namespace}, severity=${severity}`);
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    // Get enhanced workload data
    const workloads = await kubernetesMonitoringService.getEnhancedWorkloadStatus();
    
    // Filter by namespace if specified
    let filteredWorkloads = workloads;
    if (namespace && namespace !== 'all') {
      filteredWorkloads = workloads.filter(w => w.namespace === namespace);
    }
    
    // Filter by severity if specified
    if (severity && severity !== 'all') {
      filteredWorkloads = filteredWorkloads.filter(w => w.health.severity === severity);
    }
    
    // Sort workloads
    filteredWorkloads.sort((a, b) => {
      switch (sortBy) {
        case 'health':
          return b.health.healthScore - a.health.healthScore;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'severity':
          const severityOrder = { 'critical': 0, 'warning': 1, 'info': 2, 'success': 3 };
          return severityOrder[a.health.severity] - severityOrder[b.health.severity];
        case 'pods':
          return b.readyReplicas - a.readyReplicas;
        default:
          return 0;
      }
    });
    
    res.json({
      success: true,
      data: {
        workloads: filteredWorkloads,
        summary: {
          total: filteredWorkloads.length,
          byStatus: {
            healthy: filteredWorkloads.filter(w => w.health.severity === 'success').length,
            warning: filteredWorkloads.filter(w => w.health.severity === 'warning').length,
            critical: filteredWorkloads.filter(w => w.health.severity === 'critical').length
          },
          averageHealth: filteredWorkloads.length > 0 ? 
            Math.round(filteredWorkloads.reduce((sum, w) => sum + w.health.healthScore, 0) / filteredWorkloads.length) : 0
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get detailed workloads error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Workload health history and trends
app.get('/api/kubernetes/workloads/:namespace/:name/health-history', (req, res) => {
  try {
    const { namespace, name } = req.params;
    const workloadKey = `Deployment/${name}/${namespace}`;
    
    const workloadStatus = kubernetesMonitoringService.workloadStatuses.get(workloadKey);
    
    if (!workloadStatus) {
      return res.status(404).json({
        success: false,
        error: 'Workload not found'
      });
    }
    
    const healthHistory = workloadStatus.healthHistory || [];
    const now = new Date();
    
    // Generate timestamps for each health check (assuming 2-minute intervals)
    const historyWithTimestamps = healthHistory.map((health, index) => {
      const timestamp = new Date(now.getTime() - (healthHistory.length - index - 1) * 2 * 60 * 1000);
      return {
        timestamp: timestamp.toISOString(),
        healthScore: health,
        checkNumber: index + 1
      };
    });
    
    res.json({
      success: true,
      data: {
        workload: {
          name: workloadStatus.name,
          namespace: workloadStatus.namespace,
          type: workloadStatus.type
        },
        currentHealth: workloadStatus.health,
        history: historyWithTimestamps,
        stats: {
          averageHealth: healthHistory.length > 0 ? 
            Math.round(healthHistory.reduce((sum, h) => sum + h, 0) / healthHistory.length) : 0,
          minHealth: healthHistory.length > 0 ? Math.min(...healthHistory) : 0,
          maxHealth: healthHistory.length > 0 ? Math.max(...healthHistory) : 0,
          checksPerformed: workloadStatus.checkCount || 0,
          firstSeen: workloadStatus.firstSeen,
          statusDuration: workloadStatus.statusDuration || 0
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get workload health history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cluster-wide health analytics
app.get('/api/kubernetes/monitoring/analytics', async (req, res) => {
  try {
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    // Get comprehensive analytics
    const workloads = await kubernetesMonitoringService.getEnhancedWorkloadStatus();
    const healthSummary = kubernetesMonitoringService.getHealthSummary();
    
    // Generate analytics
    const analytics = {
      clusterOverview: healthSummary,
      
      // Namespace breakdown
      namespaceAnalysis: {},
      
      // Risk analysis
      riskAnalysis: {
        highRisk: workloads.filter(w => w.analysis.riskLevel === 'high').length,
        mediumRisk: workloads.filter(w => w.analysis.riskLevel === 'medium').length,
        lowRisk: workloads.filter(w => w.analysis.riskLevel === 'low').length,
        singlePointsOfFailure: workloads.filter(w => w.analysis.nodeAffinity === 'single-node').length
      },
      
      // Stability patterns
      stabilityAnalysis: {
        stable: workloads.filter(w => w.analysis.stability === 'stable').length,
        moderate: workloads.filter(w => w.analysis.stability === 'moderate').length,
        unstable: workloads.filter(w => w.analysis.stability === 'unstable').length,
        totalRestarts: workloads.reduce((sum, w) => 
          sum + w.pods.reduce((podSum, p) => podSum + (p.restarts || 0), 0), 0)
      },
      
      // Resource issues
      resourceAnalysis: {
        workloadsWithResourceIssues: workloads.filter(w => w.resourceIssues.length > 0).length,
        totalResourceIssues: workloads.reduce((sum, w) => sum + w.resourceIssues.length, 0),
        commonIssues: this.analyzeCommonResourceIssues(workloads)
      },
      
      // Scaling patterns
      scalingAnalysis: {
        scalingUp: workloads.filter(w => w.analysis.scalingPattern === 'scaling-up').length,
        scalingDown: workloads.filter(w => w.analysis.scalingPattern === 'scaling-down').length,
        static: workloads.filter(w => w.analysis.scalingPattern === 'static').length,
        totalDesiredPods: workloads.reduce((sum, w) => sum + w.desiredReplicas, 0),
        totalActualPods: workloads.reduce((sum, w) => sum + w.actualReplicas, 0)
      }
    };
    
    // Group by namespace
    workloads.forEach(workload => {
      if (!analytics.namespaceAnalysis[workload.namespace]) {
        analytics.namespaceAnalysis[workload.namespace] = {
          total: 0,
          healthy: 0,
          warning: 0,
          critical: 0,
          averageHealth: 0,
          totalPods: 0
        };
      }
      
      const ns = analytics.namespaceAnalysis[workload.namespace];
      ns.total++;
      ns.totalPods += workload.actualReplicas;
      
      switch (workload.health.severity) {
        case 'success': ns.healthy++; break;
        case 'warning': ns.warning++; break;
        case 'critical': ns.critical++; break;
      }
    });
    
    // Calculate namespace averages
    Object.keys(analytics.namespaceAnalysis).forEach(ns => {
      const nsWorkloads = workloads.filter(w => w.namespace === ns);
      analytics.namespaceAnalysis[ns].averageHealth = nsWorkloads.length > 0 ? 
        Math.round(nsWorkloads.reduce((sum, w) => sum + w.health.healthScore, 0) / nsWorkloads.length) : 0;
    });
    
    res.json({
      success: true,
      data: analytics,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get Kubernetes analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enhanced monitoring alerts history
app.get('/api/kubernetes/monitoring/alerts-history', (req, res) => {
  try {
    const { limit = 50, severity, workload } = req.query;
    
    // Get alert history from monitoring service
    const alertHistory = kubernetesMonitoringService.getAlertHistory ? 
      kubernetesMonitoringService.getAlertHistory(parseInt(limit), severity, workload) : [];
    
    res.json({
      success: true,
      data: {
        alerts: alertHistory,
        summary: {
          total: alertHistory.length,
          bySeverity: {
            critical: alertHistory.filter(a => a.severity === 'critical').length,
            warning: alertHistory.filter(a => a.severity === 'warning').length,
            info: alertHistory.filter(a => a.severity === 'info').length
          },
          byType: {
            failed: alertHistory.filter(a => a.type === 'failed').length,
            degraded: alertHistory.filter(a => a.type === 'degraded').length,
            recovered: alertHistory.filter(a => a.type === 'recovered').length
          }
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get alerts history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Workload deep dive - individual workload detailed analysis
app.get('/api/kubernetes/workloads/:namespace/:name/deep-dive', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    const workloadKey = `Deployment/${name}/${namespace}`;
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    // Get current workload data
    const workloads = await kubernetesMonitoringService.getEnhancedWorkloadStatus();
    const workload = workloads.find(w => w.name === name && w.namespace === namespace);
    
    if (!workload) {
      return res.status(404).json({
        success: false,
        error: 'Workload not found'
      });
    }

    // Get stored workload status for history
    const storedStatus = kubernetesMonitoringService.workloadStatuses.get(workloadKey);
    
    // Enhanced analysis
    const deepDive = {
      workload: {
        ...workload,
        checkCount: storedStatus?.checkCount || 0,
        firstSeen: storedStatus?.firstSeen,
        statusDuration: storedStatus?.statusDuration || 0
      },
      
      // Pod-level analysis
      podAnalysis: {
        byStatus: {},
        byNode: {},
        restartAnalysis: {},
        resourceUtilization: {},
        troublesomeNodes: []
      },
      
      // Health trends
      healthTrends: {
        current: workload.health.healthScore,
        history: storedStatus?.healthHistory || [],
        trend: this.calculateHealthTrend(storedStatus?.healthHistory || []),
        volatility: this.calculateHealthVolatility(storedStatus?.healthHistory || [])
      },
      
      // Recommendations
      recommendations: this.generateWorkloadRecommendations(workload),
      
      // Recent events (you'd need to implement getWorkloadEvents)
      recentEvents: [], // await kubernetesService.getWorkloadEvents(namespace, name)
      
      // Related resources
      relatedResources: {
        services: [], // Services that select this workload
        ingresses: [], // Ingresses that route to this workload
        configMaps: [], // ConfigMaps used by this workload
        secrets: [] // Secrets used by this workload
      }
    };
    
    // Analyze pods by status
    workload.pods.forEach(pod => {
      // By status
      if (!deepDive.podAnalysis.byStatus[pod.status]) {
        deepDive.podAnalysis.byStatus[pod.status] = [];
      }
      deepDive.podAnalysis.byStatus[pod.status].push(pod.name);
      
      // By node
      if (pod.node) {
        if (!deepDive.podAnalysis.byNode[pod.node]) {
          deepDive.podAnalysis.byNode[pod.node] = [];
        }
        deepDive.podAnalysis.byNode[pod.node].push({
          name: pod.name,
          status: pod.status,
          restarts: pod.restarts
        });
      }
      
      // Restart analysis
      if (pod.restarts > 0) {
        deepDive.podAnalysis.restartAnalysis[pod.name] = {
          count: pod.restarts,
          lastRestartTime: pod.lastRestartTime,
          pattern: pod.restarts > 5 ? 'frequent' : pod.restarts > 2 ? 'moderate' : 'rare'
        };
      }
    });
    
    res.json({
      success: true,
      data: deepDive,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get workload deep dive error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to calculate health trend
function calculateHealthTrend(healthHistory) {
  if (healthHistory.length < 3) return 'insufficient_data';
  
  const recent = healthHistory.slice(-5); // Last 5 checks
  const older = healthHistory.slice(-10, -5); // Previous 5 checks
  
  const recentAvg = recent.reduce((sum, h) => sum + h, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((sum, h) => sum + h, 0) / older.length : recentAvg;
  
  const difference = recentAvg - olderAvg;
  
  if (difference > 10) return 'improving';
  if (difference < -10) return 'declining';
  return 'stable';
}

// Helper function to calculate health volatility
function calculateHealthVolatility(healthHistory) {
  if (healthHistory.length < 3) return 0;
  
  const differences = [];
  for (let i = 1; i < healthHistory.length; i++) {
    differences.push(Math.abs(healthHistory[i] - healthHistory[i-1]));
  }
  
  const avgDifference = differences.reduce((sum, d) => sum + d, 0) / differences.length;
  
  if (avgDifference > 20) return 'high';
  if (avgDifference > 10) return 'medium';
  return 'low';
}

// Helper function to generate workload recommendations
function generateWorkloadRecommendations(workload) {
  const recommendations = [];
  
  // Resource recommendations
  if (workload.resourceIssues.length > 0) {
    recommendations.push({
      type: 'resource',
      priority: 'high',
      title: 'Resource Issues Detected',
      description: `${workload.resourceIssues.length} pods have resource-related issues`,
      action: 'Review resource limits and requests for containers',
      category: 'performance'
    });
  }
  
  // High restart rate
  const totalRestarts = workload.pods.reduce((sum, p) => sum + (p.restarts || 0), 0);
  const avgRestarts = workload.pods.length > 0 ? totalRestarts / workload.pods.length : 0;
  
  if (avgRestarts > 3) {
    recommendations.push({
      type: 'stability',
      priority: 'high',
      title: 'High Restart Rate',
      description: `Average ${avgRestarts.toFixed(1)} restarts per pod indicates instability`,
      action: 'Check application logs and health check configurations',
      category: 'reliability'
    });
  }
  
  // Single node deployment
  if (workload.nodeDistribution.size === 1 && workload.pods.length > 1) {
    recommendations.push({
      type: 'availability',
      priority: 'medium',
      title: 'Single Point of Failure',
      description: `All ${workload.pods.length} pods are running on a single node`,
      action: 'Consider adding pod anti-affinity rules for better distribution',
      category: 'reliability'
    });
  }
  
  // Scaling recommendations
  if (workload.actualReplicas !== workload.desiredReplicas) {
    recommendations.push({
      type: 'scaling',
      priority: 'medium',
      title: 'Scaling In Progress',
      description: `Current: ${workload.actualReplicas}, Desired: ${workload.desiredReplicas}`,
      action: 'Monitor scaling progress and check for resource constraints',
      category: 'performance'
    });
  }
  
  // Health score recommendations
  if (workload.health.healthScore < 70) {
    recommendations.push({
      type: 'health',
      priority: 'high',
      title: 'Poor Health Score',
      description: `Health score of ${workload.health.healthScore}% indicates multiple issues`,
      action: 'Review pod status, logs, and resource utilization',
      category: 'general'
    });
  }
  
  return recommendations;
}

// Comprehensive cluster health report
app.get('/api/kubernetes/monitoring/health-report', async (req, res) => {
  try {
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    const workloads = await kubernetesMonitoringService.getEnhancedWorkloadStatus();
    const healthSummary = kubernetesMonitoringService.getHealthSummary();
    
    // Generate comprehensive report
    const healthReport = {
      summary: healthSummary,
      clusterGrade: this.calculateClusterGrade(healthSummary),
      
      criticalIssues: workloads
        .filter(w => w.health.severity === 'critical')
        .map(w => ({
          name: `${w.namespace}/${w.name}`,
          healthScore: w.health.healthScore,
          issues: w.analysis.insights,
          recommendations: generateWorkloadRecommendations(w).filter(r => r.priority === 'high')
        })),
      
      topRecommendations: this.getTopClusterRecommendations(workloads),
      
      trends: {
        healthTrend: this.calculateOverallHealthTrend(workloads),
        stabilityTrend: this.calculateStabilityTrend(workloads),
        resourceUtilization: this.calculateResourceUtilizationTrend(workloads)
      },
      
      namespaceSummary: Object.keys(
        workloads.reduce((acc, w) => ({ ...acc, [w.namespace]: true }), {})
      ).map(ns => {
        const nsWorkloads = workloads.filter(w => w.namespace === ns);
        return {
          namespace: ns,
          workloads: nsWorkloads.length,
          healthScore: nsWorkloads.length > 0 ? 
            Math.round(nsWorkloads.reduce((sum, w) => sum + w.health.healthScore, 0) / nsWorkloads.length) : 0,
          critical: nsWorkloads.filter(w => w.health.severity === 'critical').length,
          warning: nsWorkloads.filter(w => w.health.severity === 'warning').length,
          healthy: nsWorkloads.filter(w => w.health.severity === 'success').length
        };
      })
    };
    
    res.json({
      success: true,
      data: healthReport,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Get health report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to calculate cluster grade
function calculateClusterGrade(healthSummary) {
  const score = healthSummary.averageHealth;
  
  if (score >= 95) return { grade: 'A+', description: 'Excellent' };
  if (score >= 90) return { grade: 'A', description: 'Very Good' };
  if (score >= 80) return { grade: 'B', description: 'Good' };
  if (score >= 70) return { grade: 'C', description: 'Fair' };
  if (score >= 60) return { grade: 'D', description: 'Poor' };
  return { grade: 'F', description: 'Critical' };
}

// Manual trigger for detailed health check
app.post('/api/kubernetes/monitoring/detailed-check', async (req, res) => {
  try {
    console.log('🔍 Manual detailed Kubernetes health check requested');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    // Perform detailed check
    await kubernetesMonitoringService.checkDetailedWorkloadHealth();
    
    const healthSummary = kubernetesMonitoringService.getHealthSummary();
    
    res.json({
      success: true,
      message: 'Detailed health check completed',
      data: healthSummary,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Manual detailed check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Route not found' 
  });
});


// Auto-start URL monitoring when server starts
setTimeout(() => {
  console.log('🌐 Auto-starting URL monitoring...');
  const started = urlMonitoringService.startAllMonitoring();
  console.log(`✅ Started monitoring ${started} URLs`);
}, 3000);


// Auto-start monitoring if database is configured
setTimeout(() => {
  const config = dbConfigService.getConfig();
  if (config.isConfigured) {
    console.log('🚀 Auto-starting database monitoring...');
    const started = monitoringService.startMonitoring();
    if (started) {
      console.log('✅ Database monitoring started automatically');
    } else {
      console.log('❌ Failed to auto-start monitoring');
    }
  } else {
    console.log('⚠️ Database not configured - monitoring not started');
  }
}, 2000); // Wait 2 seconds for services to initialize


// Auto-start Kubernetes monitoring if configured
setTimeout(() => {
  const kubernetesConfig = kubernetesConfigService.getConfig();
  if (kubernetesConfig.isConfigured) {
    console.log('☸️ Auto-starting Kubernetes monitoring...');
    const started = kubernetesMonitoringService.startMonitoring();
    if (started) {
      console.log('✅ Kubernetes monitoring started automatically');
    } else {
      console.log('❌ Failed to auto-start Kubernetes monitoring');
    }
  } else {
    console.log('⚠️ Kubernetes not configured - monitoring not started');
  }
}, 4000); // Wait 4 seconds for services to initialize


// Start server
app.listen(PORT, () => {
  console.log(`🚀 UPTIME WATCHDOG by Tsunami Solutions running on http://localhost:${PORT}`);
  console.log(`📊 Real Oracle database monitoring enabled`);
  console.log(`👤 User count: ${userService.getUserCount()}`);
  console.log(`🔗 Database configured: ${dbConfigService.getConfig().isConfigured}`);
  console.log('✅ Oracle Monitor Backend with Real DB Connection Started!');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await realOracleService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await realOracleService.disconnect();
  process.exit(0);
});