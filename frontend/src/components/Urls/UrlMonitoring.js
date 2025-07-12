import React, { useState, useEffect } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Table, 
  Button, 
  Space, 
  Tag, 
  Typography, 
  message,
  Popconfirm,
  Switch,
  Statistic,
  Tooltip
} from 'antd';
import { 
  LinkOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { urlAPI } from '../../services/api';
import UrlModal from './UrlModal';

const { Title, Text } = Typography;

const UrlMonitoring = () => {
  const [urls, setUrls] = useState([]);
  const [urlStatuses, setUrlStatuses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUrl, setEditingUrl] = useState(null);

  useEffect(() => {
    loadInitialData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadUrlStatuses();
      loadStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadUrls(),
        loadUrlStatuses(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUrls = async () => {
    try {
      const response = await urlAPI.getAllUrls();
      if (response.success) {
        setUrls(response.data);
      }
    } catch (error) {
      console.error('Failed to load URLs:', error);
      message.error('Failed to load URLs');
    }
  };

  const loadUrlStatuses = async () => {
    try {
      const response = await urlAPI.getUrlStatuses();
      if (response.success) {
        setUrlStatuses(response.data);
      }
    } catch (error) {
      console.error('Failed to load URL statuses:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await urlAPI.getUrlStats();
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleAddUrl = () => {
    setEditingUrl(null);
    setModalVisible(true);
  };

  const handleEditUrl = (url) => {
    setEditingUrl(url);
    setModalVisible(true);
  };

  const handleDeleteUrl = async (urlId) => {
    try {
      const response = await urlAPI.deleteUrl(urlId);
      if (response.success) {
        message.success('URL deleted successfully');
        loadInitialData();
      }
    } catch (error) {
      message.error('Failed to delete URL');
    }
  };

  const handleToggleUrl = async (urlId, enabled) => {
    try {
      const response = await urlAPI.updateUrl(urlId, { enabled });
      if (response.success) {
        message.success(`URL ${enabled ? 'enabled' : 'disabled'} successfully`);
        loadUrls();
      }
    } catch (error) {
      message.error('Failed to update URL status');
    }
  };

  const handleCheckUrl = async (urlId) => {
    try {
      setLoading(true);
      const response = await urlAPI.checkUrl(urlId);
      if (response.success) {
        message.success('URL checked successfully');
        loadUrlStatuses();
      }
    } catch (error) {
      message.error('Failed to check URL');
    } finally {
      setLoading(false);
    }
  };

  const getUrlStatus = (urlId) => {
    return urlStatuses.find(status => status.urlId === urlId);
  };

  const getStatusColor = (isUp) => {
    return isUp ? 'success' : 'error';
  };

  const columns = [
    {
      title: 'URL Details',
      key: 'details',
      render: (_, record) => {
        const status = getUrlStatus(record.id);
        return (
          <Space direction="vertical" size="small">
            <div>
              <Text strong>{record.name}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                <LinkOutlined /> {record.url}
              </Text>
            </div>
            {status && (
              <Tag 
                color={getStatusColor(status.isUp)}
                icon={status.isUp ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
              >
                {status.isUp ? 'UP' : 'DOWN'}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      render: (method) => <Tag color="blue">{method}</Tag>,
    },
    {
      title: 'Response Time',
      key: 'responseTime',
      render: (_, record) => {
        const status = getUrlStatus(record.id);
        if (!status) return <Text type="secondary">-</Text>;
        
        const color = status.responseTime < 1000 ? 'green' : 
                     status.responseTime < 3000 ? 'orange' : 'red';
        
        return (
          <Tag color={color}>
            <ClockCircleOutlined /> {status.responseTime}ms
          </Tag>
        );
      },
    },
    {
      title: 'Status Code',
      key: 'statusCode',
      render: (_, record) => {
        const status = getUrlStatus(record.id);
        if (!status) return <Text type="secondary">-</Text>;
        
        const color = status.status >= 200 && status.status < 300 ? 'green' :
                     status.status >= 400 ? 'red' : 'orange';
        
        return <Tag color={color}>{status.status || 'Error'}</Tag>;
      },
    },
    {
      title: 'Interval',
      dataIndex: 'interval',
      key: 'interval',
      render: (interval) => `${interval}s`,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled, record) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggleUrl(record.id, checked)}
          checkedChildren="ON"
          unCheckedChildren="OFF"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => handleCheckUrl(record.id)}
            size="small"
            title="Check Now"
          />
          <Button 
            icon={<EditOutlined />} 
            onClick={() => handleEditUrl(record)}
            size="small"
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this URL?"
            description="This will stop monitoring and remove the URL."
            onConfirm={() => handleDeleteUrl(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Button 
              icon={<DeleteOutlined />} 
              danger 
              size="small"
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total URLs"
              value={stats?.totalUrls || 0}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="URLs Up"
              value={stats?.upUrls || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="URLs Down"
              value={stats?.downUrls || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Monitoring"
              value={stats?.monitoringActive || 0}
              suffix={`/ ${stats?.enabledUrls || 0}`}
              prefix={<LinkOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* URL Table */}
      <Card
        title={
          <Space>
            <LinkOutlined />
            URL Monitoring
            {stats?.lastUpdated && (
              <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'normal' }}>
                (Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()})
              </Text>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadInitialData}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddUrl}
            >
              Add URL
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={urls}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
          locale={{
            emptyText: 'No URLs configured for monitoring'
          }}
        />
      </Card>

      <UrlModal
        visible={modalVisible}
        editingUrl={editingUrl}
        onClose={() => setModalVisible(false)}
        onSaved={() => {
          setModalVisible(false);
          loadInitialData();
        }}
      />
    </div>
  );
};

export default UrlMonitoring;