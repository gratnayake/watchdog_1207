// backend/services/databaseOperationsService.js
require('dotenv').config();
const oracledb = require('oracledb');
const dbConfigService = require('./dbConfigService');

class DatabaseOperationsService {
  constructor() {
    console.log('🔧 Database Operations Service initialized');
  }

  // Get connection config using existing database config + SYS credentials
  getConnectionConfig() {
    const dbConfig = dbConfigService.getConfig();
    
    if (!dbConfig.isConfigured) {
      throw new Error('Database not configured. Please configure database connection first.');
    }

    if (!process.env.DB_RESTART_USERNAME || !process.env.DB_RESTART_PASSWORD) {
      throw new Error('SYS credentials not configured in environment variables');
    }

    return {
      user: process.env.DB_RESTART_USERNAME,
      password: process.env.DB_RESTART_PASSWORD,
      connectString: `${dbConfig.host}:${dbConfig.port}/${dbConfig.serviceName}`,
      privilege: oracledb.SYSDBA // Use SYSDBA privilege
    };
  }

  // Test connection with SYS credentials
  async testConnection() {
    let connection;
    try {
      console.log('🧪 Testing SYS database connection...');
      
      const connectionConfig = this.getConnectionConfig();
      console.log(`📡 Testing connection: ${connectionConfig.user}@${connectionConfig.connectString} as SYSDBA`);
      
      connection = await oracledb.getConnection(connectionConfig);
      
      // Test with a simple query
      const result = await connection.execute('SELECT instance_name, status FROM v$instance');
      
      console.log('✅ SYS connection test successful');
      return {
        success: true,
        message: 'SYS connection successful',
        instanceInfo: result.rows[0] ? {
          name: result.rows[0][0],
          status: result.rows[0][1]
        } : null
      };
    } catch (error) {
      console.error('❌ SYS connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing test connection:', err);
        }
      }
    }
  }

  // Get database status using SYS credentials
  async getStatus() {
    let connection;
    try {
      console.log('📊 Getting database status...');
      
      const connectionConfig = this.getConnectionConfig();
      connection = await oracledb.getConnection(connectionConfig);
      
      // Get instance status
      const instanceResult = await connection.execute(`
        SELECT 
          instance_name,
          status,
          database_status,
          startup_time,
          version
        FROM v$instance
      `);

      // Get database status
      const dbResult = await connection.execute(`
        SELECT 
          name,
          open_mode,
          database_role
        FROM v$database
      `);

      const instance = instanceResult.rows[0];
      const database = dbResult.rows[0];

      return {
        success: true,
        status: {
          instance: {
            name: instance[0],
            status: instance[1],
            databaseStatus: instance[2],
            startupTime: instance[3],
            version: instance[4]
          },
          database: {
            name: database[0],
            openMode: database[1],
            role: database[2]
          },
          timestamp: new Date()
        }
      };

    } catch (error) {
      console.error('❌ Failed to get database status:', error);
      return {
        success: false,
        error: error.message,
        status: 'error'
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing status connection:', err);
        }
      }
    }
  }

  // Shutdown database immediately
  async shutdownImmediate() {
    let connection;
    try {
      console.log('🛑 Initiating immediate database shutdown...');
      
      const connectionConfig = this.getConnectionConfig();
      connection = await oracledb.getConnection(connectionConfig);
      
      // Execute shutdown immediate
      await connection.execute('SHUTDOWN IMMEDIATE');
      
      console.log('✅ Database shutdown immediate executed successfully');
      
      return {
        success: true,
        message: 'Database shutdown immediate executed successfully',
        action: 'shutdown',
        timestamp: new Date()
      };

    } catch (error) {
      console.error('❌ Database shutdown failed:', error);
      return {
        success: false,
        error: error.message,
        action: 'shutdown'
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing shutdown connection:', err);
        }
      }
    }
  }

  // Startup database
  async startup() {
    let connection;
    try {
      console.log('🚀 Initiating database startup...');
      
      const connectionConfig = this.getConnectionConfig();
      
      // For startup, we need to connect in PRELIM_AUTH mode first
      const prelimConfig = {
        ...connectionConfig,
        privilege: oracledb.SYSDBA
      };

      connection = await oracledb.getConnection(prelimConfig);
      
      // Execute startup
      await connection.execute('STARTUP');
      
      // Close preliminary connection
      await connection.close();
      
      // Wait a moment for database to fully start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Reconnect normally to verify startup
      connection = await oracledb.getConnection(connectionConfig);
      
      // Verify database is open
      const result = await connection.execute('SELECT status FROM v$instance');
      const status = result.rows[0][0];
      
      console.log('✅ Database startup executed successfully, status:', status);
      
      return {
        success: true,
        message: `Database startup executed successfully. Status: ${status}`,
        action: 'startup',
        status: status,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('❌ Database startup failed:', error);
      return {
        success: false,
        error: error.message,
        action: 'startup'
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing startup connection:', err);
        }
      }
    }
  }

  // Restart database (shutdown + startup)
  async restart() {
    try {
      console.log('🔄 Initiating database restart...');
      
      // Step 1: Shutdown
      const shutdownResult = await this.shutdownImmediate();
      if (!shutdownResult.success) {
        throw new Error(`Shutdown failed: ${shutdownResult.error}`);
      }

      console.log('⏳ Waiting 5 seconds before startup...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Step 2: Startup
      const startupResult = await this.startup();
      if (!startupResult.success) {
        throw new Error(`Startup failed: ${startupResult.error}`);
      }

      console.log('✅ Database restart completed successfully');
      
      return {
        success: true,
        message: 'Database restart completed successfully',
        action: 'restart',
        steps: {
          shutdown: shutdownResult,
          startup: startupResult
        },
        timestamp: new Date()
      };

    } catch (error) {
      console.error('❌ Database restart failed:', error);
      return {
        success: false,
        error: error.message,
        action: 'restart'
      };
    }
  }

  // Get configuration info (without sensitive data)
  getConfigInfo() {
    try {
      const dbConfig = dbConfigService.getConfig();
      
      return {
        host: dbConfig.host || 'Not configured',
        port: dbConfig.port || '1521',
        serviceName: dbConfig.serviceName || 'Not configured',
        sysUsername: process.env.DB_RESTART_USERNAME || 'Not configured',
        sysPasswordConfigured: !!process.env.DB_RESTART_PASSWORD,
        databaseConfigured: dbConfig.isConfigured,
        isConfigured: dbConfig.isConfigured && 
                      !!process.env.DB_RESTART_USERNAME && 
                      !!process.env.DB_RESTART_PASSWORD
      };
    } catch (error) {
      return {
        host: 'Error loading config',
        port: 'Error',
        serviceName: 'Error',
        sysUsername: 'Error',
        sysPasswordConfigured: false,
        databaseConfigured: false,
        isConfigured: false
      };
    }
  }

  // Validate configuration
  validateConfig() {
    try {
      const dbConfig = dbConfigService.getConfig();
      const missingItems = [];
      
      if (!dbConfig.isConfigured) {
        missingItems.push('Database connection not configured');
      }
      
      if (!process.env.DB_RESTART_USERNAME) {
        missingItems.push('DB_RESTART_USERNAME not set in .env');
      }
      
      if (!process.env.DB_RESTART_PASSWORD) {
        missingItems.push('DB_RESTART_PASSWORD not set in .env');
      }

      return {
        isValid: missingItems.length === 0,
        missingItems: missingItems,
        configInfo: this.getConfigInfo()
      };
    } catch (error) {
      return {
        isValid: false,
        missingItems: ['Error validating configuration'],
        configInfo: this.getConfigInfo()
      };
    }
  }
}

module.exports = new DatabaseOperationsService();