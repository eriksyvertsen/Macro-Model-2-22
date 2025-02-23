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

# -------------------------------
# Initialize FRED API client
# -------------------------------
FRED_API_KEY = os.environ.get("FRED_API_KEY")
fred = Fred(api_key=FRED_API_KEY)

# -------------------------------
# Classification Function
# -------------------------------
def classify_series(data, up_threshold=0.01, acceleration_threshold=0):
    """
    Given a list of data records (each a dict with keys "date" and "value"),
    compute the percentage change (first derivative) and the change in that rate
    (second derivative) using the last three points.
    Returns one of: "green", "red", "yellow", or "grey".
    """
    if len(data) < 3:
        return "grey"
    try:
        v1 = data[-3]["value"]
        v2 = data[-2]["value"]
        v3 = data[-1]["value"]
        # Avoid division by zero
        first_prev = (v2 - v1) / abs(v1) if v1 != 0 else 0
        first_last = (v3 - v2) / abs(v2) if v2 != 0 else 0
        second_deriv = first_last - first_prev

        if abs(first_last) < up_threshold:
            return "grey"
        elif first_last > 0 and second_deriv >= acceleration_threshold:
            return "green"
        elif first_last > 0 and second_deriv < acceleration_threshold:
            return "yellow"
        elif first_last < 0 and second_deriv <= -acceleration_threshold:
            return "red"
        elif first_last < 0 and second_deriv > -acceleration_threshold:
            return "yellow"
        else:
            return "grey"
    except Exception as e:
        print("Classification error:", e)
        return "grey"

# -------------------------------
# FRED API Data Fetching
# -------------------------------
def fetch_series(series_id):
    """
    Fetch time-series data from FRED for the given series_id.
    Returns a list of records with keys: "date" and "value".
    """
    try:
        series = fred.get_series(series_id)
        df = series.reset_index()
        df.columns = ["date", "value"]
        df["date"] = df["date"].astype(str)
        records = df.to_dict("records")
        return records
    except Exception as e:
        print(f"Error fetching series {series_id}: {e}")
        return None

# -------------------------------
# Replit DB Functions
# -------------------------------
def add_series_to_db(series_id, data):
    """
    Store a new series (by FRED series ID) and its data in Replit DB.
    """
    key = f"series_{series_id}"
    db[key] = {"id": series_id, "data": data}
    # Update a master list of series IDs
    if "series_list" in db:
        series_list = db["series_list"]
        if series_id not in series_list:
            series_list.append(series_id)
            db["series_list"] = series_list
    else:
        db["series_list"] = [series_id]

def refresh_series(series_id):
    """
    Refresh a specific series’ data from FRED and update the DB.
    """
    data = fetch_series(series_id)
    if data is not None:
        key = f"series_{series_id}"
        entry = db.get(key, {"id": series_id})
        entry["data"] = data
        db[key] = entry
        print(f"Refreshed series {series_id}")
    else:
        print(f"Failed to refresh series {series_id}")

def refresh_all_series():
    """
    Iterate over all tracked series and refresh their data.
    """
    if "series_list" in db:
        for series_id in db["series_list"]:
            refresh_series(series_id)
    print("All series refreshed.")

# -------------------------------
# Scheduler for Weekly Updates
# -------------------------------
def scheduler():
    # Schedule refresh_all_series() to run every 7 days
    schedule.every(7).days.do(refresh_all_series)
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

# Start scheduler in a background thread
scheduler_thread = threading.Thread(target=scheduler, daemon=True)
scheduler_thread.start()

# -------------------------------
# Dash App & Layout
# -------------------------------
app = dash.Dash(__name__)
server = app.server  # For deployment on Replit

app.layout = html.Div([
    html.H1("Macroeconomic Indicator Dashboard"),
    html.Div([
        dcc.Input(id="series-input", type="text", placeholder="Enter FRED Series ID"),
        html.Button("Add Series", id="add-button", n_clicks=0),
        html.Button("Refresh Data", id="refresh-button", n_clicks=0),
        html.Div(id="add-message", style={"color": "red", "marginTop": "10px"})
    ], style={"marginBottom": "20px"}),
    dcc.Interval(id="interval-component", interval=30*1000, n_intervals=0),  # Poll every 30 seconds
    html.Div(id="series-cards")
])

# -------------------------------
# Callbacks
# -------------------------------
# Callback to add a new series when the "Add Series" button is clicked.
@app.callback(
    [Output("add-message", "children"),
     Output("series-input", "value")],
    Input("add-button", "n_clicks"),
    State("series-input", "value")
)
def add_series(n_clicks, series_id):
    if n_clicks > 0 and series_id:
        data = fetch_series(series_id)
        if data is None:
            return f"Failed to fetch series: {series_id}", ""
        add_series_to_db(series_id, data)
        return f"Added series: {series_id}", ""
    return "", ""

# Callback to update the series cards.
# This callback is triggered by the interval component and the refresh button.
@app.callback(
    Output("series-cards", "children"),
    [Input("interval-component", "n_intervals"),
     Input("refresh-button", "n_clicks")]
)
def update_series_cards(n_intervals, refresh_clicks):
    ctx = callback_context
    if ctx.triggered:
        trigger_id = ctx.triggered[0]["prop_id"]
        if "refresh-button" in trigger_id:
            refresh_all_series()
    cards = []
    if "series_list" in db:
        for series_id in db["series_list"]:
            key = f"series_{series_id}"
            entry = db.get(key)
            if entry and "data" in entry:
                data = entry["data"]
                if data:
                    df = pd.DataFrame(data)
                    fig = px.line(df, x="date", y="value", title=series_id)
                    classification = classify_series(data)
                    # Set color based on classification
                    if classification == "green":
                        color = "green"
                    elif classification == "red":
                        color = "red"
                    elif classification == "yellow":
                        color = "orange"
                    else:
                        color = "grey"
                    card = html.Div([
                        html.H3(f"{series_id} - {classification.upper()}", style={"color": color}),
                        dcc.Graph(figure=fig)
                    ], style={"border": "1px solid #ccc", "padding": "10px", "marginBottom": "20px"})
                    cards.append(card)
    return cards

# -------------------------------
# Run the App
# -------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8050))  # Replit provides the PORT environment variable
    app.run_server(host="0.0.0.0", port=port, debug=True)
