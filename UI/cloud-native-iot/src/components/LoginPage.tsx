import React, { useState } from 'react';
import { Form, Button, Alert } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

interface LoginPageProps {
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setToken: (token: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ setIsAuthenticated, setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await axios.post('http://localhost:8000/api/login', {
        username,
        password,
      }, {
        withCredentials: true,
      });

      const { token } = response.data;
      localStorage.setItem('token', token);
      setToken(token);
      setIsAuthenticated(true);
      navigate('/home');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const errorMessage = err.response?.data?.message || 'Login failed';
        setError(errorMessage);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      
      <div className="cloud-image cloud-1">
        <img src="/pngwing.png" alt="cloud1" />
      </div>
      <div className="cloud-image cloud-2">
        <img src="/cloud2.png" alt="cloud2" />
      </div>
      <div className="cloud-image cloud-3">
        <img src="/cloud2.png" alt="cloud3" />
      </div>

      <div className="login-box">
        <div className="login-header mb-4">
          <div className="logo-container">
            <img src="/cniot-logo.png" alt="CNIoT Logo" />
          </div>
          <h1 className="login-title">Cloud Native IoT</h1>
          <p className="login-subtitle">Secure Device Management</p>
        </div>

        {error && (
          <Alert variant="danger" className="animated-alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            {error}
          </Alert>
        )}

        <Form onSubmit={handleSubmit} className="login-form text-start">
          <Form.Group controlId="formUsername" className="mb-4">
  <Form.Label className="fw-bold">Username</Form.Label>
  <div className="input-group">
    <span className="input-group-text">
      <i className="bi bi-person-fill"></i>
    </span>
    <Form.Control
      type="text"
      value={username}
      onChange={(e) => setUsername(e.target.value)}
      required
      className="login-input"
      placeholder="Enter username"
    />
  </div>
</Form.Group>

          <Form.Group controlId="formPassword" className="mb-4">
  <Form.Label className="fw-bold">Password</Form.Label>
  <div className="input-group">
    <span className="input-group-text">
      <i className="bi bi-lock-fill"></i>
    </span>
    <Form.Control
      type="password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
      className="login-input"
      placeholder="Enter password"
    />
  </div>
</Form.Group>

          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            className="login-button w-100"
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Signing In...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right me-2"></i>
                Sign In
              </>
            )}
          </Button>
        </Form>
      </div>

      <div className="footer-brand">
        <span>by Nubificus LTD</span>
      </div>
    </div>
  );
};

export default LoginPage;
