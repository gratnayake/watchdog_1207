import React, { useState, useEffect } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Table, 
  Tag, 
  Button, 
  Select, 
  Space, 
  Statistic, 
  Typography,
  Alert,
  Tooltip,
  Badge,
  Modal,
  Input,
  InputNumber,
  message,
  Dropdown,
  Popconfirm,
  Divider
} from 'antd';
import { 
  CloudOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  CodeOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  ScissorOutlined,
  ThunderboltOutlined,
  MoreOutlined,
  EyeOutlined,
  ExpandOutlined
} from '@ant-design/icons';
import { kubernetesAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const KubernetesMonitor = () => {
  const [pods, setPods] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [clusterInfo, setClusterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Pod Actions State
  const [logsModal, setLogsModal] = useState({ visible: false, pod: null, logs: '', loading: false });
  const [execModal, setExecModal] = useState({ visible: false, pod: null, command: '', containers: [] });
  const [scaleModal, setScaleModal] = useState({ visible: false, deployment: null, replicas: 1 });
  const [describeModal, setDescribeModal] = useState({ visible: false, pod: null, description: '', loading: false });
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadKubernetesData();
      }, 10000); // Refresh every 10 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedNamespace]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadNamespaces(),
        loadNodes(),
        loadClusterInfo(),
        loadPods()
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadKubernetesData = async () => {
    try {
      await Promise.all([
        loadPods(),
        loadClusterInfo()
      ]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  const loadPods = async () => {
    try {
      const response = selectedNamespace === 'all' 
        ? await kubernetesAPI.getAllPods() 
        : await kubernetesAPI.getPods(selectedNamespace);
      
      if (response.success) {
        setPods(response.data);
      }
    } catch (error) {
      console.error('Failed to load pods:', error);
    }
  };

  const loadNodes = async () => {
    try {
      const response = await kubernetesAPI.getNodes();
      if (response.success) {
        setNodes(response.data);
      }
    } catch (error) {
      console.error('Failed to load nodes:', error);
    }
  };

  const loadNamespaces = async () => {
    try {
      const response = await kubernetesAPI.getNamespaces();
      if (response.success) {
        setNamespaces(response.data);
      }
    } catch (error) {
      console.error('Failed to load namespaces:', error);
    }
  };

  const loadClusterInfo = async () => {
    try {
      const response = await kubernetesAPI.getClusterInfo();
      if (response.success) {
        setClusterInfo(response.data);
      }
    } catch (error) {
      console.error('Failed to load cluster info:', error);
    }
  };

  // POD ACTIONS
  const handleRestartPod = async (pod) => {
    setActionLoading(`restart-${pod.name}`);
    try {
      const result = await kubernetesAPI.restartPod(pod.namespace, pod.name);
      if (result.success) {
        message.success(`Pod ${pod.name} restart initiated successfully!`);
        setTimeout(() => loadPods(), 2000); // Refresh after 2 seconds
      } else {
        message.error(`Failed to restart pod: ${result.error}`);
      }
    } catch (error) {
      message.error(`Failed to restart pod: ${error.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleDeletePod = async (pod, force = false) => {
    setActionLoading(`delete-${pod.name}`);
    try {
      const result = await kubernetesAPI.deletePod(pod.namespace, pod.name, force);
      if (result.success) {
        message.success(`Pod ${pod.name} deleted successfully!`);
        setTimeout(() => loadPods(), 1000); // Refresh after 1 second
      } else {
        message.error(`Failed to delete pod: ${result.error}`);
      }
    } catch (error) {
      message.error(`Failed to delete pod: ${error.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleViewLogs = async (pod) => {
    setLogsModal({ visible: true, pod, logs: '', loading: true });
    
    try {
      const result = await kubernetesAPI.getPodLogs(pod.namespace, pod.name, { lines: 500 });
      if (result.success) {
        setLogsModal(prev => ({ ...prev, logs: result.logs, loading: false }));
      } else {
        setLogsModal(prev => ({ ...prev, logs: `Error: ${result.error}`, loading: false }));
      }
    } catch (error) {
      setLogsModal(prev => ({ ...prev, logs: `Error: ${error.message}`, loading: false }));
    }
  };

  const handleExecPod = async (pod) => {
    try {
      const result = await kubernetesAPI.getPodContainers(pod.namespace, pod.name);
      if (result.success) {
        setExecModal({ 
          visible: true, 
          pod, 
          command: '/bin/bash', 
          containers: result.containers 
        });
      } else {
        message.error('Failed to get pod containers');
      }
    } catch (error) {
      message.error(`Failed to get pod containers: ${error.message}`);
    }
  };

  const handleDescribePod = async (pod) => {
    setDescribeModal({ visible: true, pod, description: '', loading: true });
    
    try {
      const result = await kubernetesAPI.describePod(pod.namespace, pod.name);
      if (result.success) {
        setDescribeModal(prev => ({ ...prev, description: result.description, loading: false }));
      } else {
        setDescribeModal(prev => ({ ...prev, description: `Error: ${result.error}`, loading: false }));
      }
    } catch (error) {
      setDescribeModal(prev => ({ ...prev, description: `Error: ${error.message}`, loading: false }));
    }
  };

  const handleScaleDeployment = async (pod) => {
    try {
      const result = await kubernetesAPI.getDeploymentInfo(pod.namespace, pod.name);
      if (result.success) {
        setScaleModal({ 
          visible: true, 
          deployment: result.deployment, 
          replicas: result.deployment.replicas 
        });
      } else {
        message.error('No deployment found for this pod');
      }
    } catch (error) {
      message.error(`Failed to get deployment info: ${error.message}`);
    }
  };

  const executeScale = async () => {
    try {
      const result = await kubernetesAPI.scaleDeployment(
        scaleModal.deployment.namespace, 
        scaleModal.deployment.name, 
        scaleModal.replicas
      );
      if (result.success) {
        message.success(`Deployment scaled to ${scaleModal.replicas} replicas`);
        setScaleModal({ visible: false, deployment: null, replicas: 1 });
        setTimeout(() => loadPods(), 2000);
      } else {
        message.error(`Failed to scale deployment: ${result.error}`);
      }
    } catch (error) {
      message.error(`Failed to scale deployment: ${error.message}`);
    }
  };

  const executeExec = async () => {
    try {
      const result = await kubernetesAPI.execInPod(execModal.pod.namespace, execModal.pod.name, {
        command: execModal.command
      });
      if (result.success) {
        message.success(`Exec command ready: ${result.execCommand}`);
        message.info('Copy and run this command in your terminal');
      } else {
        message.error(`Failed to create exec session: ${result.error}`);
      }
    } catch (error) {
      message.error(`Failed to create exec session: ${error.message}`);
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'running': return 'green';
      case 'pending': return 'orange';
      case 'failed': return 'red';
      case 'succeeded': return 'blue';
      default: return 'default';
    }
  };

  // Pod Actions Menu
  const getPodActionsMenu = (pod) => {
    const items = [
      {
        key: 'logs',
        label: 'View Logs',
        icon: <FileTextOutlined />,
        onClick: () => handleViewLogs(pod)
      },
      {
        key: 'describe',
        label: 'Describe Pod',
        icon: <InfoCircleOutlined />,
        onClick: () => handleDescribePod(pod)
      },
      {
        key: 'exec',
        label: 'Exec into Pod',
        icon: <CodeOutlined />,
        onClick: () => handleExecPod(pod)
      },
      {
        type: 'divider'
      },
      {
        key: 'scale',
        label: 'Scale Deployment',
        icon: <ExpandOutlined />,
        onClick: () => handleScaleDeployment(pod)
      },
      {
        key: 'restart',
        label: 'Restart Pod',
        icon: <ReloadOutlined />,
        onClick: () => handleRestartPod(pod)
      },
      {
        type: 'divider'
      },
      {
        key: 'delete',
        label: 'Delete Pod',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDeletePod(pod)
      }
    ];

    return { items };
  };

  const podColumns = [
    {
      title: 'Pod Details',
      key: 'details',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.namespace}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => (
        <Space direction="vertical" size="small">
          <Tag color={getStatusColor(status)}>{status}</Tag>
          <Badge 
            status={record.ready ? 'success' : 'error'} 
            text={record.ready ? 'Ready' : 'Not Ready'}
          />
        </Space>
      ),
    },
    {
      title: 'Restarts',
      dataIndex: 'restarts',
      key: 'restarts',
      render: (restarts) => (
        <Tag color={restarts > 5 ? 'red' : restarts > 0 ? 'orange' : 'green'}>
          {restarts}
        </Tag>
      ),
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      render: (age) => (
        <Space>
          <ClockCircleOutlined />
          {age}
        </Space>
      ),
    },
    {
      title: 'Node',
      dataIndex: 'node',
      key: 'node',
      render: (node) => (
        <Tooltip title={`Running on ${node}`}>
          <Tag>{node}</Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Quick Restart">
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              loading={actionLoading === `restart-${record.name}`}
              onClick={() => handleRestartPod(record)}
            />
          </Tooltip>
          
          <Tooltip title="View Logs">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewLogs(record)}
            />
          </Tooltip>

          <Popconfirm
            title="Delete Pod"
            description="Are you sure you want to delete this pod?"
            onConfirm={() => handleDeletePod(record)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete Pod">
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={actionLoading === `delete-${record.name}`}
              />
            </Tooltip>
          </Popconfirm>

          <Dropdown 
            menu={getPodActionsMenu(record)}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const nodeColumns = [
    {
      title: 'Node Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <DatabaseOutlined />
          <div>
            <Text strong>{text}</Text>
            <div>
              <Space>
                {record.roles.map(role => (
                  <Tag key={role} color="blue" size="small">{role}</Tag>
                ))}
              </Space>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Ready' ? 'green' : 'red'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
    },
    {
      title: 'Capacity',
      key: 'capacity',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px' }}>CPU: {record.capacity.cpu}</Text>
          <Text style={{ fontSize: '12px' }}>Memory: {record.capacity.memory}</Text>
          <Text style={{ fontSize: '12px' }}>Pods: {record.capacity.pods}</Text>
        </Space>
      ),
    },
  ];

  if (!clusterInfo?.configured) {
    return (
      <Alert
        message="Kubernetes Not Configured"
        description="Configure your kubeconfig file path to enable Kubernetes monitoring."
        type="warning"
        showIcon
      />
    );
  }

  return (
    <div>
      {/* Control Panel */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Space>
              <Title level={4} style={{ margin: 0 }}>Kubernetes Cluster</Title>
              <Tag color="blue">Connected</Tag>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space>
              <Text>Namespace:</Text>
              <Select
                value={selectedNamespace}
                onChange={setSelectedNamespace}
                style={{ width: 200 }}
              >
                <Option value="all">All Namespaces</Option>
                {namespaces.map(ns => (
                  <Option key={ns.name} value={ns.name}>{ns.name}</Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={loadInitialData}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                type={autoRefresh ? 'primary' : 'default'}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Pods"
              value={clusterInfo?.pods?.total || 0}
              prefix={<CloudOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Running Pods"
              value={clusterInfo?.pods?.running || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Failed Pods"
              value={clusterInfo?.pods?.failed || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Nodes"
              value={clusterInfo?.nodes?.ready || 0}
              suffix={`/ ${clusterInfo?.nodes?.total || 0}`}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Pods Table */}
      <Card title={
        <Space>
          <CloudOutlined />
          <span>Pods</span>
          <Tag color="blue">{pods.length} pods</Tag>
        </Space>
      } style={{ marginBottom: 24 }}>
        <Table
          columns={podColumns}
          dataSource={pods}
          loading={loading}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} pods`
          }}
          rowKey="name"
          size="middle"
        />
      </Card>

      {/* Nodes Table */}
      <Card title={
        <Space>
          <DatabaseOutlined />
          <span>Nodes</span>
          <Tag color="green">{nodes.length} nodes</Tag>
        </Space>
      }>
        <Table
          columns={nodeColumns}
          dataSource={nodes}
          pagination={false}
          rowKey="name"
          size="middle"
        />
      </Card>

      {/* Pod Logs Modal */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            Pod Logs: {logsModal.pod?.name}
            <Tag color="blue">{logsModal.pod?.namespace}</Tag>
          </Space>
        }
        open={logsModal.visible}
        onCancel={() => setLogsModal({ visible: false, pod: null, logs: '', loading: false })}
        footer={[
          <Button key="refresh" onClick={() => handleViewLogs(logsModal.pod)}>
            Refresh Logs
          </Button>,
          <Button key="close" type="primary" onClick={() => setLogsModal({ visible: false, pod: null, logs: '', loading: false })}>
            Close
          </Button>
        ]}
        width={900}
      >
        <div style={{
          background: '#000',
          color: '#00ff00',
          padding: '16px',
          borderRadius: '6px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '13px',
          maxHeight: '500px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap'
        }}>
          {logsModal.loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#00ff00' }}>
              ⏳ Loading logs...
            </div>
          ) : (
            logsModal.logs || 'No logs available'
          )}
        </div>
      </Modal>

      {/* Pod Describe Modal */}
      <Modal
        title={
          <Space>
            <InfoCircleOutlined />
            Pod Description: {describeModal.pod?.name}
          </Space>
        }
        open={describeModal.visible}
        onCancel={() => setDescribeModal({ visible: false, pod: null, description: '', loading: false })}
        footer={[
          <Button key="close" type="primary" onClick={() => setDescribeModal({ visible: false, pod: null, description: '', loading: false })}>
            Close
          </Button>
        ]}
        width={900}
      >
        <TextArea
          value={describeModal.description}
          readOnly
          rows={20}
          style={{ 
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '12px'
          }}
          placeholder={describeModal.loading ? 'Loading pod description...' : 'No description available'}
        />
      </Modal>

      {/* Exec Modal */}
      <Modal
        title={
          <Space>
            <CodeOutlined />
            Exec into Pod: {execModal.pod?.name}
          </Space>
        }
        open={execModal.visible}
        onCancel={() => setExecModal({ visible: false, pod: null, command: '', containers: [] })}
        onOk={executeExec}
        okText="Generate Command"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Command to execute:</Text>
            <Input
              value={execModal.command}
              onChange={(e) => setExecModal(prev => ({ ...prev, command: e.target.value }))}
              placeholder="/bin/bash"
            />
          </div>
          
          {execModal.containers.length > 1 && (
            <div>
              <Text strong>Available containers:</Text>
              <div>
                {execModal.containers.map(container => (
                  <Tag key={container} color="blue">{container}</Tag>
                ))}
              </div>
            </div>
          )}
          
          <Alert
            message="Exec Command Generation"
            description="This will generate a kubectl exec command that you can run in your terminal."
            type="info"
            showIcon
          />
        </Space>
      </Modal>

      {/* Scale Deployment Modal */}
      <Modal
        title={
          <Space>
            <ExpandOutlined />
            Scale Deployment: {scaleModal.deployment?.name}
          </Space>
        }
        open={scaleModal.visible}
        onCancel={() => setScaleModal({ visible: false, deployment: null, replicas: 1 })}
        onOk={executeScale}
        okText="Scale"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Current Replicas: </Text>
            <Tag color="blue">{scaleModal.deployment?.replicas}</Tag>
          </div>
          
          <div>
            <Text strong>New Replica Count:</Text>
            <InputNumber
              min={0}
              max={50}
              value={scaleModal.replicas}
              onChange={(value) => setScaleModal(prev => ({ ...prev, replicas: value }))}
              style={{ width: '100%', marginTop: 8 }}
            />
          </div>
          
          <Alert
            message="Scaling Deployment"
            description={`This will scale the deployment to ${scaleModal.replicas} replicas. Pods will be created or destroyed as needed.`}
            type="warning"
            showIcon
          />
        </Space>
      </Modal>
    </div>
  );
};

export default KubernetesMonitor;