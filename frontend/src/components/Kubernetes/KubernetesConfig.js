// frontend/src/components/Kubernetes/KubernetesConfig.js
// Complete version with email groups added to existing functionality

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
  Select
} from 'antd';
import { 
  CloudOutlined, 
  SaveOutlined, 
  CheckCircleOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { kubernetesAPI, emailAPI } from '../../services/api';
import { useMode } from '../../contexts/ModeContext';

const { Title, Text } = Typography;
const { Option } = Select;

const KubernetesConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [emailGroups, setEmailGroups] = useState([]);
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });
  const { refreshMode } = useMode();

  useEffect(() => {
    loadConfig();
    loadEmailGroups();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await kubernetesAPI.getConfig();
      
      if (response.success) {
        setConfig(response.config);
        form.setFieldsValue({
          kubeconfigPath: response.config.kubeconfigPath,
          emailGroupId: response.config.emailGroupId
        });
      }
    } catch (error) {
      console.error('Failed to load Kubernetes config:', error);
      showAlert('error', 'Failed to load Kubernetes configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadEmailGroups = async () => {
    try {
      console.log('🔍 Loading email groups using emailAPI...');
      const response = await emailAPI.getEmailGroups();
      console.log('📡 EmailAPI response:', response);
      
      if (response.success) {
        console.log('✅ Email groups loaded:', response.data.length, 'groups');
        setEmailGroups(response.data || []);
      } else {
        console.error('❌ EmailAPI returned error:', response.error);
      }
    } catch (error) {
      console.error('❌ Failed to load email groups:', error);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message, visible: true });
    setTimeout(() => {
      setAlert({ ...alert, visible: false });
    }, 5000);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // Use the updated saveConfig method that includes emailGroupId
      const response = await fetch('/api/kubernetes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kubeconfigPath: values.kubeconfigPath,
          emailGroupId: values.emailGroupId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setConfig(data.config);
        showAlert('success', 'Kubernetes configuration saved successfully!');
        message.success('Configuration saved!');
        
        await refreshMode();

        setTimeout(() => {
          loadConfig();
        }, 1000);
      } else {
        showAlert('error', data.error || 'Failed to save configuration');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
        return;
      }
      
      console.error('Save Kubernetes config error:', error);
      const errorMessage = error.response?.data?.error || error.message;
      showAlert('error', `Failed to save configuration: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearConfig = async () => {
    try {
      setLoading(true);
      
      console.log('🔍 Clearing config - sending empty kubeconfigPath');
      
      // Send empty config directly
      const response = await fetch('/api/kubernetes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          kubeconfigPath: '',
          emailGroupId: null
        })
      });

      const data = await response.json();
      
      console.log('✅ Clear response:', data);
      
      if (data.success) {
        setConfig({ kubeconfigPath: '', emailGroupId: null, isConfigured: false });
        form.setFieldsValue({ kubeconfigPath: '', emailGroupId: null });
        showAlert('success', 'Kubernetes configuration cleared successfully!');
        message.success('Configuration cleared!');
        await refreshMode();
      }
    } catch (error) {
      console.error('❌ Clear config error:', error);
      console.error('❌ Error response:', error.response?.data);
      showAlert('error', 'Failed to clear configuration: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConfig = async () => {
    try {
      const values = await form.validateFields(['kubeconfigPath']); // Only validate kubeconfig for testing
      setTestLoading(true);
      
      const response = await kubernetesAPI.testConfig(values);
      
      if (response.success) {
        showAlert('success', response.message || 'Kubernetes connection test successful!');
        message.success('Connection test successful!');
      } else {
        showAlert('error', response.error || 'Connection test failed');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please enter the kubeconfig path');
        return;
      }
      
      console.error('Test Kubernetes config error:', error);
      showAlert('error', 'Connection test failed: ' + error.message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={16}>
        <Card
          title={
            <Space>
              <SettingOutlined />
              Kubernetes Configuration
            </Space>
          }
          loading={loading}
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
          >
            <Divider orientation="left">Cluster Connection</Divider>

            <Form.Item
              name="kubeconfigPath"
              label="Kubeconfig File Path"
              rules={[{ required: false }]}
            >
              <Input 
                placeholder="e.g., E:\ifsroot\config\kube or /home/user/.kube/config"
                prefix={<FolderOpenOutlined />}
                size="large"
              />
            </Form.Item>

            <Alert
              message="Kubeconfig Path Information"
              description={
                <div>
                  <p style={{ marginBottom: 8 }}>
                    <strong>Windows Example:</strong> <code>E:\ifsroot\config\kube</code>
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>Linux/Mac Example:</strong> <code>/home/user/.kube/config</code>
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    The kubeconfig file contains the necessary credentials and cluster information to connect to your Kubernetes cluster.
                  </p>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Divider orientation="left">Alert Configuration</Divider>

            
            <Form.Item
              name="emailGroupId"
              label="Pod Failure Alert Group"
              extra="Select which email group should receive Kubernetes pod failure alerts"
            >
              <Select 
                placeholder="Select email group for pod alerts (optional)"
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
                description="Create email groups in Email Management to enable pod failure alerts."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Divider />

            <Form.Item style={{ marginBottom: 0 }}>
              <Space size="large">
                <Button 
                  type="default"
                  icon={<CheckCircleOutlined />}
                  onClick={handleTestConfig}
                  loading={testLoading}
                  size="large"
                >
                  Test Connection
                </Button>
                <Button 
                  danger
                  onClick={handleClearConfig}
                  loading={loading}
                  size="large"
                >
                  Clear Config
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
                message={config.isConfigured ? "✅ Kubernetes Configured" : "⚠️ Kubernetes Not Configured"}
                type={config.isConfigured ? "success" : "warning"}
                showIcon
                style={{ marginBottom: 16 }}
              />

              {config.isConfigured && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong>Config Path:</Text>
                    <br />
                    <Text code style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                      {config.kubeconfigPath}
                    </Text>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <Text strong>Pod Alerts:</Text>
                    <br />
                    <Text style={{ fontSize: '12px' }}>
                      {config.emailGroupId ? 
                        `📧 Enabled (Group: ${emailGroups.find(g => g.id === config.emailGroupId)?.name || config.emailGroupId})` : 
                        '🔕 Disabled'
                      }
                    </Text>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <Text strong>Config File:</Text>
                    <br />
                    <Text code style={{ fontSize: '11px' }}>
                      backend/data/kubernetes-config.json
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
              <CloudOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
              <Text type="secondary">No configuration found</Text>
            </div>
          )}
        </Card>

        <Card title="How to Find Kubeconfig" style={{ marginTop: 16 }}>
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>Default Locations:</Text>
              <br />
              <Text>Windows: <code>%USERPROFILE%\.kube\config</code></Text>
              <br />
              <Text>Linux/Mac: <code>~/.kube/config</code></Text>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Text strong>Check Current Config:</Text>
              <br />
              <Text code style={{ fontSize: '10px' }}>kubectl config view --flatten</Text>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Text strong>Find Config Path:</Text>
              <br />
              <Text code style={{ fontSize: '10px' }}>echo $KUBECONFIG</Text>
            </div>
          </div>
        </Card>

        <Card title="Requirements" style={{ marginTop: 16 }}>
          <ul style={{ fontSize: '12px', paddingLeft: 20, marginBottom: 0 }}>
            <li>Valid kubeconfig file</li>
            <li>Network access to Kubernetes cluster</li>
            <li>Proper authentication credentials</li>
            <li>Read permissions on config file</li>
            <li>Email group configured for alerts (optional)</li>
          </ul>
        </Card>
      </Col>
    </Row>
  );
};

export default KubernetesConfig;