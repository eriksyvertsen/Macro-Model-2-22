import os
import time
import threading
import schedule
import dash
from dash import dcc, html, Input, Output, State, callback_context
import plotly.express as px
import pandas as pd
from replit import db
from fredapi import Fred
import datetime

# ---------------------------------------
# Configuration & Initialization
# ---------------------------------------
FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
fred = Fred(api_key=FRED_API_KEY)

# We'll fetch data for the last X years (monthly)
def get_months_back():
    """Get the MONTHS_BACK setting from DB, or use default."""
    return db.get("settings_months_back", 60)

def set_months_back(value):
    """Set the MONTHS_BACK setting in DB."""
    try:
        value = int(value)
        if value < 1:
            value = 1
        db["settings_months_back"] = value
        return True
    except:
        return False

# Color scheme for classifications
COLOR_SCHEME = {
    "green": "#28a745",   # Strong positive trend
    "red": "#dc3545",     # Strong negative trend
    "yellow": "#ffc107",  # Caution/Mixed signals
    "grey": "#6c757d"     # Neutral/No significant change
}

# ---------------------------------------
# Logging Function
# ---------------------------------------
def log_message(message, level="INFO"):
    """Log a message with timestamp for better troubleshooting."""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {message}")

# ---------------------------------------
# Classification Function
# ---------------------------------------
def classify_value(value, prev_value, direction="positive", up_threshold=0.0001, accel_threshold=0):
    """
    Classification with direction awareness:
      - direction="positive": Increase is good (e.g. GDP, industrial production)
      - direction="negative": Increase is bad (e.g. inflation, unemployment)
    """
    if prev_value is None or prev_value == 0:
        return "grey"

    # Calculate the change percentage
    change = (value - prev_value) / abs(prev_value)

    # If change is too small (below threshold), return grey
    if abs(change) < up_threshold:
        return "grey"

    # Determine if change direction is "good" based on indicator direction
    is_good_change = (change > 0 and direction == "positive") or (change < 0 and direction == "negative")

    # Return the appropriate color
    if is_good_change:
        return "green"
    else:
        return "red"

# ---------------------------------------
# Helper to Fetch Series Title from FRED
# ---------------------------------------
def get_series_name(series_id):
    """
    Use fred.get_series_info(series_id) to retrieve metadata about the series.
    Returns the 'title' field if available; otherwise, returns the ID as fallback.
    """
    try:
        info = fred.get_series_info(series_id)
        return info.get("title", series_id)
    except Exception as e:
        log_message(f"Warning: could not fetch series info for {series_id}: {e}", "WARNING")
        return series_id

# ---------------------------------------
# Data Fetching & Storage
# ---------------------------------------
def fetch_series_monthly(series_id):
    """
    Fetch up to X months of monthly data from FRED for the given series_id.
    Return a DataFrame with columns [date, value].
    """
    months_back = get_months_back()  # Get current setting from DB
    log_message(f"Fetching {months_back} months of data for {series_id}")

    try:
        end_date = datetime.datetime.today()
        start_date = end_date - pd.DateOffset(months=months_back + 1)
        log_message(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

        raw_series = fred.get_series(series_id, observation_start=start_date, observation_end=end_date)
        log_message(f"Received {len(raw_series)} observations from FRED")

        df = raw_series.reset_index()
        df.columns = ["date", "value"]
        # Convert to monthly frequency explicitly (month end)
        df = df.set_index("date").resample("ME").last().dropna().reset_index()
        df["date"] = df["date"].dt.strftime("%Y-%m")  # store as YYYY-MM
        df = df.sort_values("date")
        log_message(f"Processed into {len(df)} monthly records")

        if len(df) > 0:
            log_message(f"Date range of processed data: {df['date'].iloc[0]} to {df['date'].iloc[-1]}")

        return df
    except Exception as e:
        log_message(f"Error fetching monthly series {series_id}: {e}", "ERROR")
        return None

def store_series_data(series_id, df, direction="positive"):
    """
    Store the monthly data + name for a series in Replit DB.
    Now includes direction parameter.
    """
    if df is None:
        log_message(f"Cannot store None dataframe for {series_id}", "ERROR")
        return False

    log_message(f"Storing data for {series_id}, records: {len(df)}")

    name = get_series_name(series_id)  # <--- Fetch the official title
    records = df.to_dict("records")
    key = f"series_{series_id}"

    # Get existing entry if it exists to preserve direction setting
    existing_entry = db.get(key, {})
    existing_direction = existing_entry.get("direction", direction)

    db[key] = {
        "id": series_id,
        "name": name,
        "data": records,
        "direction": existing_direction  # Use existing direction or default
    }

    if "series_list" in db:
        s_list = db["series_list"]
        if series_id not in s_list:
            s_list.append(series_id)
            db["series_list"] = s_list
            log_message(f"Added {series_id} to series_list")
    else:
        db["series_list"] = [series_id]
        log_message(f"Created new series_list with {series_id}")

    return True

def update_series_direction(series_id, direction):
    """
    Update the direction property for a series.
    """
    log_message(f"Updating direction for {series_id} to {direction}")

    key = f"series_{series_id}"
    if key in db:
        entry = db[key]
        entry["direction"] = direction
        db[key] = entry
        log_message(f"Direction updated successfully")
        return True
    else:
        log_message(f"Failed to update direction: {series_id} not found in database", "WARNING")
        return False

def refresh_series_data(series_id):
    """
    Re-fetch and store monthly data for a given series.
    Preserves the existing direction setting.
    """
    log_message(f"Starting refresh for {series_id}")
    months_back = get_months_back()
    log_message(f"Using MONTHS_BACK={months_back}")

    try:
        df = fetch_series_monthly(series_id)

        if df is not None and not df.empty:
            log_message(f"Fetched {len(df)} records for {series_id}, date range: {df['date'].iloc[0]} to {df['date'].iloc[-1]}")

            # Get current direction if it exists
            current_direction = "positive"
            key = f"series_{series_id}"
            if key in db:
                entry = db.get(key, {})
                current_direction = entry.get("direction", "positive")

                # Compare with existing data
                if "data" in entry and entry["data"]:
                    old_df = pd.DataFrame(entry["data"])
                    if not old_df.empty:
                        log_message(f"Previous data had {len(old_df)} records, date range: {old_df['date'].iloc[0]} to {old_df['date'].iloc[-1]}")
                    else:
                        log_message("Previous data was empty or invalid")
                else:
                    log_message("No previous data found")
            else:
                log_message(f"No existing entry for {series_id}")

            store_series_data(series_id, df, current_direction)
            log_message(f"Successfully stored updated data for {series_id}")
            return True
        else:
            log_message(f"Failed to fetch data for {series_id} - returned empty dataset", "ERROR")
            return False
    except Exception as e:
        log_message(f"Error refreshing data for {series_id}: {str(e)}", "ERROR")
        return False

def refresh_all_series():
    """
    Refresh data for all tracked series.
    """
    log_message("Starting refresh for all series")

    if "series_list" in db:
        series_list = db["series_list"]
        log_message(f"Found {len(series_list)} series to refresh")

        success_count = 0
        for sid in series_list:
            if refresh_series_data(sid):
                success_count += 1

        log_message(f"Completed refresh: {success_count}/{len(series_list)} series successfully updated")
    else:
        log_message("No series found to refresh", "WARNING")

    return True

# ---------------------------------------
# Scheduler for Weekly Updates
# ---------------------------------------
def scheduler_job():
    schedule.every(7).days.do(refresh_all_series)
    while True:
        schedule.run_pending()
        time.sleep(60)

scheduler_thread = threading.Thread(target=scheduler_job, daemon=True)
scheduler_thread.start()

# ---------------------------------------
# Classification & Heatmap
# ---------------------------------------
def get_monthly_classifications(series_id):
    """
    Return a list of (month_str, classification) for the last X months.
    Takes into account the direction setting for the series.
    """
    key = f"series_{series_id}"
    entry = db.get(key)
    if not entry or "data" not in entry:
        return []

    data = entry["data"]  # list of {date: 'YYYY-MM', value: float}
    direction = entry.get("direction", "positive")  # Default to positive if not specified

    data = sorted(data, key=lambda x: x["date"])
    months_back = get_months_back()

    classifications = []
    prev_value = None
    for record in data[-months_back:]:
        month_str = record["date"]
        value = record["value"]
        if prev_value is not None:
            c = classify_value(value, prev_value, direction)
        else:
            c = "grey"
        classifications.append((month_str, c))
        prev_value = value
    return classifications

# ---------------------------------------
# Composite Index Logic
# ---------------------------------------
def get_indicator_df(series_id):
    """
    Return a DataFrame with columns [date, value] from Replit DB for all available months.
    """
    entry = db.get(f"series_{series_id}")
    if not entry or "data" not in entry:
        return pd.DataFrame(columns=["date", "value"])
    recs = entry["data"]
    df = pd.DataFrame(recs)
    df = df.sort_values("date")
    return df

def load_weights():
    """
    Load the user-defined weights from Replit DB. If none, return {}.
    """
    return db.get("user_weights", {})

def save_weights(new_weights):
    """
    Save the user-defined weights to Replit DB.
    """
    db["user_weights"] = new_weights

def get_composite_df(weights_dict):
    """
    Given a dict of {series_id: weight}, compute a weighted average time series.
    Takes into account the direction of each indicator.
    Return a DataFrame with columns [date, composite_value].
    """
    if not weights_dict:
        return pd.DataFrame(columns=["date", "composite_value"])

    combined_df = None
    for sid, w in weights_dict.items():
        df = get_indicator_df(sid)
        if df.empty:
            continue

        # Get the direction for this indicator
        key = f"series_{sid}"
        entry = db.get(key, {})
        direction = entry.get("direction", "positive")

        # If direction is negative, invert the values so that increases are negative contributions
        if direction == "negative":
            # We invert by taking the negative of percent changes
            # First, calculate percent change from first value
            first_val = df['value'].iloc[0]
            if first_val != 0:  # Avoid division by zero
                df['adjusted_value'] = (df['value'] - first_val) / abs(first_val) * -1 + 1
            else:
                # If first value is zero, just use negative of the value
                df['adjusted_value'] = -df['value']
        else:
            # For positive direction, just use regular percent change from first value
            first_val = df['value'].iloc[0]
            if first_val != 0:
                df['adjusted_value'] = (df['value'] - first_val) / abs(first_val) + 1
            else:
                df['adjusted_value'] = df['value']

        # Use the adjusted value for combining
        df = df.rename(columns={"adjusted_value": sid})
        df = df[["date", sid]]

        if combined_df is None:
            combined_df = df
        else:
            combined_df = pd.merge(combined_df, df, on="date", how="outer")

    if combined_df is None:
        return pd.DataFrame(columns=["date", "composite_value"])

    # forward-fill + fill zeros
    combined_df = combined_df.ffill().fillna(0)

    # Weighted sum
    composite_vals = []
    for i, row in combined_df.iterrows():
        total = 0
        for sid, w in weights_dict.items():
            val = row.get(sid, 0)
            total += val * w
        composite_vals.append(total)
    combined_df["composite_value"] = composite_vals
    combined_df = combined_df[["date", "composite_value"]]
    combined_df = combined_df.sort_values("date")

    # Optionally trim to last X months
    months_back = get_months_back()
    if len(combined_df) > months_back:
        combined_df = combined_df.iloc[-months_back:]
    return combined_df

# ---------------------------------------
# Custom Components
# ---------------------------------------
def create_legend():
    """Create a color legend explaining the heatmap colors"""
    legend_items = []
    for color_name, color_value in [
        ("Green", COLOR_SCHEME["green"]), 
        ("Red", COLOR_SCHEME["red"]), 
        ("Grey", COLOR_SCHEME["grey"])
    ]:
        legend_items.append(
            html.Div([
                html.Div(style={
                    "backgroundColor": color_value,
                    "width": "20px",
                    "height": "20px",
                    "display": "inline-block",
                    "marginRight": "8px"
                }),
                html.Span(f"{color_name}: " + {
                    "Green": "Positive trend",
                    "Red": "Negative trend", 
                    "Grey": "Neutral/No change"
                }[color_name])
            ], style={"marginRight": "15px", "display": "inline-block"})
        )

    return html.Div([
        html.Div(legend_items, style={"marginBottom": "5px"}),
        html.Div([
            html.Span("Note: Colors are based on indicator direction settings. ", style={"fontStyle": "italic"}),
            html.Span("For 'Increase is Positive' indicators, green means increasing. ", style={"fontStyle": "italic"}),
            html.Span("For 'Increase is Negative' indicators, green means decreasing.", style={"fontStyle": "italic"})
        ])
    ], style={
        "marginBottom": "15px",
        "padding": "10px",
        "backgroundColor": "#f8f9fa",
        "borderRadius": "5px",
        "border": "1px solid #dee2e6"
    })

def create_loading_container(component_id, loading_message="Loading..."):
    """Create a container with loading animation"""
    return html.Div([
        dcc.Loading(
            id=f"{component_id}-loading",
            type="circle",
            children=html.Div(id=component_id)
        ),
        html.Div(loading_message, id=f"{component_id}-message", style={"textAlign": "center", "display": "none"})
    ])

def create_direction_toggle(series_id, current_direction="positive"):
    """Create a toggle switch for indicator direction"""
    return html.Div([
        html.Span("Direction: ", style={"marginRight": "5px"}),
        dcc.RadioItems(
            id=f"direction-toggle-{series_id}",
            options=[
                {'label': 'Increase is Positive', 'value': 'positive'},
                {'label': 'Increase is Negative', 'value': 'negative'}
            ],
            value=current_direction,
            inline=True,
            style={"fontSize": "12px"}
        )
    ], style={"marginLeft": "10px", "display": "inline-block"})

# ---------------------------------------
# Dash App
# ---------------------------------------
app = dash.Dash(
    __name__, 
    suppress_callback_exceptions=True,
    meta_tags=[
        {"name": "viewport", "content": "width=device-width, initial-scale=1"}
    ]
)
server = app.server

# Add CSS for better styling
app.index_string = '''
<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>Macroeconomic Indicator Dashboard</title>
        {%favicon%}
        {%css%}
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                background-color: #f5f6f7;
            }
            .dashboard-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: white;
                box-shadow: 0 0 10px rgba(0,0,0,0.05);
                border-radius: 8px;
            }
            .header {
                padding: 15px 0;
                margin-bottom: 20px;
                border-bottom: 1px solid #eaeaea;
            }
            .controls-bar {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 10px;
                margin-bottom: 20px;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .indicator-table {
                width: 100%;
                border-collapse: collapse;
            }
            .indicator-table th, .indicator-table td {
                border: 1px solid #dee2e6;
                padding: 8px;
            }
            .indicator-table th {
                background-color: #e9ecef;
                position: sticky;
                top: 0;
            }
            .indicator-table tr:nth-child(even) {
                background-color: #f2f2f2;
            }
            .indicator-table tr:hover {
                background-color: #e2e6ea;
            }
            .navbar {
                background-color: #343a40;
                padding: 10px 20px;
                margin-bottom: 20px;
            }
            .navbar a {
                color: white;
                text-decoration: none;
                padding: 8px 15px;
                border-radius: 4px;
            }
            .navbar a:hover {
                background-color: #495057;
            }
            .navbar a.active {
                background-color: #007bff;
            }
            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            .btn-primary {
                background-color: #007bff;
                color: white;
            }
            .btn-primary:hover {
                background-color: #0069d9;
            }
            .btn-secondary {
                background-color: #6c757d;
                color: white;
            }
            .btn-secondary:hover {
                background-color: #5a6268;
            }
            .form-control {
                padding: 8px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                font-size: 16px;
            }
            .chart-container {
                margin-top: 30px;
                padding: 15px 0px;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                background-color: white;
            }
            .tooltip {
                position: relative;
                display: inline-block;
            }
            .tooltip .tooltiptext {
                visibility: hidden;
                width: 200px;
                background-color: #333;
                color: #fff;
                text-align: center;
                border-radius: 6px;
                padding: 5px;
                position: absolute;
                z-index: 1;
                bottom: 125%;
                left: 50%;
                margin-left: -100px;
                opacity: 0;
                transition: opacity 0.3s;
            }
            .tooltip:hover .tooltiptext {
                visibility: visible;
                opacity: 1;
            }
            .direction-indicator {
                font-size: 12px;
                color: #666;
                font-style: italic;
                margin-left: 5px;
            }
            /* Toggle switch styling */
            .switch {
                position: relative;
                display: inline-block;
                width: 60px;
                height: 24px;
            }
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 24px;
            }
            .slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .slider {
                background-color: #2196F3;
            }
            input:checked + .slider:before {
                transform: translateX(34px);
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

app.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    html.Div([
        html.A("Dashboard Heatmap", id="nav-dashboard", href="/", className="nav-link"),
        html.A("Composite Index", id="nav-composite", href="/composite", className="nav-link"),
    ], className="navbar"),
    # Hidden close button so Dash sees it on init
    html.Button("Close Modal", id="close-modal-btn", style={"display": "none"}, className="btn btn-secondary", n_clicks=0),
    html.Div(id="page-content", className="dashboard-container")
])

# -------------------------------
# Dashboard (Heatmap) Layout
# -------------------------------
def layout_dashboard():
    # Add a header with dashboard title
    header = html.Div([
        html.H1("Macroeconomic Indicator Dashboard", style={"marginBottom": "10px"}),
        html.P([
            "Monitor key economic indicators and their trends. ",
            html.Span("Click on a cell to see the detailed chart, or use the 'Open Modal' button for a larger view.",
                     style={"fontStyle": "italic"})
        ])
    ], className="header")

    # A top panel for adding a new series and refreshing all
    controls_bar = html.Div([
        html.Div([
            html.Label("Add New Indicator:", style={"fontWeight": "bold", "marginRight": "10px"}),
            dcc.Input(
                id="new-series-id",
                type="text",
                placeholder="Enter FRED Series ID (e.g. UNRATE)",
                className="form-control",
                style={"width": "250px", "marginRight": "10px"}
            ),
            html.Button("Add Series", id="add-series-btn", n_clicks=0, className="btn btn-primary")
        ]),
        html.Div([
            html.Button("Refresh All Data", id="refresh-all-btn", n_clicks=0, className="btn btn-secondary"),
            html.Div(id="add-series-msg", style={"color": "#28a745", "marginLeft": "10px", "display": "inline-block"}),
            html.Div(id="global-message", style={"color": "#28a745", "marginLeft": "10px", "display": "inline-block"})
        ]),
        # Add months back controls
        html.Div([
            html.Label("Months to Display:", style={"fontWeight": "bold", "marginRight": "10px"}),
            dcc.Input(
                id="months-back-input",
                type="number",
                value=get_months_back(),
                min=1,
                max=300,
                step=1,
                className="form-control",
                style={"width": "80px", "marginRight": "10px"}
            ),
            html.Button(
                "Apply & Refresh All",
                id="update-months-back-btn",
                n_clicks=0,
                className="btn btn-primary"
            )
        ], style={"display": "flex", "alignItems": "center", "marginLeft": "20px"})
    ], className="controls-bar")

    # Add color legend
    legend = create_legend()

    if "series_list" not in db or not db["series_list"]:
        return html.Div([
            header,
            controls_bar,
            legend,
            html.Div([
                html.H3("No series tracked yet"),
                html.P("Please add a series by entering a FRED Series ID above and clicking 'Add Series'"),
                html.P([
                    "Example FRED IDs to try: ",
                    html.Code("UNRATE"), " (Unemployment Rate, Increase is Negative), ",
                    html.Code("CPIAUCSL"), " (Consumer Price Index, Increase is Negative), ",
                    html.Code("GDP"), " (Gross Domestic Product, Increase is Positive)"
                ])
            ], style={"textAlign": "center", "padding": "30px", "backgroundColor": "#f8f9fa", "borderRadius": "8px"})
        ])

    # Add toggle for showing all months vs recent
    months_back = get_months_back()
    max_display_months = 60  # Maximum months to show in the grid at once

    display_toggle = html.Div([
        html.Label("Time Display:", style={"fontWeight": "bold", "marginRight": "10px"}),
        dcc.RadioItems(
            id="show-all-months-toggle",
            options=[
                {'label': f'Show Recent (max {max_display_months} months)', 'value': 'recent'},
                {'label': f'Show All ({months_back} months)', 'value': 'all' if months_back <= max_display_months * 2 else 'paginated'}
            ],
            value='recent',
            inline=True
        )
    ], style={"marginBottom": "15px"})

    # Add container for the month headers
    month_headers_container = html.Div(id="month-columns-container")

    # Generate list of months for the past 24 months (default view)
    # This will be updated by the callback based on the toggle
    base = datetime.date.today().replace(day=1)
    months_list = []
    for i in range(min(months_back, max_display_months), 0, -1):
        m = base - pd.DateOffset(months=i)
        months_list.append(m.strftime("%Y-%m"))

    # Build table rows
    table_rows = []
    for idx, sid in enumerate(db["series_list"]):
        key = f"series_{sid}"
        entry = db.get(key, {})
        # The stored 'name' field is the official series title
        series_name = entry.get("name", sid)
        direction = entry.get("direction", "positive")

        monthly_class = dict(get_monthly_classifications(sid))

        # 1) Create the row cells for each month (colored squares)
        row_cells = []
        for month_str in months_list:
            color = monthly_class.get(month_str, "grey")
            # Use our enhanced color scheme
            bg_color = COLOR_SCHEME.get(color, "#6c757d")
            cell_id = f"{sid}-{month_str}"
            row_cells.append(
                html.Td(
                    id=cell_id,
                    # Add tooltips for each cell
                    children=html.Div(className="tooltip", children=[
                        "",  # Empty string as placeholder
                        html.Span(
                            f"{sid}: {month_str}",
                            className="tooltiptext"
                        )
                    ]),
                    style={
                        "backgroundColor": bg_color,
                        "width": "30px",
                        "height": "25px",
                        "cursor": "pointer",
                        "textAlign": "center"
                    }
                )
            )

        # 2) Create the direction toggle for this indicator
        direction_toggle = create_direction_toggle(sid, direction)

        # 3) Add a final cell with modal button and direction toggle
        modal_btn_id = f"open-modal-{sid}"
        modal_button = html.Button(
            "Open Modal",
            id=modal_btn_id,
            n_clicks=0,
            className="btn btn-secondary",
            style={"fontSize": "12px", "padding": "4px 8px"}
        )

        # Improved row styling with tooltip for full name
        table_rows.append(
            html.Tr(
                [
                    html.Td([
                        html.Div(className="tooltip", children=[
                            series_name,
                            html.Span(series_name, className="tooltiptext")
                        ]),
                        html.Span(
                            f" ({('Up+' if direction == 'positive' else 'Up-')})",
                            className="direction-indicator"
                        )
                    ], style={
                        "fontWeight": "bold",
                        "whiteSpace": "nowrap",
                        "width": "200px",  # Reduced width for better overall table display
                        "overflow": "hidden",
                        "textOverflow": "ellipsis"  # Add ellipsis for long names
                    }),
                    *row_cells,
                    html.Td([
                        modal_button,
                        direction_toggle
                    ])
                ],
                id=f"row-{sid}"
            )
        )

    # Build the table header
    header_cells = [html.Th("Indicator")] + [
        html.Th(
            m.split("-")[1],  # Just show the month, not the year
            title=m  # Full date as tooltip
        ) for m in months_list
    ] + [html.Th("Actions")]

    # Store initial header
    header = html.Tr(header_cells, id="month-header-row")

    return html.Div([
        header,
        controls_bar,
        legend,
        display_toggle,
        month_headers_container,
        html.Div(
            [
                html.Table(
                    [html.Thead(header), html.Tbody(table_rows)],
                    className="indicator-table",
                    id="indicator-table"
                )
            ],
            style={"overflowX": "auto", "marginBottom": "20px"}
        ),
        html.Div([
            html.H3("Indicator Details", style={"marginBottom": "15px", "textAlign": "left"}),
            html.Div(id="inline-chart-container", style={"textAlign": "left", "padding": "0px"})
        ], className="chart-container", style={"textAlign": "left", "padding": "0px"}),
        html.Div(id="modal-container")
    ])

# -------------------------------
# Composite Page Layout
# -------------------------------
def layout_composite():
    series_list = db.get("series_list", [])
    weight_data = load_weights()

    # If empty, default to equal
    if not weight_data and series_list:
        default_w = 1.0 / len(series_list)
        for sid in series_list:
            weight_data[sid] = default_w

    rows = []
    for sid in series_list:
        wval = weight_data.get(sid, 0)

        # Get the full name and direction for the indicator
        entry = db.get(f"series_{sid}", {})
        series_name = entry.get("name", sid)
        direction = entry.get("direction", "positive")

        rows.append(html.Div([
            html.Div([
                html.Div(className="tooltip", children=[
                    html.Span(sid, style={"fontWeight": "bold"}),
                    html.Span(series_name, className="tooltiptext")
                ]),
                html.Span(
                    f" ({('Increase is Positive' if direction == 'positive' else 'Increase is Negative')})",
                    className="direction-indicator"
                )
            ], style={"width": "300px", "display": "inline-block"}),
            dcc.Input(
                id=f"weight-input-{sid}",
                type="number",
                value=wval,
                min=0, max=1, step=0.01,
                className="form-control",
                style={"width": "100px", "marginRight": "20px"}
            )
        ], style={"marginBottom": "10px", "display": "flex", "alignItems": "center"}))

    header = html.Div([
        html.H1("Composite Economic Index", style={"marginBottom": "10px"}),
        html.P([
            "This page displays a weighted average of all your tracked indicators, adjusted for their direction. ",
            "For indicators where 'Increase is Negative' (like inflation), the values are inverted so that ",
            "improvements always contribute positively to the composite index."
        ])
    ], className="header")

    return html.Div([
        header,
        html.Div([
            html.H3("Composite Index Chart"),
            create_loading_container("composite-chart-container")
        ], className="chart-container"),
        html.Div([
            html.H3("Adjust Indicator Weights", style={"marginBottom": "15px"}),
            html.P("Set the relative importance of each indicator in the composite index. Weights will be normalized to sum to 1."),
            html.Div(rows),
            html.Div([
                html.Button("Apply & Save Weights", id="save-weights-btn", n_clicks=0, className="btn btn-primary"),
                html.Button("Reset to Equal Weights", id="reset-weights-btn", n_clicks=0, 
                            className="btn btn-secondary", style={"marginLeft": "10px"})
            ], style={"marginTop": "15px"}),
            html.Div(id="weights-save-msg", style={"color": "#28a745", "marginTop": "10px"})
        ], className="chart-container")
    ])

# -------------------------------
# Routing
# -------------------------------
@app.callback(
    [Output("page-content", "children"),
     Output("nav-dashboard", "className"),
     Output("nav-composite", "className")],
    Input("url", "pathname")
)
def display_page(pathname):
    if pathname == "/composite":
        return layout_composite(), "nav-link", "nav-link active"
    return layout_dashboard(), "nav-link active", "nav-link"

# -------------------------------
# Callback: Display Toggle
# -------------------------------
@app.callback(
    Output("month-header-row", "children"),
    [Input("show-all-months-toggle", "value")],
    prevent_initial_call=True
)
def update_months_display(show_mode):
    """
    Update the header columns based on display mode.
    """
    # Calculate how many months to show
    months_back = get_months_back()
    max_display_months = 60

    if show_mode == 'all':
        display_months = months_back
    else:
        display_months = min(max_display_months, months_back)

    # Generate list of months
    base = datetime.date.today().replace(day=1)
    months_list = []
    for i in range(display_months, 0, -1):
        m = base - pd.DateOffset(months=i)
        months_list.append(m.strftime("%Y-%m"))

    # Generate header cells
    header_cells = [html.Th("Indicator")] + [
        html.Th(
            m.split("-")[1],  # Just show the month, not the year
            title=m  # Full date as tooltip
        ) for m in months_list
    ] + [html.Th("Actions")]

    return header_cells

# -------------------------------
# Callback: Months Back Setting
# -------------------------------
@app.callback(
    Output("global-message", "children"),
    [Input("update-months-back-btn", "n_clicks")],
    [State("months-back-input", "value")],
    prevent_initial_call=True
)
def update_months_back(n_clicks, new_value):
    """Update the MONTHS_BACK setting and refresh all data."""
    if not new_value:
        return "Please enter a valid number of months."

    try:
        log_message(f"Updating MONTHS_BACK setting to {new_value}")
        # Update the setting
        if set_months_back(new_value):
            # Perform a full refresh on all series
            if "series_list" in db:
                success = refresh_all_series()
                if success:
                    return f"Updated to show {new_value} months of data and refreshed all indicators."
                else:
                    return f"Updated to show {new_value} months, but some indicators failed to refresh."
            return f"Updated to show {new_value} months of data."
        else:
            return "Failed to update months setting. Please enter a valid number."
    except Exception as e:
        log_message(f"Error updating MONTHS_BACK: {str(e)}", "ERROR")
        return f"Error: {str(e)}"

# -------------------------------
# Callback: Direction Toggle
# -------------------------------
@app.callback(
    Output("global-message", "children", allow_duplicate=True),
    [Input(f"direction-toggle-{sid}", "value") for sid in db.get("series_list", [])],
    [State(f"direction-toggle-{sid}", "id") for sid in db.get("series_list", [])],
    prevent_initial_call=True
)
def update_direction(*args):
    """
    Update the direction setting for an indicator when toggled.
    """
    ctx = callback_context
    if not ctx.triggered:
        return ""

    # Get the toggle that was changed and its new value
    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]
    new_value = ctx.triggered[0]["value"]  # Get the value from the triggered input

    # Get series ID from trigger_id
    series_id = trigger_id.replace("direction-toggle-", "")

    try:
        # Update the direction in the database
        update_series_direction(series_id, new_value)
        return f"Updated direction for {series_id} to '{new_value}'"
    except Exception as e:
        return f"Error updating direction: {str(e)}"

# -------------------------------
# Callback: Cell Click => Inline Chart
# -------------------------------
@app.callback(
    Output("inline-chart-container", "children"),
    [
        Input(f"{sid}-{(datetime.date.today().replace(day=1) - pd.DateOffset(months=i)).strftime('%Y-%m')}", "n_clicks")
        for sid in db.get("series_list", [])
        for i in range(get_months_back(), 0, -1)
    ],
    prevent_initial_call=True
)
def handle_cell_click(*args):
    """
    Single-click a cell => show an inline chart below the table.
    """
    ctx = callback_context
    if not ctx.triggered:
        return ""

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]
    parts = trigger_id.split("-")
    if len(parts) < 2:
        return ""

    sid = parts[0]
    month_str = "-".join(parts[1:])  # e.g. 2023-01

    df = get_indicator_df(sid)
    if df.empty:
        return html.Div([
            html.Div("No data available for this indicator", 
                     style={"textAlign": "center", "padding": "20px", "color": "#dc3545"})
        ])

    # Get the full name and direction for the indicator
    entry = db.get(f"series_{sid}", {})
    series_name = entry.get("name", sid)
    direction = entry.get("direction", "positive")

    # Improve chart styling
    fig = px.line(df, x="date", y="value", title=f"{series_name} ({sid})")
    fig.update_layout(
        height=400,
        margin=dict(l=0, r=40, t=60, b=40),  # Reduce left margin to 0
        hovermode="x unified",
        plot_bgcolor="white",
        paper_bgcolor="white",
        title={"font": {"size": 18, "color": "#333"}, "x": 0},  # Position title at far left
        xaxis={"title": "Date", "showgrid": True, "gridcolor": "#eee"},
        yaxis={"title": "Value", "showgrid": True, "gridcolor": "#eee"}
    )
    fig.update_traces(line=dict(width=2))

    # Add a note about the direction interpretation
    direction_note = html.Div([
        html.Span(
            f"Note: For this indicator, an increase is {'positive' if direction == 'positive' else 'negative'}.",
            style={"fontStyle": "italic", "fontSize": "14px", "color": "#666"}
        )
    ], style={"marginTop": "10px", "textAlign": "center"})

    return html.Div([
        dcc.Graph(figure=fig, config={"displayModeBar": True, "responsive": True}),
        direction_note
    ], style={"textAlign": "left"})  # Align chart container to the left

# -------------------------------
# Single Callback: Open/Close Modal
# -------------------------------
@app.callback(
    Output("modal-container", "children"),
    [Input("close-modal-btn", "n_clicks")] +
    [Input(f"open-modal-{sid}", "n_clicks") for sid in db.get("series_list", [])],
    prevent_initial_call=True
)
def manage_modal(n_close, *open_clicks):
    """
    If 'close-modal-btn' triggered => clear the modal (return "").
    Else find which open-modal-{sid} triggered => show that indicator's big chart.
    """
    ctx = callback_context
    if not ctx.triggered:
        return ""

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]
    if trigger_id == "close-modal-btn":
        return ""

    sid = trigger_id.replace("open-modal-", "")
    df = get_indicator_df(sid)
    if df.empty:
        return ""

    # Get the full name and direction for the indicator
    entry = db.get(f"series_{sid}", {})
    series_name = entry.get("name", sid)
    direction = entry.get("direction", "positive")

    # Enhanced chart with better styling
    fig = px.line(df, x="date", y="value", title=f"{series_name} ({sid})")
    fig.update_layout(
        height=600,
        margin=dict(l=0, r=40, t=60, b=40),  # Reduce left margin to 0
        hovermode="x unified",
        plot_bgcolor="white",
        paper_bgcolor="white",
        title={"font": {"size": 20, "color": "#333"}, "x": 0},  # Position title at far left
        xaxis={"title": "Date", "showgrid": True, "gridcolor": "#eee"},
        yaxis={"title": "Value", "showgrid": True, "gridcolor": "#eee"}
    )
    fig.update_traces(line=dict(width=3))

    # Add a note about the direction
    direction_note = f"For this indicator, an increase is {'positive' if direction == 'positive' else 'negative'}."

    return html.Div([
        html.Div(
            style={
                "position": "fixed",
                "top": 0,
                "left": 0,
                "width": "100%",
                "height": "100%",
                "backgroundColor": "rgba(0,0,0,0.7)",
                "zIndex": 9999,
                "display": "flex",
                "justifyContent": "center",
                "alignItems": "center"
            },
            children=[
                html.Div([
                    html.Div([
                        html.H3(f"{series_name}", style={"margin": "0", "flex": "1"}),
                        html.Button(
                            "×",
                            id="close-modal-btn",
                            n_clicks=0,
                            style={
                                "background": "none",
                                "border": "none",
                                "fontSize": "30px",
                                "cursor": "pointer",
                                "color": "#333"
                            }
                        )
                    ], style={
                        "display": "flex", 
                        "justifyContent": "space-between", 
                        "alignItems": "center",
                        "borderBottom": "1px solid #eaeaea",
                        "padding": "10px 20px"
                    }),
                    dcc.Graph(figure=fig, config={"displayModeBar": True, "responsive": True}),
                    html.Div(
                        direction_note,
                        style={
                            "textAlign": "center",
                            "padding": "10px",
                            "fontStyle": "italic",
                            "color": "#666"
                        }
                    )
                ],
                style={
                    "position": "relative",
                    "margin": "50px auto",
                    "width": "90%",
                    "maxWidth": "1200px",
                    "maxHeight": "90vh",
                    "backgroundColor": "#fff",
                    "borderRadius": "8px",
                    "overflow": "hidden",
                    "boxShadow": "0 4px 20px rgba(0,0,0,0.2)",
                    "textAlign": "left"  # Align modal content to the left
                })
            ]
        )
    ])

# -------------------------------
# Composite Page Callbacks
# -------------------------------
@app.callback(
    [Output("weights-save-msg", "children"),
     Output("composite-chart-container", "children")],
    [Input("save-weights-btn", "n_clicks"),
     Input("reset-weights-btn", "n_clicks"),
     Input("url", "pathname")],
    [State(f"weight-input-{sid}", "value") for sid in db.get("series_list", [])]
)
def update_composite(n_clicks, n_reset, pathname, *weight_values):
    """
    Handle composite page interactions:
    - Page load on /composite
    - Saving weights when user clicks 'Apply & Save Weights'
    - Resetting weights to equal when user clicks 'Reset to Equal Weights'
    """
    # If we're not on /composite, return empty
    if pathname != "/composite":
        return "", ""

    series_list = db.get("series_list", [])
    if not series_list:
        return "No series found to weight.", html.Div("Please add indicators on the dashboard page first.")

    ctx = callback_context
    if not ctx.triggered:
        # No triggers => just load existing
        stored_weights = load_weights()

        # If empty, default to equal
        if not stored_weights and series_list:
            default_w = 1.0 / len(series_list)
            for sid in series_list:
                stored_weights[sid] = default_w
            save_weights(stored_weights)

        comp_df = get_composite_df(stored_weights)
        if comp_df.empty:
            return "No data to display in composite.", html.Div("No data available for composite index.")

        # Improved chart styling
        fig = px.line(comp_df, x="date", y="composite_value", title="Composite Economic Index")
        fig.update_layout(
            height=400,
            margin=dict(l=0, r=40, t=60, b=40),  # Reduce left margin to 0
            hovermode="x unified",
            plot_bgcolor="white",
            paper_bgcolor="white",
            title={"font": {"size": 18, "color": "#333"}, "x": 0},  # Position title at far left
            xaxis={"title": "Date", "showgrid": True, "gridcolor": "#eee"},
            yaxis={"title": "Index Value", "showgrid": True, "gridcolor": "#eee"}
        )
        fig.update_traces(line=dict(width=3, color="#007bff"))

        return "", dcc.Graph(figure=fig, config={"displayModeBar": True, "responsive": True})

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    # If triggered by url => page load
    if trigger_id == "url":
        stored_weights = load_weights()

        # If empty, default to equal
        if not stored_weights and series_list:
            default_w = 1.0 / len(series_list)
            for sid in series_list:
                stored_weights[sid] = default_w
            save_weights(stored_weights)

        comp_df = get_composite_df(stored_weights)
        if comp_df.empty:
            return "No data to display in composite.", html.Div("No data available for composite index.")

        # Enhanced chart
        fig = px.line(comp_df, x="date", y="composite_value", title="Composite Economic Index")
        fig.update_layout(
            height=400,
            margin=dict(l=0, r=40, t=60, b=40),  # Reduce left margin to 0
            hovermode="x unified",
            plot_bgcolor="white",
            paper_bgcolor="white",
            title={"font": {"size": 18, "color": "#333"}, "x": 0},  # Position title at far left
            xaxis={"title": "Date", "showgrid": True, "gridcolor": "#eee"},
            yaxis={"title": "Index Value", "showgrid": True, "gridcolor": "#eee"}
        )
        fig.update_traces(line=dict(width=3, color="#007bff"))

        return "", dcc.Graph(figure=fig, config={"displayModeBar": True, "responsive": True})

    # If triggered by reset button
    if trigger_id == "reset-weights-btn":
        default_w = 1.0 / len(series_list)
        new_wdict = {sid: default_w for sid in series_list}
        save_weights(new_wdict)

        comp_df = get_composite_df(new_wdict)
        if comp_df.empty:
            return "Weights reset to equal. (No data available)", html.Div("No data available for composite index.")

        fig = px.line(comp_df, x="date", y="composite_value", title="Composite Economic Index")
        fig.update_layout(
            height=400,
            margin=dict(l=0, r=40, t=60, b=40),  # Reduce left margin to 0
            hovermode="x unified",
            plot_bgcolor="white",
            paper_bgcolor="white",
            title={"font": {"size": 18, "color": "#333"}, "x": 0},  # Position title at far left
            xaxis={"title": "Date", "showgrid": True, "gridcolor": "#eee"},
            yaxis={"title": "Index Value", "showgrid": True, "gridcolor": "#eee"}
        )
        fig.update_traces(line=dict(width=3, color="#007bff"))

        return "Weights reset to equal values.", dcc.Graph(figure=fig, config={"displayModeBar": True, "responsive": True})

    # Otherwise, user clicked "save-weights-btn"
    weight_values = [float(wv) if wv is not None else 0 for wv in weight_values]
    s = sum(weight_values)
    if s > 0:
        weight_values = [wv / s for wv in weight_values]
    else:
        # If all weights are 0, revert to equal weights
        weight_values = [1.0 / len(series_list) for _ in series_list]

    new_wdict = {}
    for sid, wv in zip(series_list, weight_values):
        new_wdict[sid] = wv
    save_weights(new_wdict)

    comp_df = get_composite_df(new_wdict)
    if comp_df.empty:
        return "Weights saved. (No data available)", html.Div("No data available for composite index.")

    fig = px.line(comp_df, x="date", y="composite_value", title="Composite Economic Index")
    fig.update_layout(
        height=400,
        margin=dict(l=40, r=40, t=60, b=40),
        hovermode="x unified",
        plot_bgcolor="white",
        paper_bgcolor="white",
        title={"font": {"size": 18, "color": "#333"}},
        xaxis={"title": "Date", "showgrid": True, "gridcolor": "#eee"},
        yaxis={"title": "Index Value", "showgrid": True, "gridcolor": "#eee"}
    )
    fig.update_traces(line=dict(width=3, color="#007bff"))

    return "Weights saved successfully.", dcc.Graph(figure=fig, config={"displayModeBar": True, "responsive": True})

# -------------------------------
# Callbacks for Add Series & Refresh All
# -------------------------------
@app.callback(
    Output("add-series-msg", "children"),
    Input("add-series-btn", "n_clicks"),
    State("new-series-id", "value"),
    prevent_initial_call=True
)
def add_series(n_clicks, new_id):
    """
    Add a new FRED series by ID, fetch & store it in DB.
    """
    if not new_id:
        return "Please enter a FRED Series ID."
    new_id = new_id.strip().upper()  # Normalize to uppercase for FRED IDs

    try:
        log_message(f"Adding new series: {new_id}")
        refresh_series_data(new_id)
        # Check if it was actually added
        if f"series_{new_id}" in db:
            entry = db.get(f"series_{new_id}", {})
            series_name = entry.get("name", new_id)
            return f"Added: {series_name} ({new_id})"
        else:
            return f"Failed to add series: {new_id}. Please check the ID and try again."
    except Exception as e:
        log_message(f"Error adding series {new_id}: {str(e)}", "ERROR")
        return f"Error: {str(e)}"

@app.callback(
    Output("add-series-msg", "children", allow_duplicate=True),
    Input("refresh-all-btn", "n_clicks"),
    prevent_initial_call=True
)
def refresh_all_button(n_clicks):
    """Handle the Refresh All button click."""
    try:
        log_message("Manual refresh triggered")
        result = refresh_all_series()
        return "All series refreshed successfully." if result else "Some series failed to refresh."
    except Exception as e:
        log_message(f"Error during manual refresh: {str(e)}", "ERROR")
        return f"Error refreshing data: {str(e)}"

# ---------------------------------------
# Run Server
# ---------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8050))
    app.run_server(host="0.0.0.0", port=port, debug=True)