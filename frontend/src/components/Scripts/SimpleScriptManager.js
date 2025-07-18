import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  Space, 
  Typography, 
  message,
  Modal,
  Input,
  Alert,
  Table,
  Tag,
  Row,
  Col,
  Select,
  Tooltip,
  Divider,
  Popconfirm
} from 'antd';
import { 
  PlayCircleOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  FileTextOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  DatabaseOutlined,
  PoweroffOutlined,
  ThunderboltOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { scriptAPI, simpleScriptAPI, databaseOperationsAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const SimpleScriptManager = () => {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [outputModal, setOutputModal] = useState({ visible: false, script: null, output: '', loading: false });
  const [kubeStatus, setKubeStatus] = useState(null);
  
  // Database Operations State
  const [dbOperationsStatus, setDbOperationsStatus] = useState(null);
  const [dbOperationLoading, setDbOperationLoading] = useState(false);
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    scriptPath: '',
    arguments: ''
  });

  // Predefined common arguments for MTCTL
  const commonArguments = [
    { label: 'Help', value: '--help', description: 'Show help information' },
    { label: 'Version', value: '--version', description: 'Show version information' },
    { label: 'Stop Namespace', value: 'stop --namespace "tsutst"', description: 'Stop deployments in namespace' },
    { label: 'Start Namespace', value: 'start --namespace "tsutst"', description: 'Start deployments in namespace' },
    { label: 'Status Check', value: 'status --namespace "tsutst"', description: 'Check status of namespace' },
    { label: 'List Deployments', value: 'list --namespace "tsutst"', description: 'List all deployments' },
    { label: 'Deploy', value: 'deploy --namespace "tsutst"', description: 'Deploy to namespace' }
  ];

  useEffect(() => {
    loadScripts();
    checkKubernetesConfig();
    loadDatabaseOperationsStatus();
  }, []);

  // Load database operations status
  const loadDatabaseOperationsStatus = async () => {
    try {
      const { databaseOperationsAPI } = await import('../../services/api');
      const response = await databaseOperationsAPI.getStatus();
      if (response.success) {
        setDbOperationsStatus(response);
      }
    } catch (error) {
      console.error('Failed to load database operations status:', error);
    }
  };

  // Database shutdown operation
  const handleDatabaseShutdown = async () => {
    setDbOperationLoading(true);
    setOutputModal({ 
      visible: true, 
      script: { name: 'Database Shutdown', scriptPath: 'SHUTDOWN IMMEDIATE' }, 
      output: 'Initiating database shutdown...\n', 
      loading: true 
    });
    
    try {
      const { databaseOperationsAPI } = await import('../../services/api');
      const result = await databaseOperationsAPI.shutdownImmediate();
      
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\n${result.output}\n\n--- Operation completed ---`,
        loading: false
      }));
      
      if (result.success) {
        message.success('Database shutdown completed successfully!');
      } else {
        message.error('Database shutdown failed!');
      }
      
      // Refresh status
      await loadDatabaseOperationsStatus();
      
    } catch (error) {
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\nError: ${error.message}`,
        loading: false
      }));
      message.error(`Database shutdown failed: ${error.message}`);
    } finally {
      setDbOperationLoading(false);
    }
  };

  // Database startup operation
  const handleDatabaseStartup = async () => {
    setDbOperationLoading(true);
    setOutputModal({ 
      visible: true, 
      script: { name: 'Database Startup', scriptPath: 'STARTUP' }, 
      output: 'Initiating database startup...\n', 
      loading: true 
    });
    
    try {
      const { databaseOperationsAPI } = await import('../../services/api');
      const result = await databaseOperationsAPI.startup();
      
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\n${result.output}\n\n--- Operation completed ---`,
        loading: false
      }));
      
      if (result.success) {
        message.success('Database startup completed successfully!');
      } else {
        message.error('Database startup failed!');
      }
      
      // Refresh status
      await loadDatabaseOperationsStatus();
      
    } catch (error) {
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\nError: ${error.message}`,
        loading: false
      }));
      message.error(`Database startup failed: ${error.message}`);
    } finally {
      setDbOperationLoading(false);
    }
  };

  // Check Kubernetes configuration status
  const checkKubernetesConfig = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/kubernetes-script-config');
      const data = await response.json();
      setKubeStatus(data);
    } catch (error) {
      console.error('Failed to check Kubernetes config:', error);
      setKubeStatus({
        configured: false,
        message: 'Unable to check Kubernetes configuration'
      });
    }
  };

  // Render Database Operations Panel
  const renderDatabaseOperations = () => {
    if (!dbOperationsStatus?.configInfo?.isConfigured) {
      return (
        <Alert
          message="Database Not Configured"
          description="Please configure database connection in Database Config to enable database operations."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      );
    }

    const getStatusColor = () => {
      if (dbOperationsStatus?.configInfo?.isConfigured) return 'success';
      return 'error';
    };

    const getStatusText = () => {
      if (dbOperationsStatus?.configInfo?.isConfigured) return 'CONFIGURED';
      return 'NOT CONFIGURED';
    };

    return (
      <Card 
        title={
          <Space>
            <DatabaseOutlined />
            <span>Database Operations</span>
            <Tag color={getStatusColor()}>
              {getStatusText()}
            </Tag>
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Button size="small" onClick={loadDatabaseOperationsStatus}>
            <ReloadOutlined />
          </Button>
        }
      >
        <Row gutter={16} align="middle">
          <Col span={12}>
            <Space direction="vertical" size="small">
              <Text strong>Connection:</Text>
              <Text code style={{ fontSize: '12px' }}>
                {dbOperationsStatus?.configInfo?.host}:{dbOperationsStatus?.configInfo?.port}/{dbOperationsStatus?.configInfo?.serviceName}
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                SYS User: {dbOperationsStatus?.configInfo?.sysUsername || 'Not configured'}              </Text>
            </Space>
          </Col>
          <Col span={12}>
            <Space>
              <Popconfirm
                title="Shutdown Database"
                description="This will perform SHUTDOWN IMMEDIATE. Are you sure?"
                onConfirm={handleDatabaseShutdown}
                okText="Shutdown"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                disabled={!dbOperationsStatus.canShutdown || dbOperationLoading}
              >
                <Button 
                  danger
                  icon={<PoweroffOutlined />}
                  loading={dbOperationLoading}
                  disabled={!dbOperationsStatus.canShutdown}
                >
                  Shutdown
                </Button>
              </Popconfirm>
              
              <Button 
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleDatabaseStartup}
                loading={dbOperationLoading}
                disabled={!dbOperationsStatus.canStartup || dbOperationLoading}
              >
                Startup
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  };

  // Render Kubernetes status indicator
  const renderKubernetesStatus = () => {
    if (!kubeStatus) return null;

    const getStatusProps = () => {
      if (kubeStatus.configured && kubeStatus.kubeconfigExists) {
        return {
          type: "success",
          icon: <CheckCircleOutlined />,
          message: "Kubernetes Configuration Ready",
          description: `KUBECONFIG will be automatically used from: ${kubeStatus.kubeconfigPath}`
        };
      } else if (kubeStatus.configured && !kubeStatus.kubeconfigExists) {
        return {
          type: "warning", 
          icon: <ExclamationCircleOutlined />,
          message: "Kubernetes Configuration Issue",
          description: `KUBECONFIG file not found: ${kubeStatus.kubeconfigPath}`
        };
      } else {
        return {
          type: "info",
          icon: <InfoCircleOutlined />,
          message: "Kubernetes Not Configured",
          description: "Scripts will run without KUBECONFIG. Configure in Kubernetes settings if needed."
        };
      }
    };

    const statusProps = getStatusProps();

    return (
      <Alert
        {...statusProps}
        showIcon
        style={{ marginBottom: 16 }}
        action={
          <Button size="small" onClick={checkKubernetesConfig}>
            Refresh
          </Button>
        }
      />
    );
  };

  const loadScripts = async () => {
    try {
      setLoading(true);
      const response = await scriptAPI.getAllScripts();
      if (response.success) {
        setScripts(response.data);
      }
    } catch (error) {
      console.error('Failed to load scripts:', error);
      message.error('Failed to load scripts from server');
    } finally {
      setLoading(false);
    }
  };

  // Remove the old saveScripts function entirely and replace handleSaveScript with:
  const handleSaveScript = async () => {
    if (!form.name || !form.scriptPath) {
      message.error('Please fill in script name and path');
      return;
    }

    try {
      setLoading(true);

      const scriptData = {
        name: form.name,
        description: form.description,
        scriptPath: form.scriptPath,
        arguments: form.arguments
      };

      let response;
      if (editingScript) {
        // Update existing script
        response = await scriptAPI.updateScript(editingScript.id, scriptData);
      } else {
        // Add new script
        response = await scriptAPI.addScript(scriptData);
      }

      if (response.success) {
        message.success(editingScript ? 'Script updated successfully' : 'Script added successfully');
        setModalVisible(false);
        await loadScripts(); // Reload scripts from backend
      } else {
        message.error('Failed to save script');
      }
    } catch (error) {
      console.error('Save script error:', error);
      message.error(`Failed to save script: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const executeScript = async (script) => {
    setOutputModal({ visible: true, script, output: '', loading: true });
    
    try {
      const result = await simpleScriptAPI.executeScript({
        name: script.name,
        scriptPath: script.scriptPath,
        arguments: script.arguments
      });
      
      setOutputModal(prev => ({
        ...prev,
        output: result.output,
        loading: false
      }));
      
      // Reload scripts to get updated lastRunAt from backend
      await loadScripts();
      
      if (result.kubeconfigUsed) {
        message.success('Script executed successfully with KUBECONFIG');
      } else {
        message.success('Script executed successfully');
      }
    } catch (error) {
      setOutputModal(prev => ({
        ...prev,
        output: `Error executing script: ${error.message}`,
        loading: false
      }));
      message.error(`Script execution failed: ${error.message}`);
    }
  };

  const handleAddScript = () => {
    setEditingScript(null);
    setForm({
      name: '',
      description: '',
      scriptPath: '',
      arguments: ''
    });
    setModalVisible(true);
  };

  const handleEditScript = (script) => {
    setEditingScript(script);
    setForm({
      name: script.name,
      description: script.description,
      scriptPath: script.scriptPath,
      arguments: script.arguments
    });
    setModalVisible(true);
  };

  const handleDeleteScript = async (scriptId) => {
  try {
    const response = await scriptAPI.deleteScript(scriptId);
    if (response.success) {
      message.success('Script deleted successfully');
      await loadScripts(); // Reload scripts from backend
    } else {
      message.error('Failed to delete script');
    }
  } catch (error) {
    console.error('Delete script error:', error);
    message.error(`Failed to delete script: ${error.message}`);
  }
};

  const handleQuickArgument = (value) => {
    setForm(prev => ({ ...prev, arguments: value }));
  };

  const columns = [
    {
      title: 'Script Details',
      key: 'details',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <FileTextOutlined /> {record.scriptPath}
            </Text>
          </div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Arguments',
      dataIndex: 'arguments',
      key: 'arguments',
      render: (args) => (
        args ? (
          <Tooltip title={args}>
            <Text code style={{ fontSize: '12px' }}>
              {args.length > 40 ? `${args.substring(0, 40)}...` : args}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: '12px' }}>No arguments</Text>
        )
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Tag color="blue">Ready</Tag>
          {record.lastRun && (
            <Text type="secondary" style={{ fontSize: '11px' }}>
              Last run: {new Date(record.lastRun).toLocaleString()}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Run Script">
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              size="small"
              onClick={() => executeScript(record)}
            />
          </Tooltip>
          <Tooltip title="Edit Script">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEditScript(record)}
            />
          </Tooltip>
          <Tooltip title="Delete Script">
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => handleDeleteScript(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <CodeOutlined />
            <Title level={4} style={{ margin: 0 }}>Cluster & DB Control</Title>
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadScripts}
            >
              Refresh
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddScript}
            >
              Add Script
            </Button>
          </Space>
        }
      >
        {/* Database Operations Panel */}
        {renderDatabaseOperations()}
        
        <Divider orientation="left">Custom Scripts</Divider>

        {/* Kubernetes Status Indicator */}
        {renderKubernetesStatus()}

        <Table
          columns={columns}
          dataSource={scripts}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
          locale={{
            emptyText: 'No scripts configured. Click "Add Script" to get started!'
          }}
        />
      </Card>

      {/* Add/Edit Script Modal */}
      <Modal
        title={
          <Space>
            {editingScript ? <EditOutlined /> : <PlusOutlined />}
            {editingScript ? 'Edit Script' : 'Add New Script'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSaveScript}
        width={700}
        okText={editingScript ? 'Update Script' : 'Add Script'}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text strong>Script Name *</Text>
            <Input 
              placeholder="Enter script name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div>
            <Text strong>Description</Text>
            <Input 
              placeholder="Enter script description (optional)"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div>
            <Text strong>Script Path *</Text>
            <Input 
              placeholder="Enter full path to script or command"
              value={form.scriptPath}
              onChange={(e) => setForm(prev => ({ ...prev, scriptPath: e.target.value }))}
            />
          </div>

          <div>
            <Text strong>Arguments</Text>
            <Select
              placeholder="Select common arguments or type custom"
              style={{ width: '100%' }}
              allowClear
              onChange={handleQuickArgument}
              dropdownRender={(menu) => (
                <div>
                  {menu}
                  <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      💡 Select predefined arguments or type custom ones below
                    </Text>
                  </div>
                </div>
              )}
            >
              {commonArguments.map((arg, index) => (
                <Option key={index} value={arg.value}>
                  <div>
                    <Text>{arg.label}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {arg.description}
                    </Text>
                  </div>
                </Option>
              ))}
            </Select>
            
            <Input 
              placeholder="Enter custom arguments"
              value={form.arguments}
              onChange={(e) => setForm(prev => ({ ...prev, arguments: e.target.value }))}
              style={{ marginTop: 4 }}
            />
          </div>

          <Alert
            message="Automatic Kubernetes Integration"
            description="Your KUBECONFIG will be automatically applied from your Kubernetes configuration settings. No need to set environment variables manually."
            type="info"
            showIcon
          />
        </Space>
      </Modal>

        {/* Script Output Modal */}
        <Modal
          title={
            <Space>
              <CodeOutlined />
              Script Output: {outputModal.script?.name}
              <Tag color={outputModal.loading ? 'blue' : 'green'}>
                {outputModal.loading ? 'Running...' : 'Completed'}
              </Tag>
            </Space>
          }
          open={outputModal.visible}
          onCancel={() => setOutputModal({ visible: false, script: null, output: '', loading: false })}
          footer={[
            <Button 
              key="close" 
              type="primary"
              onClick={() => setOutputModal({ visible: false, script: null, output: '', loading: false })}
            >
              Close
            </Button>
          ]}
          width={800}
        >
          <div style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>Script:</Text>
                <br />
                <Text code style={{ fontSize: '12px' }}>{outputModal.script?.scriptPath}</Text>
              </Col>
              <Col span={12}>
                <Text strong>Arguments:</Text>
                <br />
                <Text code style={{ fontSize: '12px' }}>{outputModal.script?.arguments || 'None'}</Text>
              </Col>
            </Row>
          </div>

          <div>
            <Text strong>Output:</Text>
            <div style={{
              background: '#000',
              color: '#00ff00',
              padding: '16px',
              borderRadius: '6px',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '13px',
              maxHeight: '400px',
              overflow: 'auto',
              marginTop: '8px',
              whiteSpace: 'pre-wrap',
              border: '1px solid #333'
            }}>
              {outputModal.loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Text style={{ color: '#00ff00' }}>
                    ⏳ Executing operation... Please wait...
                  </Text>
                </div>
              ) : (
                outputModal.output || 'No output generated'
              )}
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  export default SimpleScriptManager;// In frontend/src/components/Scripts/SimpleScriptManager.js

// PROBLEM 1: The loadDatabaseOperationsStatus function is setting the wrong data
// FIND this function (around line 75):

const loadDatabaseOperationsStatus = async () => {
  try {
    const { databaseOperationsAPI } = await import('../../services/api');
    const response = await databaseOperationsAPI.getStatus();
    console.log('🔍 Database operations API response:', response); // Add this for debugging
    
    if (response.success) {
      // CHANGE THIS LINE:
      // setDbOperationsStatus(response.status);
      
      // TO THIS LINE:
      setDbOperationsStatus(response);  // Set the entire response object
    }
  } catch (error) {
    console.error('Failed to load database operations status:', error);
  }
};

// PROBLEM 2: Update the renderDatabaseOperations function
// FIND this function (around line 140):

const renderDatabaseOperations = () => {
  console.log('🔍 Current dbOperationsStatus:', dbOperationsStatus); // Add debugging
  
  // CHANGE THIS CHECK:
  // if (!dbOperationsStatus?.configured) {
  
  // TO THIS CHECK:
  if (!dbOperationsStatus?.configInfo?.isConfigured) {
    return (
      <Alert
        message="Database Not Configured"
        description="Please configure database connection in Database Config to enable database operations."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }

  const getStatusColor = () => {
    // CHANGE THIS:
    // if (dbOperationsStatus.available) return 'success';
    
    // TO THIS:
    if (dbOperationsStatus?.configInfo?.isConfigured) return 'success';
    return 'error';
  };

  const getStatusText = () => {
    // CHANGE THIS:
    // if (dbOperationsStatus.available) return 'ONLINE';
    
    // TO THIS:
    if (dbOperationsStatus?.configInfo?.isConfigured) return 'CONFIGURED';
    return 'NOT CONFIGURED';
  };

  return (
    <Card 
      title={
        <Space>
          <DatabaseOutlined />
          <span>Database Operations</span>
          <Tag color={getStatusColor()}>
            {getStatusText()}
          </Tag>
        </Space>
      }
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Button size="small" onClick={loadDatabaseOperationsStatus}>
          <ReloadOutlined />
        </Button>
      }
    >
      <Row gutter={16} align="middle">
        <Col span={12}>
          <Space direction="vertical" size="small">
            <Text strong>Connection:</Text>
            <Text code style={{ fontSize: '12px' }}>
              {/* CHANGE THIS: */}
              {/* {dbOperationsStatus.connectionString} */}
              
              {/* TO THIS: */}
              {dbOperationsStatus?.configInfo?.host}:{dbOperationsStatus?.configInfo?.port}/{dbOperationsStatus?.configInfo?.serviceName}
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {/* CHANGE THIS: */}
              {/* {dbOperationsStatus.message} */}
              
              {/* TO THIS: */}
              SYS User: {dbOperationsStatus?.configInfo?.sysUsername} | Password: {dbOperationsStatus?.configInfo?.sysPasswordConfigured ? 'Configured' : 'Not Set'}
            </Text>
          </Space>
        </Col>
        <Col span={12}>
          <Space>
            <Popconfirm
              title="Shutdown Database"
              description="This will perform SHUTDOWN IMMEDIATE. Are you sure?"
              onConfirm={handleDatabaseShutdown}
              disabled={dbOperationLoading}
            >
              <Button 
                danger 
                size="small" 
                loading={dbOperationLoading}
                icon={<PoweroffOutlined />}
              >
                Shutdown
              </Button>
            </Popconfirm>
            
            <Button 
              type="primary" 
              size="small" 
              loading={dbOperationLoading}
              icon={<ThunderboltOutlined />}
              onClick={handleDatabaseStartup}
            >
              Startup
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  );
};