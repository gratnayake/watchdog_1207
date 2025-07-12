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
    console.log('📊 Database config requested');
    res.json({ success: true, config });
  } catch (error) {
    console.error('❌ Get database config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/database/config', (req, res) => {
  try {
    const { host, port, serviceName, username, password } = req.body;

    console.log('💾 Updating database config:', { host, port, serviceName, username });

    if (!host || !port || !serviceName || !username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'All database connection fields are required' 
      });
    }

    const configData = { host, port, serviceName, username, password };
    
    const saved = dbConfigService.updateConfig(configData);
    
    if (saved) {
      console.log('✅ Database config saved successfully');
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
    const namespace = req.query.namespace || 'default';
    const pods = await kubernetesService.getPods(namespace);
    res.json({ success: true, data: pods });
  } catch (error) {
    console.error('❌ Get pods error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/pods/all', async (req, res) => {
  try {
    const pods = await kubernetesService.getAllPods();
    res.json({ success: true, data: pods });
  } catch (error) {
    console.error('❌ Get all pods error:', error);
    res.status(500).json({ success: false, error: error.message });
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
    const { kubeconfigPath } = req.body;
    
    console.log('📝 Received kubeconfigPath:', kubeconfigPath);
    
    // Allow empty path to clear configuration
    if (kubeconfigPath && kubeconfigPath.trim() !== '') {
      console.log('🔍 Validating non-empty path...');
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

    const configData = { kubeconfigPath: kubeconfigPath || '' };
    const saved = kubernetesConfigService.updateConfig(configData);
    
    if (saved) {
      console.log('✅ Config saved successfully');
      res.json({ 
        success: true, 
        message: 'Kubernetes configuration saved successfully',
        config: kubernetesConfigService.getPublicConfig()
      });
    } else {
      console.log('❌ Failed to save config');
      res.status(500).json({ success: false, error: 'Failed to save Kubernetes configuration' });
    }
  } catch (error) {
    console.error('❌ Route error:', error);
    res.status(500).json({ success: false, error: error.message });
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
    console.log('📊 Getting database operations status...');
    const status = await databaseOperationsService.getDatabaseStatus();
    
    res.json({ 
      success: true, 
      status: status,
      timestamp: new Date()
    });
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
    
    // Check if user has permission (you might want to add admin check here)
    const result = await databaseOperationsService.shutdownImmediate();
    
    if (result.success) {
      console.log('✅ Database shutdown completed successfully');
      res.json({ 
        success: true, 
        message: result.message,
        output: result.output,
        timestamp: result.timestamp
      });
    } else {
      console.log('❌ Database shutdown failed');
      res.status(400).json({ 
        success: false,
        error: result.message,
        output: result.output,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Database shutdown error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// STARTUP operation
app.post('/api/database/operations/startup', async (req, res) => {
  try {
    console.log('🚀 Database STARTUP requested...');
    
    // Check if user has permission (you might want to add admin check here)
    const result = await databaseOperationsService.startupDatabase();
    
    if (result.success) {
      console.log('✅ Database startup completed successfully');
      res.json({ 
        success: true, 
        message: result.message,
        output: result.output,
        timestamp: result.timestamp
      });
    } else {
      console.log('❌ Database startup failed');
      res.status(400).json({ 
        success: false,
        error: result.message,
        output: result.output,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Database startup error:', error);
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
    console.log(`🔄 Pod restart requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.restartPod(namespace, podName);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        output: result.output,
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
    console.error('❌ Pod restart error:', error);
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
    console.log(`🗑️ Pod deletion requested: ${namespace}/${podName}, force: ${force}`);
    
    const result = await podActionsService.deletePod(namespace, podName, force === 'true');
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        output: result.output,
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
    const { container, lines = 100, follow } = req.query;
    console.log(`📝 Pod logs requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.getPodLogs(
      namespace, 
      podName, 
      container, 
      parseInt(lines), 
      follow === 'true'
    );
    
    if (result.success) {
      res.json({
        success: true,
        logs: result.logs,
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
    console.log(`📏 Deployment scale requested: ${namespace}/${deploymentName} to ${replicas}`);
    
    if (!replicas || replicas < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid replica count'
      });
    }
    
    const result = await podActionsService.scaleDeployment(namespace, deploymentName, replicas);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        output: result.output,
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
    console.error('❌ Deployment scale error:', error);
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
    console.log(`🚀 Pod deployment info requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.getDeploymentInfo(namespace, podName);
    
    if (result.success) {
      res.json({
        success: true,
        deployment: result.deployment
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('❌ Pod deployment info error:', error);
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