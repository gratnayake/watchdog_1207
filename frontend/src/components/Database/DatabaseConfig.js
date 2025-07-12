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
  Spin,
  Select  
} from 'antd';
import { 
  DatabaseOutlined, 
  SaveOutlined, 
  CheckCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons';
import { databaseAPI, emailAPI  } from '../../services/api';
import DbSizeThreshold from '../Thresholds/DbSizeThreshold';

const { Title, Text } = Typography;
const { Option } = Select; 

const DatabaseConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });
  const [emailGroups, setEmailGroups] = useState([]);

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
        // Fill form with existing config (except password)
        form.setFieldsValue({
          host: response.config.host,
          port: response.config.port,
          serviceName: response.config.serviceName,
          username: response.config.username,
          password: '' // Don't show existing password
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      showAlert('error', 'Failed to load database configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadEmailGroups = async () => {
    try {
      const response = await emailAPI.getEmailGroups();
      if (response.success) {
        setEmailGroups(response.data.filter(g => g.enabled));
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
      const values = await form.validateFields();
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
      
      console.log('Saving config:', { ...values, password: '***' });
      
      const response = await databaseAPI.saveConfig(values);
      
      if (response.success) {
        setConfig(response.config);
        showAlert('success', 'Database configuration saved successfully to JSON file!');
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
                      placeholder="e.g., localhost, 192.168.1.100, or oracle.company.com"
                      prefix={<DatabaseOutlined />}
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
                    <Input 
                      type="number"
                      placeholder="1521"
                      size="large"
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
                  placeholder="e.g., XE, ORCL, PROD, or your Oracle service name"
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
              // Add to the form after the password field:
              <Form.Item
                name="emailGroupId"
                label="Database Alert Group"
              >
                <Select 
                  placeholder="Select email group for database alerts (optional)"
                  allowClear
                >
                  <Option value={null}>🔕 No email alerts</Option>
                  {emailGroups.map(group => (
                    <Option key={group.id} value={group.id}>
                      📧 {group.name} ({group.emails.length} recipients)
                    </Option>
                  ))}
                </Select>
              </Form.Item>
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
                    Save to JSON File
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
                  showIcon
                  style={{ marginBottom: 16 }}
                />

                {config.isConfigured && (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Connection String:</Text>
                      <br />
                      <Text code style={{ fontSize: '12px' }}>
                        {config.host}:{config.port}/{config.serviceName}
                      </Text>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Username:</Text>
                      <br />
                      <Text>{config.username}</Text>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <Text strong>JSON File:</Text>
                      <br />
                      <Text code style={{ fontSize: '11px' }}>
                        backend/data/db-config.json
                      </Text>
                    </div>

                    <div>
                      <Text strong>Last Updated:</Text>
                      <br />
                      <Text style={{ fontSize: '12px' }}>
                        {new Date(config.lastUpdated).toLocaleString()}
                      </Text>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <DatabaseOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                <Text type="secondary">No configuration found</Text>
              </div>
            )}
          </Card>

          <Card title="Quick Examples" style={{ marginTop: 16 }}>
            <div style={{ fontSize: '12px' }}>
              <div style={{ marginBottom: 8 }}>
                <Text strong>Local Oracle XE:</Text>
                <br />
                <Text code>localhost:1521/XE</Text>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong>Remote Server:</Text>
                <br />
                <Text code>192.168.1.100:1521/ORCL</Text>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong>Oracle Cloud:</Text>
                <br />
                <Text code>host.oraclecloud.com:1521/SERVICE</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Row gutter={[24, 24]}>
  <Col span={24}>
    <DbSizeThreshold />
  </Col>
</Row>
      </Row>
    </div>
  );
};

export default DatabaseConfig;