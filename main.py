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

# We'll fetch data for the last 5 years (monthly)
MONTHS_BACK = 60  # e.g. 5 years * 12 months

# ---------------------------------------
# Classification Function
# ---------------------------------------
def classify_value(value, prev_value, direction_factor=1, up_threshold=0.0001):
    """
    Incorporate direction_factor (+1 or -1).
    If direction_factor = -1, we invert the sign of the change so that
    'positive' moves become negative, etc.

      - If |change| < up_threshold => grey
      - If change > 0 => green
      - Else => red
    """
    if prev_value is None or prev_value == 0:
        return "grey"

    # Multiply the derivative by direction_factor
    change = direction_factor * (value - prev_value) / abs(prev_value)

    if abs(change) < up_threshold:
        return "grey"
    elif change > 0:
        return "green"
    else:
        return "red"

def get_series_direction_factor(series_id):
    """
    Read directionFactor from DB for the given series (default = +1).
    """
    entry = db.get(f"series_{series_id}", {})
    return entry.get("directionFactor", 1)

# ---------------------------------------
# Helper to Fetch Series Title from FRED
# ---------------------------------------
def get_series_name(series_id):
    try:
        info = fred.get_series_info(series_id)
        return info.get("title", series_id)
    except Exception as e:
        print(f"Warning: could not fetch series info for {series_id}: {e}")
        return series_id

# ---------------------------------------
# Data Fetching & Storage
# ---------------------------------------
def fetch_series_monthly(series_id):
    try:
        end_date = datetime.datetime.today()
        start_date = end_date - pd.DateOffset(months=MONTHS_BACK + 1)
        raw_series = fred.get_series(series_id, observation_start=start_date, observation_end=end_date)
        df = raw_series.reset_index()
        df.columns = ["date", "value"]
        # monthly freq (month end)
        df = df.set_index("date").resample("ME").last().dropna().reset_index()
        df["date"] = df["date"].dt.strftime("%Y-%m")
        df = df.sort_values("date")
        return df
    except Exception as e:
        print(f"Error fetching monthly series {series_id}: {e}")
        return None

def store_series_data(series_id, df):
    if df is None:
        return
    name = get_series_name(series_id)
    records = df.to_dict("records")
    key = f"series_{series_id}"

    # Preserve existing directionFactor if set
    existing = db.get(key, {})
    directionFactor = existing.get("directionFactor", 1)

    db[key] = {
        "id": series_id,
        "name": name,
        "data": records,
        "directionFactor": directionFactor
    }

    if "series_list" in db:
        s_list = db["series_list"]
        if series_id not in s_list:
            s_list.append(series_id)
            db["series_list"] = s_list
    else:
        db["series_list"] = [series_id]

def refresh_series_data(series_id):
    df = fetch_series_monthly(series_id)
    if df is not None:
        store_series_data(series_id, df)
        print(f"Refreshed data for {series_id}")
    else:
        print(f"Failed to refresh data for {series_id}")

def refresh_all_series():
    if "series_list" in db:
        for sid in db["series_list"]:
            refresh_series_data(sid)
    print("All series refreshed.")

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
    For the last MONTHS_BACK months, compute classification (red/green/grey).
    Takes into account directionFactor (positive=good or positive=bad).
    """
    key = f"series_{series_id}"
    entry = db.get(key)
    if not entry or "data" not in entry:
        return []

    data = entry["data"]
    data = sorted(data, key=lambda x: x["date"])
    directionFactor = entry.get("directionFactor", 1)

    classifications = []
    prev_value = None
    for record in data[-MONTHS_BACK:]:
        month_str = record["date"]
        value = record["value"]
        if prev_value is not None:
            c = classify_value(value, prev_value, direction_factor=directionFactor)
        else:
            c = "grey"
        classifications.append((month_str, c))
        prev_value = value
    return classifications

# ---------------------------------------
# Composite Index Logic
# ---------------------------------------
def get_indicator_df(series_id):
    entry = db.get(f"series_{series_id}")
    if not entry or "data" not in entry:
        return pd.DataFrame(columns=["date", "value"])
    recs = entry["data"]
    df = pd.DataFrame(recs)
    df = df.sort_values("date")
    return df

def load_weights():
    return db.get("user_weights", {})

def save_weights(new_weights):
    db["user_weights"] = new_weights

def get_composite_df(weights_dict):
    """
    Weighted average time series for up to MONTHS_BACK months.
    We also apply the directionFactor for each series (inverting if + or -).
    """
    if not weights_dict:
        return pd.DataFrame(columns=["date", "composite_value"])

    combined_df = None
    for sid, w in weights_dict.items():
        entry = db.get(f"series_{sid}", {})
        directionFactor = entry.get("directionFactor", 1)

        df = get_indicator_df(sid)
        if df.empty:
            continue
        # multiply 'value' by directionFactor
        df["adjustedValue"] = df["value"] * directionFactor

        # rename to sid so we can pivot
        df = df.rename(columns={"adjustedValue": sid})
        # remove original 'value' col to avoid confusion
        df = df.drop(columns=["value"], errors="ignore")

        if combined_df is None:
            combined_df = df
        else:
            combined_df = pd.merge(combined_df, df, on="date", how="outer")

    if combined_df is None:
        return pd.DataFrame(columns=["date", "composite_value"])

    combined_df = combined_df.ffill().fillna(0)

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

    # Trim to last MONTHS_BACK
    if len(combined_df) > MONTHS_BACK:
        combined_df = combined_df.iloc[-MONTHS_BACK:]
    return combined_df

# ---------------------------------------
# Dash App
# ---------------------------------------
app = dash.Dash(__name__, suppress_callback_exceptions=True)
server = app.server

app.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    html.Div([
        html.A("Dashboard Heatmap", href="/", style={"marginRight": "20px"}),
        html.A("Composite Index", href="/composite"),
    ], style={"marginBottom": "20px"}),

    # We'll keep an 'X' close button for the modal
    html.Button("×", id="close-modal-btn", style={"display": "none"}, n_clicks=0),

    # A hidden dummy div to avoid duplicate callback outputs
    html.Div(id="direction-dummy-output", style={"display": "none"}),

    html.Div(id="page-content")
])

# -------------------------------
# Dashboard (Heatmap) Layout
# -------------------------------
def layout_dashboard():
    # A top panel for adding a new series and refreshing all
    controls_bar = html.Div([
        dcc.Input(
            id="new-series-id",
            type="text",
            placeholder="Enter FRED Series ID (e.g. UNRATE)",
            style={"marginRight": "10px"}
        ),
        html.Button("Add Series", id="add-series-btn", n_clicks=0, style={"marginRight": "20px"}),
        html.Button("Refresh All", id="refresh-all-btn", n_clicks=0),
        html.Div(id="add-series-msg", style={"color": "blue", "marginTop": "10px"}),
        html.Div(id="global-message", style={"color": "green", "marginTop": "10px"})
    ], style={"marginBottom": "20px"})

    if "series_list" not in db or not db["series_list"]:
        return html.Div([
            controls_bar,
            html.H3("No series tracked yet. Please add some or refresh.")
        ])

    base = datetime.date.today().replace(day=1)
    months_list = []
    for i in range(MONTHS_BACK, 0, -1):
        m = base - pd.DateOffset(months=i)
        months_list.append(m.strftime("%Y-%m"))

    table_rows = []
    for sid in db["series_list"]:
        key = f"series_{sid}"
        entry = db.get(key, {})
        series_name = entry.get("name", sid)
        directionFactor = entry.get("directionFactor", 1)

        # Build direction dropdown
        direction_dropdown = dcc.Dropdown(
            id=f"direction-dropdown-{sid}",
            options=[
                {"label": "Positive is Good", "value": 1},
                {"label": "Positive is Bad",  "value": -1}
            ],
            value=directionFactor,
            clearable=False,
            style={"width": "150px"}
        )

        monthly_class = dict(get_monthly_classifications(sid))
        row_cells = []
        for month_str in months_list:
            color = monthly_class.get(month_str, "grey")
            cell_id = f"{sid}-{month_str}"
            row_cells.append(
                html.Td(
                    id=cell_id,
                    style={
                        "backgroundColor": color,
                        "width": "50px",
                        "height": "25px",
                        "cursor": "pointer",
                        "textAlign": "center"
                    }
                )
            )

        modal_btn_id = f"open-modal-{sid}"
        modal_button = html.Button(
            "Open Modal",
            id=modal_btn_id,
            n_clicks=0,
            style={"marginLeft": "10px"}
        )

        table_rows.append(
            html.Tr(
                [
                    html.Td(
                        series_name,
                        style={
                            "fontWeight": "bold",
                            "whiteSpace": "nowrap",
                            "width": "300px"
                        }
                    ),
                    *row_cells,
                    html.Td(direction_dropdown, style={"verticalAlign": "middle"}),
                    html.Td(modal_button)
                ],
                id=f"row-{sid}"
            )
        )

    header_cells = (
        [html.Th("Indicator")]
        + [html.Th(m) for m in months_list]
        + [html.Th("Direction"), html.Th("Actions")]
    )
    header = html.Tr(header_cells)

    return html.Div([
        controls_bar,
        html.Table(
            [html.Thead(header), html.Tbody(table_rows)],
            style={"borderCollapse": "collapse", "border": "1px solid #ccc"}
        ),
        html.Div(id="inline-chart-container", style={"marginTop": "20px"}),
        html.Div(id="modal-container")
    ])

# -------------------------------
# Composite Page Layout
# -------------------------------
def layout_composite():
    series_list = db.get("series_list", [])
    weight_data = db.get("user_weights", {})

    # If the number of series changed, reset to equal weighting
    if series_list and len(series_list) != len(weight_data):
        default_w = 1.0 / len(series_list)
        new_wdict = {}
        for sid in series_list:
            new_wdict[sid] = default_w
        save_weights(new_wdict)
        weight_data = new_wdict

    rows = []
    for sid in series_list:
        wval = weight_data.get(sid, 0)
        rows.append(html.Div([
            html.Span(sid, style={"display": "inline-block", "width": "150px"}),
            dcc.Input(
                id=f"weight-input-{sid}",
                type="number",
                value=wval,
                min=0, max=1, step=0.01,
                style={"width": "80px", "marginRight": "20px"}
            )
        ], style={"marginBottom": "5px"}))

    return html.Div([
        html.H3("Composite Index"),
        html.Div(id="composite-chart-container"),
        html.Div([
            html.H4("Adjust Weights (normalized to sum=1)"),
            html.Div(rows),
            html.Button("Apply & Save Weights", id="save-weights-btn", n_clicks=0),
            html.Div(id="weights-save-msg", style={"color": "green", "marginTop": "10px"})
        ], style={"marginTop": "30px"})
    ])

# -------------------------------
# Routing
# -------------------------------
@app.callback(Output("page-content", "children"), Input("url", "pathname"))
def display_page(pathname):
    if pathname == "/composite":
        return layout_composite()
    return layout_dashboard()

# -------------------------------
# Cell Click => Inline Chart
# -------------------------------
@app.callback(
    Output("inline-chart-container", "children"),
    [
        Input(f"{sid}-{(datetime.date.today().replace(day=1) - pd.DateOffset(months=i)).strftime('%Y-%m')}", "n_clicks")
        for sid in db.get("series_list", [])
        for i in range(MONTHS_BACK, 0, -1)
    ],
    prevent_initial_call=True
)
def handle_cell_click(*args):
    ctx = callback_context
    if not ctx.triggered:
        return ""
    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]
    parts = trigger_id.split("-")
    if len(parts) < 2:
        return ""
    sid = parts[0]
    month_str = "-".join(parts[1:])
    df = get_indicator_df(sid)
    if df.empty:
        return f"No data for {sid}"
    fig = px.line(df, x="date", y="value", title=f"{sid} - Last {MONTHS_BACK} Months")
    fig.update_layout(height=400)
    return html.Div([
        html.H4(f"Indicator: {sid} (Clicked {month_str})"),
        dcc.Graph(figure=fig)
    ])

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
    fig = px.line(df, x="date", y="value", title=f"{sid} - Modal View (Last {MONTHS_BACK} Months)")
    fig.update_layout(height=600, margin=dict(l=40, r=40, t=40, b=40))

    # 'X' close button
    x_button = html.Button(
        "×",
        id="close-modal-btn",
        n_clicks=0,
        style={
            "float": "right",
            "margin": "10px",
            "fontSize": "20px",
            "border": "none",
            "backgroundColor": "transparent",
            "cursor": "pointer"
        }
    )

    return html.Div([
        html.Div(
            style={
                "position": "fixed",
                "top": 0,
                "left": 0,
                "width": "100%",
                "height": "100%",
                "backgroundColor": "rgba(0,0,0,0.5)",
                "zIndex": 9999
            },
            children=[
                html.Div([
                    x_button,
                    dcc.Graph(figure=fig)
                ],
                style={
                    "position": "relative",
                    "margin": "50px auto",
                    "padding": "20px",
                    "width": "80%",
                    "backgroundColor": "#fff",
                    "borderRadius": "8px"
                })
            ]
        )
    ])

# -------------------------------
# Unified Callback for Composite
# -------------------------------
@app.callback(
    [Output("weights-save-msg", "children"),
     Output("composite-chart-container", "children")],
    [Input("save-weights-btn", "n_clicks"),
     Input("url", "pathname")],
    [State(f"weight-input-{sid}", "value") for sid in db.get("series_list", [])]
)
def update_composite(n_clicks, pathname, *weight_values):
    if pathname != "/composite":
        return "", ""
    series_list = db.get("series_list", [])
    if not series_list:
        return "No series found to weight.", ""
    stored_weights = db.get("user_weights", {})
    ctx = callback_context
    if not ctx.triggered:
        comp_df = get_composite_df(stored_weights)
        if comp_df.empty:
            return "No data to display in composite.", ""
        fig = px.line(comp_df, x="date", y="composite_value",
                      title=f"Composite Index (Last {MONTHS_BACK} Months)")
        fig.update_layout(height=400)
        return "", dcc.Graph(figure=fig)
    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]
    if trigger_id == "url":
        comp_df = get_composite_df(stored_weights)
        if comp_df.empty:
            return "No data to display in composite.", ""
        fig = px.line(comp_df, x="date", y="composite_value",
                      title=f"Composite Index (Last {MONTHS_BACK} Months)")
        fig.update_layout(height=400)
        return "", dcc.Graph(figure=fig)

    # user clicked "save-weights-btn"
    weight_values = [wv if wv else 0 for wv in weight_values]
    s = sum(weight_values)
    if s > 0:
        weight_values = [wv / s for wv in weight_values]
    new_wdict = {}
    for sid, wv in zip(series_list, weight_values):
        new_wdict[sid] = wv
    save_weights(new_wdict)
    comp_df = get_composite_df(new_wdict)
    if comp_df.empty:
        return "Weights saved. (Composite empty)", ""
    fig = px.line(comp_df, x="date", y="composite_value",
                  title=f"Composite Index (Last {MONTHS_BACK} Months)")
    fig.update_layout(height=400)
    return "Weights saved.", dcc.Graph(figure=fig)

# -------------------------------
# Callback: Add Series & Refresh All
# -------------------------------
@app.callback(
    Output("add-series-msg", "children"),
    Input("add-series-btn", "n_clicks"),
    State("new-series-id", "value"),
    prevent_initial_call=True
)
def add_series(n_clicks, new_id):
    if not new_id:
        return "Please enter a FRED Series ID."
    new_id = new_id.strip()
    refresh_series_data(new_id)
    return f"Added/refreshed series: {new_id}"

@app.callback(
    Output("global-message", "children"),
    Input("refresh-all-btn", "n_clicks"),
    prevent_initial_call=True
)
def do_refresh_all(n_clicks):
    refresh_all_series()
    return "All tracked series have been refreshed."

# -------------------------------
# Callback: Update directionFactor
# -------------------------------
@app.callback(
    Output("direction-dummy-output", "children"),
    [
        Input(f"direction-dropdown-{sid}", "value")
        for sid in db.get("series_list", [])
    ],
    prevent_initial_call=True
)
def set_directions(*new_values):
    """
    When a user changes a 'Positive is Good/Bad' dropdown,
    store directionFactor in the DB for each series.
    Then return an empty string to the hidden dummy output.
    """
    series_list = db.get("series_list", [])
    if not series_list:
        return ""
    for sid, val in zip(series_list, new_values):
        key = f"series_{sid}"
        entry = db.get(key, {})
        entry["directionFactor"] = val  # update
        db[key] = entry
    return ""

# ---------------------------------------
# Run
# ---------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8050))
    app.run_server(host="0.0.0.0", port=port, debug=True)
