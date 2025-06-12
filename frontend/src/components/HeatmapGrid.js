
import React, { useState } from 'react';

const HeatmapGrid = ({ indicators, onCellClick, onDirectionChange }) => {
  const [showAllMonths, setShowAllMonths] = useState(false);
  
  if (!indicators || indicators.length === 0) {
    return <div>No indicators to display</div>;
  }

  // Get the months from the first indicator (they should all have the same months)
  const allMonths = indicators[0]?.months || [];
  const maxDisplayMonths = 60;
  const displayMonths = showAllMonths ? allMonths : allMonths.slice(-Math.min(maxDisplayMonths, allMonths.length));

  const handleCellClick = (indicator, month, value) => {
    onCellClick({
      ...indicator,
      selectedMonth: month,
      selectedValue: value
    });
  };

  const getColorFromClassification = (classification) => {
    if (classification.startsWith('rgb(')) {
      return classification;
    }
    
    // Fallback colors
    switch (classification) {
      case 'green':
        return '#28a745';
      case 'red':
        return '#dc3545';
      case 'grey':
      default:
        return '#6c757d';
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Time Display:</label>
        <div style={{ display: 'flex', gap: '15px' }}>
          <label>
            <input
              type="radio"
              value="recent"
              checked={!showAllMonths}
              onChange={() => setShowAllMonths(false)}
              style={{ marginRight: '5px' }}
            />
            Show Recent (max {maxDisplayMonths} months)
          </label>
          <label>
            <input
              type="radio"
              value="all"
              checked={showAllMonths}
              onChange={() => setShowAllMonths(true)}
              style={{ marginRight: '5px' }}
            />
            Show All ({allMonths.length} months)
          </label>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '800px' }}>
          {/* Header row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `200px repeat(${displayMonths.length}, 30px) 200px`,
            gap: '2px',
            marginBottom: '2px'
          }}>
            <div style={{ fontWeight: 'bold', padding: '8px' }}>Indicator</div>
            {displayMonths.map(month => (
              <div 
                key={month}
                style={{ 
                  fontWeight: 'bold', 
                  fontSize: '12px', 
                  textAlign: 'center',
                  padding: '4px 2px'
                }}
                title={month}
              >
                {month.split('-')[1]}
              </div>
            ))}
            <div style={{ fontWeight: 'bold', padding: '8px' }}>Actions</div>
          </div>

          {/* Data rows */}
          {indicators.map(indicator => (
            <div
              key={indicator.id}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: `200px repeat(${displayMonths.length}, 30px) 200px`,
                gap: '2px',
                marginBottom: '2px',
                alignItems: 'center'
              }}
            >
              <div style={{ 
                padding: '8px',
                fontWeight: 'bold',
                fontSize: '14px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                <div title={indicator.name}>
                  {indicator.name}
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#666', 
                  fontStyle: 'italic',
                  fontWeight: 'normal'
                }}>
                  ({indicator.direction === 'positive' ? 'Up+' : 'Up-'})
                </div>
              </div>

              {displayMonths.map(month => {
                const monthData = indicator.data.find(d => d.month === month);
                const classification = monthData?.classification || 'grey';
                const value = monthData?.value;
                
                return (
                  <div
                    key={`${indicator.id}-${month}`}
                    className="heatmap-cell"
                    style={{
                      backgroundColor: getColorFromClassification(classification),
                      cursor: 'pointer'
                    }}
                    onClick={() => handleCellClick(indicator, month, value)}
                    title={`${indicator.id}: ${month}${value !== undefined ? ` (${value})` : ''}`}
                  />
                );
              })}

              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <button
                  className="btn"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  onClick={() => onCellClick(indicator)}
                >
                  View Chart
                </button>
                
                <div style={{ fontSize: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '2px' }}>Direction:</label>
                  <select
                    value={indicator.direction}
                    onChange={(e) => onDirectionChange(indicator.id, e.target.value)}
                    style={{ fontSize: '11px', padding: '2px' }}
                  >
                    <option value="positive">Increase +</option>
                    <option value="negative">Increase -</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeatmapGrid;
