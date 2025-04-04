import os
import datetime
import pandas as pd
from fredapi import Fred
from replit import db

# Configuration
FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
fred = Fred(api_key=FRED_API_KEY)

def test_months_back():
    """
    Tests different MONTHS_BACK settings to verify FRED API data fetching
    and Replit DB storage/retrieval.
    """
    print("Testing MONTHS_BACK settings...")

    # Test series (using common indicators that have long histories)
    series_ids = ["UNRATE", "GDP", "CPIAUCSL"]  

    # Test different lookback periods
    for months_back in [60, 120, 240]:
        print(f"\n{'='*50}")
        print(f"Testing with MONTHS_BACK = {months_back}")
        print(f"{'='*50}")

        for series_id in series_ids:
            print(f"\nProcessing {series_id}...")

            # Calculate date range
            end_date = datetime.datetime.today()
            start_date = end_date - pd.DateOffset(months=months_back + 1)
            print(f"Target date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

            try:
                # Fetch data from FRED
                raw_series = fred.get_series(series_id, observation_start=start_date, observation_end=end_date)
                print(f"Successfully fetched {len(raw_series)} observations from FRED")

                if len(raw_series) == 0:
                    print(f"WARNING: No data returned for {series_id}")
                    continue

                # Convert to DataFrame
                df = raw_series.reset_index()
                df.columns = ["date", "value"]

                # Resample to monthly
                df = df.set_index("date").resample("ME").last().dropna().reset_index()
                df["date"] = df["date"].dt.strftime("%Y-%m")
                df = df.sort_values("date")

                # Display sample of data
                print(f"Processed into {len(df)} monthly records")
                print("\nFirst 2 months:")
                print(df.head(2))
                print("\nLast 2 months:")
                print(df.tail(2))

                # Check date range
                if len(df) >= 2:
                    first_date = pd.to_datetime(df['date'].iloc[0])
                    last_date = pd.to_datetime(df['date'].iloc[-1])
                    date_range_years = (last_date - first_date).days / 365.25
                    print(f"Actual date range: {df['date'].iloc[0]} to {df['date'].iloc[-1]} ({date_range_years:.1f} years)")

                    # Check if we got enough data
                    if len(df) < months_back * 0.8:  # Allow for some missing months
                        print(f"WARNING: Only got {len(df)} months of data, which is less than expected ({months_back})")

                # Store in DB to test storage
                test_key = f"test_months_back_{series_id}_{months_back}"
                try:
                    db[test_key] = df.to_dict("records")
                    print(f"Successfully stored {len(df)} records in DB under key: {test_key}")

                    # Read back from DB to verify
                    stored_data = db.get(test_key, [])
                    stored_df = pd.DataFrame(stored_data)
                    if not stored_df.empty:
                        print(f"Successfully retrieved {len(stored_df)} records from DB")
                        if len(stored_df) != len(df):
                            print(f"WARNING: Retrieved record count ({len(stored_df)}) doesn't match original ({len(df)})")
                    else:
                        print("ERROR: Retrieved empty dataframe from DB")
                except Exception as e:
                    print(f"DB Storage/Retrieval Error: {str(e)}")

            except Exception as e:
                print(f"Error processing {series_id}: {str(e)}")

    print("\nTest completed.")

if __name__ == "__main__":
    test_months_back()