// frontend/src/components/Kubernetes/KubernetesMonitor.js
// Complete Enhanced Version with Pod Lifecycle Tracking + Grouped View

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
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
  Timeline,
  Modal,
  Alert,
  message,
  Dropdown,
  Tooltip,
  Progress,
  PoweroffOutlined,  
  InputNumber,
  Popconfirm 
} from 'antd';
import { 
  ScissorOutlined,
  ReloadOutlined,
  DeleteOutlined,
  HistoryOutlined,
  BarChartOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ExpandOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ContainerOutlined,
  AppstoreOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';

import { kubernetesAPI } from '../../services/api';
import PodActions from './PodActions';

const { Text, Title } = Typography;
const { Option } = Select;

const EnhancedKubernetesMonitor = () => {
  const [pods, setPods] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [sortBy, setSortBy] = useState('lastSeen');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [historyModal, setHistoryModal] = useState({ visible: false, pod: null });
  const [changes, setChanges] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [selectedPod, setSelectedPod] = useState(null);
  const [newReplicaCount, setNewReplicaCount] = useState(1);
  const [deploymentInfo, setDeploymentInfo] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // NEW: Grouped view state
  const [viewMode, setViewMode] = useState('detailed'); // 'detailed' or 'grouped'
  const [groupedPods, setGroupedPods] = useState([]);
  const [showHealthyGroups, setShowHealthyGroups] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadEnhancedPods();
  }, [selectedNamespace, includeDeleted, sortBy]);

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

  const loadInitialData = async () => {
    try {
      // Load namespaces
      const namespacesResponse = await fetch('/api/kubernetes/namespaces');
      const namespacesData = await namespacesResponse.json();
      if (namespacesData.success) {
        setNamespaces(namespacesData.data || []);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
    
    loadEnhancedPods();
  };

  const loadEnhancedPods = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/kubernetes/pods/enhanced?namespace=${selectedNamespace}&includeDeleted=${includeDeleted}&sortBy=${sortBy}`);
      const data = await response.json();
      
      if (data.success) {
        setPods(data.data.pods);
        setStatistics(data.data.statistics);
        setChanges(data.data.changes || []);
        
        // NEW: Generate grouped data
        groupPodsByBaseName(data.data.pods);
        
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

  // NEW: Extract base deployment name from pod name
  const extractBaseName = (podName) => {
    // For pods like: ifsapp-native-notification-f4d89d9d9-hszqv
    // Return: ifsapp-native-notification
    const parts = podName.split('-');
    if (parts.length >= 3) {
      // Remove last 2 parts (replicaset hash + pod hash)
      return parts.slice(0, -2).join('-');
    }
    return podName;
  };

  // NEW: Group pods by their base deployment name
  const groupPodsByBaseName = (podList) => {
    const grouped = {};
    
    podList.forEach(pod => {
      if (pod.isDeleted) return; // Skip deleted pods
      
      const baseName = extractBaseName(pod.name);
      const groupKey = `${pod.namespace}/${baseName}`;
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          namespace: pod.namespace,
          baseName: baseName,
          pods: [],
          expectedCount: 0,
          readyCount: 0,
          totalCount: 0,
          hasIssues: false,
          status: 'healthy'
        };
      }
      
      grouped[groupKey].pods.push(pod);
      grouped[groupKey].totalCount++;
      
      // Count ready pods
      if (pod.ready && pod.status === 'Running') {
        grouped[groupKey].readyCount++;
      }
    });

    // Determine expected count and health status for each group
    Object.values(grouped).forEach(group => {
      // Use the highest current count as expected (or get from deployment if available)
      group.expectedCount = group.totalCount;
      
      // Check for issues
      const allPodsReady = group.pods.every(pod => pod.ready && pod.status === 'Running');
      const hasFailedPods = group.pods.some(pod => pod.status === 'Failed' || pod.status === 'CrashLoopBackOff');
      
      if (hasFailedPods) {
        group.status = 'critical';
        group.hasIssues = true;
      } else if (!allPodsReady) {
        group.status = 'warning';
        group.hasIssues = true;
      } else if (group.readyCount < group.expectedCount) {
        group.status = 'degraded';
        group.hasIssues = true;
      } else {
        group.status = 'healthy';
        group.hasIssues = false;
      }
    });

    // Convert to array and sort
    const groupedArray = Object.values(grouped).sort((a, b) => {
      // Sort by issues first, then by name
      if (a.hasIssues !== b.hasIssues) {
        return a.hasIssues ? -1 : 1;
      }
      return a.baseName.localeCompare(b.baseName);
    });

    setGroupedPods(groupedArray);
  };

  // NEW: Helper functions for grouped view
  const getGroupStatusColor = (status) => {
    switch (status) {
      case 'critical': return '#ff4d4f';
      case 'warning': return '#faad14';
      case 'degraded': return '#fa8c16';
      case 'healthy': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const getGroupStatusIcon = (status) => {
    switch (status) {
      case 'critical': return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'degraded': return <WarningOutlined style={{ color: '#fa8c16' }} />;
      case 'healthy': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      default: return <ContainerOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const handleViewHistory = async (pod) => {
    try {
      const response = await fetch(`/api/kubernetes/pods/${pod.namespace}/${pod.name}/history`);
      const data = await response.json();
      
      if (data.success) {
        setHistoryModal({
          visible: true,
          pod: data.data
        });
      }
    } catch (error) {
      console.error('Failed to load pod history:', error);
      message.error('Failed to load pod history');
    }
  };

  const handleViewLogs = (pod) => {
    if (pod.isDeleted) {
      message.warning('Cannot view logs for deleted pods');
      return;
    }
    // Implement log viewing functionality
    message.info(`Viewing logs for ${pod.namespace}/${pod.name}`);
  };

  // Helper function to extract deployment name
  const getDeploymentName = (podName) => {
    const parts = podName.split('-');
    if (parts.length >= 3) {
      return parts.slice(0, -2).join('-');
    }
    return podName;
  };

  // Restart pod handler
  const handleRestartPod = async (pod) => {
    try {
      setActionLoading(true);
      message.loading('Restarting pod...', 0);
      
      const result = await kubernetesAPI.restartPod(pod.namespace, pod.name);
      
      message.destroy();
      if (result.success) {
        message.success(`Pod ${pod.name} restart initiated`);
        // Refresh pod list after 2 seconds
        setTimeout(loadEnhancedPods, 2000);
      } else {
        message.error(`Failed to restart pod: ${result.error}`);
      }
    } catch (error) {
      message.destroy();
      console.error('Restart pod error:', error);
      message.error(`Failed to restart pod: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Show scale modal
  const handleShowScaleModal = async (pod) => {
    try {
      setSelectedPod(pod);
      
      // Get deployment info to show current replica count
      const result = await kubernetesAPI.getDeploymentInfo(pod.namespace, pod.name);
      if (result.success) {
        setDeploymentInfo(result.data);
        setNewReplicaCount(result.data.currentReplicas || 1);
      }
      setScaleModalVisible(true);
    } catch (error) {
      console.error('Get deployment info error:', error);
      // Still show modal with default values
      setScaleModalVisible(true);
    }
  };

  // Scale deployment handler
  const handleScaleDeployment = async () => {
    if (!selectedPod) return;

    try {
      setActionLoading(true);
      message.loading('Scaling deployment...', 0);
      
      const deploymentName = getDeploymentName(selectedPod.name);
      const result = await kubernetesAPI.scaleDeployment(selectedPod.namespace, deploymentName, newReplicaCount);
      
      message.destroy();
      if (result.success) {
        message.success(`Deployment scaled to ${newReplicaCount} replicas`);
        setScaleModalVisible(false);
        setTimeout(loadEnhancedPods, 2000);
      } else {
        message.error(`Failed to scale deployment: ${result.error}`);
      }
    } catch (error) {
      message.destroy();
      console.error('Scale deployment error:', error);
      message.error(`Failed to scale deployment: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Stop deployment handler
  const handleStopDeployment = async (pod) => {
    try {
      setActionLoading(true);
      message.loading('Stopping deployment...', 0);
      
      const deploymentName = getDeploymentName(pod.name);
      const result = await kubernetesAPI.scaleDeployment(pod.namespace, deploymentName, 0);
      
      message.destroy();
      if (result.success) {
        message.success(`Deployment ${deploymentName} stopped`);
        setTimeout(loadEnhancedPods, 2000);
      } else {
        message.error(`Failed to stop deployment: ${result.error}`);
      }
    } catch (error) {
      message.destroy();
      console.error('Stop deployment error:', error);
      message.error(`Failed to stop deployment: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDescribePod = (pod) => {
    if (pod.isDeleted) {
      message.warning('Cannot describe deleted pods');
      return;
    }
    // Implement pod description functionality
    message.info(`Describing pod ${pod.namespace}/${pod.name}`);
  };

  const getStatusColor = (status, isDeleted) => {
    if (isDeleted) return 'red';
    switch (status?.toLowerCase()) {
      case 'running': return 'green';
      case 'pending': return 'orange';
      case 'failed': return 'red';
      case 'succeeded': return 'blue';
      default: return 'default';
    }
  };

  const getLifecycleStageIcon = (stage) => {
    switch (stage) {
      case 'stable': return '🟢';
      case 'starting': return '🟡';
      case 'failed': return '🔴';
      case 'completed': return '🔵';
      case 'deleted': return '🗑️';
      default: return '❓';
    }
  };

  const getPodActionsMenu = (pod) => {
    const items = [
    {
      key: 'restart',
      icon: <ReloadOutlined />,
      label: 'Restart Pod',
      onClick: () => handleRestartPod(pod)
    },
    {
      key: 'scale',
      icon: <ScissorOutlined />,
      label: 'Scale Deployment',
      onClick: () => handleShowScaleModal(pod)
    },
    {
      type: 'divider'
    },
    {
      key: 'logs',
      icon: <FileTextOutlined />,
      label: 'View Logs',
      onClick: () => handleViewLogs(pod)
    },
    {
      key: 'describe',
      icon: <InfoCircleOutlined />,
      label: 'Describe Pod',
      onClick: () => handleDescribePod(pod)
    },
    {
      type: 'divider'
    },
    {
      key: 'stop',
      label: (
      <Popconfirm
        title="Stop Deployment"
        description="Are you sure you want to stop this deployment? All pods will be terminated."
        onConfirm={() => handleStopDeployment(pod)}
        okText="Yes, Stop"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
      >
        <span style={{ color: '#ff4d4f' }}>Stop Deployment</span>
      </Popconfirm>
    ),
    danger: true
    }
  ];   

    return { items };
  };

  // NEW: Grouped view functions
  const handleRestartGroup = (group) => {
    message.info(`Restart functionality for ${group.baseName} - implement as needed`);
  };

  // NEW: Render pod details for expanded group rows
  const renderPodDetails = (pods) => {
    const detailColumns = [
      {
        title: 'Pod Name',
        dataIndex: 'name',
        key: 'name',
        render: (name, pod) => (
          <div>
            <Text strong style={{ fontSize: '12px' }}>{name}</Text>
            <div style={{ fontSize: '10px', color: '#666' }}>
              Age: {pod.age || 'Unknown'}
            </div>
          </div>
        )
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status, pod) => (
          <Tag color={status === 'Running' ? 'green' : status === 'Failed' ? 'red' : 'orange'}>
            {status}
          </Tag>
        )
      },
      {
        title: 'Ready',
        dataIndex: 'ready',
        key: 'ready',
        render: (ready, pod) => {
          const readyCount = pod.readyContainers || 0;
          const totalCount = pod.totalContainers || 1;
          return (
            <div>
              <Text style={{ 
                color: ready ? '#52c41a' : '#ff4d4f',
                fontWeight: 'bold',
                fontSize: '12px'
              }}>
                {readyCount}/{totalCount}
              </Text>
            </div>
          );
        }
      },
      {
        title: 'Restarts',
        dataIndex: 'restarts',
        key: 'restarts',
        render: (restarts) => (
          <Tag color={restarts > 0 ? 'orange' : 'default'}>
            {restarts || 0}
          </Tag>
        )
      },
      {
        title: 'Node',
        dataIndex: 'node',
        key: 'node',
        render: (node) => (
          <Text style={{ fontSize: '11px' }}>{node || 'Unknown'}</Text>
        )
      }
    ];

    return (
      <Table
        columns={detailColumns}
        dataSource={pods}
        rowKey="name"
        pagination={false}
        size="small"
        style={{ marginTop: 8 }}
      />
    );
  };

  const enhancedColumns = [
    {
      title: 'Pod Details',
      key: 'details',
      width: 250,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong style={{ opacity: pod.isDeleted ? 0.6 : 1 }}>
              {pod.name}
            </Text>
            {pod.isDeleted && <Tag color="red" size="small">DELETED</Tag>}
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {pod.namespace}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status & Lifecycle',
      key: 'status',
      width: 180,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <div>
            <span style={{ marginRight: 8 }}>
              {getLifecycleStageIcon(pod.lifecycleStage)}
            </span>
            <Tag color={getStatusColor(pod.status, pod.isDeleted)}>
              {pod.isDeleted ? 'DELETED' : pod.status}
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            Duration: {pod.statusDuration}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Ready',
      key: 'ready',
      width: 100,
      render: (_, record) => {
        // Use the backend-provided readiness data
        const readyCount = record.readyContainers || 0;
        const totalCount = record.totalContainers || 1;

        const getTagColor = () => {
          if (record.isDeleted) return 'default';
          if (readyCount === totalCount) return 'success';
          if (readyCount > 0) return 'warning';
          return 'error';
        };

        const getReadinessColor = () => {
          if (record.isDeleted) return '#8c8c8c';
          if (readyCount === totalCount) return '#52c41a';
          if (readyCount > 0) return '#fa8c16';
          return '#ff4d4f';
        };

        // Create tooltip content
        const tooltipContent = record.containers && record.containers.length > 0 ? (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 'bold' }}>
              Container Status:
            </div>
            {record.containers.map((container, index) => (
              <div key={index} style={{ marginBottom: 4 }}>
                <span style={{ 
                  color: container.ready ? '#52c41a' : '#ff4d4f',
                  marginRight: 8 
                }}>
                  {container.ready ? '✓' : '✗'}
                </span>
                <span style={{ fontWeight: 'bold' }}>{container.name}</span>
                <div style={{ fontSize: '11px', color: '#666', marginLeft: 16 }}>
                  State: {container.state || 'Unknown'}
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginLeft: 16 }}>
                  Restarts: {container.restartCount || 0}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div>Pod readiness: {record.ready ? 'Ready' : 'Not Ready'}</div>
            <div>Status: {record.status}</div>
          </div>
        );

        return (
          <Tooltip title={tooltipContent} placement="topLeft">
            <div style={{ cursor: 'help' }}>
              <Tag 
                color={getTagColor()}
                style={{ 
                  fontWeight: 'bold',
                  minWidth: '45px',
                  textAlign: 'center'
                }}
              >
                {readyCount}/{totalCount}
              </Tag>
              
              <div style={{ 
                fontSize: '10px', 
                color: getReadinessColor(),
                marginTop: 2,
                fontWeight: 'bold'
              }}>
                {record.ready ? 'Ready' : 'Not Ready'}
              </div>
            </div>
          </Tooltip>
        );
      }
    },
    {
      title: 'Restarts',
      key: 'restarts',
      width: 80,
      render: (_, pod) => (
        <Badge
          count={pod.restarts || 0}
          style={{ 
            backgroundColor: pod.restarts > 0 ? '#fa8c16' : '#52c41a'
          }}
          overflowCount={99}
        />
      ),
    },
    {
      title: 'Age',
      key: 'age',
      width: 120,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px' }}>
            {pod.age || 'Unknown'}
          </Text>
          <Text type="secondary" style={{ fontSize: '10px' }}>
            Node: {pod.node || 'Unknown'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, pod) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => handleRestartPod(pod)}
            disabled={pod.isDeleted || actionLoading}
            loading={actionLoading}
          >
            Restart
          </Button>
          
          <Dropdown
            menu={getPodActionsMenu(pod)}
            trigger={['click']}
            disabled={pod.isDeleted}
          >
            <Button 
              size="small" 
              icon={<MoreOutlined />}
              disabled={pod.isDeleted}
            />
          </Dropdown>

          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => handleViewHistory(pod)}
          >
            History
          </Button>
        </Space>
      ),
    },
  ];

  // NEW: Grouped view columns
  const groupColumns = [
    {
      title: 'Deployment Group',
      key: 'deployment',
      render: (_, group) => (
        <div>
          <Space>
            {getGroupStatusIcon(group.status)}
            <div>
              <Text strong style={{ 
                fontSize: '14px',
                color: group.hasIssues ? getGroupStatusColor(group.status) : undefined
              }}>
                {group.baseName}
              </Text>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {group.namespace}
              </div>
            </div>
          </Space>
        </div>
      )
    },
    {
      title: 'Pod Count',
      key: 'count',
      render: (_, group) => (
        <div>
          <Space direction="vertical" size="small">
            <div>
              <Badge 
                count={group.totalCount} 
                style={{ 
                  backgroundColor: group.hasIssues ? getGroupStatusColor(group.status) : '#52c41a'
                }}
              />
              <Text style={{ marginLeft: 8, fontSize: '12px' }}>Total</Text>
            </div>
            <Progress
              percent={Math.round((group.readyCount / group.totalCount) * 100)}
              size="small"
              status={group.hasIssues ? 'exception' : 'success'}
              format={() => `${group.readyCount}/${group.totalCount}`}
            />
          </Space>
        </div>
      )
    },
    {
      title: 'Health Status',
      key: 'health',
      render: (_, group) => (
        <div>
          <Tag color={getGroupStatusColor(group.status)} style={{ fontWeight: 'bold' }}>
            {group.status.toUpperCase()}
          </Tag>
          {group.hasIssues && (
            <div style={{ fontSize: '11px', color: getGroupStatusColor(group.status), marginTop: 4 }}>
              {group.status === 'critical' && 'Failed pods detected'}
              {group.status === 'warning' && 'Some pods not ready'}
              {group.status === 'degraded' && 'Below expected count'}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, group) => (
        <Space>
          <Button 
            size="small" 
            icon={<ReloadOutlined />}
            onClick={() => handleRestartGroup(group)}
          >
            Restart All
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Statistics Dashboard */}
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Total Pods"
                value={statistics.total}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Running"
                value={statistics.running}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Failed"
                value={statistics.failed}
                prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Pending"
                value={statistics.pending}
                prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Recent Changes Alert */}
      {changes && changes.length > 0 && (
        <Alert
          message="Recent Pod Changes"
          description={
            <div>
              {changes.slice(0, 3).map((change, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  {change.type === 'created' && (
                    <Text>
                      <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                      New pod created: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                    </Text>
                  )}
                  {change.type === 'deleted' && (
                    <Text>
                      <DeleteOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                      Pod deleted: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                    </Text>
                  )}
                  {change.type === 'status_change' && (
                    <Text>
                      <ReloadOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                      Status change: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                      <span> ({change.oldStatus} → {change.newStatus})</span>
                    </Text>
                  )}
                </div>
              ))}
              {changes.length > 3 && (
                <Text type="secondary">... and {changes.length - 3} more changes</Text>
              )}
            </div>
          }
          type="info"
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      {/* NEW: Summary Cards for Grouped View */}
      {viewMode === 'grouped' && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Space>
                <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a' }} />
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {groupedPods.filter(g => !g.hasIssues).length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Healthy Groups</div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Space>
                <WarningOutlined style={{ fontSize: '24px', color: '#fa8c16' }} />
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {groupedPods.filter(g => g.hasIssues).length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Groups with Issues</div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Space>
                <ContainerOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {groupedPods.length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Total Groups</div>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* NEW: Issues Alert for Grouped View */}
      {viewMode === 'grouped' && groupedPods.filter(g => g.hasIssues).length > 0 && (
        <Alert
          message={`${groupedPods.filter(g => g.hasIssues).length} deployment group${groupedPods.filter(g => g.hasIssues).length > 1 ? 's' : ''} have issues`}
          description="Red highlighted groups have pod count mismatches or readiness issues"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Enhanced Control Panel */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={5}>
            <Space>
              <Text>View:</Text>
              <Select
                value={viewMode}
                onChange={setViewMode}
                style={{ width: 120 }}
              >
                <Option value="detailed">
                  <Space>
                    <UnorderedListOutlined />
                    Detailed
                  </Space>
                </Option>
                <Option value="grouped">
                  <Space>
                    <AppstoreOutlined />
                    Grouped
                  </Space>
                </Option>
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={5}>
            <Space>
              <Text>Namespace:</Text>
              <Select
                value={selectedNamespace}
                onChange={setSelectedNamespace}
                style={{ width: 130 }}
                loading={namespaces.length === 0}
              >
                <Option value="all">All Namespaces</Option>
                {namespaces.map(ns => (
                  <Option key={ns.name} value={ns.name}>{ns.name}</Option>
                ))}
              </Select>
            </Space>
          </Col>

          {viewMode === 'detailed' && (
            <Col xs={24} md={3}>
              <Space>
                <Text>Include Deleted:</Text>
                <Switch
                  checked={includeDeleted}
                  onChange={setIncludeDeleted}
                  size="small"
                />
              </Space>
            </Col>
          )}

          {viewMode === 'grouped' && (
            <Col xs={24} md={3}>
              <Space>
                <Text>Show Healthy:</Text>
                <Switch
                  checked={showHealthyGroups}
                  onChange={setShowHealthyGroups}
                  size="small"
                />
              </Space>
            </Col>
          )}

          {viewMode === 'detailed' && (
            <Col xs={24} md={3}>
              <Space>
                <Text>Sort by:</Text>
                <Select
                  value={sortBy}
                  onChange={setSortBy}
                  style={{ width: 100 }}
                >
                  <Option value="lastSeen">Last Seen</Option>
                  <Option value="name">Name</Option>
                  <Option value="status">Status</Option>
                  <Option value="firstSeen">Created</Option>
                </Select>
              </Space>
            </Col>
          )}

          <Col xs={24} md={4}>
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

      {/* Main Content - Conditional Rendering */}
      {viewMode === 'detailed' ? (
        /* Enhanced Pod Table */
        <Card title={`Pod Lifecycle Monitor (${pods.length} pods)`}>
          <Table
            columns={enhancedColumns}
            dataSource={pods}
            rowKey={(pod) => `${pod.namespace}-${pod.name}-${pod.firstSeen}`}
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} pods`,
            }}
            rowClassName={(pod) => 
              pod.isDeleted ? 'deleted-pod-row' : ''
            }
            scroll={{ x: 1200 }}
          />
        </Card>
      ) : (
        /* Grouped Pod Table */
        <Card title={`Pod Groups (${showHealthyGroups ? groupedPods.length : groupedPods.filter(g => g.hasIssues).length} groups)`}>
          <Table
            columns={groupColumns}
            dataSource={showHealthyGroups ? groupedPods : groupedPods.filter(g => g.hasIssues)}
            rowKey={(group) => `${group.namespace}/${group.baseName}`}
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} groups`,
            }}
            rowClassName={(group) => group.hasIssues ? 'unhealthy-group-row' : ''}
            expandable={{
              expandedRowRender: (group) => renderPodDetails(group.pods),
              expandRowByClick: true,
              rowExpandable: (group) => group.pods.length > 0,
            }}
            scroll={{ x: 800 }}
          />
        </Card>
      )}

      {/* Pod History Modal */}
      <Modal
        title={
          <Space>
            <HistoryOutlined />
            Pod Lifecycle History
          </Space>
        }
        open={historyModal.visible}
        onCancel={() => setHistoryModal({ visible: false, pod: null })}
        footer={null}
        width={800}
      >
        {historyModal.pod && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Space direction="vertical" size="small">
                    <div>
                      <Text strong>Pod Name:</Text> {historyModal.pod.pod.name}
                    </div>
                    <div>
                      <Text strong>Namespace:</Text> {historyModal.pod.pod.namespace}
                    </div>
                    <div>
                      <Text strong>Current Status:</Text> 
                      <Tag 
                        color={getStatusColor(historyModal.pod.pod.status, historyModal.pod.pod.isDeleted)}
                        style={{ marginLeft: 8 }}
                      >
                        {historyModal.pod.pod.isDeleted ? 'DELETED' : historyModal.pod.pod.status}
                      </Tag>
                    </div>
                  </Space>
                </Col>
                <Col span={12}>
                  <Space direction="vertical" size="small">
                    <div>
                      <Text strong>First Seen:</Text> {new Date(historyModal.pod.pod.firstSeen).toLocaleString()}
                    </div>
                    <div>
                      <Text strong>Last Seen:</Text> {new Date(historyModal.pod.pod.lastSeen).toLocaleString()}
                    </div>
                    <div>
                      <Text strong>Total Events:</Text> {historyModal.pod.pod.statusHistory?.length || 0}
                    </div>
                  </Space>
                </Col>
              </Row>
            </Card>
            
            <Card size="small" title="Status History Timeline">
              <Timeline
                items={historyModal.pod.pod.statusHistory?.map((event, index) => ({
                  children: (
                    <div key={index}>
                      <div style={{ fontWeight: 'bold' }}>
                        {event.event === 'created' ? 'Pod Created' :
                         event.event === 'status_change' ? 'Status Changed' :
                         event.event === 'restart' ? 'Pod Restarted' : 
                         event.event}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {new Date(event.timestamp).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Status: <Tag color={getStatusColor(event.status)} size="small">
                          {event.status}
                        </Tag>
                        {event.previousStatus && (
                          <span> (from {event.previousStatus})</span>
                        )}
                      </div>
                      {event.event === 'restart' && (
                        <div>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            Restart #{event.restartCount}
                          </Text>
                        </div>
                      )}
                    </div>
                  )
                }))}
              />
            </Card>
          </div>
        )}
      </Modal>

      <Modal
        title={
          <Space>
            <ScissorOutlined />
            Scale Deployment
          </Space>
        }
        open={scaleModalVisible}
        onCancel={() => setScaleModalVisible(false)}
        onOk={handleScaleDeployment}
        confirmLoading={actionLoading}
        okText="Scale"
      >
        {selectedPod && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <p><strong>Pod:</strong> {selectedPod.name}</p>
              <p><strong>Namespace:</strong> {selectedPod.namespace}</p>
              <p><strong>Deployment:</strong> {getDeploymentName(selectedPod.name)}</p>
              {deploymentInfo && (
                <p><strong>Current Replicas:</strong> {deploymentInfo.currentReplicas}</p>
              )}
            </div>

            <div>
              <p><strong>New Replica Count:</strong></p>
              <InputNumber
                min={0}
                max={20}
                value={newReplicaCount}
                onChange={setNewReplicaCount}
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Set to 0 to stop all pods, or increase to scale up
              </p>
            </div>
          </Space>
        )}
      </Modal>

      {/* Custom CSS */}
      <style jsx>{`
        .deleted-pod-row {
          background-color: #fff2f0 !important;
          opacity: 0.8;
        }
        .deleted-pod-row:hover {
          background-color: #ffebe6 !important;
        }
        .unhealthy-group-row {
          background-color: #fff2f0 !important;
          border-left: 3px solid #ff4d4f;
        }
        .unhealthy-group-row:hover {
          background-color: #ffece8 !important;
        }
      `}</style>
    </div>
  );
};

export default EnhancedKubernetesMonitor;