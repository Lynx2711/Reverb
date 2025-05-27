import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
console.log('Client started on http://localhost:3000');
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // <React.StrictMode>
    <App />
//</React.StrictMode>
);
