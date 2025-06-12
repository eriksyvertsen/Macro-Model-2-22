
import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import CompositeIndex from './components/CompositeIndex';
import Navigation from './components/Navigation';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  return (
    <div className="App">
      <Navigation currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <div className="container">
        {currentPage === 'dashboard' ? (
          <Dashboard />
        ) : (
          <CompositeIndex />
        )}
      </div>
    </div>
  );
}

export default App;
