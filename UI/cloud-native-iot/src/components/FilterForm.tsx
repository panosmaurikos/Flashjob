import React from 'react';
import { Form, Button, Card, Row, Col } from 'react-bootstrap';

interface FilterFormProps {
  filters: { uuid: string; device_type: string; application_type: string; status?: string; last_updated?: string };
  setFilters: (filters: { uuid: string; device_type: string; application_type: string; status?: string; last_updated?: string }) => void;
  onFilter: () => void;
  onSelectAll: () => void;
}

const FilterForm: React.FC<FilterFormProps> = ({ filters, setFilters, onFilter, onSelectAll }) => {
  return (
    <Card className="mb-4 shadow-sm bg-secondary">
      <Card.Body>
        <Card.Title>Filter Instances</Card.Title>
        <Form>
          <Row>
            <Col md={6} className="mb-3">
              <Form.Group controlId="formUuid">
                <Form.Label>UUID</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.uuid}
                  onChange={(e) => setFilters({ ...filters, uuid: e.target.value })}
                  placeholder="Enter UUID"
                />
              </Form.Group>
            </Col>
            <Col md={6} className="mb-3">
              <Form.Group controlId="formDeviceType">
                <Form.Label>Device Type</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.device_type}
                  onChange={(e) => setFilters({ ...filters, device_type: e.target.value })}
                  placeholder="e.g., esp32c6"
                />
              </Form.Group>
            </Col>
          </Row>
          <Row>
            <Col md={6} className="mb-3">
              <Form.Group controlId="formApplicationType">
                <Form.Label>Application Type</Form.Label>
                <Form.Control
                  type="text"
                  value={filters.application_type}
                  onChange={(e) => setFilters({ ...filters, application_type: e.target.value })}
                  placeholder="e.g., IoT Sensor"
                />
              </Form.Group>
            </Col>
            <Col md={6} className="mb-3">
              <Form.Group controlId="formStatus">
                <Form.Label>Status</Form.Label>
                <Form.Select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>
          <Row>
            <Col md={6} className="mb-3">
              <Form.Group controlId="formLastUpdated">
                <Form.Label>Last Updated (e.g., 2025-06-30)</Form.Label>
                <Form.Control
                  type="date"
                  value={filters.last_updated || ''}
                  onChange={(e) => setFilters({ ...filters, last_updated: e.target.value || undefined })}
                />
              </Form.Group>
            </Col>
          </Row>
          <Button variant="primary" onClick={onFilter} className="me-2">
            Apply Filters
          </Button>
          <Button variant="outline-light" onClick={onSelectAll}>
            Select All
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default FilterForm;