import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import FilterForm from './components/FilterForm';
import InstanceTable from './components/InstanceTable';
import RolloutForm from './components/RolloutForm';
import Settings from './components/Settings';
import Contact from './components/Contact';
import Help from './components/Help';
import LogPage from './components/LogPanel';
import LoginPage from './components/LoginPage';
import { Alert, Button } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

interface Instance {
  uuid: string;
  deviceType: string;
  applicationType: string;
  status?: string;
  lastUpdated?: string;
}

interface Filters {
  uuid: string;
  device_type: string;
  application_type: string;
  status?: string;
  last_updated?: string;
}

const AppContent: React.FC = () => {
  const [filteredInstances, setFilteredInstances] = useState<Instance[]>([]);
  const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({
    uuid: '',
    device_type: '',
    application_type: '',
    status: undefined,
    last_updated: undefined,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState<boolean>(true); // Προστέθηκε loading state
  const navigate = useNavigate();

  useEffect(() => {
    const validateToken = async () => {
      setLoading(true); // Ξεκινάει το loading
      console.log('Token on load:', token); // Debug token presence
      if (token) {
        try {
          await axios.get('http://localhost:8000/api/validate-session', {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          });
          setIsAuthenticated(true);
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          if (window.location.pathname === '/login' || window.location.pathname === '/') {
            navigate('/home');
          }
          fetchInstances();
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
          setToken(null);
          setIsAuthenticated(false);
          if (window.location.pathname !== '/login') {
            navigate('/login');
          }
        }
      } else {
        setIsAuthenticated(false);
        if (window.location.pathname !== '/login') {
          navigate('/login');
        }
      }
      setLoading(false); // Σταματάει το loading μετά την επικύρωση
    };
    validateToken();
  }, [token, navigate]);

  const fetchInstances = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/akri-instances', {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const fetchedInstances = Array.isArray(response.data.instances)
        ? response.data.instances.map((item: any) => ({
            uuid: item.uuid || '',
            deviceType: item.deviceType || '',
            applicationType: item.applicationType || '',
            status: item.status || 'active',
            lastUpdated: item.lastUpdated || '',
          }))
        : [];
      setFilteredInstances(fetchedInstances);
      if (response.data.error) {
        setStatus(`Warning: ${response.data.error}`);
      } else {
        setStatus(fetchedInstances.length > 0 ? 'Instances loaded successfully' : 'No instances found');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken(null);
        setIsAuthenticated(false);
        navigate('/login');
      } else {
        setStatus(`Error fetching instances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      setFilteredInstances([]);
    }
  };

  const handleFilter = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/filter-instances', filters, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const filteredData = Array.isArray(response.data)
        ? response.data.map((item: any) => ({
            uuid: item.uuid || '',
            deviceType: item.deviceType || '',
            applicationType: item.applicationType || '',
            status: item.status || 'active',
            lastUpdated: item.lastUpdated || '',
          }))
        : [];
      setFilteredInstances(filteredData);
      setSelectedUuids([]);
      setStatus(filteredData.length > 0 ? 'Instances filtered successfully' : 'No instances matched the filters');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken(null);
        setIsAuthenticated(false);
        navigate('/login');
      } else {
        setStatus(`Error filtering instances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      setFilteredInstances([]);
    }
  };

  const handleSelectAll = () => {
    setSelectedUuids(filteredInstances.map(i => i.uuid));
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:8000/api/logout', {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      localStorage.removeItem('token');
      setToken(null);
      setIsAuthenticated(false);
      navigate('/login');
    } catch (error) {
      setStatus(`Error logging out: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return <div className="text-center p-5">Loading...</div>; // Προσωρινό loading screen
  }

  return (
    <div className="bg-dark text-light min-vh-100">
      <Routes>
        <Route
          path="/login"
          element={<LoginPage setIsAuthenticated={setIsAuthenticated} setToken={setToken} />}
        />
        <Route
          path="/"
          element={isAuthenticated ? <Navigate to="/home" /> : <Navigate to="/login" />}
        />
        <Route
          path="/home"
          element={
            isAuthenticated ? (
              <Header>
                <div className="container mt-4">
                  <h1 className="mb-4">Manage FlashJob Operator</h1>
                  {status && (
                    <Alert variant={status.includes("Error") ? "danger" : "success"} className="mt-3" dismissible onClose={() => setStatus(null)}>
                      {status}
                    </Alert>
                  )}
                  <Button variant="danger" onClick={handleLogout} className="mb-3">Logout</Button>
                  <FilterForm
                    filters={filters}
                    setFilters={setFilters}
                    onFilter={handleFilter}
                    onSelectAll={handleSelectAll}
                  />
                  <InstanceTable
                    instances={filteredInstances}
                    selectedUuids={selectedUuids}
                    setSelectedUuids={setSelectedUuids}
                  />
                  <RolloutForm
                    selectedUuids={selectedUuids}
                    setParentStatus={setStatus}
                  />
                </div>
              </Header>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/settings/*"
          element={isAuthenticated ? <Header><Settings /></Header> : <Navigate to="/login" />}
        />
        <Route
          path="/contact"
          element={isAuthenticated ? <Header><Contact /></Header> : <Navigate to="/login" />}
        />
        <Route
          path="/help"
          element={isAuthenticated ? <Header><Help /></Header> : <Navigate to="/login" />}
        />
        <Route
          path="/logs"
          element={isAuthenticated ? <Header><LogPage /></Header> : <Navigate to="/login" />}
        />
      </Routes>
    </div>
  );
};

const App: React.FC = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;