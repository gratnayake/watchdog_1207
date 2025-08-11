import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  Space, 
  Tag, 
  Typography, 
  Row, 
  Col,
  Switch,
  Select,
  Statistic,
  Badge,
  Modal,
  Alert,
  message,
  Dropdown,
  Tooltip,
  Progress,
  Collapse,
  List,
  Avatar
} from 'antd';
import { 
  ReloadOutlined,
  HistoryOutlined,
  BarChartOutlined,
  EyeOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  DatabaseOutlined,
  NodeIndexOutlined,
  ClockCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

const EnhancedKubernetesMonitor = () => {
  const [pods, setPods] = useState([]);
  const [groupedPods, setGroupedPods] = useState({});
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [sortBy, setSortBy] = useState('lastSeen');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [namespaces, setNamespaces] = useState([]);
  const [expandedPanels, setExpandedPanels] = useState([]);

  // Auto refresh effect
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadEnhancedPods();
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedNamespace, includeDeleted, sortBy]);

  // Load data effects
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadEnhancedPods();
  }, [selectedNamespace, includeDeleted, sortBy]);

  // Load initial data (namespaces)
  const loadInitialData = async () => {
    try {
      const response = await fetch('/api/kubernetes/namespaces');
      const data = await response.json();
      if (data.success) {
        setNamespaces(data.data || []);
        // Expand all panels by default
        setExpandedPanels(data.data?.map(ns => ns.name) || []);
      }
    } catch (error) {
      console.error('Failed to load namespaces:', error);
      message.error('Failed to load namespaces');
    }
    
    loadEnhancedPods();
  };

  // Load enhanced pods data
  const loadEnhancedPods = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/kubernetes/pods/enhanced?namespace=${selectedNamespace}&includeDeleted=${includeDeleted}&sortBy=${sortBy}`);
      const data = await response.json();
      
      if (data.success) {
        setPods(data.data.pods);
        setStatistics(data.data.statistics);
        
        // Group pods by namespace
        const grouped = groupPodsByNamespace(data.data.pods);
        setGroupedPods(grouped);
        
        // Show notifications for important changes
        if (data.data.changes && data.data.changes.length > 0) {
          data.data.changes.forEach(change => {
            if (change.type === 'deleted') {
              message.warning(`Pod deleted: ${change.pod.namespace}/${change.pod.name}`, 3);
            } else if (change.type === 'created') {
              message.success(`New pod created: ${change.pod.namespace}/${change.pod.name}`, 3);
            } else if (change.type === 'status_change' && change.newStatus === 'Failed') {
              message.error(`Pod failed: ${change.pod.namespace}/${change.pod.name}`, 5);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load enhanced pods:', error);
      message.error('Failed to load pod data');
    } finally {
      setLoading(false);
    }
  };

  // Group pods by namespace
  const groupPodsByNamespace = (podList) => {
    const grouped = {};
    
    podList.forEach(pod => {
      if (!grouped[pod.namespace]) {
        grouped[pod.namespace] = [];
      }
      grouped[pod.namespace].push(pod);
    });

    // Sort pods within each namespace
    Object.keys(grouped).forEach(namespace => {
      grouped[namespace].sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'status':
            return a.status.localeCompare(b.status);
          case 'lastSeen':
            return new Date(b.lastSeen) - new Date(a.lastSeen);
          case 'firstSeen':
            return new Date(a.firstSeen) - new Date(b.firstSeen);
          default:
            return 0;
        }
      });
    });

    return grouped;
  };

  // Get status color for pods and namespaces
  const getStatusColor = (status, isDeleted = false) => {
    if (isDeleted) return '#ff4d4f';
    
    switch (status?.toLowerCase()) {
      case 'running': return '#52c41a';
      case 'pending': return '#faad14';
      case 'failed': return '#ff4d4f';
      case 'succeeded': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  // Get namespace statistics
  const getNamespaceStats = (namespaceName) => {
    const namespacePods = groupedPods[namespaceName] || [];
    const running = namespacePods.filter(p => p.status === 'Running' && !p.isDeleted).length;
    const failed = namespacePods.filter(p => p.status === 'Failed' && !p.isDeleted).length;
    const pending = namespacePods.filter(p => p.status === 'Pending' && !p.isDeleted).length;
    const total = namespacePods.filter(p => !p.isDeleted).length;
    
    return { running, failed, pending, total, allPods: namespacePods.length };
  };

  // Handle pod actions
  const handlePodAction = async (action, pod) => {
    try {
      let result;
      
      switch (action) {
        case 'restart':
          result = await fetch(`/api/kubernetes/pods/${pod.namespace}/${pod.name}/restart`, {
            method: 'POST'
          });
          break;
        case 'delete':
          result = await fetch(`/api/kubernetes/pods/${pod.namespace}/${pod.name}`, {
            method: 'DELETE'
          });
          break;
        case 'logs':
          // Open logs modal or new window
          message.info(`Opening logs for ${pod.name}`);
          return;
        case 'describe':
          message.info(`Describing ${pod.name}`);
          return;
        default:
          return;
      }

      const data = await result.json();
      if (data.success) {
        message.success(`${action} completed for ${pod.name}`);
        setTimeout(() => loadEnhancedPods(), 2000);
      } else {
        message.error(`Failed to ${action}: ${data.error}`);
      }
    } catch (error) {
      console.error(`Pod ${action} error:`, error);
      message.error(`Failed to ${action} pod: ${error.message}`);
    }
  };

  // Render pod item with actions
  const renderPodItem = (pod) => {
    const statusColor = getStatusColor(pod.status, pod.isDeleted);
    
    const actions = [
      <Button
        key="logs"
        type="text"
        size="small"
        icon={<FileTextOutlined />}
        onClick={() => handlePodAction('logs', pod)}
        disabled={pod.isDeleted}
        title="View Logs"
      />,
      <Button
        key="describe"
        type="text"
        size="small"
        icon={<InfoCircleOutlined />}
        onClick={() => handlePodAction('describe', pod)}
        disabled={pod.isDeleted}
        title="Describe Pod"
      />,
      <Dropdown
        key="more"
        menu={{
          items: [
            {
              key: 'restart',
              label: 'Restart Pod',
              icon: <ReloadOutlined />,
              disabled: pod.isDeleted,
              onClick: () => handlePodAction('restart', pod)
            },
            {
              key: 'delete',
              label: 'Delete Pod',
              icon: <StopOutlined />,
              disabled: pod.isDeleted,
              danger: true,
              onClick: () => handlePodAction('delete', pod)
            }
          ]
        }}
        trigger={['click']}
        disabled={pod.isDeleted}
      >
        <Button
          type="text"
          size="small"
          icon={<MoreOutlined />}
          title="More Actions"
        />
      </Dropdown>
    ];

    return (
      <List.Item
        actions={actions}
        style={{
          backgroundColor: pod.isDeleted ? '#fff2f0' : 'transparent',
          opacity: pod.isDeleted ? 0.7 : 1
        }}
      >
        <List.Item.Meta
          avatar={
            <Badge dot color={statusColor}>
              <Avatar 
                size="small" 
                style={{ backgroundColor: statusColor, fontSize: '10px' }}
              >
                {pod.name.charAt(0).toUpperCase()}
              </Avatar>
            </Badge>
          }
          title={
            <Space>
              <Text strong={!pod.isDeleted} delete={pod.isDeleted}>
                {pod.name}
              </Text>
              <Tag color={statusColor} size="small">
                {pod.status}
              </Tag>
              {pod.restarts > 0 && (
                <Tag color="orange" size="small">
                  {pod.restarts} restarts
                </Tag>
              )}
            </Space>
          }
          description={
            <Space size="large">
              <Text type="secondary" style={{ fontSize: '12px' }}>
                <DatabaseOutlined /> {pod.readinessRatio || pod.ready || '0/1'} Ready
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                <NodeIndexOutlined /> {pod.node || 'Unknown'}
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                <ClockCircleOutlined /> {pod.age || 'Unknown'}
              </Text>
              {pod.isDeleted && (
                <Text type="danger" style={{ fontSize: '11px' }}>
                  <WarningOutlined /> Deleted
                </Text>
              )}
            </Space>
          }
        />
      </List.Item>
    );
  };

  // Render namespace panel
  const renderNamespacePanel = (namespaceName, pods) => {
    const stats = getNamespaceStats(namespaceName);
    
    const header = (
      <Row justify="space-between" align="middle" style={{ width: '100%' }}>
        <Col>
          <Space>
            <FolderOutlined style={{ color: '#1890ff' }} />
            <Text strong>{namespaceName}</Text>
            <Badge count={stats.total} color="#52c41a" />
            {stats.failed > 0 && (
              <Badge count={stats.failed} color="#ff4d4f" />
            )}
          </Space>
        </Col>
        <Col>
          <Space>
            <Tag color="success" size="small">{stats.running} Running</Tag>
            {stats.failed > 0 && <Tag color="error" size="small">{stats.failed} Failed</Tag>}
            {stats.pending > 0 && <Tag color="warning" size="small">{stats.pending} Pending</Tag>}
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {includeDeleted ? `${stats.allPods} total` : `${stats.total} active`}
            </Text>
          </Space>
        </Col>
      </Row>
    );

    return (
      <Panel
        key={namespaceName}
        header={header}
        style={{
          marginBottom: 8,
          border: `1px solid ${stats.failed > 0 ? '#ff4d4f' : '#d9d9d9'}`,
          borderRadius: 6
        }}
      >
        <List
          itemLayout="horizontal"
          dataSource={pods}
          renderItem={renderPodItem}
          size="small"
          style={{ backgroundColor: '#fafafa', padding: '8px', borderRadius: '4px' }}
        />
      </Panel>
    );
  };

  return (
    <div>
      {/* Statistics Cards */}
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Total Pods"
                value={statistics.total || 0}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Running"
                value={statistics.running || 0}
                valueStyle={{ color: '#52c41a' }}
                prefix={<PlayCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Failed"
                value={statistics.failed || 0}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Namespaces"
                value={Object.keys(groupedPods).length}
                prefix={<FolderOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Control Panel */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={6}>
            <Space>
              <Text>Namespace:</Text>
              <Select
                value={selectedNamespace}
                onChange={setSelectedNamespace}
                style={{ width: 150 }}
                loading={namespaces.length === 0}
              >
                <Option value="all">All Namespaces</Option>
                {namespaces.map(ns => (
                  <Option key={ns.name} value={ns.name}>{ns.name}</Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={4}>
            <Space>
              <Text>Include Deleted:</Text>
              <Switch
                checked={includeDeleted}
                onChange={setIncludeDeleted}
                size="small"
              />
            </Space>
          </Col>

          <Col xs={24} md={4}>
            <Space>
              <Text>Sort by:</Text>
              <Select
                value={sortBy}
                onChange={setSortBy}
                style={{ width: 120 }}
              >
                <Option value="lastSeen">Last Seen</Option>
                <Option value="name">Name</Option>
                <Option value="status">Status</Option>
                <Option value="firstSeen">Created</Option>
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={6}>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={loadEnhancedPods}
                loading={loading}
              >
                Refresh
              </Button>
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                checkedChildren="Auto"
                unCheckedChildren="Manual"
              />
            </Space>
          </Col>

          <Col xs={24} md={4}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Last updated: {new Date().toLocaleTimeString()}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Grouped Pods Display */}
      <Card 
        title={`Kubernetes Pods - Grouped by Namespace (${pods.length} total pods)`}
        loading={loading}
      >
        {Object.keys(groupedPods).length > 0 ? (
          <Collapse
            activeKey={expandedPanels}
            onChange={setExpandedPanels}
            expandIconPosition="right"
            ghost={false}
            size="small"
          >
            {Object.keys(groupedPods)
              .sort()
              .map(namespaceName => 
                renderNamespacePanel(namespaceName, groupedPods[namespaceName])
              )}
          </Collapse>
        ) : (
          <Alert
            message="No pods found"
            description="No Kubernetes pods were found with the current filters."
            type="info"
            showIcon
          />
        )}
      </Card>

      {/* Custom styles */}
      <style jsx>{`
        .ant-collapse-header {
          padding: 12px 16px !important;
        }
        
        .ant-list-item {
          padding: 8px 12px !important;
        }
        
        .ant-list-item-meta-title {
          margin-bottom: 4px !important;
        }
        
        .ant-badge-dot {
          box-shadow: 0 0 0 1px #fff;
        }
      `}</style>
    </div>
  );
};

export default EnhancedKubernetesMonitor;