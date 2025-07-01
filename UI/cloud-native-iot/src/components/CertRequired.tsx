import React, { useState } from 'react';
import axios from 'axios';
import { Button, Alert } from 'react-bootstrap';

const CertRequired: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);

  const handleGenerateCert = async () => {
    try {
      const response = await axios.post('http://localhost:8000/generate-certificate', {}, { withCredentials: true });
      const pfxData = response.data.pfx;
      const byteCharacters = atob(pfxData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/x-pkcs12' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'user_cert.pfx';
      a.click();
      window.URL.revokeObjectURL(url);
      setStatus('Certificate generated. Please install it in your browser.');
    } catch (error) {
      if (error instanceof Error) {
        setStatus(`Error generating certificate: ${error.message}`);
      } else {
        setStatus('Error generating certificate: An unknown error occurred.');
      }
    }
  };

  return (
    <div className="container mt-4 text-light">
      <h1>Certificate Required</h1>
      <p>You need a certificate to access this application.</p>
      <Button variant="primary" onClick={handleGenerateCert}>Generate Certificate</Button>
      {status && <Alert variant={status.includes("Error") ? "danger" : "success"} className="mt-3">{status}</Alert>}
      <p>After generating the certificate, download the <code>.pfx</code> file and install it in your browser:</p>
      <ul>
        <li><strong>Firefox:</strong> Settings → Privacy & Security → View Certificates → Import</li>
        <li><strong>Chrome:</strong> Settings → Privacy and Security → Manage Certificates → Import</li>
      </ul>
      <p>Once installed, refresh the page to access the application.</p>
    </div>
  );
};

export default CertRequired;