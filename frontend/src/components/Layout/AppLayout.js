import React, { useState, useEffect  } from 'react';
import { Layout } from 'antd';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import Dashboard from '../Dashboard/Dashboard';
import DatabaseStatus from '../Dashboard/DatabaseStatus';
import RealtimeDashboard from '../Dashboard/RealtimeDashboard';
import EnhancedDowntimeTable from '../Dashboard/EnhancedDowntimeTable';
import DatabaseConfig from '../Database/DatabaseConfig';
import EmailManagement from '../Email/EmailManagement';
import UserManagement from '../Users/UserManagement';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import SystemMetrics from '../System/SystemMetrics';
import KubernetesMonitor from '../Kubernetes/KubernetesMonitor';
import UrlMonitoring from '../Urls/UrlMonitoring';
import KubernetesConfig from '../Kubernetes/KubernetesConfig';
import { useMode } from '../../contexts/ModeContext'; 
import DbSizeThreshold from '../Thresholds/DbSizeThreshold';
import SimpleScriptManager from '../Scripts/SimpleScriptManager';

const { Content, Footer } = Layout;

const AppLayout = () => {
  const [currentPage, setCurrentPage] = useState('url-monitoring'); // DEFAULT TO URL MONITORING FOR CLIENT MODE
  const { isAdmin } = useAuth();
  const { isDarkMode } = useTheme();  
  const { isServerMode, loading: modeLoading } = useMode();

  useEffect(() => {
    if (!modeLoading && !isServerMode) {
      // CLIENT MODE: Only URL monitoring allowed
      const allowedPages = ['url-monitoring'];
      
      // Add admin-only pages if user is admin
      if (isAdmin) {
        allowedPages.push('email-config', 'users', 'kubernetes-config');
      }
      
      if (!allowedPages.includes(currentPage)) {
        setCurrentPage('url-monitoring');
      }
    }
    
    // SET DEFAULT PAGE BASED ON MODE
    if (!modeLoading && isServerMode && currentPage === 'url-monitoring') {
      setCurrentPage('realtime-dashboard'); // Switch to realtime dashboard in server mode
    }
  }, [isServerMode, modeLoading, isAdmin, currentPage]);

  const renderContent = () => {
    if (modeLoading) {
      return <div>Loading...</div>;
    }

    // CLIENT MODE ROUTING - Minimal options
    if (!isServerMode) {
      switch (currentPage) {
        case 'url-monitoring':
          return <UrlMonitoring />;
        case 'kubernetes-config':
          return isAdmin ? <KubernetesConfig /> : <UrlMonitoring />;
        case 'email-config':
          return isAdmin ? <EmailManagement /> : <UrlMonitoring />;
        case 'users':
          return isAdmin ? <UserManagement /> : <UrlMonitoring />;
        default:
          return <UrlMonitoring />;
      }
    }
    
    // SERVER MODE ROUTING - Full options
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'realtime-dashboard':
        return <RealtimeDashboard />;
      case 'database':
        return <DatabaseStatus />;
      case 'downtime-logs':
        return <EnhancedDowntimeTable />;
      case 'database-config':
        return isAdmin ? <DatabaseConfig /> : <RealtimeDashboard />;
      case 'email-config':
         return isAdmin ? <EmailManagement /> : <RealtimeDashboard />;
      case 'users':
        return isAdmin ? <UserManagement /> : <RealtimeDashboard />;
      case 'system-metrics':
        return <SystemMetrics />;
      case 'kubernetes':
        return <KubernetesMonitor />;
      case 'url-monitoring':
        return <UrlMonitoring />;      
      case 'kubernetes-config':
        return isAdmin ? <KubernetesConfig /> : <RealtimeDashboard />;
      case 'threshold-config':
        return isAdmin ? <DbSizeThreshold /> : <RealtimeDashboard />;
      case 'script-manager':
        return <SimpleScriptManager />;
      default:
        return <RealtimeDashboard />;
    }
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'realtime-dashboard':
        return 'Real-time Monitoring';
      case 'database':
        return 'Database Status';
      case 'downtime-logs':
        return 'Downtime Logs';
      case 'database-config':
        return 'Database Configuration';
      case 'email-config':
        return 'Email Configuration';
      case 'users':
        return 'User Management';
      case 'system-metrics':
        return 'System Performance';  
      case 'kubernetes':
        return 'Kubernetes Monitoring';
      case 'url-monitoring':
        return 'URL Monitoring';      
      case 'kubernetes-config':
        return 'Kubernetes Configuration';
      case 'script-manager':
        return 'Cluster & DB Control';
      case 'threshold-config':
        return 'Alert Thresholds';
      default:
        return isServerMode ? 'Real-time Monitoring' : 'URL Monitoring';
    }
  };

  const layoutStyle = {
    minHeight: '100vh',
    background: isDarkMode ? '#141414' : '#f0f2f5'
  };

  const contentStyle = {
    margin: '24px',
    background: isDarkMode ? '#141414' : '#f0f2f5'
  };

  return (
    <Layout style={layoutStyle}>
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      
      <Layout>
        <AppHeader title={getPageTitle()} />
        
        <Content style={contentStyle}>
          {renderContent()}
        </Content>
        <Layout.Footer style={{
          textAlign: 'center',
          background: isDarkMode ? '#141414' : '#f0f2f5',
          color: isDarkMode ? '#8c8c8c' : '#666',
          borderTop: isDarkMode ? '1px solid #303030' : '1px solid #e8e8e8',
          padding: '12px 24px'
          }}>
          © 2025 Tsunami Solutions. All rights reserved. | Uptime WatchDog v1.0
        </Layout.Footer>          
      </Layout>      
    </Layout>
  );
};

export default AppLayout;