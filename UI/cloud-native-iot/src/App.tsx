import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import FilterForm from './components/FilterForm';
import InstanceTable from './components/InstanceTable';
import RolloutForm from './components/RolloutForm';
import Settings from './components/Settings';
import Contact from './components/Contact';
import Help from './components/Help';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { Alert } from 'react-bootstrap';
import LogPage from './components/LogPanel';
import CertRequired from './components/CertRequired';

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
  const [filteredInstances, setFilteredInstances] = React.useState<Instance[]>([]);
  const [selectedUuids, setSelectedUuids] = React.useState<string[]>([]);
  const [filters, setFilters] = React.useState<Filters>({
    uuid: '',
    device_type: '',
    application_type: '',
    status: undefined,
    last_updated: undefined
  });
  const [status, setStatus] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const [hasCert, setHasCert] = useState<boolean | null>(null);

   useEffect(() => {
    const checkCertificate = async () => {
      try {
        const response = await axios.get('http://localhost:8000/check-cert', {
          withCredentials: true, // Important for cookies
        });
        
        setHasCert(response.data.has_cert);
        
        if (response.data.has_cert) {
          // Load instances only if certificate exists
          axios.get('http://localhost:8000/akri-instances', { withCredentials: true })
            .then(response => {
              const fetchedInstances = response.data.instances.map((item: any) => ({
                uuid: item.metadata.uid,
                deviceType: item.spec.brokerProperties?.DEVICE || 'Unknown Device Type',
                applicationType: item.spec.brokerProperties?.APPLICATION_TYPE || 'Unknown Application Type',
                status: 'active',
                lastUpdated: item.metadata.creationTimestamp
              }));
              setFilteredInstances(fetchedInstances);
            })
            .catch(error => setStatus(`Error fetching instances: ${error.message}`));
        } else {
          navigate('/cert-required');
        }
      } catch (error) {
        navigate('/cert-required');
      }
    };
    
    checkCertificate();
  }, [navigate]);

  const handleFilter = () => {
    axios.post('http://localhost:8000/filter-instances', filters)
      .then(response => {
        setFilteredInstances(response.data);
        setSelectedUuids([]);
        setStatus('Instances filtered successfully');
      })
      .catch(error => setStatus(`Error filtering instances: ${error.message}`));
  };

  const handleSelectAll = () => {
    setSelectedUuids(filteredInstances.map(i => i.uuid));
  };

  return (
    <div className="bg-dark text-light min-vh-100">
      <Header>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/home" />}
          />
          <Route
  path="/home"
  element={
    hasCert === null ? (
      <div className="text-center mt-5">Checking certificate...</div>
    ) : hasCert ? (
      <div className="container mt-4">
        <h1 className="mb-4">Manage FlashJob Operator</h1>
        {status && (
          <Alert variant={status.includes("Error") ? "danger" : "success"} className="mt-3" dismissible onClose={() => setStatus(null)}>
            {status}
          </Alert>
        )}
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
    ) : (
      <Navigate to="/cert-required" />
    )
  }
/>
          <Route path="/cert-required" element={<CertRequired />} />
          <Route path="/settings/general" element={<Settings />} />
          <Route path="/settings/api" element={<Settings />} />
          <Route path="/settings/security" element={<Settings />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/help" element={<Help />} />
          <Route path="/logs" element={<LogPage />} />
        </Routes>
      </Header>
    </div>
  );
};

const App: React.FC = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;