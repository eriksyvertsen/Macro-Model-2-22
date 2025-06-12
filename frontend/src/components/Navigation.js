
import React from 'react';

const Navigation = ({ currentPage, setCurrentPage }) => {
  return (
    <nav style={{
      backgroundColor: '#343a40',
      padding: '10px 20px',
      marginBottom: '20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '15px' }}>
        <button
          onClick={() => setCurrentPage('dashboard')}
          style={{
            background: currentPage === 'dashboard' ? '#007bff' : 'transparent',
            color: 'white',
            border: 'none',
            padding: '8px 15px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Dashboard Heatmap
        </button>
        <button
          onClick={() => setCurrentPage('composite')}
          style={{
            background: currentPage === 'composite' ? '#007bff' : 'transparent',
            color: 'white',
            border: 'none',
            padding: '8px 15px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Composite Index
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
