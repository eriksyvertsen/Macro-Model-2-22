
import React, { useState, useEffect } from 'react';
import Chart from './Chart';

const CompositeIndex = () => {
  const [compositeData, setCompositeData] = useState(null);
  const [indicators, setIndicators] = useState([]);
  const [weights, setWeights] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCompositeData();
  }, []);

  const fetchCompositeData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/composite');
      if (!response.ok) throw new Error('Failed to fetch composite data');
      const data = await response.json();
      
      setIndicators(data.indicators || []);
      setWeights(data.weights || {});
      setCompositeData(data.composite || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWeightChange = (seriesId, value) => {
    setWeights(prev => ({
      ...prev,
      [seriesId]: parseFloat(value) || 0
    }));
  };

  const handleSaveWeights = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/save-weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights })
      });
      
      if (!response.ok) throw new Error('Failed to save weights');
      
      await fetchCompositeData();
      setMessage('Weights saved successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetWeights = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/reset-weights', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to reset weights');
      
      await fetchCompositeData();
      setMessage('Weights reset to equal values.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !compositeData) {
    return <div className="loading">Loading composite index...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (indicators.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '30px' }}>
        <h3>No indicators available</h3>
        <p>Please add indicators on the dashboard page first.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ marginBottom: '10px' }}>Composite Economic Index</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          This page displays a weighted average of all your tracked indicators, adjusted for their direction. 
          For indicators where 'Increase is Negative' (like inflation), the values are inverted so that 
          improvements always contribute positively to the composite index.
        </p>
      </div>

      {compositeData && (
        <div className="card">
          <h3 style={{ marginBottom: '15px' }}>Composite Index Chart</h3>
          <Chart indicator={compositeData} />
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '15px' }}>Adjust Indicator Weights</h3>
        <p style={{ marginBottom: '20px', color: '#666' }}>
          Set the relative importance of each indicator in the composite index. 
          Weights will be normalized to sum to 1.
        </p>

        <div style={{ display: 'grid', gap: '15px', marginBottom: '20px' }}>
          {indicators.map(indicator => (
            <div key={indicator.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '15px',
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px'
            }}>
              <div style={{ flex: '1', minWidth: '300px' }}>
                <div style={{ fontWeight: 'bold' }}>{indicator.id}</div>
                <div style={{ fontSize: '12px', color: '#666' }} title={indicator.name}>
                  {indicator.name}
                </div>
                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                  ({indicator.direction === 'positive' ? 'Increase is Positive' : 'Increase is Negative'})
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontWeight: 'bold', minWidth: '60px' }}>Weight:</label>
                <input
                  type="number"
                  value={weights[indicator.id] || 0}
                  onChange={(e) => handleWeightChange(indicator.id, e.target.value)}
                  min="0"
                  max="1"
                  step="0.01"
                  className="input"
                  style={{ width: '100px' }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="btn"
            onClick={handleSaveWeights}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Apply & Save Weights'}
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={handleResetWeights}
            disabled={loading}
          >
            Reset to Equal Weights
          </button>

          {message && (
            <div style={{ 
              color: '#28a745',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompositeIndex;
