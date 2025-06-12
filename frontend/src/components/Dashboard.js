
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
        
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '15px', 
          alignItems: 'center',
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px'
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

        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#f8f9fa',
          borderRadius: '5px',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '20px', backgroundColor: '#28a745' }}></div>
              <span>Green: Positive trend</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '20px', backgroundColor: '#dc3545' }}></div>
              <span>Red: Negative trend</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '20px', backgroundColor: '#6c757d' }}></div>
              <span>Grey: Neutral/No change</span>
            </div>
          </div>
          <div style={{ fontStyle: 'italic', color: '#666' }}>
            Note: Colors are based on indicator direction settings. For 'Increase is Positive' indicators, green means increasing. 
            For 'Increase is Negative' indicators, green means decreasing.
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
