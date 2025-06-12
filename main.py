
import dash
from dash import dcc, html, Input, Output, State, callback_context
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import requests
from datetime import datetime, timedelta
import json

# Initialize the Dash app
app = dash.Dash(__name__)
app.title = "Economic Indicators Dashboard"

# Custom CSS styles
app.layout = html.Div([
    # Header Section
    html.Div([
        html.Div([
            html.H1("Economic Indicators Dashboard", 
                   className="header-title"),
            html.P("Track key economic indicators with interactive heatmaps", 
                   className="header-subtitle"),
            html.Div([
                html.A("View Composite Index", 
                      href="/composite", 
                      className="composite-link",
                      target="_blank")
            ], className="header-links")
        ], className="header-content")
    ], className="header-section"),
    
    # Controls Section
    html.Div([
        html.Div([
            html.Div([
                html.Label("Select Indicators:", className="control-label"),
                dcc.Dropdown(
                    id="indicator-dropdown",
                    options=[
                        {"label": "GDP Growth Rate", "value": "GDP"},
                        {"label": "Unemployment Rate", "value": "UNRATE"},
                        {"label": "Inflation Rate (CPI)", "value": "CPIAUCSL"},
                        {"label": "Federal Funds Rate", "value": "FEDFUNDS"},
                        {"label": "Housing Starts", "value": "HOUST"},
                        {"label": "Industrial Production", "value": "INDPRO"},
                        {"label": "Consumer Confidence", "value": "UMCSENT"},
                        {"label": "Retail Sales", "value": "RSXFS"},
                        {"label": "Payroll Employment", "value": "PAYEMS"},
                        {"label": "Personal Income", "value": "PI"},
                        {"label": "Durable Goods Orders", "value": "DGORDER"},
                        {"label": "Building Permits", "value": "PERMIT"},
                        {"label": "ISM Manufacturing PMI", "value": "NAPM"},
                        {"label": "Consumer Price Index", "value": "CPILFESL"},
                        {"label": "Producer Price Index", "value": "PPIFIS"},
                        {"label": "10-Year Treasury Rate", "value": "DGS10"},
                        {"label": "Dollar Index", "value": "DTWEXBGS"},
                        {"label": "Crude Oil Prices", "value": "DCOILWTICO"},
                        {"label": "Gold Prices", "value": "GOLDAMGBD228NLBM"},
                        {"label": "VIX Volatility", "value": "VIXCLS"}
                    ],
                    value=["GDP", "UNRATE", "CPIAUCSL", "FEDFUNDS", "HOUST", "INDPRO", "UMCSENT", "RSXFS", "PAYEMS", "PI", "DGORDER", "PERMIT", "NAPM", "CPILFESL", "PPIFIS", "DGS10", "DTWEXBGS", "DCOILWTICO", "GOLDAMGBD228NLBM", "VIXCLS"],
                    multi=True,
                    className="dropdown"
                )
            ], className="control-group"),
            
            html.Div([
                html.Label("Time Period (Months):", className="control-label"),
                dcc.Slider(
                    id="months-slider",
                    min=6,
                    max=60,
                    step=6,
                    value=24,
                    marks={i: f"{i}m" for i in range(6, 61, 12)},
                    className="slider"
                )
            ], className="control-group"),
            
            html.Button("Update Dashboard", 
                       id="update-btn", 
                       className="update-button")
        ], className="controls-container")
    ], className="controls-section"),
    
    # Main Content Section
    html.Div([
        # Loading indicator
        dcc.Loading(
            id="loading",
            children=[
                # Heatmap container
                html.Div([
                    dcc.Graph(
                        id="heatmap-chart",
                        config={'displayModeBar': False}
                    )
                ], className="chart-container"),
                
                # Stats cards
                html.Div(id="stats-cards", className="stats-section")
            ],
            type="circle",
            className="loading-wrapper"
        )
    ], className="main-content"),
    
    # Footer
    html.Div([
        html.P("Economic data sourced from FRED API", className="footer-text")
    ], className="footer-section")
], className="app-container")

# Custom CSS styling
app.index_string = '''
<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>{%title%}</title>
        {%favicon%}
        {%css%}
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
            }
            
            .app-container {
                min-height: 100vh;
                display: flex;
                flex-direction: column;
            }
            
            .header-section {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                padding: 2rem 1rem;
                text-align: center;
                box-shadow: 0 2px 20px rgba(0,0,0,0.1);
            }
            
            .header-title {
                color: #2d3748;
                font-size: 2.5rem;
                font-weight: 700;
                margin-bottom: 0.5rem;
            }
            
            .header-subtitle {
                color: #4a5568;
                font-size: 1.1rem;
                opacity: 0.8;
                margin-bottom: 1rem;
            }
            
            .header-links {
                margin-top: 1rem;
            }
            
            .composite-link {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-weight: 600;
                transition: all 0.3s ease;
                font-size: 0.9rem;
            }
            
            .composite-link:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                color: white;
                text-decoration: none;
            }
            
            .controls-section {
                background: rgba(255, 255, 255, 0.9);
                padding: 1.5rem;
                margin: 1rem;
                border-radius: 15px;
                box-shadow: 0 4px 25px rgba(0,0,0,0.1);
            }
            
            .controls-container {
                display: grid;
                grid-template-columns: 2fr 1fr auto;
                gap: 2rem;
                align-items: end;
            }
            
            .control-group {
                display: flex;
                flex-direction: column;
            }
            
            .control-label {
                font-weight: 600;
                color: #2d3748;
                margin-bottom: 0.5rem;
                font-size: 0.9rem;
            }
            
            .dropdown {
                border-radius: 8px;
            }
            
            .slider {
                margin-top: 1rem;
            }
            
            .update-button {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 0.75rem 1.5rem;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.9rem;
            }
            
            .update-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
            }
            
            .main-content {
                flex: 1;
                padding: 0 1rem;
            }
            
            .chart-container {
                background: rgba(255, 255, 255, 0.95);
                border-radius: 15px;
                padding: 1.5rem;
                margin-bottom: 1rem;
                box-shadow: 0 4px 25px rgba(0,0,0,0.1);
                overflow-x: auto;
            }
            
            .stats-section {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 1rem;
                margin-bottom: 1rem;
            }
            
            .stat-card {
                background: rgba(255, 255, 255, 0.95);
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                text-align: center;
                transition: transform 0.3s ease;
            }
            
            .stat-card:hover {
                transform: translateY(-3px);
            }
            
            .stat-value {
                font-size: 2rem;
                font-weight: 700;
                color: #667eea;
                margin-bottom: 0.5rem;
            }
            
            .stat-label {
                color: #4a5568;
                font-size: 0.9rem;
                font-weight: 500;
            }
            
            .footer-section {
                background: rgba(255, 255, 255, 0.9);
                padding: 1rem;
                text-align: center;
                margin-top: auto;
            }
            
            .footer-text {
                color: #4a5568;
                font-size: 0.8rem;
            }
            
            .loading-wrapper {
                min-height: 400px;
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                .header-title {
                    font-size: 2rem;
                }
                
                .controls-container {
                    grid-template-columns: 1fr;
                    gap: 1.5rem;
                }
                
                .chart-container {
                    padding: 1rem;
                    margin: 0.5rem 0;
                }
                
                .stats-section {
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 0.5rem;
                }
                
                .stat-card {
                    padding: 1rem;
                }
                
                .stat-value {
                    font-size: 1.5rem;
                }
            }
            
            @media (max-width: 480px) {
                .header-section {
                    padding: 1.5rem 1rem;
                }
                
                .controls-section {
                    margin: 0.5rem;
                    padding: 1rem;
                }
                
                .main-content {
                    padding: 0 0.5rem;
                }
            }
        </style>
    </head>
    <body>
        {%app_entry%}
        <footer>
            {%config%}
            {%scripts%}
            {%renderer%}
        </footer>
    </body>
</html>
'''

# Callback for updating the dashboard
@app.callback(
    [Output("heatmap-chart", "figure"),
     Output("stats-cards", "children")],
    [Input("update-btn", "n_clicks")],
    [State("indicator-dropdown", "value"),
     State("months-slider", "value")]
)
def update_dashboard(n_clicks, selected_indicators, months_back):
    if not selected_indicators:
        # Return empty chart and stats
        empty_fig = go.Figure()
        empty_fig.update_layout(
            title="Select indicators to display",
            template="plotly_white",
            height=400
        )
        return empty_fig, []
    
    # Directional factors for indicators (1 = higher is better, -1 = higher is worse)
    direction_factors = {
        "GDP": 1, "UNRATE": -1, "CPIAUCSL": -1, "FEDFUNDS": 0, "HOUST": 1,
        "INDPRO": 1, "UMCSENT": 1, "RSXFS": 1, "PAYEMS": 1, "PI": 1,
        "DGORDER": 1, "PERMIT": 1, "NAPM": 1, "CPILFESL": -1, "PPIFIS": -1,
        "DGS10": 0, "DTWEXBGS": 0, "DCOILWTICO": 0, "GOLDAMGBD228NLBM": 0, "VIXCLS": -1
    }
    
    # Sample data generation with directional coding
    months = pd.date_range(
        start=datetime.now() - timedelta(days=30*months_back), 
        end=datetime.now(), 
        freq='M'
    )
    
    # Create sample heatmap data with directional adjustment
    data = []
    for indicator in selected_indicators:
        direction = direction_factors.get(indicator, 1)
        prev_value = None
        
        for month in months:
            # Generate sample values
            import random
            raw_value = random.uniform(-2, 5) + random.uniform(-1, 1)
            
            if prev_value is not None:
                # Calculate directional change
                change = (raw_value - prev_value) / abs(prev_value) if prev_value != 0 else 0
                directional_value = direction * change
            else:
                directional_value = 0
                
            data.append({
                'Indicator': indicator,
                'Month': month.strftime('%Y-%m'),
                'Value': directional_value,
                'RawValue': raw_value
            })
            prev_value = raw_value
    
    df = pd.DataFrame(data)
    
    # Create pivot table for heatmap
    pivot_df = df.pivot(index='Indicator', columns='Month', values='Value')
    
    # Create heatmap with red-green color scale
    fig = go.Figure(data=go.Heatmap(
        z=pivot_df.values,
        x=pivot_df.columns,
        y=pivot_df.index,
        colorscale='RdYlGn',
        hoverongaps=False,
        hovertemplate='<b>%{y}</b><br>%{x}<br>Change: %{z:.2%}<extra></extra>',
        zmid=0
    ))
    
    fig.update_layout(
        title="Economic Indicators Heatmap",
        template="plotly_white",
        height=max(300, len(selected_indicators) * 80),
        font=dict(size=12),
        margin=dict(l=20, r=20, t=60, b=20),
        xaxis=dict(tickangle=45),
        coloraxis_colorbar=dict(
            title="Value"
        )
    )
    
    # Create stats cards
    stats_cards = []
    for indicator in selected_indicators:
        indicator_data = df[df['Indicator'] == indicator]
        avg_value = indicator_data['Value'].mean()
        latest_value = indicator_data['Value'].iloc[-1] if not indicator_data.empty else 0
        
        card = html.Div([
            html.Div(f"{latest_value:.2f}", className="stat-value"),
            html.Div(f"Latest {indicator}", className="stat-label")
        ], className="stat-card")
        
        stats_cards.append(card)
    
    return fig, stats_cards

if __name__ == "__main__":
    app.run_server(debug=True, host="0.0.0.0", port=5000)
