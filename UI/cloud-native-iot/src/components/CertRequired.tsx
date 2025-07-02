import React, { useState } from 'react';
import axios from 'axios';
import { Button, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom'; // <-- Νέο import

const CertRequired: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleGenerateCert = async () => {
    try {
      const response = await axios.post('http://localhost:8000/generate-certificate', {}, { 
        withCredentials: true 
      });
      const pfxData = response.data.pfx;
      
      const binaryString = atob(pfxData);
      const byteArray = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        byteArray[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([byteArray], { type: 'application/x-pkcs12' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'user_cert.p12';
      a.click();
      window.URL.revokeObjectURL(url);
      
      setStatus('Certificate generated. Verifying installation...');
      
      // Νέα επαλήθευση
      try {
        const verification = await axios.get('http://localhost:8000/check-cert', {
          withCredentials: true
        });
        
        if (verification.data.has_cert) {
          setStatus('Certificate verified! Redirecting to dashboard...');
          setTimeout(() => navigate('/home'), 2000);
        } else {
          setStatus('Certificate installed but not detected. Please refresh your browser.');
        }
      } catch (verifyError) {
        setStatus('Verification failed. Please refresh the page manually');
      }
      
    } catch (error) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.detail || error.message;
      }
      setStatus(`Error generating certificate: ${errorMessage}`);
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
      <p>Use password <strong>"password"</strong> when prompted during installation.</p>
    </div>
  );
};

export default CertRequired;