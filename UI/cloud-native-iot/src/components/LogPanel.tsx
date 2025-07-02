import React, { useState, useEffect } from 'react';
import { ListGroup, Spinner, Form, Button, Tab, Tabs } from 'react-bootstrap';

const LogPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [fileLogs, setFileLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  useEffect(() => {
    fetchLogs();
    fetchFileLogs();
  }, []);

  const fetchLogs = async (applyFilters = false) => {
    setLoading(true);
    setError(null);
    try {
      let url = 'http://localhost:8000/api/logs';
      if (applyFilters && (filterType || startTime || endTime)) {
        const params = new URLSearchParams();
        if (filterType) params.append('type', filterType);
        if (startTime) params.append('start_time', (new Date(startTime).getTime() / 1000).toString());
        if (endTime) params.append('end_time', (new Date(endTime).getTime() / 1000).toString());
        url = `http://localhost:8000/api/logs/filter?${params.toString()}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log('Fetched logs:', data.logs);
      setLogs(data.logs || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching logs:', err);
      setError(`Failed to load logs: ${errorMessage}`);
      setLogs([{ timestamp: Date.now() / 1000, message: `Error loading logs: ${errorMessage}`, type: 'error', formatted_time: new Date().toLocaleString() }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFileLogs = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/logs/file');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setFileLogs(data.logs || []);
    } catch (err) {
      console.error('Error fetching file logs:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setFileLogs([`Error loading app.log: ${errorMessage}`]);
    }
  };

  const handleFilter = () => {
    fetchLogs(true);
  };

  const refreshLogs = () => {
    fetchLogs(false);
    fetchFileLogs();
  };

  if (loading) {
    return (
      <div className="container mt-4 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <h1>Logs</h1>
      <div className="mb-3">
        <Button variant="secondary" onClick={refreshLogs} className="me-2">Refresh</Button>
      </div>
      <Tabs defaultActiveKey="redisLogs" className="mb-3">
        <Tab eventKey="redisLogs" title="Redis Logs">
          <Form className="mb-3">
            <Form.Group controlId="filterType" className="mb-2">
              <Form.Label>Filter by Type</Form.Label>
              <Form.Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All</option>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="rollout">Rollout</option>
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="startTime" className="mb-2">
              <Form.Label>Start Time</Form.Label>
              <Form.Control type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Form.Group>
            <Form.Group controlId="endTime" className="mb-2">
              <Form.Label>End Time</Form.Label>
              <Form.Control type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Form.Group>
            <Button variant="primary" onClick={handleFilter}>Apply Filters</Button>
          </Form>
          {error && <div className="alert alert-danger">{error}</div>}
          <ListGroup>
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <ListGroup.Item
                  key={index}
                  variant={log.type === "error" ? "danger" : log.type === "success" ? "success" : "info"}
                  className="text-dark"
                >
                  <strong>[{log.formatted_time}]</strong> {log.message} <span className="text-muted">({log.type})</span>
                </ListGroup.Item>
              ))
            ) : (
              <ListGroup.Item className="text-dark">No logs available</ListGroup.Item>
            )}
          </ListGroup>
        </Tab>
        <Tab eventKey="fileLogs" title="File Logs">
          <ListGroup>
            {fileLogs.length > 0 ? (
              fileLogs.map((log, index) => (
                <ListGroup.Item key={index} className="text-dark">
                  {log}
                </ListGroup.Item>
              ))
            ) : (
              <ListGroup.Item className="text-dark">No file logs available</ListGroup.Item>
            )}
          </ListGroup>
        </Tab>
      </Tabs>
    </div>
  );
};

export default LogPage;