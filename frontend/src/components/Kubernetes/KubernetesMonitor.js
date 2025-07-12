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
  Badge
} from 'antd';
import { 
  CloudOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import { kubernetesAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

const KubernetesMonitor = () => {
  const [pods, setPods] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [clusterInfo, setClusterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'running': return 'green';
      case 'pending': return 'orange';
      case 'failed': return 'red';
      case 'succeeded': return 'blue';
      default: return 'default';
    }
  };

  const podColumns = [
    {
      title: 'Pod Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space direction="vertical" size="small">
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.namespace}
          </Text>
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
      action={
        <Button type="primary" onClick={() => window.location.hash = '#/kubernetes-config'}>
          Configure Kubernetes
        </Button>
      }
    />
    );
  }

  return (
    <div>
      {/* Cluster Overview */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Space direction="vertical" size="small">
              <Title level={3} style={{ margin: 0 }}>
                <CloudOutlined style={{ marginRight: 8 }} />
                Kubernetes Cluster
              </Title>
              <Text type="secondary">Live cluster monitoring</Text>
            </Space>
          </Col>
          
          <Col xs={24} sm={12} md={6}>
            <Select
              style={{ width: '100%' }}
              value={selectedNamespace}
              onChange={(value) => {
                setSelectedNamespace(value);
                loadPods();
              }}
            >
              <Option value="all">All Namespaces</Option>
              {namespaces.map(ns => (
                <Option key={ns.name} value={ns.name}>{ns.name}</Option>
              ))}
            </Select>
          </Col>

          <Col xs={24} md={12}>
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
      <Card title="Pods" style={{ marginBottom: 24 }}>
        <Table
          columns={podColumns}
          dataSource={pods}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="name"
          size="middle"
        />
      </Card>

      {/* Nodes Table */}
      <Card title="Nodes">
        <Table
          columns={nodeColumns}
          dataSource={nodes}
          pagination={false}
          rowKey="name"
          size="middle"
        />
      </Card>
    </div>
  );
};

export default KubernetesMonitor;