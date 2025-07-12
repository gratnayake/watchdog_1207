// backend/services/databaseOperationsService.js
const realOracleService = require('./realOracleService');
const dbConfigService = require('./dbConfigService');

class DatabaseOperationsService {
  constructor() {
    console.log('🗄️ Database Operations Service initialized');
  }

  // Check if database is configured and accessible
  async checkDatabaseAvailability() {
    try {
      const config = dbConfigService.getConfig();
      if (!config.isConfigured) {
        return {
          available: false,
          message: 'Database not configured. Please configure database connection first.',
          configured: false
        };
      }

      const connectionCheck = await realOracleService.checkConnection();
      return {
        available: connectionCheck.isConnected,
        message: connectionCheck.isConnected ? 'Database is accessible' : 'Database is not accessible',
        configured: true,
        error: connectionCheck.error
      };
    } catch (error) {
      return {
        available: false,
        message: `Error checking database: ${error.message}`,
        configured: true,
        error: error.message
      };
    }
  }

  // SHUTDOWN IMMEDIATE - Forceful database shutdown
  async shutdownImmediate() {
    try {
      console.log('🛑 Attempting SHUTDOWN IMMEDIATE...');
      
      const availability = await this.checkDatabaseAvailability();
      if (!availability.configured) {
        throw new Error(availability.message);
      }

      if (!availability.available) {
        return {
          success: false,
          message: 'Database is already down or not accessible',
          output: 'Database connection failed - may already be shut down'
        };
      }

      // Connect as SYSDBA for shutdown operations
      const result = await this.executeDatabaseCommand('SHUTDOWN IMMEDIATE');
      
      console.log('✅ SHUTDOWN IMMEDIATE completed');
      return {
        success: true,
        message: 'Database shutdown completed successfully',
        output: result.output,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ SHUTDOWN IMMEDIATE failed:', error);
      return {
        success: false,
        message: `Shutdown failed: ${error.message}`,
        output: `Error: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // STARTUP - Start the database
  async startupDatabase() {
    try {
      console.log('🚀 Attempting STARTUP...');
      
      const config = dbConfigService.getConfig();
      if (!config.isConfigured) {
        throw new Error('Database not configured. Please configure database connection first.');
      }

      // For startup, we need to connect without specifying a database
      const result = await this.executeDatabaseCommand('STARTUP');
      
      console.log('✅ STARTUP completed');
      return {
        success: true,
        message: 'Database startup completed successfully',
        output: result.output,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ STARTUP failed:', error);
      return {
        success: false,
        message: `Startup failed: ${error.message}`,
        output: `Error: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Execute database commands (SHUTDOWN/STARTUP)
  async executeDatabaseCommand(command) {
    const config = dbConfigService.getConfig();
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let output = '';
      let errorOutput = '';

      // Create SQL*Plus command
      const sqlplusProcess = spawn('sqlplus', ['-S', `/nolog`], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Prepare SQL*Plus commands
      const sqlCommands = [
        `CONNECT ${config.username}/${config.password}@${config.host}:${config.port}/${config.serviceName} AS SYSDBA`,
        command,
        'EXIT'
      ].join('\n');

      // Handle output
      sqlplusProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log('📤 SQL*Plus output:', chunk.trim());
      });

      sqlplusProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        console.error('📤 SQL*Plus error:', chunk.trim());
      });

      // Handle process completion
      sqlplusProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        
        if (code === 0) {
          resolve({
            success: true,
            output: output || 'Command executed successfully',
            executionTime: executionTime,
            code: code
          });
        } else {
          reject(new Error(`SQL*Plus exited with code ${code}. Error: ${errorOutput || output}`));
        }
      });

      sqlplusProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
          reject(new Error('SQL*Plus not found. Please ensure Oracle client is installed and sqlplus is in PATH.'));
        } else {
          reject(error);
        }
      });

      // Send commands to SQL*Plus
      sqlplusProcess.stdin.write(sqlCommands);
      sqlplusProcess.stdin.end();

      // Set timeout for long-running operations
      setTimeout(() => {
        if (!sqlplusProcess.killed) {
          sqlplusProcess.kill();
          reject(new Error('Database operation timed out after 60 seconds'));
        }
      }, 60000); // 60 second timeout
    });
  }

  // Get database status for operations
  async getDatabaseStatus() {
    try {
      const availability = await this.checkDatabaseAvailability();
      const config = dbConfigService.getConfig();
      
      return {
        configured: availability.configured,
        available: availability.available,
        message: availability.message,
        canShutdown: availability.available && availability.configured,
        canStartup: availability.configured,
        connectionString: config.isConfigured ? 
          `${config.host}:${config.port}/${config.serviceName}` : 'Not configured'
      };
    } catch (error) {
      return {
        configured: false,
        available: false,
        message: `Error: ${error.message}`,
        canShutdown: false,
        canStartup: false,
        error: error.message
      };
    }
  }
}

module.exports = new DatabaseOperationsService();