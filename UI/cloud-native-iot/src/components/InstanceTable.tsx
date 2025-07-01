import React from 'react';
  import { Table } from 'react-bootstrap';

  interface Instance {
    uuid: string;
    deviceType: string;
    applicationType: string;
  }

  interface InstanceTableProps {
    instances: Instance[];
    selectedUuids: string[];
    setSelectedUuids: (uuids: string[]) => void;
  }

  const InstanceTable: React.FC<InstanceTableProps> = ({ instances, selectedUuids, setSelectedUuids }) => {
    const handleSelect = (uuid: string) => {
      setSelectedUuids(selectedUuids.includes(uuid)
        ? selectedUuids.filter(u => u !== uuid)
        : [...selectedUuids, uuid]);
    };

    return (
      <Table striped bordered hover variant="dark" className="text-light shadow-sm">
        <thead>
          <tr>
            <th>UUID</th>
            <th>Device Type</th>
            <th>Application Type</th>
            <th>Select</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((instance) => (
            <tr key={instance.uuid}>
              <td>{instance.uuid}</td>
              <td>{instance.deviceType}</td>
              <td>{instance.applicationType}</td>
              <td>
                <input
                  type="checkbox"
                  checked={selectedUuids.includes(instance.uuid)}
                  onChange={() => handleSelect(instance.uuid)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  export default InstanceTable;