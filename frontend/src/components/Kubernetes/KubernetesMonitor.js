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
  UnorderedListOutlined,
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

  // NEW: Grouped view state
  const [groupedPods, setGroupedPods] = useState([]);
  const [showHealthyGroups, setShowHealthyGroups] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadEnhancedPods();
  }, [selectedNamespace]);

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
  }, [autoRefresh, selectedNamespace]);

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


// Replace the groupPodsByDeployment function in your KubernetesMonitor component

const groupPodsByDeployment = (podsList) => {
  const workloadMap = new Map();
  
  podsList.forEach(pod => {
    // Extract workload info - same logic as kubernetesMonitoringService
    let workloadName = pod.name;
    let workloadType = 'Pod'; // Default for standalone pods
    
    // Pattern: deployment-name-replicaset-hash-pod-hash
    if (pod.name.includes('-')) {
      const parts = pod.name.split('-');
      if (parts.length >= 3) {
        // Remove last 2 parts (replicaset hash + pod hash)
        workloadName = parts.slice(0, -2).join('-');
        workloadType = 'Deployment';
      }
    }
    
    const workloadKey = `${workloadType}/${workloadName}/${pod.namespace}`;
    
    if (!workloadMap.has(workloadKey)) {
      workloadMap.set(workloadKey, {
        key: workloadKey,
        type: workloadType,
        name: workloadName,
        deployment: workloadName,
        namespace: pod.namespace,
        isGroup: true,
        children: [],
        pods: [],
        desiredReplicas: 0,
        readyReplicas: 0,
        totalPods: 0,
        runningPods: 0,
        deletedPods: 0,
        failedPods: 0,
        pendingPods: 0
      });
    }
    
    const workload = workloadMap.get(workloadKey);
    
    // Add pod to workload
    const childPod = {
      ...pod,
      key: `${workloadKey}/${pod.name}`,
      isChild: true,
      parentDeployment: workloadName
    };
    
    workload.children.push(childPod);
    workload.pods.push({
      name: pod.name,
      status: pod.status,
      ready: pod.ready,
      restarts: pod.restarts || 0,
      age: pod.age,
      node: pod.node,
      readyContainers: pod.readyContainers || 0,
      totalContainers: pod.totalContainers || 1
    });
    
    workload.totalPods++;
    
    // Count pod states
    if (pod.isDeleted) {
      workload.deletedPods++;
    } else {
      if (pod.status === 'Running') {
        workload.runningPods++;
        // Count as ready only if ALL containers are ready
        if (pod.ready === true || 
            (pod.readyContainers && pod.totalContainers && 
             pod.readyContainers === pod.totalContainers)) {
          workload.readyReplicas++;
        }
      } else if (pod.status === 'Failed') {
        workload.failedPods++;
      } else if (pod.status === 'Pending') {
        workload.pendingPods++;
      }
    }
  });
  
  // Convert to array and calculate health status
  const result = [];
  workloadMap.forEach(workload => {
    // Calculate workload health status - matching the monitoring service logic
    workload.desiredReplicas = workload.totalPods - workload.deletedPods;
    
    // Calculate health status
    const calculateWorkloadHealth = (wl) => {
      const totalActivePods = wl.totalPods - wl.deletedPods;
      const readyPods = wl.readyReplicas;
      const runningPods = wl.runningPods;
      
      if (totalActivePods === 0) return 'empty';
      if (readyPods === 0 && totalActivePods > 0) return 'critical';
      if (readyPods < totalActivePods * 0.5) return 'degraded';
      if (readyPods < totalActivePods) return 'warning';
      if (runningPods < totalActivePods) return 'warning';
      return 'healthy';
    };
    
    workload.healthStatus = calculateWorkloadHealth(workload);
    
    // Set display status
    workload.status = workload.healthStatus === 'healthy' ? 'All Ready' :
                     workload.healthStatus === 'critical' ? 'Critical' :
                     workload.healthStatus === 'degraded' ? 'Degraded' :
                     workload.healthStatus === 'warning' ? 'Warning' :
                     workload.healthStatus === 'empty' ? 'No Active Pods' : 'Unknown';
    
    // Add display name
    workload.displayName = `${workload.deployment} (${workload.readyReplicas}/${workload.desiredReplicas} ready)`;
    
    // Check if ANY pod has containers not fully ready
    workload.hasUnreadyContainers = workload.pods.some(pod => {
      return pod.readyContainers < pod.totalContainers;
    });
    
    // Only add groups with multiple pods or single pods
    if (workload.children.length > 1) {
      result.push(workload);
    } else if (workload.children.length === 1) {
      // Single pod - add directly without grouping
      result.push(workload.children[0]);
    }
  });
  
  // Sort by namespace and deployment name
  result.sort((a, b) => {
    if (a.isGroup && !b.isGroup) return -1;
    if (!a.isGroup && b.isGroup) return 1;
    const nsCompare = a.namespace.localeCompare(b.namespace);
    if (nsCompare !== 0) return nsCompare;
    return (a.deployment || a.name).localeCompare(b.deployment || b.name);
  });
  
  return result;
};




  const loadEnhancedPods = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/kubernetes/pods/enhanced?namespace=${selectedNamespace}&includeDeleted=${includeDeleted}&sortBy=${sortBy}`);
      const data = await response.json();
      
      if (data.success) {
        // Group pods by deployment
        const groupedPods = groupPodsByDeployment(data.data.pods);
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

  // NEW: Extract ReplicaSet name from pod name (includes hash)
  const extractReplicaSetName = (podName) => {
    // For pods like: ifsapp-odata-7949dd6859-9llzn
    // Return: ifsapp-odata-7949dd6859 (deployment + replicaset hash)
    const parts = podName.split('-');
    if (parts.length >= 2) {
      // Remove only the last part (pod hash)
      return parts.slice(0, -1).join('-');
    }
    return podName;
  };

  // NEW: Group pods by their ReplicaSet name (deployment + hash)
  const groupPodsByBaseName = (podList) => {
    const grouped = {};
    
    podList.forEach(pod => {
      if (pod.isDeleted) return; // Skip deleted pods
      
      const replicaSetName = extractReplicaSetName(pod.name);
      const groupKey = `${pod.namespace}/${replicaSetName}`;
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          namespace: pod.namespace,
          replicaSetName: replicaSetName,
          deploymentName: replicaSetName.split('-').slice(0, -1).join('-'), // Extract deployment name for display
          pods: [],
          expectedCount: 0,
          readyCount: 0,
          totalCount: 0,
          totalReadyContainers: 0,
          totalExpectedContainers: 0,
          hasIssues: false,
          status: 'healthy'
        };
      }
      
      grouped[groupKey].pods.push(pod);
      grouped[groupKey].totalCount++;
      
      // Count ready containers across all pods
      const podReadyContainers = pod.readyContainers || 0;
      const podTotalContainers = pod.totalContainers || 1;
      
      grouped[groupKey].totalReadyContainers += podReadyContainers;
      grouped[groupKey].totalExpectedContainers += podTotalContainers;
      
      // Count fully ready pods (all containers ready AND status Running)
      if (pod.ready && pod.status === 'Running' && podReadyContainers === podTotalContainers) {
        grouped[groupKey].readyCount++;
      }
    });

    // Determine expected count and health status for each group
    Object.values(grouped).forEach(group => {
      // Use the total count as expected
      group.expectedCount = group.totalCount;
      
      // Check for issues based on container readiness
      const allContainersReady = group.totalReadyContainers === group.totalExpectedContainers;
      const allPodsRunning = group.pods.every(pod => pod.status === 'Running');
      const hasFailedPods = group.pods.some(pod => 
        pod.status === 'Failed' || 
        pod.status === 'CrashLoopBackOff' ||
        pod.status === 'Error'
      );
      
      if (hasFailedPods) {
        group.status = 'critical';
        group.hasIssues = true;
      } else if (!allContainersReady || !allPodsRunning) {
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
      return a.replicaSetName.localeCompare(b.replicaSetName);
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
    Modal.confirm({
      title: 'Restart All Pods in ReplicaSet',
      content: `Are you sure you want to restart all ${group.totalCount} pods in ${group.replicaSetName}?`,
      okText: 'Yes, Restart All',
      cancelText: 'Cancel',
      onOk: async () => {
        message.loading('Restarting all pods in group...', 0);
        
        try {
          let successCount = 0;
          let failCount = 0;
          
          for (const pod of group.pods) {
            try {
              const result = await kubernetesAPI.restartPod(pod.namespace, pod.name);
              if (result.success) {
                successCount++;
              } else {
                failCount++;
              }
            } catch (error) {
              failCount++;
            }
          }
          
          message.destroy();
          if (failCount === 0) {
            message.success(`All ${successCount} pods in ${group.replicaSetName} restart initiated`);
          } else {
            message.warning(`${successCount} pods restarted successfully, ${failCount} failed`);
          }
          
          setTimeout(loadEnhancedPods, 2000);
        } catch (error) {
          message.destroy();
          message.error(`Failed to restart pods: ${error.message}`);
        }
      }
    });
  };

  // NEW: Individual pod restart from grouped view
  const handleRestartIndividualPod = async (pod, groupName) => {
    try {
      setActionLoading(true);
      message.loading(`Restarting ${pod.name}...`, 0);
      
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

  // NEW: Render pod details for expanded group rows with individual actions
  const renderPodDetails = (pods, groupName) => {
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
          const isFullyReady = ready && readyCount === totalCount;
          
          return (
            <div>
              <Text style={{ 
                color: isFullyReady ? '#52c41a' : '#ff4d4f',
                fontWeight: 'bold',
                fontSize: '12px'
              }}>
                {readyCount}/{totalCount}
              </Text>
              {!isFullyReady && (
                <div style={{ 
                  fontSize: '10px', 
                  color: '#ff4d4f',
                  fontWeight: 'bold'
                }}>
                  Not Ready
                </div>
              )}
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
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_, pod) => (
          <Space size="small">
            <Button
              type="primary"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => handleRestartIndividualPod(pod, groupName)}
              disabled={pod.isDeleted || actionLoading}
              loading={actionLoading}
            >
              Restart
            </Button>
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => handleViewHistory(pod)}
            >
              History
            </Button>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => handleViewLogs(pod)}
              disabled={pod.isDeleted}
            >
              Logs
            </Button>
          </Space>
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
        rowClassName={(pod) => {
          if (pod.isDeleted) return 'deleted-pod-row';
          
          const readyCount = pod.readyContainers || 0;
          const totalCount = pod.totalContainers || 1;
          const isFullyReady = pod.ready && readyCount === totalCount;
          
          return !isFullyReady ? 'pod-not-ready-row' : '';
        }}
      />
    );
  };

// Update the enhancedColumns in your KubernetesMonitor component

const enhancedColumns = [
  {
    title: 'Workload/Pod',
    key: 'details',
    width: 350,
    render: (_, record) => {
      // Group/Workload row
      if (record.isGroup) {
        // Determine if group should be highlighted in red
        const isUnhealthy = record.healthStatus === 'critical' || 
                           record.healthStatus === 'degraded' ||
                           record.hasUnreadyContainers;
        
        return (
          <Space direction="vertical" size="small">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Text strong style={{ 
                fontSize: '14px',
                color: isUnhealthy ? '#ff4d4f' : 'inherit'
              }}>
                📦 {record.deployment}
              </Text>
              <Badge 
                count={record.totalPods} 
                style={{ 
                  marginLeft: 8, 
                  backgroundColor: isUnhealthy ? '#ff4d4f' : '#1890ff' 
                }}
              />
              {isUnhealthy && (
                <ExclamationCircleOutlined 
                  style={{ color: '#ff4d4f', marginLeft: 8 }} 
                  title="Some pods are not fully ready"
                />
              )}
            </div>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              Namespace: {record.namespace} | Type: {record.type}
            </Text>
          </Space>
        );
      }
      
      // Individual pod row
      const podStyle = record.isChild ? { paddingLeft: '30px' } : {};
      
      return (
        <Space direction="vertical" size="small" style={podStyle}>
          <div>
            <Text strong style={{ 
              opacity: record.isDeleted ? 0.6 : 1,
              fontSize: record.isChild ? '12px' : '13px'
            }}>
              {record.isChild ? '└─ ' : ''}{record.name}
            </Text>
            {record.isDeleted && (
              <Tag color="red" size="small" style={{ marginLeft: 8 }}>DELETED</Tag>
            )}
          </div>
          {!record.isGroup && (
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {record.namespace}
            </Text>
          )}
        </Space>
      );
    },
  },
  {
    title: 'Status',
    key: 'status',
    width: 180,
    render: (_, record) => {
      // Group/Workload status
      if (record.isGroup) {
        const getStatusColor = () => {
          switch (record.healthStatus) {
            case 'healthy': return 'green';
            case 'critical': return 'red';
            case 'degraded': return 'orange';
            case 'warning': return 'gold';
            case 'empty': return 'default';
            default: return 'blue';
          }
        };
        
        return (
          <Space direction="vertical" size="small">
            <Tag color={getStatusColor()} style={{ fontSize: '12px' }}>
              {record.status}
            </Tag>
            <Space size="small">
              {record.runningPods > 0 && (
                <Tag color="green" size="small">{record.runningPods} Running</Tag>
              )}
              {record.deletedPods > 0 && (
                <Tag color="red" size="small">{record.deletedPods} Deleted</Tag>
              )}
              {record.failedPods > 0 && (
                <Tag color="red" size="small">{record.failedPods} Failed</Tag>
              )}
              {record.pendingPods > 0 && (
                <Tag color="orange" size="small">{record.pendingPods} Pending</Tag>
              )}
            </Space>
          </Space>
        );
      }
      
      // Individual pod status
      return (
        <Space direction="vertical" size="small">
          <div>
            <span style={{ marginRight: 8 }}>
              {getLifecycleStageIcon(record.lifecycleStage)}
            </span>
            <Tag color={getStatusColor(record.status, record.isDeleted)}>
              {record.isDeleted ? 'DELETED' : record.status}
            </Tag>
          </div>
          {record.statusDuration && (
            <Text type="secondary" style={{ fontSize: '11px' }}>
              Duration: {record.statusDuration}
            </Text>
          )}
        </Space>
      );
    },
  },
  {
    title: 'Ready',
    key: 'ready',
    width: 150,
    render: (_, record) => {
      // Group/Workload ready status
      if (record.isGroup) {
        const isFullyReady = record.readyReplicas === record.desiredReplicas && 
                            !record.hasUnreadyContainers;
        const color = isFullyReady ? '#52c41a' : '#ff4d4f';
        
        return (
          <Space direction="vertical" size="small">
            <Badge 
              count={`${record.readyReplicas}/${record.desiredReplicas}`}
              style={{ 
                backgroundColor: color,
                fontSize: '12px'
              }}
            />
            {record.hasUnreadyContainers && (
              <Text type="danger" style={{ fontSize: '11px' }}>
                ⚠️ Some containers not ready
              </Text>
            )}
          </Space>
        );
      }
      
      // Individual pod ready status
      const readyCount = record.readyContainers || 0;
      const totalCount = record.totalContainers || 1;
      const isFullyReady = readyCount === totalCount;
      
      return (
        <Tooltip title={`${readyCount} of ${totalCount} containers ready`}>
          <Tag 
            color={isFullyReady ? 'success' : 'error'}
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
        const totalRestarts = record.pods.reduce((sum, pod) => sum + pod.restarts, 0);
        if (totalRestarts > 0) {
          return (
            <Badge 
              count={totalRestarts} 
              style={{ backgroundColor: '#f5222d' }}
              title={`Total restarts across all pods`}
            />
          );
        }
        return <Text type="secondary">-</Text>;
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
        // Show age range or oldest pod
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
      // Group/Workload actions
      if (record.isGroup) {
        const hasActivePods = record.desiredReplicas > 0;
        
        return (
          <Space>
            {hasActivePods ? (
              <Popconfirm
                title="Stop All Pods?"
                description={`This will stop all ${record.desiredReplicas} active pods in ${record.deployment}`}
                onConfirm={async () => {
                  message.loading(`Stopping all pods in ${record.deployment}...`, 0);
                  // Stop all non-deleted pods
                  for (const pod of record.children) {
                    if (!pod.isDeleted) {
                      await handleRestartPod(pod);
                    }
                  }
                  message.destroy();
                  message.success(`Stopped all pods in ${record.deployment}`);
                  setTimeout(loadEnhancedPods, 2000);
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
            ) : (
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => message.info('Use deployment scale to start pods')}
              >
                Start
              </Button>
            )}
          </Space>
        );
      }
      
      // Individual pod actions
      if (!record.isDeleted) {
        return <PodActions pod={record} onPodAction={() => setTimeout(loadEnhancedPods, 2000)} />;
      }
      
      return null;
    },
  },
];
const groupedTableStyles = `
  .group-row {
    background-color: #f0f5ff !important;
    font-weight: 500;
  }
  .group-row:hover {
    background-color: #e6f0ff !important;
  }
  .deleted-pod-row {
    background-color: #fff2f0 !important;
    opacity: 0.8;
  }
  .deleted-pod-row:hover {
    background-color: #ffebe6 !important;
  }
  .ant-table-row-level-1 {
    background-color: #fafafa;
  }
`;

  // NEW: Grouped view columns
  const groupColumns = [
    {
      title: 'ReplicaSet Group',
      key: 'replicaset',
      render: (_, group) => (
        <div>
          <Space>
            {getGroupStatusIcon(group.status)}
            <div>
              <Text strong style={{ 
                fontSize: '14px',
                color: group.hasIssues ? getGroupStatusColor(group.status) : undefined
              }}>
                {group.replicaSetName}
              </Text>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {group.namespace} • {group.deploymentName}
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
              percent={Math.round((group.totalReadyContainers / group.totalExpectedContainers) * 100)}
              size="small"
              status={group.hasIssues ? 'exception' : 'success'}
              format={() => `${group.totalReadyContainers}/${group.totalExpectedContainers}`}
            />
            <div style={{ fontSize: '10px', color: '#666' }}>
              Containers Ready
            </div>
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
            type="primary"
          >
            Restart All
          </Button>
          <Button 
            size="small" 
            icon={<ExpandOutlined />}
            onClick={() => {
              // This will be handled by the expandable table functionality
            }}
          >
            View Pods
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

      {/* NEW: Issues Alert for Grouped View */}
      {groupedPods.filter(g => g.hasIssues).length > 0 && (
        <Alert
          message={`${groupedPods.filter(g => g.hasIssues).length} pod group${groupedPods.filter(g => g.hasIssues).length > 1 ? 's' : ''} have issues`}
          description="Red highlighted groups have pod count mismatches or readiness issues"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Enhanced Control Panel */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
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
              <Text>Show Healthy:</Text>
              <Switch
                checked={showHealthyGroups}
                onChange={setShowHealthyGroups}
                size="small"
              />
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

          <Col xs={24} md={6}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Last updated: {new Date().toLocaleTimeString()}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Grouped Pod Table */}
      <Table
        columns={enhancedColumns}
        dataSource={pods}
        rowKey="key"  // Now using the key field we added
        loading={loading}
        expandable={{
          expandedRowKeys: expandedGroups,
          onExpand: (expanded, record) => {
            if (record.isGroup) {
              setExpandedGroups(prev => 
                expanded 
                  ? [...prev, record.key]
                  : prev.filter(key => key !== record.key)
              );
            }
          },
          expandRowByClick: true,
          childrenColumnName: 'children',
          indentSize: 0,
          rowExpandable: record => record.isGroup && record.children && record.children.length > 0
        }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => 
            `${range[0]}-${range[1]} of ${total} items`,
        }}
        rowClassName={(record) => {
          if (record.isGroup) return 'group-row';
          if (record.isDeleted) return 'deleted-pod-row';
          return '';
        }}
        scroll={{ x: 1200 }}
      />

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
<style dangerouslySetInnerHTML={{ __html: groupedTableStyles }} />
      {/* Custom CSS */}
      
    </div>
  );
};

export default EnhancedKubernetesMonitor;