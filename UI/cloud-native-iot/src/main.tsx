import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/global.css';

console.log('Mounting React App...');
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found! Ensure there is a <div id="root"></div> in your index.html');
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('App mounted successfully.');
}