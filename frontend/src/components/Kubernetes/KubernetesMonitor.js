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
  Progress
} from 'antd';
import { 
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
        key: 'history',
        label: 'View History',
        icon: <HistoryOutlined />,
        onClick: () => handleViewHistory(pod)
      }
    ];

    if (!pod.isDeleted) {
      items.unshift(
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
          type: 'divider'
        }
      );
    }

    return { items };
  };

  const enhancedColumns = [
    {
      title: 'Pod Details',
      key: 'details',
      width: 250,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong style={{ opacity: record.isDeleted ? 0.6 : 1 }}>
              {record.name}
            </Text>
            {record.isDeleted && <Tag color="red" size="small">DELETED</Tag>}
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.namespace}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status & Lifecycle',
      key: 'status',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <span style={{ marginRight: 8 }}>
              {getLifecycleStageIcon(record.lifecycleStage)}
            </span>
            <Tag color={getStatusColor(record.status, record.isDeleted)}>
              {record.isDeleted ? 'DELETED' : record.status}
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            Duration: {record.statusDuration}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Timeline',
      key: 'timeline',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text style={{ fontSize: '11px' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              Created: {record.age} ago
            </Text>
          </div>
          <div>
            <Text style={{ fontSize: '11px' }}>
              Last seen: {record.timeSinceLastSeen} ago
            </Text>
          </div>
          {record.isDeleted && (
            <div>
              <Text type="danger" style={{ fontSize: '11px' }}>
                <DeleteOutlined style={{ marginRight: 4 }} />
                Deleted: {new Date(record.deletedAt).toLocaleString()}
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
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View History">
            <Button
              type="text"
              icon={<HistoryOutlined />}
              size="small"
              onClick={() => handleViewHistory(record)}
            />
          </Tooltip>
          {!record.isDeleted && (
            <Dropdown
              menu={getPodActionsMenu(record)}
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
          rowKey={(record) => `${record.namespace}-${record.name}-${record.firstSeen}`}
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} pods`,
          }}
          rowClassName={(record) => 
            record.isDeleted ? 'deleted-pod-row' : ''
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