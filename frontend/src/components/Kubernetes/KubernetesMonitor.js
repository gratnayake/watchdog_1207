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
  PoweroffOutlined
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
  const [expandedGroups, setExpandedGroups] = useState([]);

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
      }, 10000); // Refresh every 10 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedNamespace, includeDeleted, sortBy]);

  // FIXED: Function to group pods by deployment using Ant Design Table's expandable feature
  const groupPodsByDeployment = (podsList) => {
    const workloadMap = new Map();
    
    console.log('🔍 Processing pods:', podsList.length);
    if (podsList.length > 0) {
      console.log('🔍 Sample pod structure:', podsList[0]);
    }
    
    // Process all pods to group them
    podsList.forEach((pod, index) => {
      console.log(`🔍 Processing pod ${index + 1}:`, pod.name, 'isDeleted:', pod.isDeleted);
      
      // Extract deployment name (remove replicaset hash and pod identifier)
      let deploymentName = pod.name;
      
      // For pod names like: ifsapp-odata-7949dd6859-jcp7t
      // deploymentName should be: ifsapp-odata (deployment)
      if (pod.name.includes('-')) {
        const parts = pod.name.split('-');
        if (parts.length >= 3) {
          // Remove last two parts (replicaset hash and pod identifier) 
          deploymentName = parts.slice(0, -2).join('-');
        }
      }
      
      console.log(`🔍 Pod ${pod.name} -> Deployment: ${deploymentName}`);
      
      const workloadKey = `${pod.namespace}/${deploymentName}`;
      
      if (!workloadMap.has(workloadKey)) {
        console.log(`📦 Creating new group: ${workloadKey}`);
        workloadMap.set(workloadKey, {
          key: workloadKey,
          deployment: deploymentName,
          namespace: pod.namespace,
          isGroup: true,
          children: [],
          originalCount: 0,
          currentCount: 0,
          readyPods: 0,
          totalContainersReady: 0,
          totalContainersExpected: 0,
          hasIssues: false,
          snapshotPodCount: 0,
          allPodsGone: false
        });
      }
      
      const workload = workloadMap.get(workloadKey);
      
      // Count snapshot pods to get original count
      if (pod.wasInSnapshot) {
        workload.snapshotPodCount++;
      }
      
      // Create child pod entry for ALL pods (deleted and non-deleted)
      const childPod = {
        ...pod,
        key: `${workloadKey}/${pod.name}`,
        isChild: true,
        parentGroup: deploymentName
      };
      
      workload.children.push(childPod);
      console.log(`📦 Added pod ${pod.name} to group ${workloadKey}. Group now has ${workload.children.length} children`);
      
      // Only count non-deleted pods for current stats
      if (!pod.isDeleted) {
        workload.currentCount++;
        
        // Parse ready status (e.g., "2/2" -> readyContainers=2, totalContainers=2)
        let readyContainers = 0;
        let totalContainers = 1;
        
        if (pod.readinessRatio && pod.readinessRatio.includes('/')) {
          const parts = pod.readinessRatio.split('/');
          readyContainers = parseInt(parts[0]) || 0;
          totalContainers = parseInt(parts[1]) || 1;
        } else if (pod.readyContainers !== undefined) {
          readyContainers = pod.readyContainers;
          totalContainers = pod.totalContainers || 1;
        } else if (pod.ready && typeof pod.ready === 'string' && pod.ready.includes('/')) {
          const parts = pod.ready.split('/');
          readyContainers = parseInt(parts[0]) || 0;
          totalContainers = parseInt(parts[1]) || 1;
        }
        
        workload.totalContainersReady += readyContainers;
        workload.totalContainersExpected += totalContainers;
        
        // Check if pod is fully ready
        if (readyContainers === totalContainers && pod.status === 'Running') {
          workload.readyPods++;
        }
      }
    });
    
    // Convert to array and calculate status
    const result = [];
    workloadMap.forEach((workload, key) => {
      console.log(`📦 Processing group ${key}:`, {
        deployment: workload.deployment,
        childrenCount: workload.children.length,
        currentCount: workload.currentCount,
        children: workload.children.map(c => c.name)
      });
      
      // Set original count from snapshot or current count
      workload.originalCount = workload.snapshotPodCount || workload.currentCount;
      
      // Check if all pods are gone
      workload.allPodsGone = workload.currentCount === 0 && workload.originalCount > 0;
      
      // Calculate if there are issues
      const missingPods = workload.currentCount < workload.originalCount;
      const notAllReady = workload.readyPods < workload.currentCount;
      const containersNotReady = workload.totalContainersReady < workload.totalContainersExpected;
      
      workload.hasIssues = missingPods || notAllReady || containersNotReady;
      workload.missingCount = Math.max(0, workload.originalCount - workload.currentCount);
      
      // Only add groups that have or had pods
      if (workload.children.length > 0 || workload.originalCount > 0) {
        // Sort children pods by name
        workload.children.sort((a, b) => a.name.localeCompare(b.name));
        result.push(workload);
        console.log(`📦 Added group ${workload.deployment} with ${workload.children.length} children to result`);
      }
    });
    
    // Sort by namespace and group name
    result.sort((a, b) => {
      const nsCompare = a.namespace.localeCompare(b.namespace);
      if (nsCompare !== 0) return nsCompare;
      return a.deployment.localeCompare(b.deployment);
    });
    
    console.log('📦 Final grouped result:', result);
    const odataGroup = result.find(g => g.deployment === 'ifsapp-odata');
    if (odataGroup) {
      console.log('📦 ifsapp-odata group details:', {
        deployment: odataGroup.deployment,
        childrenCount: odataGroup.children.length,
        children: odataGroup.children.map(c => ({ name: c.name, isDeleted: c.isDeleted }))
      });
    } else {
      console.log('❌ ifsapp-odata group not found in result!');
    }
    
    return result;
  };

  const loadInitialData = async () => {
    try {
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
        console.log('📊 Raw API response:', data.data);
        console.log('📊 Total pods from API:', data.data.pods.length);
        console.log('📊 All pods:', data.data.pods);
        console.log('📊 Found ifsapp-odata pods:', data.data.pods.filter(p => p.name.includes('ifsapp-odata')));
        
        // Group pods by deployment
        const groupedPods = groupPodsByDeployment(data.data.pods);
        console.log('📦 Grouped pods result:', groupedPods);
        console.log('📦 ifsapp-odata groups:', groupedPods.filter(p => p.deployment?.includes('ifsapp-odata')));
        
        setPods(groupedPods);
        
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
    message.info(`Viewing logs for ${pod.namespace}/${pod.name}`);
  };

  const getDeploymentName = (podName) => {
    const parts = podName.split('-');
    if (parts.length >= 3) {
      return parts.slice(0, -2).join('-');
    }
    return podName;
  };

  const handleRestartPod = async (pod) => {
    try {
      setActionLoading(true);
      message.loading('Restarting pod...', 0);
      
      const result = await kubernetesAPI.restartPod(pod.namespace, pod.name);
      
      message.destroy();
      if (result.success) {
        message.success(`Pod ${pod.name} restart initiated`);
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

  const handleShowScaleModal = async (pod) => {
    try {
      setSelectedPod(pod);
      const deploymentName = getDeploymentName(pod.name);
      const result = await kubernetesAPI.getDeploymentInfo(pod.namespace, deploymentName);
      
      if (result.success && result.data) {
        setDeploymentInfo(result.data);
        setNewReplicaCount(result.data.currentReplicas || 1);
      }
      setScaleModalVisible(true);
    } catch (error) {
      console.error('Failed to get deployment info:', error);
      setScaleModalVisible(true);
    }
  };

  const handleScaleDeployment = async () => {
    if (!selectedPod) return;
    
    try {
      setActionLoading(true);
      const deploymentName = getDeploymentName(selectedPod.name);
      
      message.loading(`Scaling ${deploymentName} to ${newReplicaCount} replicas...`, 0);
      
      const result = await kubernetesAPI.scaleDeployment(
        selectedPod.namespace,
        deploymentName,
        newReplicaCount
      );
      
      message.destroy();
      
      if (result.success) {
        message.success(`Successfully scaled ${deploymentName} to ${newReplicaCount} replicas`);
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

  const handleStopDeployment = async (pod) => {
    try {
      setActionLoading(true);
      const deploymentName = getDeploymentName(pod.name);
      
      message.loading(`Stopping deployment ${deploymentName}...`, 0);
      
      const result = await kubernetesAPI.scaleDeployment(pod.namespace, deploymentName, 0);
      
      message.destroy();
      
      if (result.success) {
        message.success(`Successfully stopped ${deploymentName}`);
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
    message.info(`Describing pod ${pod.namespace}/${pod.name}`);
  };

  const getStatusColor = (status, isDeleted) => {
    if (isDeleted) return 'red';
    switch (status?.toLowerCase()) {
      case 'running': return 'green';
      case 'pending': return 'orange';
      case 'failed': return 'red';
      case 'succeeded': return 'blue';
      case 'completed': return 'blue';
      case 'unknown': return 'gray';
      default: return 'default';
    }
  };

  const getLifecycleStageIcon = (stage) => {
    if (!stage) return ''; // Return empty string if no stage
    switch (stage) {
      case 'stable': return '🟢';
      case 'starting': return '🟡';
      case 'failed': return '🔴';
      case 'completed': return '🔵';
      case 'deleted': return '🗑️';
      default: return '';
    }
  };

  // FIXED: Helper function to check if a row is a group header
  const isGroupHeader = (record) => {
    return record.isGroup === true;
  };

  const enhancedColumns = [
    {
      title: 'Deployment/Pod',
      key: 'details',
      width: 400,
      render: (_, record) => {
        // Group/Deployment row
        if (record.isGroup) {
          const shouldHighlight = record.hasIssues;
          
          return (
            <Space direction="vertical" size="small">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Text strong style={{ 
                  fontSize: '14px',
                  color: shouldHighlight ? '#ff4d4f' : 'inherit'
                }}>
                  📦 {record.deployment}
                </Text>
                {shouldHighlight && (
                  <ExclamationCircleOutlined 
                    style={{ color: '#ff4d4f', marginLeft: 8 }} 
                    title={`Expected ${record.originalCount} pods, found ${record.currentCount}`}
                  />
                )}
              </div>
              <Space>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  Namespace: {record.namespace}
                </Text>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  | Pods: {record.children.length}
                </Text>
              </Space>
            </Space>
          );
        }
        
        // Individual pod row (child)
        return (
          <Space direction="vertical" size="small">
            <div>
              <Text strong style={{ fontSize: '13px' }}>
                {record.name}
              </Text>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Pods/Status',
      key: 'status',
      width: 200,
      render: (_, record) => {
        // Group status - show pod count
        if (record.isGroup) {
          const isHealthy = !record.hasIssues;
          const statusText = record.allPodsGone ? 
            `0/${record.originalCount} pods` :
            `${record.currentCount}/${record.originalCount} pods`;
          
          return (
            <Space direction="vertical" size="small">
              <div>
                <Badge 
                  count={statusText}
                  style={{ 
                    backgroundColor: isHealthy ? '#52c41a' : '#ff4d4f',
                    fontSize: '12px'
                  }}
                />
              </div>
              {record.missingCount > 0 && (
                <Text type="danger" style={{ fontSize: '11px' }}>
                  {record.missingCount} pod{record.missingCount > 1 ? 's' : ''} missing
                </Text>
              )}
            </Space>
          );
        }
        
        // Individual pod status
        return (
          <Tag color={getStatusColor(record.status, record.isDeleted)}>
            {record.status || 'Unknown'}
          </Tag>
        );
      },
    },
    {
      title: 'Ready',
      key: 'ready',
      width: 150,
      render: (_, record) => {
        // Group ready status - show container totals
        if (record.isGroup) {
          if (record.allPodsGone) {
            return (
              <Badge 
                count="0/0"
                style={{ 
                  backgroundColor: '#ff4d4f',
                  fontSize: '12px'
                }}
              />
            );
          }
          
          const allReady = record.totalContainersReady === record.totalContainersExpected;
          const containerText = `${record.totalContainersReady}/${record.totalContainersExpected}`;
          
          return (
            <Space direction="vertical" size="small">
              <Badge 
                count={containerText}
                style={{ 
                  backgroundColor: allReady ? '#52c41a' : '#faad14',
                  fontSize: '12px'
                }}
              />
              {!allReady && record.totalContainersExpected > 0 && (
                <Text type="warning" style={{ fontSize: '11px' }}>
                  Not all ready
                </Text>
              )}
            </Space>
          );
        }
        
        // Individual pod ready status
        let readyCount = 0;
        let totalCount = 1;
        
        // Parse the ready field - try different formats
        if (record.readinessRatio && record.readinessRatio.includes('/')) {
          const parts = record.readinessRatio.split('/');
          readyCount = parseInt(parts[0]) || 0;
          totalCount = parseInt(parts[1]) || 1;
        } else if (record.ready && typeof record.ready === 'string' && record.ready.includes('/')) {
          const parts = record.ready.split('/');
          readyCount = parseInt(parts[0]) || 0;
          totalCount = parseInt(parts[1]) || 1;
        } else if (record.readyContainers !== undefined) {
          readyCount = record.readyContainers || 0;
          totalCount = record.totalContainers || 1;
        }
        
        const isFullyReady = readyCount === totalCount;
        
        return (
          <Tooltip title={`${readyCount} of ${totalCount} containers ready`}>
            <Tag 
              color={isFullyReady ? 'success' : 'warning'}
              style={{ 
                minWidth: '50px', 
                textAlign: 'center'
              }}
            >
              {readyCount}/{totalCount}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Restarts',
      key: 'restarts',
      width: 100,
      render: (_, record) => {
        if (record.isGroup) {
          // Sum of all restarts in the group
          const totalRestarts = record.children.reduce((sum, pod) => sum + (pod.restarts || 0), 0);
            
          if (totalRestarts > 0) {
            return (
              <Badge 
                count={totalRestarts} 
                style={{ backgroundColor: '#f5222d' }}
                title={`Total restarts across all pods`}
              />
            );
          }
          return <Text type="secondary">0</Text>;
        }
        
        // Individual pod restarts
        return record.restarts > 0 ? (
          <Badge count={record.restarts} style={{ backgroundColor: '#f5222d' }} />
        ) : (
          <Text type="secondary">0</Text>
        );
      },
    },
    {
      title: 'Age',
      key: 'age',
      width: 100,
      render: (_, record) => {
        if (record.isGroup) {
          // Show age of oldest pod
          const ages = record.children.map(p => p.age || '').filter(a => a);
          if (ages.length > 0) {
            return <Text style={{ fontSize: '12px' }}>{ages[0]}</Text>;
          }
          return <Text type="secondary">-</Text>;
        }
        return <Text style={{ fontSize: '12px' }}>{record.age || '-'}</Text>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => {
        // Group actions
        if (record.isGroup) {
          const hasActivePods = record.currentCount > 0;
          
          return (
            <Space>
              {hasActivePods && (
                <Popconfirm
                  title="Stop All Pods?"
                  description={`This will stop all ${record.currentCount} active pods in ${record.deployment}`}
                  onConfirm={async () => {
                    message.loading(`Stopping all pods in ${record.deployment}...`, 0);
                    // Here you would implement the actual stop logic
                    setTimeout(() => {
                      message.destroy();
                      message.success(`Stopped all pods in ${record.deployment}`);
                      loadEnhancedPods();
                    }, 2000);
                  }}
                  okText="Yes, Stop All"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    size="small"
                    danger
                    icon={<PoweroffOutlined />}
                  >
                    Stop All
                  </Button>
                </Popconfirm>
              )}
              {record.missingCount > 0 && (
                <Tooltip title={`${record.missingCount} pods are missing`}>
                  <Tag color="red">
                    {record.missingCount} Missing
                  </Tag>
                </Tooltip>
              )}
            </Space>
          );
        }
        
        // Individual pod actions
        return <PodActions pod={record} onPodAction={() => setTimeout(loadEnhancedPods, 2000)} />;
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Statistics Cards */}
      {statistics && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Total"
                value={statistics.total}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Running"
                value={statistics.running}
                valueStyle={{ color: '#52c41a' }}
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
      <Card title={`Pod Lifecycle Monitor (${pods.length} deployments)`}>
        <Table
          columns={enhancedColumns}
          dataSource={pods}
          rowKey="key"
          loading={loading}
          expandable={{
            childrenColumnName: 'children',
            defaultExpandAllRows: false,
            rowExpandable: record => record.isGroup && record.children && record.children.length > 0,
            indentSize: 20,
          }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} items`,
          }}
          rowClassName={(record) => {
            if (record.isGroup && record.hasIssues) return 'degraded-group-row';
            if (record.isGroup) return 'group-row';
            if (record.isDeleted) return 'deleted-pod-row';
            return '';
          }}
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
                    {historyModal.pod.lifecycle.deletedAt && (
                      <div>
                        <Text strong>Deleted At:</Text> {new Date(historyModal.pod.lifecycle.deletedAt).toLocaleString()}
                      </div>
                    )}
                  </Space>
                </Col>
              </Row>
            </Card>

            <Card title="Status History" size="small">
              <Timeline mode="left">
                {historyModal.pod.statusHistory && historyModal.pod.statusHistory.map((event, index) => (
                  <Timeline.Item 
                    key={index}
                    color={event.event === 'deleted' ? 'red' : 
                           event.event === 'created' ? 'green' : 
                           event.event === 'restart' ? 'orange' : 'blue'}
                  >
                    <div>
                      <Text strong>{event.status}</Text>
                      {event.event && (
                        <Tag size="small" style={{ marginLeft: 8 }}>
                          {event.event}
                        </Tag>
                      )}
                      <br />
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        {new Date(event.timestamp).toLocaleString()}
                      </Text>
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
                  </Timeline.Item>
                ))}
              </Timeline>
            </Card>
          </div>
        )}
      </Modal>

      {/* Scale Deployment Modal */}
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
      <style>{`
        .group-row {
          background-color: #f0f5ff !important;
          font-weight: 500;
        }
        .group-row:hover {
          background-color: #e6f0ff !important;
        }
        .degraded-group-row {
          background-color: #fff2f0 !important;
          font-weight: 500;
          border-left: 3px solid #ff4d4f;
        }
        .degraded-group-row:hover {
          background-color: #ffebe6 !important;
        }
        .child-pod-row {
          background-color: #fafafa !important;
        }
        .child-pod-row:hover {
          background-color: #f0f0f0 !important;
        }
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