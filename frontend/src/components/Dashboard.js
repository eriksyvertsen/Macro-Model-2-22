
import React, { useState, useEffect } from 'react';
import HeatmapGrid from './HeatmapGrid';
import Chart from './Chart';
import AddSeriesForm from './AddSeriesForm';

const Dashboard = () => {
  const [indicators, setIndicators] = useState([]);
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthsBack, setMonthsBack] = useState(60);

  useEffect(() => {
    fetchIndicators();
  }, []);

  const fetchIndicators = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/indicators');
      if (!response.ok) throw new Error('Failed to fetch indicators');
      const data = await response.json();
      setIndicators(data.indicators || []);
      setMonthsBack(data.months_back || 60);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSeries = async (seriesId) => {
    try {
      const response = await fetch('/api/add-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId })
      });
      
      if (!response.ok) throw new Error('Failed to add series');
      
      await fetchIndicators(); // Refresh the data
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleRefreshAll = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/refresh-all', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh data');
      await fetchIndicators();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMonthsBack = async (newMonthsBack) => {
    try {
      setLoading(true);
      const response = await fetch('/api/update-months-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months_back: newMonthsBack })
      });
      
      if (!response.ok) throw new Error('Failed to update months setting');
      
      await fetchIndicators();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDirectionChange = async (seriesId, direction) => {
    try {
      const response = await fetch('/api/update-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId, direction })
      });
      
      if (!response.ok) throw new Error('Failed to update direction');
      
      await fetchIndicators();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && indicators.length === 0) {
    return <div className="loading">Loading indicators...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ marginBottom: '10px' }}>Macroeconomic Indicator Dashboard</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Monitor key economic indicators and their trends. Click on a cell to see the detailed chart.
        </p>
        
        <div className="controls-section" style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '20px', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <AddSeriesForm onAddSeries={handleAddSeries} />
          
          <button 
            className="btn btn-secondary" 
            onClick={handleRefreshAll}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh All Data'}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontWeight: 'bold' }}>Months to Display:</label>
            <input
              type="number"
              value={monthsBack}
              onChange={(e) => setMonthsBack(parseInt(e.target.value) || 60)}
              min="1"
              max="300"
              style={{ width: '80px' }}
              className="input"
            />
            <button 
              className="btn"
              onClick={() => handleUpdateMonthsBack(monthsBack)}
              disabled={loading}
            >
              Apply & Refresh
            </button>
          </div>
        </div>

        <div className="legend-container">
          <h4 style={{ 
            marginBottom: '16px', 
            color: '#2c3e50',
            fontSize: '16px',
            fontWeight: '600'
          }}>
            🎨 Color Legend
          </h4>
          <div style={{ 
            display: 'flex', 
            gap: '20px', 
            marginBottom: '12px',
            flexWrap: 'wrap'
          }}>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#28a745' }}></div>
              <span>✅ Positive Trend</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#dc3545' }}></div>
              <span>❌ Negative Trend</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#6c757d' }}></div>
              <span>⚪ Neutral/No Change</span>
            </div>
          </div>
          <div style={{ 
            fontStyle: 'italic', 
            color: '#7f8c8d',
            fontSize: '13px',
            lineHeight: '1.5'
          }}>
            💡 <strong>Tip:</strong> Colors adapt to indicator direction settings. For 'Increase is Positive' indicators, 
            green means improving values. For 'Increase is Negative' indicators, green means decreasing values 
            (which is good for metrics like unemployment or inflation).
          </div>
        </div>
      </div>

      {indicators.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px' }}>
          <h3>No series tracked yet</h3>
          <p>Please add a series by entering a FRED Series ID above and clicking 'Add Series'</p>
          <p>
            Example FRED IDs to try: <code>UNRATE</code> (Unemployment Rate), 
            <code>CPIAUCSL</code> (Consumer Price Index), <code>GDP</code> (Gross Domestic Product)
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <HeatmapGrid 
              indicators={indicators}
              onCellClick={setSelectedIndicator}
              onDirectionChange={handleDirectionChange}
            />
          </div>

          {selectedIndicator && (
            <div className="card">
              <h3 style={{ marginBottom: '15px' }}>Indicator Details</h3>
              <Chart indicator={selectedIndicator} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
