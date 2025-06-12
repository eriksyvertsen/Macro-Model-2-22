
import React, { useState } from 'react';

const HeatmapGrid = ({ indicators, onCellClick, onDirectionChange }) => {
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (!indicators || indicators.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px',
        color: '#7f8c8d',
        fontSize: '16px'
      }}>
        📊 No indicators to display
      </div>
    );
  }

  // Get the months from the first indicator (they should all have the same months)
  const allMonths = indicators[0]?.months || [];
  const maxDisplayMonths = isMobile ? 36 : 60;
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
    <div className="heatmap-container">
      <div style={{ 
        marginBottom: '20px',
        background: 'linear-gradient(135deg, #f8f9fc 0%, #e9ecef 100%)',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.5)'
      }}>
        <label style={{ 
          fontWeight: '600', 
          marginBottom: '12px', 
          display: 'block',
          color: '#2c3e50',
          fontSize: '14px'
        }}>
          📅 Time Display Range:
        </label>
        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '8px' : '20px',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: !showAllMonths ? '#667eea' : 'transparent',
            color: !showAllMonths ? 'white' : '#495057',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            fontWeight: '500'
          }}>
            <input
              type="radio"
              value="recent"
              checked={!showAllMonths}
              onChange={() => setShowAllMonths(false)}
              style={{ marginRight: '8px' }}
            />
            📊 Recent ({maxDisplayMonths} months)
          </label>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: showAllMonths ? '#667eea' : 'transparent',
            color: showAllMonths ? 'white' : '#495057',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            fontWeight: '500'
          }}>
            <input
              type="radio"
              value="all"
              checked={showAllMonths}
              onChange={() => setShowAllMonths(true)}
              style={{ marginRight: '8px' }}
            />
            📈 All Data ({allMonths.length} months)
          </label>
        </div>
      </div>

      <div className="heatmap-responsive" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: isMobile ? '600px' : '900px' }}>
          {/* Header row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `${isMobile ? '160px' : '220px'} repeat(${displayMonths.length}, ${isMobile ? '28px' : '36px'}) ${isMobile ? '140px' : '180px'}`,
            gap: '3px',
            marginBottom: '8px'
          }}>
            <div className="heatmap-header">
              📊 Indicator
            </div>
            {displayMonths.map(month => (
              <div 
                key={month}
                className="heatmap-header"
                style={{ 
                  fontSize: isMobile ? '10px' : '11px',
                  padding: isMobile ? '8px 4px' : '12px 8px'
                }}
                title={month}
              >
                {month.split('-')[1]}
              </div>
            ))}
            <div className="heatmap-header">
              ⚙️ Controls
            </div>
          </div>

          {/* Data rows */}
          {indicators.map((indicator, index) => (
            <div
              key={indicator.id}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: `${isMobile ? '160px' : '220px'} repeat(${displayMonths.length}, ${isMobile ? '28px' : '36px'}) ${isMobile ? '140px' : '180px'}`,
                gap: '3px',
                marginBottom: '4px',
                alignItems: 'center',
                background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(248, 249, 252, 0.7)',
                borderRadius: '8px',
                padding: '4px'
              }}
            >
              <div style={{ 
                padding: isMobile ? '8px' : '12px',
                borderRadius: '8px',
                background: 'white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }}>
                <div style={{
                  fontWeight: '600',
                  fontSize: isMobile ? '12px' : '14px',
                  color: '#2c3e50',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }} title={indicator.name}>
                  {isMobile ? indicator.id : indicator.name}
                </div>
                <div className="indicator-direction">
                  {indicator.direction === 'positive' ? '📈 Up+' : '📉 Up-'}
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
                      cursor: 'pointer',
                      width: isMobile ? '28px' : '36px',
                      height: isMobile ? '28px' : '32px'
                    }}
                    onClick={() => handleCellClick(indicator, month, value)}
                    title={`${indicator.name}\n${month}\n${value !== undefined ? `Value: ${value.toLocaleString()}` : 'No data'}`}
                  >
                    {value !== undefined && (
                      <span style={{ 
                        fontSize: isMobile ? '8px' : '9px',
                        fontWeight: '600'
                      }}>
                        •
                      </span>
                    )}
                  </div>
                );
              })}

              <div style={{ 
                padding: isMobile ? '6px' : '8px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: isMobile ? '4px' : '6px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }}>
                <button
                  className="btn"
                  style={{ 
                    fontSize: isMobile ? '10px' : '11px', 
                    padding: isMobile ? '6px 8px' : '8px 12px',
                    minHeight: 'auto'
                  }}
                  onClick={() => onCellClick(indicator)}
                >
                  📊 Chart
                </button>
                
                <div style={{ fontSize: isMobile ? '10px' : '11px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '3px',
                    fontWeight: '500',
                    color: '#495057'
                  }}>
                    Direction:
                  </label>
                  <select
                    value={indicator.direction}
                    onChange={(e) => onDirectionChange(indicator.id, e.target.value)}
                    style={{ 
                      fontSize: isMobile ? '9px' : '10px', 
                      padding: '4px',
                      width: '100%',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="positive">📈 Up+</option>
                    <option value="negative">📉 Up-</option>
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
