import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Progress, 
  Table, 
  Tag, 
  Button, 
  Space, 
  Alert, 
  Typography,
  Tooltip,
  Badge,
  Divider,
  Select,
  Spin,
  Timeline,
  Tabs,
  message
} from 'antd';
import { 
  HeartOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  ReloadOutlined,
  BarChartOutlined,
  BugOutlined,
  TrophyOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const EnhancedKubernetesMonitoringDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [pods, setPods] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [monitoringStatus, setMonitoringStatus] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadDashboardData();
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedNamespace]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Use existing API endpoints
      const [podsResponse, namespacesResponse, monitoringResponse] = await Promise.allSettled([
        fetch(`/api/kubernetes/pods/enhanced?namespace=${selectedNamespace}`),
        fetch('/api/kubernetes/namespaces'),
        fetch('/api/kubernetes/monitoring/status')
      ]);

      if (podsResponse.status === 'fulfilled' && podsResponse.value.ok) {
        const podsData = await podsResponse.value.json();
        if (podsData.success) {
          setPods(podsData.data.pods || []);
          setStatistics(podsData.data.statistics || {});
        }
      }

      if (namespacesResponse.status === 'fulfilled' && namespacesResponse.value.ok) {
        const namespacesData = await namespacesResponse.value.json();
        if (namespacesData.success) {
          setNamespaces(namespacesData.data || []);
        }
      }

      if (monitoringResponse.status === 'fulfilled' && monitoringResponse.value.ok) {
        const monitoringData = await monitoringResponse.value.json();
        if (monitoringData.success) {
          setMonitoringStatus(monitoringData.status || {});
        }
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      message.error('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  const triggerManualCheck = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/kubernetes/monitoring/force-check', { method: 'POST' });
      if (response.ok) {
        message.success('Manual health check completed');
        await loadDashboardData();
      } else {
        message.error('Manual check failed');
      }
    } catch (error) {
      console.error('Failed to trigger manual check:', error);
      message.error('Manual check failed');
    } finally {
      setLoading(false);
    }
  };

  // Calculate enhanced metrics from existing pod data
  const calculateEnhancedMetrics = () => {
    if (!pods.length) return null;

    const total = pods.length;
    const running = pods.filter(p => p.status === 'Running').length;
    const pending = pods.filter(p => p.status === 'Pending').length;
    const failed = pods.filter(p => p.status === 'Failed').length;
    const ready = pods.filter(p => p.ready).length;
    
    // Calculate health score based on multiple factors
    const runningScore = (running / total) * 40;
    const readyScore = (ready / total) * 40;
    const failureScore = Math.max(0, 20 - (failed / total) * 100);
    const healthScore = Math.round(runningScore + readyScore + failureScore);

    // Determine overall status
    let overallStatus = 'healthy';
    let severity = 'success';
    
    if (failed > 0 || ready < total * 0.5) {
      overallStatus = 'critical';
      severity = 'error';
    } else if (pending > 0 || ready < total * 0.8) {
      overallStatus = 'warning';
      severity = 'warning';
    }

    return {
      total,
      running,
      pending,
      failed,
      ready,
      healthScore,
      overallStatus,
      severity,
      readyPercentage: Math.round((ready / total) * 100)
    };
  };

  // Group pods by workload (simplified version)
  const groupPodsByWorkload = () => {
    const workloadMap = new Map();

    pods.forEach(pod => {
      // Extract workload name (remove last 2 parts of pod name)
      const parts = pod.name.split('-');
      const workloadName = parts.length >= 3 ? parts.slice(0, -2).join('-') : pod.name;
      const key = `${pod.namespace}/${workloadName}`;

      if (!workloadMap.has(key)) {
        workloadMap.set(key, {
          name: workloadName,
          namespace: pod.namespace,
          pods: [],
          readyPods: 0,
          totalPods: 0
        });
      }

      const workload = workloadMap.get(key);
      workload.pods.push(pod);
      workload.totalPods++;
      if (pod.ready && pod.status === 'Running') {
        workload.readyPods++;
      }
    });

    return Array.from(workloadMap.values()).map(workload => ({
      ...workload,
      healthScore: workload.totalPods > 0 ? Math.round((workload.readyPods / workload.totalPods) * 100) : 0,
      status: workload.readyPods === workload.totalPods ? 'healthy' : 
              workload.readyPods === 0 ? 'critical' : 'warning'
    }));
  };

  const getHealthColor = (score) => {
    if (score >= 90) return '#52c41a';
    if (score >= 75) return '#faad14';
    if (score >= 50) return '#fa8c16';
    return '#f5222d';
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'healthy': 'success',
      'warning': 'warning',  
      'critical': 'error'
    };
    return colors[severity] || 'default';
  };

  const enhancedMetrics = calculateEnhancedMetrics();
  const workloads = groupPodsByWorkload();

  // Group pods by namespace for namespace analysis
  const namespaceAnalysis = namespaces.map(ns => {
    const nsPods = pods.filter(p => p.namespace === ns.name);
    const nsReady = nsPods.filter(p => p.ready && p.status === 'Running').length;
    const nsTotal = nsPods.length;
    const nsHealth = nsTotal > 0 ? Math.round((nsReady / nsTotal) * 100) : 100;
    
    return {
      namespace: ns.name,
      total: nsTotal,
      ready: nsReady,
      health: nsHealth,
      status: nsHealth >= 90 ? 'healthy' : nsHealth >= 70 ? 'warning' : 'critical'
    };
  });

  const workloadColumns = [
    {
      title: 'Workload',
      key: 'workload',
      render: (_, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClusterOutlined />
            <Text strong>{record.name}</Text>
            <Tag size="small" color="blue">Deployment</Tag>
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>{record.namespace}</Text>
        </div>
      ),
    },
    {
      title: 'Health Score',
      key: 'health',
      width: 120,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Progress
            type="circle"
            size={40}
            percent={record.healthScore}
            strokeColor={getHealthColor(record.healthScore)}
            format={() => `${record.healthScore}%`}
          />
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Tag color={getSeverityColor(record.status)}>
            {record.status.toUpperCase()}
          </Tag>
          <Text style={{ fontSize: '11px' }}>
            {record.readyPods}/{record.totalPods} pods
          </Text>
        </Space>
      ),
    },
    {
      title: 'Pod Details',
      key: 'pods',
      render: (_, record) => (
        <div>
          {record.pods.slice(0, 3).map((pod, index) => (
            <div key={index} style={{ fontSize: '11px', marginBottom: '2px' }}>
              <Space size="small">
                <Text>{pod.name.length > 20 ? `${pod.name.substring(0, 20)}...` : pod.name}</Text>
                <Tag size="small" color={pod.status === 'Running' ? 'green' : 'orange'}>
                  {pod.status}
                </Tag>
              </Space>
            </div>
          ))}
          {record.pods.length > 3 && (
            <Text type="secondary" style={{ fontSize: '10px' }}>
              +{record.pods.length - 3} more pods
            </Text>
          )}
        </div>
      ),
    }
  ];

  if (!enhancedMetrics) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>Loading Kubernetes monitoring data...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            ☸️ Enhanced Kubernetes Monitoring
          </Title>
          <Text type="secondary">Database-style detailed monitoring and analytics</Text>
        </div>
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadDashboardData}
            loading={loading}
          >
            Refresh
          </Button>
          <Button 
            type="primary"
            icon={<ThunderboltOutlined />} 
            onClick={triggerManualCheck}
            loading={loading}
          >
            Manual Check
          </Button>
        </Space>
      </div>

      {/* Cluster Health Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Cluster Health"
              value={enhancedMetrics.healthScore}
              suffix="%"
              prefix={<HeartOutlined style={{ color: getHealthColor(enhancedMetrics.healthScore) }} />}
              valueStyle={{ color: getHealthColor(enhancedMetrics.healthScore) }}
            />
            <div style={{ marginTop: '8px' }}>
              <Tag color={getSeverityColor(enhancedMetrics.overallStatus)}>
                {enhancedMetrics.overallStatus.toUpperCase()}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Pods"
              value={enhancedMetrics.total}
              prefix={<ClusterOutlined />}
            />
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              <Space>
                <Text type="success">✓ {enhancedMetrics.running}</Text>
                <Text type="warning">⚠ {enhancedMetrics.pending}</Text>
                <Text type="danger">✗ {enhancedMetrics.failed}</Text>
              </Space>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Ready Pods"
              value={enhancedMetrics.readyPercentage}
              suffix="%"
              prefix={<CheckCircleOutlined style={{ color: enhancedMetrics.ready === enhancedMetrics.total ? '#52c41a' : '#fa8c16' }} />}
              valueStyle={{ color: enhancedMetrics.ready === enhancedMetrics.total ? '#52c41a' : '#fa8c16' }}
            />
            <div style={{ marginTop: '8px' }}>
              <Progress 
                percent={enhancedMetrics.readyPercentage}
                size="small"
                showInfo={false}
              />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Issues"
              value={enhancedMetrics.failed + enhancedMetrics.pending}
              prefix={<WarningOutlined style={{ color: enhancedMetrics.failed > 0 ? '#f5222d' : '#52c41a' }} />}
              valueStyle={{ color: enhancedMetrics.failed > 0 ? '#f5222d' : '#52c41a' }}
            />
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              <Text type="secondary">Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Monitoring Status */}
      {monitoringStatus && (
        <Alert
          message={`Kubernetes Monitoring: ${monitoringStatus.isMonitoring ? 'ACTIVE' : 'INACTIVE'}`}
          description={
            <div>
              <Text>Workloads tracked: {monitoringStatus.workloadCount || 0} | </Text>
              <Text>Nodes: {monitoringStatus.nodeCount || 0} | </Text>
              <Text>Last check: {monitoringStatus.lastCheck ? new Date(monitoringStatus.lastCheck).toLocaleTimeString() : 'Never'}</Text>
            </div>
          }
          type={monitoringStatus.isMonitoring ? 'info' : 'warning'}
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}

      {/* Workloads Table */}
      <Card 
        title={`Workload Analysis (${workloads.length} workloads detected)`}
        extra={
          <Space>
            <Select
              value={selectedNamespace}
              onChange={setSelectedNamespace}
              style={{ width: 150 }}
              size="small"
            >
              <Option value="all">All Namespaces</Option>
              {namespaces.map(ns => (
                <Option key={ns.name} value={ns.name}>{ns.name}</Option>
              ))}
            </Select>
          </Space>
        }
      >
        <Table
          columns={workloadColumns}
          dataSource={workloads}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey={record => `${record.namespace}/${record.name}`}
          size="small"
        />
      </Card>

      {/* Namespace Summary */}
      <Card title="📁 Namespace Health Summary" style={{ marginTop: '24px' }}>
        <Row gutter={[16, 16]}>
          {namespaceAnalysis.map((ns) => (
            <Col span={6} key={ns.namespace}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '8px' }}>
                  <Text strong>{ns.namespace}</Text>
                </div>
                <Progress
                  type="circle"
                  size={60}
                  percent={ns.health}
                  strokeColor={getHealthColor(ns.health)}
                  format={() => `${ns.health}%`}
                />
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                  <Space>
                    <Text type="success">✓ {ns.ready}</Text>
                    <Text>/ {ns.total} pods</Text>
                  </Space>
                </div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  <Tag size="small" color={getSeverityColor(ns.status)}>
                    {ns.status}
                  </Tag>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Quick Actions */}
      <Card title="🚀 Quick Actions" style={{ marginTop: '24px' }}>
        <Space wrap>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => {
              fetch('/api/kubernetes/monitoring/reset', { method: 'POST' })
                .then(() => message.success('Monitoring state reset'))
                .catch(() => message.error('Reset failed'));
            }}
          >
            Reset Monitoring
          </Button>
          <Button 
            icon={<BarChartOutlined />} 
            onClick={loadDashboardData}
          >
            Generate Report
          </Button>
          <Button 
            icon={<TrophyOutlined />} 
            type={autoRefresh ? 'primary' : 'default'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </Button>
        </Space>
        
        <Divider />
        
        <Alert
          message="🔍 Enhanced Monitoring (Compatibility Mode)"
          description={
            <div>
              <p>This dashboard works with your existing Kubernetes APIs and provides:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '0' }}>
                <li><strong>Health Scoring:</strong> Calculated from pod readiness and status</li>
                <li><strong>Workload Grouping:</strong> Pods grouped by deployment name</li>
                <li><strong>Namespace Analysis:</strong> Health summary per namespace</li>
                <li><strong>Real-time Monitoring:</strong> Auto-refresh with current data</li>
                <li><strong>Quick Actions:</strong> Manual checks and monitoring controls</li>
              </ul>
              <p style={{ marginTop: '8px', marginBottom: '0' }}>
                <Text type="secondary">
                  💡 To unlock full enhanced features, add the new API endpoints to your backend.
                </Text>
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginTop: '16px' }}
        />
      </Card>
    </div>
  );
};

export default EnhancedKubernetesMonitoringDashboard;