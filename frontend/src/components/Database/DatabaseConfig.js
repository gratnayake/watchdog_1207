// Replace your DatabaseConfig.js with this enhanced version

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Space, 
  Alert, 
  Row, 
  Col, 
  Typography,
  message,
  Divider,
  InputNumber,
  Select,
  Spin
} from 'antd';
import { 
  DatabaseOutlined, 
  SaveOutlined, 
  CheckCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  MailOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { databaseAPI, emailAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const DatabaseConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [emailGroups, setEmailGroups] = useState([]);
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });

  useEffect(() => {
    loadConfig();
    loadEmailGroups();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await databaseAPI.getConfig();
      
      if (response.success) {
        setConfig(response.config);
        // Set form values INCLUDING emailGroupId
        form.setFieldsValue({
          host: response.config.host,
          port: response.config.port,
          serviceName: response.config.serviceName,
          username: response.config.username,
          password: '', // Don't show existing password
          emailGroupId: response.config.emailGroupId || null // Add this field
        });
      }
    } catch (error) {
      console.error('Failed to load database config:', error);
      showAlert('error', 'Failed to load database configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadEmailGroups = async () => {
    try {
      const response = await emailAPI.getEmailGroups();
      if (response.success) {
        setEmailGroups(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load email groups:', error);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message, visible: true });
    setTimeout(() => {
      setAlert({ ...alert, visible: false });
    }, 5000);
  };

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields(['host', 'port', 'serviceName', 'username', 'password']);
      setTestLoading(true);
      
      console.log('Testing connection with:', { ...values, password: '***' });
      
      const response = await databaseAPI.testConnection(values);
      
      if (response.success) {
        showAlert('success', 'Connection test successful! Database is reachable.');
        message.success('Connection test successful!');
      } else {
        showAlert('error', `Connection test failed: ${response.error}`);
        message.error('Connection test failed');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
        return;
      }
      
      console.error('Test connection error:', error);
      const errorMessage = error.response?.data?.error || error.message;
      showAlert('error', `Connection test failed: ${errorMessage}`);
      message.error('Connection test failed');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      console.log('Saving config with email group:', { ...values, password: '***' });
      
      const response = await databaseAPI.saveConfig(values);
      
      if (response.success) {
        setConfig(response.config);
        showAlert('success', 'Database configuration saved successfully with email group!');
        message.success('Configuration saved to JSON file!');
        
        // Reload config to get updated data
        setTimeout(() => {
          loadConfig();
        }, 1000);
      } else {
        showAlert('error', 'Failed to save configuration');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
        return;
      }
      
      console.error('Save config error:', error);
      const errorMessage = error.response?.data?.error || error.message;
      showAlert('error', `Failed to save configuration: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !config) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading database configuration...</p>
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <DatabaseOutlined />
                Oracle Database Configuration
              </Space>
            }
          >
            {alert.visible && (
              <Alert
                message={alert.message}
                type={alert.type}
                style={{ marginBottom: 16 }}
                closable
                onClose={() => setAlert({ ...alert, visible: false })}
              />
            )}

            <Form
              form={form}
              layout="vertical"
              initialValues={{
                port: 1521
              }}
            >
              <Row gutter={16}>
                <Col span={16}>
                  <Form.Item
                    name="host"
                    label="Database Host"
                    rules={[{ required: true, message: 'Please enter database host!' }]}
                  >
                    <Input 
                      placeholder="Database server hostname or IP address"
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="port"
                    label="Port"
                    rules={[{ required: true, message: 'Please enter port!' }]}
                  >
                    <InputNumber 
                      placeholder="1521"
                      min={1}
                      max={65535}
                      size="large"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="serviceName"
                label="Service Name"
                rules={[{ required: true, message: 'Please enter service name!' }]}
              >
                <Input 
                  placeholder="Oracle service name (e.g., ORCL, XE, XEPDB1)"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="username"
                label="Database Username"
                rules={[{ required: true, message: 'Please enter username!' }]}
              >
                <Input 
                  placeholder="Database username (e.g., system, hr, scott)"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="password"
                label="Database Password"
                rules={[{ required: true, message: 'Please enter password!' }]}
              >
                <Input.Password 
                  placeholder="Database password"
                  size="large"
                  iconRender={visible => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                />
              </Form.Item>

              <Divider orientation="left">Alert Configuration</Divider>

              <Form.Item
                name="emailGroupId"
                label="Database Alert Group"
                extra="Select which email group should receive database alerts (up/down notifications)"
              >
                <Select 
                  placeholder="Select email group for database alerts (optional)"
                  allowClear
                  size="large"
                  loading={emailGroups.length === 0}
                >
                  <Option value={null}>
                    <Space>
                      🔕 
                      <span>No email alerts</span>
                    </Space>
                  </Option>
                  {emailGroups.map(group => (
                    <Option key={group.id} value={group.id}>
                      <Space>
                        <TeamOutlined />
                        <span>{group.name}</span>
                        <span style={{ color: '#8c8c8c' }}>
                          ({group.emails.length} recipients)
                        </span>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {emailGroups.length === 0 && (
                <Alert
                  message="No Email Groups Available"
                  description="Create email groups in Email Management to enable database alerts."
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}

              <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                <Space size="large">
                  <Button 
                    type="default"
                    icon={<CheckCircleOutlined />}
                    onClick={handleTestConnection}
                    loading={testLoading}
                    size="large"
                  >
                    Test Connection
                  </Button>
                  <Button 
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={loading}
                    size="large"
                  >
                    Save Configuration
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Configuration Status">
            {config ? (
              <div>
                <Alert
                  message={config.isConfigured ? "✅ Database Configured" : "⚠️ Database Not Configured"}
                  type={config.isConfigured ? "success" : "warning"}
                  style={{ marginBottom: 16 }}
                />
                
                {config.isConfigured && (
                  <div>
                    <Title level={5}>Current Settings:</Title>
                    <p><strong>Host:</strong> {config.host}</p>
                    <p><strong>Port:</strong> {config.port}</p>
                    <p><strong>Service:</strong> {config.serviceName}</p>
                    <p><strong>Username:</strong> {config.username}</p>
                    
                    {config.emailGroupId && (
                      <div>
                        <p><strong>Alert Group:</strong> 
                          {emailGroups.find(g => g.id === config.emailGroupId)?.name || 'Unknown Group'}
                        </p>
                      </div>
                    )}
                    
                    {!config.emailGroupId && (
                      <Alert
                        message="No Email Alerts"
                        description="Select an email group to receive database alerts"
                        type="info"
                        size="small"
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Alert
                message="No Configuration Found"
                description="Please configure your Oracle database connection"
                type="info"
              />
            )}
          </Card>

          <Card title="Connection Tips" style={{ marginTop: 16 }}>
            <div>
              <Title level={5}>Common Service Names:</Title>
              <ul>
                <li><strong>XE:</strong> Oracle Express Edition</li>
                <li><strong>ORCL:</strong> Standard Oracle instance</li>
                <li><strong>XEPDB1:</strong> Pluggable database in XE</li>
                <li><strong>PDB1:</strong> Common pluggable database name</li>
              </ul>
              
              <Title level={5}>Default Ports:</Title>
              <ul>
                <li><strong>1521:</strong> Standard Oracle port</li>
                <li><strong>1522:</strong> Alternative Oracle port</li>
              </ul>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DatabaseConfig;