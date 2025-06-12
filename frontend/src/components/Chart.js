
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Chart = ({ indicator }) => {
  if (!indicator || !indicator.data) {
    return <div>No data available for this indicator</div>;
  }

  // Transform data for Recharts
  const chartData = indicator.data
    .filter(d => d.value !== null && d.value !== undefined)
    .map(d => ({
      date: d.date || d.month,
      value: d.value,
      formattedDate: d.date || d.month
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return <div>No valid data points available for this indicator</div>;
  }

  const formatTooltip = (value, name, props) => {
    if (name === 'value') {
      return [value.toLocaleString(), 'Value'];
    }
    return [value, name];
  };

  const formatLabel = (label) => {
    return `Date: ${label}`;
  };

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <h4>{indicator.name} ({indicator.id})</h4>
        {indicator.selectedMonth && indicator.selectedValue && (
          <p style={{ color: '#666', fontSize: '14px' }}>
            Selected: {indicator.selectedMonth} - {indicator.selectedValue.toLocaleString()}
          </p>
        )}
      </div>
      
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis 
            dataKey="date" 
            stroke="#666"
            fontSize={12}
            interval="preserveStartEnd"
          />
          <YAxis 
            stroke="#666"
            fontSize={12}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <Tooltip 
            formatter={formatTooltip}
            labelFormatter={formatLabel}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#007bff" 
            strokeWidth={2}
            dot={{ fill: '#007bff', strokeWidth: 2, r: 3 }}
            activeDot={{ r: 5, stroke: '#007bff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      
      <div style={{ 
        marginTop: '10px', 
        textAlign: 'center', 
        fontSize: '14px', 
        color: '#666',
        fontStyle: 'italic'
      }}>
        Note: For this indicator, an increase is {indicator.direction === 'positive' ? 'positive' : 'negative'}.
      </div>
    </div>
  );
};

export default Chart;
