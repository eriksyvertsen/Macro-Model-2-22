
import React, { useState } from 'react';

const AddSeriesForm = ({ onAddSeries }) => {
  const [seriesId, setSeriesId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!seriesId.trim()) return;

    setLoading(true);
    setMessage('');

    try {
      const result = await onAddSeries(seriesId.trim().toUpperCase());
      if (result.success) {
        setMessage(`Successfully added ${seriesId}`);
        setSeriesId('');
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }

    // Clear message after 3 seconds
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <label style={{ fontWeight: 'bold' }}>Add New Indicator:</label>
        <input
          type="text"
          value={seriesId}
          onChange={(e) => setSeriesId(e.target.value)}
          placeholder="Enter FRED Series ID (e.g. UNRATE)"
          className="input"
          style={{ width: '250px' }}
          disabled={loading}
        />
        <button 
          type="submit" 
          className="btn"
          disabled={loading || !seriesId.trim()}
        >
          {loading ? 'Adding...' : 'Add Series'}
        </button>
      </form>
      
      {message && (
        <div style={{ 
          color: message.includes('Error') ? '#dc3545' : '#28a745',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default AddSeriesForm;
