// frontend/src/components/Kubernetes/KubernetesMonitor.js
// Complete Enhanced Version with Pod Lifecycle Tracking

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
  ExclamationCircleOutlined
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

const handleResetMonitoring = async () => {
  try {
    message.loading('Resetting monitoring state...', 0);
    
    const response = await fetch('/api/kubernetes/monitoring/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    message.destroy();
    
    if (data.success) {
      message.success('Monitoring state reset successfully! ✅');
      // Refresh your data if needed
      setTimeout(() => {
        window.location.reload(); // Or call your refresh method
      }, 1000);
    } else {
      message.error(`Reset failed: ${data.error}`);
    }
  } catch (error) {
    message.destroy();
    message.error(`Reset failed: ${error.message}`);
  }
};

const handleBaselineCheck = async () => {
  try {
    message.loading('Performing baseline check...', 0);
    
    const response = await fetch('/api/kubernetes/monitoring/baseline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    message.destroy();
    
    if (data.success) {
      message.success('Baseline check completed! 📊');
    } else {
      message.error(`Baseline check failed: ${data.error}`);
    }
  } catch (error) {
    message.destroy();
    message.error(`Baseline check failed: ${error.message}`);
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
    } else {
      setNewReplicaCount(1);
    }
    setScaleModalVisible(true);
  } catch (error) {
    console.error('Get deployment info error:', error);
    setNewReplicaCount(1);
    setScaleModalVisible(true);
  }
};

// Scale deployment handler
const handleScaleDeployment = async () => {
  if (!selectedPod) return;
  
  try {
    setActionLoading(true);
    message.loading(`Scaling deployment to ${newReplicaCount} replicas...`, 0);
    
    const deploymentName = getDeploymentName(selectedPod.name);
    const result = await kubernetesAPI.scaleDeployment(
      selectedPod.namespace, 
      deploymentName, 
      newReplicaCount
    );
    
    message.destroy();
    if (result.success) {
      message.success(`Deployment scaled to ${newReplicaCount} replicas`);
      setScaleModalVisible(false);
      // Refresh pod list after 3 seconds
      setTimeout(loadEnhancedPods, 3000);
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

// Stop deployment (scale to 0)
const handleStopDeployment = async (pod) => {
  try {
    setActionLoading(true);
    message.loading('Stopping deployment...', 0);
    
    const deploymentName = getDeploymentName(pod.name);
    const result = await kubernetesAPI.scaleDeployment(pod.namespace, deploymentName, 0);
    
    message.destroy();
    if (result.success) {
      message.success(`Deployment ${deploymentName} stopped`);
      // Refresh pod list after 3 seconds
      setTimeout(loadEnhancedPods, 3000);
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
            <div>Containers: {readyCount}/{totalCount}</div>
          </div>
        );

        return (
          <Tooltip title={tooltipContent} placement="topRight">
            <Space direction="vertical" size={2} align="center">
              <Tag 
                color={getTagColor()}
                style={{ 
                  minWidth: '50px', 
                  textAlign: 'center',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {readyCount}/{totalCount}
              </Tag>
              {totalCount > 1 && (
                <Progress
                  percent={(readyCount / totalCount) * 100}
                  size="small"
                  strokeColor={getReadinessColor()}
                  showInfo={false}
                  style={{ margin: 0, width: '45px' }}
                />
              )}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: 'Timeline',
      key: 'timeline',
      width: 160,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <div>
            <Text style={{ fontSize: '11px' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              Created: {pod.age} ago
            </Text>
          </div>
          <div>
            <Text style={{ fontSize: '11px' }}>
              Last seen: {pod.timeSinceLastSeen} ago
            </Text>
          </div>
          {pod.isDeleted && (
            <div>
              <Text type="danger" style={{ fontSize: '11px' }}>
                <DeleteOutlined style={{ marginRight: 4 }} />
                Deleted: {new Date(pod.deletedAt).toLocaleString()}
              </Text>
            </div>
          )}
        </Space>
      ),
    },
    
    {
      title: 'Restarts',
      dataIndex: 'restarts',
      key: 'restarts',
      width: 80,
      render: (restarts) => (
        <Tooltip title={`${restarts} restarts`}>
          <Badge 
            count={restarts} 
            overflowCount={99}
            style={{ 
              backgroundColor: restarts > 5 ? '#ff4d4f' : 
                              restarts > 0 ? '#fa8c16' : '#52c41a' 
            }}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Node',
      dataIndex: 'node',
      key: 'node',
      width: 120,
      ellipsis: true,
      render: (node) => (
        <Tooltip title={node}>
          <Text style={{ fontSize: '12px' }}>{node || 'Unknown'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, pod) => (
        <Space size="small">
          <Tooltip title="View History">
            <Button
              type="text"
              icon={<HistoryOutlined />}
              size="small"
              onClick={() => handleViewHistory(pod)}
            />
          </Tooltip>
          {!pod.isDeleted && (
            <Dropdown
              menu={getPodActionsMenu(pod)}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button
                type="text"
                icon={<MoreOutlined />}
                size="small"
              />
            </Dropdown>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Statistics Cards */}
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Total Pods"
                value={statistics.total}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Running"
                value={statistics.running}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Failed"
                value={statistics.failed}
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Deleted"
                value={statistics.deleted}
                valueStyle={{ color: '#8c8c8c' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Recent Changes Alert */}
      {changes.length > 0 && (
        <Alert
          message="Recent Pod Changes"
          description={
            <div>
              {changes.slice(0, 3).map((change, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  {change.type === 'created' && (
                    <Text>
                      <PlayCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                      Created: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                    </Text>
                  )}
                  {change.type === 'deleted' && (
                    <Text>
                      <DeleteOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                      Deleted: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                    </Text>
                  )}
                  {change.type === 'status_change' && (
                    <Text>
                      <ExclamationCircleOutlined style={{ color: '#1890ff', marginRight: 8 }} />
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
          <Col xs={24} md={6}>
      <Space>
        <Popconfirm
          title="Reset Monitoring State"
          description="This will clear all cached pod statuses and start fresh. Are you sure?"
          onConfirm={handleResetMonitoring}
          okText="Yes, Reset"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button 
            icon={<ReloadOutlined />} 
            danger
            size="small"
          >
            Reset Monitoring
          </Button>
        </Popconfirm>
        
        <Button 
          icon={<CheckCircleOutlined />} 
          type="primary"
          onClick={handleBaselineCheck}
          size="small"
        >
          Set Baseline
        </Button>
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

      {/* Enhanced Pod Table */}
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
                      <Text strong>First Seen:</Text> {new Date(historyModal.pod.lifecycle.firstSeen).toLocaleString()}
                    </div>
                    <div>
                      <Text strong>Last Seen:</Text> {new Date(historyModal.pod.lifecycle.lastSeen).toLocaleString()}
                    </div>
                    <div>
                      <Text strong>Age:</Text> {historyModal.pod.lifecycle.age}
                    </div>
                    {historyModal.pod.pod.isDeleted && (
                      <div>
                        <Text strong>Deleted At:</Text> {new Date(historyModal.pod.lifecycle.deletedAt).toLocaleString()}
                      </div>
                    )}
                  </Space>
                </Col>
              </Row>
            </Card>

            <Card size="small" title="Status History Timeline">
              <Timeline
                items={historyModal.pod.statusHistory.map((event, index) => ({
                  key: index,
                  color: event.event === 'deleted' ? 'red' : 
                         event.event === 'created' ? 'green' : 
                         event.event === 'restart' ? 'orange' : 'blue',
                  children: (
                    <div>
                      <div>
                        <Text strong>{event.status}</Text>
                        <Tag size="small" style={{ marginLeft: 8 }}>
                          {event.event.replace('_', ' ')}
                        </Tag>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {new Date(event.timestamp).toLocaleString()}
                        </Text>
                      </div>
                      {event.previousStatus && (
                        <div>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            Previous: {event.previousStatus}
                          </Text>
                        </div>
                      )}
                      {event.restartCount !== undefined && (
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

      {/* Custom CSS for deleted pods */}
      <style jsx>{`
        .deleted-pod-row {
          background-color: #fff2f0 !important;
          opacity: 0.8;
        }
        .deleted-pod-row:hover {
          background-color: #ffebe6 !important;
        }
      `}</style>
    </div>
  );
};

export default EnhancedKubernetesMonitor;