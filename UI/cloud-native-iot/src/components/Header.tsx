import React from 'react';
import { Nav, Image, OverlayTrigger, Tooltip, NavDropdown } from 'react-bootstrap';
import { FaHome, FaUsers, FaCog, FaInfoCircle } from 'react-icons/fa';
import { useNavigate, useLocation } from 'react-router-dom';
import './Header.css';


interface NavItem {
  path: string;
  title: string;
  icon: React.ReactNode;
  tooltip: string;
  subItems?: { path: string; title: string }[];
}

const Header: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const navItems: NavItem[] = [
    { path: '/home', title: 'Home', icon: <FaHome />, tooltip: 'Dashboard' },
    { path: '/contact', title: 'Contact', icon: <FaUsers />, tooltip: 'Contact Support' },
    {
      path: '/settings',
      title: 'Settings',
      icon: <FaCog />,
      tooltip: 'Settings',
      subItems: [
        { path: '/settings/general', title: 'General' },
        { path: '/settings/api', title: 'API Keys' },
        { path: '/settings/security', title: 'Security' },
      ],
    },
    { path: '/help', title: 'Help', icon: <FaInfoCircle />, tooltip: 'Help & Docs' },
    { path: '/logs', title: 'Logs', icon: <FaInfoCircle />, tooltip: 'Logs' },
  ];

  return (
    <div className="wrapper">
      <div className="sidebar-full-height p-3 shadow">
        <div className="mb-4 d-flex align-items-center cursor-pointer" onClick={() => navigate('/home')}>
          <Image src="/cniot-logo.png" width="40" height="40" className="me-2 rounded-circle" alt="Logo" />
          <span className="text-light fs-4">Cloud Native IoT</span>
        </div>
        <Nav className="flex-column flex-grow-1">
          {navItems.map((item) =>
            item.subItems ? (
              <NavDropdown
                key={item.path}
                title={<span className="text-light">{item.icon} {item.title}</span>}
                id={`${item.title.toLowerCase()}-dropdown`}
                className={`mb-2 p-2 rounded ${isActive(item.path) ? 'active' : ''}`}
              >
                {item.subItems.map((subItem) => (
                  <NavDropdown.Item key={subItem.path} onClick={() => navigate(subItem.path)}>
                    {subItem.title}
                  </NavDropdown.Item>
                ))}
              </NavDropdown>
            ) : (
              <OverlayTrigger
                key={item.path}
                placement="right"
                overlay={<Tooltip id={`${item.title.toLowerCase()}-tooltip`}>{item.tooltip}</Tooltip>}
              >
                <Nav.Link
                  className={`text-light mb-2 p-2 rounded ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  {item.icon} {item.title}
                </Nav.Link>
              </OverlayTrigger>
            )
          )}
        </Nav>
      </div>
      <div className="content-area">
        {children}
      </div>
    </div>
  );
};

export default Header;
