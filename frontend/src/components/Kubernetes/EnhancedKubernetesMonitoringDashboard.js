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
  Tabs
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
  const [healthSummary, setHealthSummary] = useState(null);
  const [detailedWorkloads, setDetailedWorkloads] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
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
  }, [autoRefresh, selectedNamespace, selectedSeverity]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const [healthResponse, workloadsResponse, analyticsResponse] = await Promise.allSettled([
        fetch('/api/kubernetes/monitoring/health-summary'),
        fetch(`/api/kubernetes/workloads/detailed?namespace=${selectedNamespace}&severity=${selectedSeverity}`),
        fetch('/api/kubernetes/monitoring/analytics')
      ]);

      if (healthResponse.status === 'fulfilled' && healthResponse.value.ok) {
        const healthData = await healthResponse.value.json();
        setHealthSummary(healthData.data);
      }

      if (workloadsResponse.status === 'fulfilled' && workloadsResponse.value.ok) {
        const workloadsData = await workloadsResponse.value.json();
        setDetailedWorkloads(workloadsData.data.workloads);
      }

      if (analyticsResponse.status === 'fulfilled' && analyticsResponse.value.ok) {
        const analyticsData = await analyticsResponse.value.json();
        setAnalytics(analyticsData.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerDetailedCheck = async () => {
    try {
      setLoading(true);
      await fetch('/api/kubernetes/monitoring/detailed-check', { method: 'POST' });
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to trigger detailed check:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (score) => {
    if (score >= 90) return '#52c41a';
    if (score >= 75) return '#faad14';
    if (score >= 50) return '#fa8c16';
    return '#f5222d';
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'success': 'success',
      'info': 'processing',
      'warning': 'warning',
      'critical': 'error'
    };
    return colors[severity] || 'default';
  };

  const workloadColumns = [
    {
      title: 'Workload',
      key: 'workload',
      render: (_, record) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClusterOutlined />
            <Text strong>{record.name}</Text>
            <Tag size="small" color="blue">{record.type}</Tag>
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
            percent={record.health.healthScore}
            strokeColor={getHealthColor(record.health.healthScore)}
            format={() => `${record.health.healthScore}%`}
          />
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Tag color={getSeverityColor(record.health.severity)}>
            {record.health.status.toUpperCase()}
          </Tag>
          <Text style={{ fontSize: '11px' }}>
            {record.readyReplicas}/{record.desiredReplicas} pods
          </Text>
        </Space>
      ),
    },
    {
      title: 'Stability',
      key: 'stability',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Tag color={record.analysis.stability === 'stable' ? 'green' : 
                     record.analysis.stability === 'moderate' ? 'orange' : 'red'}>
            {record.analysis.stability}
          </Tag>
          <Text style={{ fontSize: '11px' }}>
            Risk: {record.analysis.riskLevel}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Insights',
      key: 'insights',
      render: (_, record) => (
        <div>
          {record.analysis.insights.slice(0, 2).map((insight, index) => (
            <div key={index} style={{ fontSize: '11px', marginBottom: '2px' }}>
              {insight.length > 40 ? `${insight.substring(0, 40)}...` : insight}
            </div>
          ))}
          {record.analysis.insights.length > 2 && (
            <Text type="secondary" style={{ fontSize: '10px' }}>
              +{record.analysis.insights.length - 2} more
            </Text>
          )}
        </div>
      ),
    }
  ];

  if (!healthSummary) {
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
            onClick={triggerDetailedCheck}
            loading={loading}
          >
            Detailed Check
          </Button>
        </Space>
      </div>

      {/* Cluster Health Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Cluster Health"
              value={healthSummary.averageHealth}
              suffix="%"
              prefix={<HeartOutlined style={{ color: getHealthColor(healthSummary.averageHealth) }} />}
              valueStyle={{ color: getHealthColor(healthSummary.averageHealth) }}
            />
            <div style={{ marginTop: '8px' }}>
              <Tag color={healthSummary.clusterHealth === 'excellent' ? 'green' : 
                         healthSummary.clusterHealth === 'good' ? 'blue' : 
                         healthSummary.clusterHealth === 'fair' ? 'orange' : 'red'}>
                {healthSummary.clusterHealth?.toUpperCase()}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Workloads"
              value={healthSummary.total}
              prefix={<ClusterOutlined />}
            />
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              <Space>
                <Text type="success">✓ {healthSummary.healthy}</Text>
                <Text type="warning">⚠ {healthSummary.warning}</Text>
                <Text type="danger">✗ {healthSummary.critical}</Text>
              </Space>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Critical Issues"
              value={healthSummary.critical}
              prefix={<WarningOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: healthSummary.critical > 0 ? '#f5222d' : '#52c41a' }}
            />
            <div style={{ marginTop: '8px' }}>
              <Progress 
                percent={healthSummary.total > 0 ? Math.round((healthSummary.critical / healthSummary.total) * 100) : 0}
                strokeColor="#f5222d"
                size="small"
                showInfo={false}
              />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Last Updated"
              value={new Date(healthSummary.timestamp).toLocaleTimeString()}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              <Text type="secondary">Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Analytics Cards */}
      {analytics && (
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={8}>
            <Card title="🎯 Risk Analysis" size="small">
              <Row gutter={8}>
                <Col span={8}>
                  <Statistic 
                    title="High Risk" 
                    value={analytics.riskAnalysis.highRisk}
                    valueStyle={{ color: '#f5222d', fontSize: '18px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="Medium Risk" 
                    value={analytics.riskAnalysis.mediumRisk}
                    valueStyle={{ color: '#fa8c16', fontSize: '18px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="Low Risk" 
                    value={analytics.riskAnalysis.lowRisk}
                    valueStyle={{ color: '#52c41a', fontSize: '18px' }}
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Text style={{ fontSize: '12px' }}>
                <WarningOutlined style={{ color: '#fa8c16' }} /> {analytics.riskAnalysis.singlePointsOfFailure} single points of failure
              </Text>
            </Card>
          </Col>
          <Col span={8}>
            <Card title="🔄 Stability Analysis" size="small">
              <Row gutter={8}>
                <Col span={8}>
                  <Statistic 
                    title="Stable" 
                    value={analytics.stabilityAnalysis.stable}
                    valueStyle={{ color: '#52c41a', fontSize: '18px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="Moderate" 
                    value={analytics.stabilityAnalysis.moderate}
                    valueStyle={{ color: '#fa8c16', fontSize: '18px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="Unstable" 
                    value={analytics.stabilityAnalysis.unstable}
                    valueStyle={{ color: '#f5222d', fontSize: '18px' }}
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Text style={{ fontSize: '12px' }}>
                <BugOutlined style={{ color: '#f5222d' }} /> {analytics.stabilityAnalysis.totalRestarts} total restarts
              </Text>
            </Card>
          </Col>
          <Col span={8}>
            <Card title="📊 Scaling Status" size="small">
              <Row gutter={8}>
                <Col span={8}>
                  <Statistic 
                    title="Scaling Up" 
                    value={analytics.scalingAnalysis.scalingUp}
                    valueStyle={{ color: '#1890ff', fontSize: '18px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="Scaling Down" 
                    value={analytics.scalingAnalysis.scalingDown}
                    valueStyle={{ color: '#fa8c16', fontSize: '18px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="Static" 
                    value={analytics.scalingAnalysis.static}
                    valueStyle={{ color: '#52c41a', fontSize: '18px' }}
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Text style={{ fontSize: '12px' }}>
                {analytics.scalingAnalysis.totalActualPods}/{analytics.scalingAnalysis.totalDesiredPods} pods
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      {/* Workloads Table */}
      <Card 
        title="Workload Details"
        extra={
          <Space>
            <Select
              value={selectedNamespace}
              onChange={setSelectedNamespace}
              style={{ width: 150 }}
              size="small"
            >
              <Option value="all">All Namespaces</Option>
              {/* Add namespace options dynamically */}
            </Select>
            <Select
              value={selectedSeverity}
              onChange={setSelectedSeverity}
              style={{ width: 120 }}
              size="small"
            >
              <Option value="all">All Severities</Option>
              <Option value="critical">Critical</Option>
              <Option value="warning">Warning</Option>
              <Option value="success">Healthy</Option>
            </Select>
          </Space>
        }
      >
        <Table
          columns={workloadColumns}
          dataSource={detailedWorkloads}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey={record => `${record.namespace}/${record.name}`}
          size="small"
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: '16px', backgroundColor: '#fafafa' }}>
                <Tabs size="small">
                  <TabPane tab="Pod Details" key="pods">
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <div>
                          <Text strong>Pod Distribution:</Text>
                          <div style={{ marginTop: '8px' }}>
                            {record.pods.map((pod, index) => (
                              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <Text style={{ fontSize: '12px' }}>{pod.name}</Text>
                                <Space size="small">
                                  <Tag 
                                    size="small" 
                                    color={pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'orange' : 'red'}
                                  >
                                    {pod.status}
                                  </Tag>
                                  {pod.restarts > 0 && (
                                    <Tag size="small" color="volcano">
                                      {pod.restarts} restarts
                                    </Tag>
                                  )}
                                </Space>
                              </div>
                            ))}
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div>
                          <Text strong>Node Distribution:</Text>
                          <div style={{ marginTop: '8px' }}>
                            {Array.from(record.nodeDistribution.entries()).map(([node, count], index) => (
                              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <Text style={{ fontSize: '12px' }}>{node}</Text>
                                <Badge count={count} size="small" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </TabPane>
                  <TabPane tab="Health Metrics" key="health">
                    <Row gutter={[16, 16]}>
                      <Col span={8}>
                        <Card size="small">
                          <Statistic
                            title="Ready Pods"
                            value={record.health.metrics.readyPercentage}
                            suffix="%"
                            valueStyle={{ fontSize: '18px' }}
                          />
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            {record.health.metrics.readyPods}/{record.health.metrics.totalPods}
                          </div>
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small">
                          <Statistic
                            title="Running Pods"
                            value={record.health.metrics.runningPods}
                            valueStyle={{ fontSize: '18px' }}
                          />
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            Active containers
                          </div>
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small">
                          <Statistic
                            title="Issues"
                            value={record.health.metrics.crashLoopPods + record.health.metrics.failedPods}
                            valueStyle={{ fontSize: '18px', color: '#f5222d' }}
                          />
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            Crash loops + Failed
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  </TabPane>
                  <TabPane tab="Analysis" key="analysis">
                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <div>
                          <Text strong>Stability Assessment:</Text>
                          <div style={{ marginTop: '8px' }}>
                            <Tag color={record.analysis.stability === 'stable' ? 'green' : 
                                       record.analysis.stability === 'moderate' ? 'orange' : 'red'}>
                              {record.analysis.stability.toUpperCase()}
                            </Tag>
                            <div style={{ marginTop: '8px' }}>
                              <Text strong>Risk Level: </Text>
                              <Tag color={record.analysis.riskLevel === 'low' ? 'green' : 
                                         record.analysis.riskLevel === 'medium' ? 'orange' : 'red'}>
                                {record.analysis.riskLevel.toUpperCase()}
                              </Tag>
                            </div>
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div>
                          <Text strong>Insights:</Text>
                          <div style={{ marginTop: '8px' }}>
                            {record.analysis.insights.length > 0 ? (
                              <Timeline size="small">
                                {record.analysis.insights.map((insight, index) => (
                                  <Timeline.Item key={index}>
                                    <Text style={{ fontSize: '12px' }}>{insight}</Text>
                                  </Timeline.Item>
                                ))}
                              </Timeline>
                            ) : (
                              <Text type="secondary" style={{ fontSize: '12px' }}>No specific insights available</Text>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </TabPane>
                  {record.resourceIssues.length > 0 && (
                    <TabPane tab="Resource Issues" key="resources">
                      <Alert
                        message="Resource Issues Detected"
                        description={
                          <div>
                            {record.resourceIssues.map((issue, index) => (
                              <div key={index} style={{ marginBottom: '8px' }}>
                                <Text strong>{issue.pod}:</Text>
                                <ul style={{ marginLeft: '16px', marginBottom: '4px' }}>
                                  {issue.issues.map((detail, detailIndex) => (
                                    <li key={detailIndex} style={{ fontSize: '12px' }}>{detail}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        }
                        type="warning"
                        showIcon
                      />
                    </TabPane>
                  )}
                </Tabs>
              </div>
            ),
            rowExpandable: () => true,
          }}
        />
      </Card>

      {/* Namespace Summary */}
      {analytics && analytics.namespaceAnalysis && (
        <Card title="📁 Namespace Summary" style={{ marginTop: '24px' }}>
          <Row gutter={[16, 16]}>
            {Object.entries(analytics.namespaceAnalysis).map(([namespace, data]) => (
              <Col span={6} key={namespace}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <Text strong>{namespace}</Text>
                  </div>
                  <Progress
                    type="circle"
                    size={60}
                    percent={data.averageHealth}
                    strokeColor={getHealthColor(data.averageHealth)}
                    format={() => `${data.averageHealth}%`}
                  />
                  <div style={{ marginTop: '8px', fontSize: '12px' }}>
                    <Space>
                      <Text type="success">✓ {data.healthy}</Text>
                      <Text type="warning">⚠ {data.warning}</Text>
                      <Text type="danger">✗ {data.critical}</Text>
                    </Space>
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    {data.totalPods} pods total
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Quick Actions */}
      <Card title="🚀 Quick Actions" style={{ marginTop: '24px' }}>
        <Space wrap>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => window.location.reload()}
          >
            Reset Monitoring
          </Button>
          <Button 
            icon={<BarChartOutlined />} 
            onClick={() => window.open('/api/kubernetes/monitoring/health-report', '_blank')}
          >
            Download Report
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
          message="🔍 Enhanced Monitoring Active"
          description={
            <div>
              <p>This dashboard provides database-style detailed monitoring for your Kubernetes cluster:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '0' }}>
                <li><strong>Health Scoring:</strong> 0-100% health score for each workload</li>
                <li><strong>Trend Analysis:</strong> Historical health patterns and volatility</li>
                <li><strong>Risk Assessment:</strong> Single points of failure and stability issues</li>
                <li><strong>Resource Monitoring:</strong> OOMKilled, crash loops, and resource constraints</li>
                <li><strong>Smart Alerting:</strong> Batch alerts with detailed context and recommendations</li>
              </ul>
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