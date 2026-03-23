import streamlit as st
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from gspread.cell import Cell
from datetime import datetime
import warnings
import time
import numpy as np

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

def set_bg_color():
    st.markdown(
        """
        <style>
        /* Light mode styles */
        @media (prefers-color-scheme: light) {
            .stApp {
                background-color: #f7f8fa;
                color: #000;
            }
            .rounded-square {
                background-color: white;
                border: 1px solid #ddd;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .copy-btn {
                color: #fff;
                background-color: #1f77b4;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                transition: background-color 0.3s ease;
                width: auto;
                display: inline-block;
            }
            .copy-btn:hover {
                background-color: #1a5a8a;
            }
        }

        /* Dark mode styles */
        @media (prefers-color-scheme: dark) {
            .stApp {
                background-color: #2c2c2c;
                color: #e0e0e0;
            }
            .rounded-square {
                background-color: #3a3a3a;
                border: 1px solid #555;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            .copy-btn {
                color: #000;
                background-color: #90caf9;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                transition: background-color 0.3s ease;
                width: auto;
                display: inline-block;
            }
            .copy-btn:hover {
                background-color: #42a5f5;
            }
        }
        </style>
        """,
        unsafe_allow_html=True
    )

def connect_to_google_sheet(sheet_name, worksheet_name):
    try:
        creds = ServiceAccountCredentials.from_json_keyfile_dict(
            st.secrets["GOOGLE_CREDENTIALS"], 
            scopes=["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
        )
        client = gspread.authorize(creds)
        sheet = client.open(sheet_name).worksheet(worksheet_name)
        return sheet
    except Exception as e:
        st.error(f"An unexpected error occurred while connecting to Google Sheets: {e}. Please check the configuration and try again.")
        return None

def clean_column_data(column):
    return column.replace(r'[\$,]', '', regex=True).replace(',', '', regex=True).astype(float)

def convert_to_native_type(value):
    if isinstance(value, pd.Series):
        value = value.sum()
    if pd.isna(value):
        return 0
    elif isinstance(value, (np.integer, np.int64, np.int32, int)):
        return int(value)
    elif isinstance(value, (np.floating, np.float64, np.float32, float)):
        return float(value)
    elif isinstance(value, (np.bool_, bool)):
        return bool(value)
    elif isinstance(value, (np.str_, str)):
        return str(value)
    else:
        return str(value)


def process_menu_sales_data(df, names_column='Advisor Name', ro_number_column='RO Number'):
    df[names_column] = df[names_column].str.strip().str.upper()
    df['Opcode Labor Gross'] = clean_column_data(df['Opcode Labor Gross'])
    df['Opcode Parts Gross'] = clean_column_data(df['Opcode Parts Gross'])
    
    # Count unique RO Numbers per advisor
    df = df.dropna(subset=[ro_number_column])
    df[ro_number_column] = df[ro_number_column].astype(str).str.strip()
    unique_ro = df.drop_duplicates(subset=[names_column, ro_number_column])
    name_counts = unique_ro.groupby(names_column)[ro_number_column].nunique().to_dict()
    
    labor_gross_sums = df.groupby(names_column)['Opcode Labor Gross'].sum().to_dict()
    parts_gross_sums = df.groupby(names_column)['Opcode Parts Gross'].sum().to_dict()
    return name_counts, labor_gross_sums, parts_gross_sums

def process_alacarte_data(df, names_column='Advisor Name'):
    df[names_column] = df[names_column].str.strip().str.upper()
    df['Opcode Labor Gross'] = clean_column_data(df['Opcode Labor Gross'])
    df['Opcode Parts Gross'] = clean_column_data(df['Opcode Parts Gross'])
    name_counts = df[names_column].value_counts().to_dict()
    labor_gross_sums = df.groupby(names_column)['Opcode Labor Gross'].sum().to_dict()
    parts_gross_sums = df.groupby(names_column)['Opcode Parts Gross'].sum().to_dict()
    return name_counts, labor_gross_sums, parts_gross_sums

def process_commodity_file(df, names_column='Primary Advisor Name', gross_column='Gross'):
    df[names_column] = df[names_column].astype(str).str.strip().str.upper()
    df[gross_column] = clean_column_data(df[gross_column])
    name_counts = df[names_column].value_counts()
    parts_gross_sums = df.groupby(names_column)[gross_column].sum()
    name_counts = name_counts.to_dict()
    parts_gross_sums = parts_gross_sums.to_dict()
    return name_counts, parts_gross_sums

#    TIRES
def process_tires_data(df):
    names_column = None
    quantity_column = None
    gross_column = None

    for col in df.columns:
        col_lower = col.lower()
        if 'advisor' in col_lower and 'name' in col_lower:
            names_column = col
        elif 'part count' in col_lower or 'actual quantity' in col_lower:
            quantity_column = col
        elif 'opcode parts gross' in col_lower or 'gross' in col_lower:
            gross_column = col

    if names_column and quantity_column and gross_column:
        if 'advisor name group' in names_column.lower():
            st.write("Detected GM Tires Format.")
        else:
            st.write("Detected Original Tires Format.")
    else:
        raise ValueError("Tires Excel does not match any known format.")

    df[names_column] = df[names_column].astype(str).str.strip().str.upper()

    try:
        df[quantity_column] = clean_column_data(df[quantity_column])
        df[gross_column] = clean_column_data(df[gross_column])
    except Exception as e:
        raise ValueError(f"Error cleaning columns: {e}")

    actual_quantity_sums = df.groupby(names_column)[quantity_column].sum().to_dict()
    gross_sums = df.groupby(names_column)[gross_column].sum().to_dict()

    actual_quantity_sums = {k: float(v) for k, v in actual_quantity_sums.items()}
    gross_sums = {k: float(v) for k, v in gross_sums.items()}
    return actual_quantity_sums, gross_sums

def process_tires_gm_format(file):
    try:
        df = pd.read_excel(file, skiprows=2, header=0)
        actual_quantity_sums, gross_sums = process_tires_data(df)
        return actual_quantity_sums, gross_sums
    except Exception as e:
        raise ValueError(f"Error processing GM Format Tires Excel file: {e}")

#    ALIGNMENT MENUS & A-LA-CARTE: NEW WHEEL ALIGNMENT
def process_alignment_new_format(df, advisor_col='Advisor Name', story_col='Operation Tech Story'):
   
    df[advisor_col] = df[advisor_col].astype(str).str.strip().str.upper()
    alignment_counts = {}
    for _, row in df.iterrows():
        advisor = row[advisor_col]
        story_text = str(row.get(story_col, "")).lower()
        if "wheel alignment" in story_text:
            alignment_counts[advisor] = alignment_counts.get(advisor, 0) + 1

    # Return just name_counts; no parts/labor
    return alignment_counts

#  RECOMMENDATIONS / DAILY / RO COUNT
def process_recommendations_data(df, names_column="Name"):
    df.columns = df.columns.str.strip()
    df = df[df[names_column].str.strip().str.upper() != "TOTAL"]
    required_columns = ['Recommendations', 'Recommendations Sold', 'Recommendations $ amount', 'Recommendations Sold $ amount']
    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Column '{col}' not found in the uploaded Recommendations Excel. Please check the column names.")
    df[names_column] = df[names_column].str.strip().str.upper()
    rec_count = df.groupby(names_column)['Recommendations'].sum().to_dict()
    rec_sold_count = df.groupby(names_column)['Recommendations Sold'].sum().to_dict()
    rec_amount = clean_column_data(df.groupby(names_column)['Recommendations $ amount'].sum()).to_dict()
    rec_sold_amount = clean_column_data(df.groupby(names_column)['Recommendations Sold $ amount'].sum()).to_dict()
    return rec_count, rec_sold_count, rec_amount, rec_sold_amount

def process_daily_data(df):
    df.columns = df.columns.str.strip()
    
    # Auto-detect format: Old format has 'Name' and 'Pay Type', new format has 'Service Advisor'
    if 'Name' in df.columns and 'Pay Type' in df.columns:
        # Old format
        names_column = 'Name'
        df = df[df[names_column].str.strip().str.upper() != "TOTAL"]
        df = df[df['Pay Type'].str.upper() == "ALL"]
        st.write("Detected Old Daily Data Format")
    elif 'Service Advisor' in df.columns:
        # New format
        names_column = 'Service Advisor'
        df = df[df[names_column].str.strip().str.upper() != "TOTAL"]
        st.write("Detected New Advisor Preformance 3.0 format")
    else:
        raise ValueError("Daily Data Excel format not recognized. ")
    
    df[names_column] = df[names_column].str.strip().str.upper()
    required_columns = ['Labor Gross', 'Parts Gross']
    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Column '{col}' not found in the uploaded Daily Data Excel. Please check the column names.")
    df['Labor Gross'] = clean_column_data(df['Labor Gross'])
    df['Parts Gross'] = clean_column_data(df['Parts Gross'])
    labor_gross_sums = df.groupby(names_column)['Labor Gross'].sum().to_dict()
    parts_gross_sums = df.groupby(names_column)['Parts Gross'].sum().to_dict()
    return labor_gross_sums, parts_gross_sums

def process_ro_count_data(df, advisor_column='Advisor Name', ro_number_column='RO Number'):
    df.columns = df.columns.str.strip()
    if advisor_column not in df.columns or ro_number_column not in df.columns:
        raise ValueError(f"Columns '{advisor_column}' or '{ro_number_column}' not found in the uploaded RO Count Excel.")
    df[advisor_column] = df[advisor_column].str.strip().str.upper()
    df = df.dropna(subset=[ro_number_column])
    df[ro_number_column] = df[ro_number_column].astype(str).str.strip()
    unique_ro = df.drop_duplicates(subset=[advisor_column, ro_number_column])
    ro_counts = unique_ro.groupby(advisor_column)[ro_number_column].nunique().to_dict()
    return ro_counts

#   RTH PROCESSING FUNCTIONS

def process_technician_report_data(df):
    """Process Technician Report Excel to extract Actual Hours and Assigned Billed Hours per technician."""
    df.columns = df.columns.str.strip()
    
    required_columns = ['Technician Name', 'Actual Hours', 'Assigned Billed Hours']
    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Column '{col}' not found in the Technician Report Excel. Please check the column names.")
    
    # Clean and normalize technician names
    df['Technician Name'] = df['Technician Name'].astype(str).str.strip().str.upper()
    
    # Clean numeric columns
    df['Actual Hours'] = pd.to_numeric(df['Actual Hours'], errors='coerce').fillna(0)
    df['Assigned Billed Hours'] = pd.to_numeric(df['Assigned Billed Hours'], errors='coerce').fillna(0)
    
    # Group by technician and sum hours
    actual_hours = df.groupby('Technician Name')['Actual Hours'].sum().to_dict()
    assigned_billed_hours = df.groupby('Technician Name')['Assigned Billed Hours'].sum().to_dict()
    
    return actual_hours, assigned_billed_hours

def update_rth_technician_data(sheet, actual_hours, assigned_billed_hours, date_col_index, tech_mapping):
    """Update RTH Google Sheet with Technician Report data."""
    cells_to_update = []
    
    for tech_name, start_row in tech_mapping.items():
        # Row offsets for each tech's 4-row block:
        # start_row + 0: Attendance Hours
        # start_row + 1: Actual Hours (we update this)
        # start_row + 2: Assigned Billed Hours (we update this)
        # start_row + 3: Daily Objective
        
        # Update Actual Hours (row start_row + 1)
        actual_hour_value = convert_to_native_type(actual_hours.get(tech_name, 0))
        cell_actual = Cell(row=start_row + 1, col=date_col_index, value=actual_hour_value)
        cells_to_update.append(cell_actual)
        
        # Update Assigned Billed Hours (row start_row + 2)
        assigned_billed_value = convert_to_native_type(assigned_billed_hours.get(tech_name, 0))
        cell_assigned = Cell(row=start_row + 2, col=date_col_index, value=assigned_billed_value)
        cells_to_update.append(cell_assigned)
    
    if cells_to_update:
        try:
            sheet.update_cells(cells_to_update)
        except Exception as e:
            st.error(f"Failed to update RTH Google Sheet cells: {e}")

def process_employee_timecard_data(df):
    """
    Process Employee Timecard Report Excel to extract attendance hours and daily objectives.
    This file has a vertical layout with bi-weekly data for multiple technicians.
    
    Structure:
    - Row 1 (index 0): Date range in columns H-L (e.g., "11/16/2025 - 11/30/2025")
    - Row 6 (index 5): First tech - Column A: Employee #, Column C: "Lastname, Firstname"
    - Row 7 (index 6): Headers (Date, ..., Paid)
    - Row 8+ (index 7+): Every 3 rows = 1 day (Date in Column A, Paid in Column K)
    - Next tech starts when we see another name in Column C
    
    Returns: (date_range_tuple, {employee_id_or_name: {day: {"attendance": hours, "objective": 8 or 0}}})
    """
    timecard_data = {}
    date_range = None
    
    # Extract date range from row 1 (index 0), columns H-L (indexes 7-11)
    try:
        row_1 = df.iloc[0]
        # Look for date range string in columns H-L
        for col_idx in range(7, 12):  # Columns H, I, J, K, L
            if col_idx < len(row_1):
                cell_value = str(row_1.iloc[col_idx]).strip()
                if "-" in cell_value and "/" in cell_value:
                    # Found date range like "11/16/2025 - 11/30/2025"
                    parts = cell_value.split("-")
                    if len(parts) == 2:
                        start_date = pd.to_datetime(parts[0].strip(), errors='coerce')
                        end_date = pd.to_datetime(parts[1].strip(), errors='coerce')
                        if pd.notna(start_date) and pd.notna(end_date):
                            date_range = (start_date, end_date)
                            break
    except Exception as e:
        st.warning(f"Could not extract date range from row 1: {e}")
    
    # Iterate through rows to find tech sections
    current_tech_id = None
    current_tech_name = None
    current_tech_data = {}
    
    for idx, row in df.iterrows():
        # Check if this row starts a new tech section
        # Tech section starts when Column C (index 2) has a name and Column A (index 0) has employee number
        col_c_value = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ""
        col_a_value = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
        
        # Detect new tech section: Column C has "Lastname, Firstname" format
        if col_c_value and "," in col_c_value and len(col_c_value) > 3:
            # Save previous tech's data if exists
            if current_tech_id and current_tech_data:
                timecard_data[current_tech_id] = current_tech_data
            
            # Start new tech
            current_tech_id = col_a_value  # Employee number
            current_tech_name = col_c_value  # "Lastname, Firstname"
            
            # Convert "Lastname, Firstname" to "FIRSTNAME LASTNAME" for matching
            if "," in current_tech_name:
                parts = current_tech_name.split(",")
                if len(parts) == 2:
                    lastname = parts[0].strip()
                    firstname = parts[1].strip()
                    current_tech_name = f"{firstname} {lastname}".upper()
            
            current_tech_data = {}
            continue
        
        # If we're in a tech section, look for date rows
        if current_tech_id:
            # Check if Column A has a date (try to parse as date)
            try:
                date_value = pd.to_datetime(row.iloc[0], errors='coerce')
                if pd.notna(date_value):
                    # This is a date row! Extract day number
                    day_number = str(date_value.day)
                    
                    # Get Paid amount from Column K (index 10)
                    paid_value = pd.to_numeric(row.iloc[10], errors='coerce') if len(row) > 10 else 0
                    paid_value = paid_value if pd.notna(paid_value) else 0
                    
                    # Calculate daily objective: 8 if paid > 0, else 0
                    daily_objective = 8 if paid_value > 0 else 0
                    
                    # Store the data
                    current_tech_data[day_number] = {
                        "attendance": float(paid_value),
                        "objective": daily_objective
                    }
            except:
                pass
    
    # Save last tech's data
    if current_tech_id and current_tech_data:
        timecard_data[current_tech_id] = current_tech_data
    
    return date_range, timecard_data

def update_rth_timecard_data(sheet, date_range, timecard_data, tech_mapping_with_employee_id):
    """
    Update RTH Google Sheet with Employee Timecard data for all days in the date range.
    Days without data will be set to 0.
    
    Args:
        sheet: Google Sheet object
        date_range: Tuple of (start_date, end_date) from the timecard report
        timecard_data: {tech_id: {day: {"attendance": X, "objective": Y}}}
        tech_mapping_with_employee_id: {tech_id: start_row} or {tech_name: start_row}
    """
    cells_to_update = []
    
    # Get date row to build day-to-column mapping
    date_row = sheet.row_values(2)[4:]  # Skip first 4 columns (A, B, C, D)
    day_to_col = {}
    for i, day_str in enumerate(date_row):
        if day_str.strip():
            day_to_col[day_str.strip()] = i + 5  # Column index (E=5, F=6, etc.)
    
    # Generate all days in the date range
    all_days_in_range = []
    if date_range:
        start_date, end_date = date_range
        current_date = start_date
        while current_date <= end_date:
            day_str = str(current_date.day)
            all_days_in_range.append(day_str)
            current_date += pd.Timedelta(days=1)
    
    for tech_id, days_data in timecard_data.items():
        # Try to find this tech in the Google Sheet mapping
        start_row = None
        
        # First try direct employee ID match
        if tech_id in tech_mapping_with_employee_id:
            start_row = tech_mapping_with_employee_id[tech_id]
        else:
            # Try matching by name if employee ID didn't work
            # (In case the mapping uses names instead of IDs)
            for mapped_id, row in tech_mapping_with_employee_id.items():
                if mapped_id == tech_id:
                    start_row = row
                    break
        
        if start_row is None:
            st.warning(f"Technician {tech_id} not found in Google Sheet. Skipping.")
            continue
        
        # Update data for ALL days in the date range
        for day in all_days_in_range:
            if day not in day_to_col:
                continue
            
            date_col_index = day_to_col[day]
            
            # Get data for this day, or use 0 if no data
            if day in days_data:
                attendance_value = convert_to_native_type(days_data[day]["attendance"])
                objective_value = convert_to_native_type(days_data[day]["objective"])
            else:
                # No data for this day - set both to 0
                attendance_value = 0
                objective_value = 0
            
            # Update Attendance Hours (row start_row + 0)
            cell_attendance = Cell(row=start_row, col=date_col_index, value=attendance_value)
            cells_to_update.append(cell_attendance)
            
            # Update Daily Objective (row start_row + 3)
            cell_objective = Cell(row=start_row + 3, col=date_col_index, value=objective_value)
            cells_to_update.append(cell_objective)
    
    if cells_to_update:
        try:
            sheet.update_cells(cells_to_update)
            st.success(f"Updated {len(cells_to_update)} cells successfully!")
        except Exception as e:
            st.error(f"Failed to update Employee Timecard data in Google Sheet: {e}")

#   SHEET UPDATE UTILITIES

def update_google_sheet(sheet, data_series1, *args, date_col_index, start_row_offset, advisor_mapping):
    cells_to_update = []
    for advisor_name, start_row in advisor_mapping.items():
        row_index = start_row + start_row_offset
        value1 = data_series1.get(advisor_name, 0)
        value1 = convert_to_native_type(value1)
        cell = Cell(row=row_index, col=date_col_index, value=value1)
        cells_to_update.append(cell)
        for i, data_series in enumerate(args):
            value = data_series.get(advisor_name, 0)
            value = convert_to_native_type(value)
            cell = Cell(row=row_index + i + 1, col=date_col_index, value=value)
            cells_to_update.append(cell)
    if cells_to_update:
        try:
            sheet.update_cells(cells_to_update)
        except Exception as e:
            st.error(f"Failed to update Google Sheet cells: {e}")

def update_commodities_in_sheet(sheet, date_col_index, commodities_data, commodities_list, advisor_mapping, data_row_offsets):
    cells_to_update = {}
    commodity_row_offsets = {
        'Air Filters': 8,
        'Cabin Filters': 9,
        'Batteries': 10,
        'Tires': 11,
        'Brakes': 12,
        'Alignments': 13,       
        'Wipers': 14,
        'Belts': 15,
        'Fluids': 16,
        'Factory Chemicals': 17,
    }
    labor_gross_offset = data_row_offsets['Labor Gross']
    parts_gross_offset = data_row_offsets['Parts Gross'] 
    total_parts_gross_per_advisor = {advisor: 0 for advisor in advisor_mapping.keys()}
    total_labor_gross_per_advisor = {advisor: 0 for advisor in advisor_mapping.keys()}

    for commodity in commodities_list:
        data = commodities_data.get(commodity, {})
        if commodity == 'Tires':
            actual_quantity_sums = data.get('actual_quantity_sums', {})
            gross_sums = data.get('gross_sums', {})
        else:
            name_counts = data.get('name_counts', {})
            parts_gross_sums = data.get('parts_gross_sums', {})
            labor_gross_sums = data.get('labor_gross_sums', {}) if commodity == 'Alignments' else {}

        for advisor_name, start_row in advisor_mapping.items():
            base_row = start_row + commodity_row_offsets[commodity] - 1
            if commodity == 'Tires':
                actual_quantity = convert_to_native_type(actual_quantity_sums.get(advisor_name, 0))
                cell_actual_quantity = Cell(row=base_row, col=date_col_index, value=actual_quantity)
                cells_to_update.setdefault(advisor_name, []).append(cell_actual_quantity)
                gross = convert_to_native_type(gross_sums.get(advisor_name, 0))
                total_parts_gross_per_advisor[advisor_name] += gross
            else:
                
                count_value = convert_to_native_type(name_counts.get(advisor_name, 0))
                cell_count = Cell(row=base_row, col=date_col_index, value=count_value)
                cells_to_update.setdefault(advisor_name, []).append(cell_count)
                parts_gross_value = convert_to_native_type(parts_gross_sums.get(advisor_name, 0))
                total_parts_gross_per_advisor[advisor_name] += parts_gross_value

                
                if commodity == 'Alignments':
                    labor_gross_value = convert_to_native_type(labor_gross_sums.get(advisor_name, 0))
                    total_labor_gross_per_advisor[advisor_name] += labor_gross_value

    # Add final labor/parts totals
    for advisor_name, start_row in advisor_mapping.items():
        labor_gross = total_labor_gross_per_advisor.get(advisor_name, 0)
        labor_gross_row = start_row + labor_gross_offset - 1
        cell_labor_gross = Cell(row=labor_gross_row, col=date_col_index, value=labor_gross)

        parts_gross = total_parts_gross_per_advisor.get(advisor_name, 0)
        parts_gross_row = start_row + parts_gross_offset - 1
        cell_parts_gross = Cell(row=parts_gross_row, col=date_col_index, value=parts_gross)

        cells_to_update.setdefault(advisor_name, []).extend([cell_labor_gross, cell_parts_gross])

    all_cells = []
    for advisor_cells in cells_to_update.values():
        all_cells.extend(advisor_cells)

    if all_cells:
        try:
            sheet.update_cells(all_cells)
        except Exception as e:
            st.error(f"Failed to update Commodities in Google Sheet: {e}")

# MAIN
def main():
    set_bg_color()
    delay_seconds = 0.01
    st.title("Google Sheet Updater")

    st.markdown(
        """
        <div class='rounded-square'>
            <p><b>Instructions:</b></p>
            <ul>
                <li>Please share the Google Sheet with the following email:</li>
                <p style='margin-left: 20px; display: flex; align-items: center;'>
                    <code style='flex: 1; white-space: nowrap;'>auto-report@auto-pop-report.iam.gserviceaccount.com</code> 
                    <button id="copy-button" class="copy-btn">Copy Email</button>
                </p>
                <li>Make sure to give the email <b>Editor</b> permissions.</li>
                <li>Ensure there are no other restrictions or permissions on the sheet.</li>
            </ul>
        </div>

        <script>
        const copyButton = document.getElementById('copy-button');
        copyButton.addEventListener('click', function() {
            navigator.clipboard.writeText('auto-report@auto-pop-report.iam.gserviceaccount.com');
            copyButton.textContent = 'Email Copied';
            setTimeout(() => { copyButton.textContent = 'Copy Email'; }, 2000);
        });
        </script>
        """,
        unsafe_allow_html=True
    )

    # Create tabs for Advisor and RTH processes
    tab1, tab2 = st.tabs(["Advisor", "RTH"])
    
    # ==================== ADVISOR TAB ====================
    with tab1:
        st.markdown("### Advisor Data Processing")
        sheet_name = st.text_input("Enter the Google Sheet name:", "SHEET NAME HERE", key="advisor_sheet_name")
        worksheet_name = st.text_input("Enter the Worksheet (tab) name:", "Input", key="advisor_worksheet_name")

        st.subheader("Upload Excel Files")

        # ---- RO Count
        st.markdown("#### **Upload RO Count Excel**")
        ro_count_file = st.file_uploader("Select RO Count Excel file", type=["xlsx"], key="advisor_ro_count", label_visibility="hidden")

        # ---- Menu Sales
        st.markdown("#### **Upload Menu Sales Excel**")
        menu_sales_file = st.file_uploader("Upload Menu Sales Excel", type=["xlsx"], key="advisor_menu_sales_file", label_visibility="hidden")

        # ---- A-La-Carte
        st.markdown("#### **Upload A-La-Carte Excel**")
        alacarte_file = st.file_uploader("Upload A-La-Carte Excel", type=["xlsx"], key="advisor_alacarte_file", label_visibility="hidden")

        # ---- Recommendations
        st.markdown("#### **Upload Recommendations Excel**")
        recommendations_file = st.file_uploader("Upload Recommendations Excel", type=["xlsx"], key="advisor_recommendations_file", label_visibility="hidden")

        # ---- Daily Data
        st.markdown("#### **Upload Daily Data Excel**")
        daily_file = st.file_uploader("Upload Daily Data Excel", type=["xlsx"], key="advisor_daily_file", label_visibility="hidden")

        # -------------- Commodities --------------
        st.markdown("### **Upload Commodities Files**")
        commodities_list = [
            'Air Filters', 'Cabin Filters', 'Batteries', 'Tires', 'Brakes',
            'Wipers', 'Belts', 'Fluids', 'Factory Chemicals'
        ]
        commodities_files = {}
        for commodity in commodities_list:
            key = f"advisor_commodity_{commodity.replace(' ', '_').lower()}"
            commodities_files[commodity] = st.file_uploader(f"Upload {commodity} Excel", type=["xlsx"], key=key)

        # -------------- Alignment --------------
        st.markdown("### **Upload Alignment Files**")
        alignment_menus_file = st.file_uploader("Upload Alignment Menus Excel", type=["xlsx"], key="advisor_alignment_menus")
        alignment_alacarte_file = st.file_uploader("Upload Alignment A-La-Carte Excel", type=["xlsx"], key="advisor_alignment_alacarte")

        # -------------- Date Selection --------------
        selected_date = st.date_input("Select the date:", datetime.now(), key="advisor_selected_date").strftime('%d').lstrip('0')

        # -------------- Connect to Google Sheet --------------
        sheet = connect_to_google_sheet(sheet_name, worksheet_name)
        if sheet is None:
            st.error("Failed to connect to the Google Sheet. Please check the inputs and try again.")
        else:
            date_row = sheet.row_values(2)[2:]
            date = selected_date
            if date in date_row:
                date_col_index = date_row.index(date) + 3
            else:
                st.error(f"Date {date} not found in the sheet.")
                sheet = None

        if sheet is not None:
            # -------------- Get Advisors --------------
            col_a_values = sheet.col_values(1)[3:]
            advisor_names = []
            advisor_start_rows = []
            row = 4
            idx = 0
            while idx < len(col_a_values):
                advisor_name = col_a_values[idx]
                if not advisor_name:
                    break
                advisor_name = advisor_name.strip().upper()
                advisor_names.append(advisor_name)
                advisor_start_rows.append(row + idx)
                idx += 26
            advisor_mapping = dict(zip(advisor_names, advisor_start_rows))

            data_row_offsets = {
                'RO Count': 1,
                'Menu Sales': 2,
                'Menu Sales Labor Gross': 3,
                'Menu Sales Parts Gross': 4,
                'A-la-carte Count': 5,
                'A-la-carte Labor Gross': 6,
                'A-la-carte Parts Gross': 7,
                'Labor Gross': 18,
                'Parts Gross': 19,
                'Rec Count': 20,
                'Rec Sold Count': 21,
                'Rec Amount': 22,
                'Rec Sold Amount': 23,
                'Daily Labor Gross': 24,
                'Daily Parts Gross': 25,
            }

            # -------------- Buttons Layout --------------
            col1, col2, col3, col4, col5, col6 = st.columns(6)

            # -------------- RO Count --------------
            with col1:
                if ro_count_file is not None:
                    if st.button("Update RO Count in Google Sheet", key="advisor_update_ro_count"):
                        try:
                            df_ro_count = pd.read_excel(ro_count_file)
                            ro_counts = process_ro_count_data(df_ro_count, advisor_column='Advisor Name', ro_number_column='RO Number')
                            update_google_sheet(
                            sheet,
                            ro_counts,
                            date_col_index=date_col_index,
                            start_row_offset=data_row_offsets['RO Count'] - 1,
                            advisor_mapping=advisor_mapping
                            )
                            st.success("RO Count data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating RO Count data: {e}")
                        time.sleep(delay_seconds)

            # -------------- Menu Sales --------------
            with col2:
                if menu_sales_file is not None:
                    if st.button("Update Menu Sales in Google Sheet", key="advisor_update_menu_sales"):
                        try:
                            df_menu_sales = pd.read_excel(menu_sales_file)
                            menu_name_counts, menu_labor_gross_sums, menu_parts_gross_sums = process_menu_sales_data(df_menu_sales, "Advisor Name", "RO Number")
                            update_google_sheet(
                            sheet,
                            menu_name_counts,
                            menu_labor_gross_sums,
                            menu_parts_gross_sums,
                            date_col_index=date_col_index,
                            start_row_offset=data_row_offsets['Menu Sales'] - 1,
                            advisor_mapping=advisor_mapping
                            )
                            st.success("Menu Sales data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Menu Sales data: {e}")
                        time.sleep(delay_seconds)

            # -------------- A-La-Carte --------------
            with col3:
                if alacarte_file is not None:
                    if st.button("Update A-La-Carte in Google Sheet", key="advisor_update_alacarte"):
                        try:
                            df_alacarte = pd.read_excel(alacarte_file)
                            alacarte_name_counts, alacarte_labor_gross_sums, alacarte_parts_gross_sums = process_alacarte_data(df_alacarte, "Advisor Name")
                            update_google_sheet(
                            sheet,
                            alacarte_name_counts,
                            alacarte_labor_gross_sums,
                            alacarte_parts_gross_sums,
                            date_col_index=date_col_index,
                            start_row_offset=data_row_offsets['A-la-carte Count'] - 1,
                            advisor_mapping=advisor_mapping
                            )
                            st.success("A-La-Carte data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating A-La-Carte data: {e}")
                        time.sleep(delay_seconds)

            # -------------- Commodities (including Alignments) --------------
            with col4:
                if any(commodities_files.values()) or alignment_menus_file or alignment_alacarte_file:
                    if st.button("Update Commodities in Google Sheet", key="advisor_update_commodities"):
                        commodities_data = {}

                        # --- Process Each Commodity ---
                        for commodity in commodities_list:
                            if commodities_files[commodity] is not None:
                                if commodity == 'Tires':
                                    try:
                                        df = pd.read_excel(commodities_files[commodity], header=0)
                                        actual_quantity_sums, gross_sums = process_tires_data(df)
                                        commodities_data['Tires'] = {
                                            'actual_quantity_sums': actual_quantity_sums,
                                            'gross_sums': gross_sums
                                        }
                                        st.success(f"{commodity} data (Original Format) processed successfully.")
                                    except Exception:
                                        try:
                                            actual_quantity_sums, gross_sums = process_tires_gm_format(commodities_files[commodity])
                                            commodities_data['Tires'] = {
                                                'actual_quantity_sums': actual_quantity_sums,
                                                'gross_sums': gross_sums
                                            }
                                            st.success(f"{commodity} data (GM Format) processed successfully.")
                                        except Exception as e2:
                                            st.error(f"Error processing {commodity} Excel file in both formats: {e2}")
                                            commodities_data['Tires'] = {
                                                'actual_quantity_sums': {},
                                                'gross_sums': {}
                                            }
                                else:
                                    try:
                                        df = pd.read_excel(commodities_files[commodity], header=0)
                                        name_counts, parts_gross_sums = process_commodity_file(df)
                                        commodities_data[commodity] = {
                                            'name_counts': name_counts,
                                            'parts_gross_sums': parts_gross_sums
                                        }
                                        st.success(f"{commodity} data processed successfully.")
                                    except Exception as e:
                                        st.error(f"Error processing {commodity} Excel file: {e}")
                                        commodities_data[commodity] = {
                                            'name_counts': {},
                                            'parts_gross_sums': {}
                                        }

                        alignment_counts_menus = {}
                        alignment_counts_alacarte = {}

                        if alignment_menus_file:
                            try:
                                df_menus_new = pd.read_excel(alignment_menus_file, header=0)
                                alignment_counts_menus = process_alignment_new_format(
                                    df_menus_new,
                                    advisor_col="Advisor Name",
                                    story_col="Operation Tech Story"
                                )
                                st.success("Alignment Menus (New Wheel Alignment Logic) processed successfully.")
                            except Exception as e:
                                st.error(f"Error processing new-format Alignment Menus: {e}")

                        if alignment_alacarte_file:
                            try:
                                df_alacarte_align = pd.read_excel(alignment_alacarte_file, header=0)
                                alignment_counts_alacarte = process_alignment_new_format(
                                    df_alacarte_align,
                                    advisor_col="Advisor Name",
                                    story_col="Operation Tech Story"
                                )
                                st.success("Alignment A-La-Carte (New Wheel Alignment Logic) processed successfully.")
                            except Exception as e:
                                st.error(f"Error processing new-format Alignment A-La-Carte: {e}")

                        # Combine
                        final_align_counts = {}
                        for adv, c in alignment_counts_menus.items():
                            final_align_counts[adv] = final_align_counts.get(adv, 0) + c
                        for adv, c in alignment_counts_alacarte.items():
                            final_align_counts[adv] = final_align_counts.get(adv, 0) + c

                        commodities_data['Alignments'] = {
                            'name_counts': final_align_counts,
                            'parts_gross_sums': {},
                            'labor_gross_sums': {}
                        }

                        # Update in Google Sheet
                        try:
                            update_commodities_in_sheet(
                                sheet,
                                date_col_index=date_col_index,
                                commodities_data=commodities_data,
                                commodities_list=commodities_list + ['Alignments'],
                                advisor_mapping=advisor_mapping,
                                data_row_offsets=data_row_offsets
                            )
                            st.success("Commodities data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Commodities data: {e}")
                        time.sleep(delay_seconds)

            # -------------- Recommendations --------------
            with col5:
                if recommendations_file is not None:
                    if st.button("Update Recommendations in Google Sheet", key="advisor_update_recommendations"):
                        try:
                            df_recommendations = pd.read_excel(recommendations_file)
                            rec_count, rec_sold_count, rec_amount, rec_sold_amount = process_recommendations_data(df_recommendations, "Name")
                            update_google_sheet(
                            sheet,
                            rec_count,
                            rec_sold_count,
                            rec_amount,
                            rec_sold_amount,
                            date_col_index=date_col_index,
                            start_row_offset=data_row_offsets['Rec Count'] - 1,
                            advisor_mapping=advisor_mapping
                            )
                            st.success("Recommendations data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Recommendations data: {e}")
                        time.sleep(delay_seconds)

            # -------------- Daily Data --------------
            with col6:
                if daily_file is not None:
                    if st.button("Update Daily Data in Google Sheet", key="advisor_update_daily_data"):
                        try:
                            df_daily = pd.read_excel(daily_file)
                            daily_labor_gross, daily_parts_gross = process_daily_data(df_daily)
                            update_google_sheet(
                            sheet,
                            daily_labor_gross,
                            daily_parts_gross,
                            date_col_index=date_col_index,
                            start_row_offset=data_row_offsets['Daily Labor Gross'] - 1,
                            advisor_mapping=advisor_mapping
                            )
                            st.success("Daily data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Daily data: {e}")
                        time.sleep(delay_seconds)

            # -------------- Input All Button --------------
            if st.button("Input All", key="advisor_input_all"):
                updated_sections = []

                # ---------- RO Count ----------
                if ro_count_file:
                        try:
                            df_ro_count = pd.read_excel(ro_count_file)
                            ro_counts = process_ro_count_data(df_ro_count, advisor_column='Advisor Name', ro_number_column='RO Number')
                            update_google_sheet(
                                sheet,
                                ro_counts,
                                date_col_index=date_col_index,
                                start_row_offset=data_row_offsets['RO Count'] - 1,
                                advisor_mapping=advisor_mapping
                            )
                            updated_sections.append("RO Count")
                            st.success("RO Count data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating RO Count data: {e}")
                        time.sleep(delay_seconds)

                # ---------- Menu Sales ----------
                if menu_sales_file:
                        try:
                            df_menu_sales = pd.read_excel(menu_sales_file)
                            menu_name_counts, menu_labor_gross_sums, menu_parts_gross_sums = process_menu_sales_data(df_menu_sales, "Advisor Name", "RO Number")
                            update_google_sheet(
                                sheet,
                                menu_name_counts,
                                menu_labor_gross_sums,
                                menu_parts_gross_sums,
                                date_col_index=date_col_index,
                                start_row_offset=data_row_offsets['Menu Sales'] - 1,
                                advisor_mapping=advisor_mapping
                            )
                            updated_sections.append("Menu Sales")
                            st.success("Menu Sales data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Menu Sales data: {e}")
                        time.sleep(delay_seconds)

                # ---------- A-La-Carte ----------
                if alacarte_file:
                        try:
                            df_alacarte = pd.read_excel(alacarte_file)
                            alacarte_name_counts, alacarte_labor_gross_sums, alacarte_parts_gross_sums = process_alacarte_data(df_alacarte, "Advisor Name")
                            update_google_sheet(
                                sheet,
                                alacarte_name_counts,
                                alacarte_labor_gross_sums,
                                alacarte_parts_gross_sums,
                                date_col_index=date_col_index,
                                start_row_offset=data_row_offsets['A-la-carte Count'] - 1,
                                advisor_mapping=advisor_mapping
                            )
                            updated_sections.append("A-La-Carte")
                            st.success("A-La-Carte data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating A-La-Carte data: {e}")
                        time.sleep(delay_seconds)

                # ---------- Commodities & Alignments ----------
                commodities_data = {}
                # Normal Commodities
                for commodity in commodities_list:
                        if commodities_files[commodity] is not None:
                            if commodity == 'Tires':
                                try:
                                    df = pd.read_excel(commodities_files[commodity], header=0)
                                    actual_quantity_sums, gross_sums = process_tires_data(df)
                                    commodities_data['Tires'] = {
                                        'actual_quantity_sums': actual_quantity_sums,
                                        'gross_sums': gross_sums
                                    }
                                    updated_sections.append("Tires")
                                    st.success(f"{commodity} data (Original Format) processed successfully.")
                                except Exception:
                                    try:
                                        actual_quantity_sums, gross_sums = process_tires_gm_format(commodities_files[commodity])
                                        commodities_data['Tires'] = {
                                            'actual_quantity_sums': actual_quantity_sums,
                                            'gross_sums': gross_sums
                                        }
                                        updated_sections.append("Tires (GM Format)")
                                        st.success(f"{commodity} data (GM Format) processed successfully.")
                                    except Exception as e2:
                                        st.error(f"Error processing {commodity} Excel file in both formats: {e2}")
                                        commodities_data['Tires'] = {
                                            'actual_quantity_sums': {},
                                            'gross_sums': {}
                                        }
                            else:
                                try:
                                    df = pd.read_excel(commodities_files[commodity], header=0)
                                    name_counts, parts_gross_sums = process_commodity_file(df)
                                    commodities_data[commodity] = {
                                        'name_counts': name_counts,
                                        'parts_gross_sums': parts_gross_sums
                                    }
                                    updated_sections.append(commodity)
                                    st.success(f"{commodity} data processed successfully.")
                                except Exception as e:
                                    st.error(f"Error processing {commodity} Excel file: {e}")
                                    commodities_data[commodity] = {
                                        'name_counts': {},
                                        'parts_gross_sums': {}
                                    }

                # Alignments with new logic for both
                alignment_counts_menus = {}
                alignment_counts_alacarte = {}

                # Menus => new
                if alignment_menus_file:
                        try:
                            df_menus_new = pd.read_excel(alignment_menus_file, header=0)
                            alignment_counts_menus = process_alignment_new_format(
                                df_menus_new,
                                advisor_col="Advisor Name",
                                story_col="Operation Tech Story"
                            )
                            st.success("Alignment Menus (New Wheel Alignment Logic) processed successfully.")
                        except Exception as e:
                            st.error(f"Error processing new-format Alignment Menus: {e}")

                # A-La-Carte => new
                if alignment_alacarte_file:
                        try:
                            df_alacarte_align = pd.read_excel(alignment_alacarte_file, header=0)
                            alignment_counts_alacarte = process_alignment_new_format(
                                df_alacarte_align,
                                advisor_col="Advisor Name",
                                story_col="Operation Tech Story"
                            )
                            st.success("Alignment A-La-Carte (New Wheel Alignment Logic) processed successfully.")
                        except Exception as e:
                            st.error(f"Error processing new-format Alignment A-La-Carte: {e}")

                final_align_counts = {}
                for adv, c in alignment_counts_menus.items():
                        final_align_counts[adv] = final_align_counts.get(adv, 0) + c
                for adv, c in alignment_counts_alacarte.items():
                        final_align_counts[adv] = final_align_counts.get(adv, 0) + c

                commodities_data['Alignments'] = {
                        'name_counts': final_align_counts,
                        'parts_gross_sums': {},
                        'labor_gross_sums': {}
                }

                # Update once we have all
                if any(commodities_data.values()):
                        try:
                            update_commodities_in_sheet(
                                sheet,
                                date_col_index=date_col_index,
                                commodities_data=commodities_data,
                                commodities_list=commodities_list + ['Alignments'],
                                advisor_mapping=advisor_mapping,
                                data_row_offsets=data_row_offsets
                            )
                            updated_sections.append("Commodities")
                            st.success("Commodities data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Commodities data: {e}")
                        time.sleep(delay_seconds)

                # ---------- Recommendations ----------
                if recommendations_file:
                        try:
                            df_recommendations = pd.read_excel(recommendations_file)
                            rec_count, rec_sold_count, rec_amount, rec_sold_amount = process_recommendations_data(df_recommendations, "Name")
                            update_google_sheet(
                                sheet,
                                rec_count,
                                rec_sold_count,
                                rec_amount,
                                rec_sold_amount,
                                date_col_index=date_col_index,
                                start_row_offset=data_row_offsets['Rec Count'] - 1,
                                advisor_mapping=advisor_mapping
                            )
                            updated_sections.append("Recommendations")
                            st.success("Recommendations data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Recommendations data: {e}")
                        time.sleep(delay_seconds)

                # ---------- Daily Data ----------
                if daily_file:
                        try:
                            df_daily = pd.read_excel(daily_file)
                            daily_labor_gross, daily_parts_gross = process_daily_data(df_daily)
                            update_google_sheet(
                                sheet,
                                daily_labor_gross,
                                daily_parts_gross,
                                date_col_index=date_col_index,
                                start_row_offset=data_row_offsets['Daily Labor Gross'] - 1,
                                advisor_mapping=advisor_mapping
                            )
                            updated_sections.append("Daily Data")
                            st.success("Daily data updated successfully.")
                        except Exception as e:
                            st.error(f"Error updating Daily data: {e}")
                        time.sleep(delay_seconds)

                if updated_sections:
                        st.success(f"Updated the following sections successfully: {', '.join(updated_sections)}")
                else:
                        st.warning("No data sections were updated. Please ensure you've uploaded the necessary Excel files.")

    
    # ==================== RTH TAB ====================
    with tab2:
        st.markdown("### RTH Data Processing")
        rth_sheet_name = st.text_input("Enter the Google Sheet name:", "SHEET NAME HERE", key="rth_sheet_name")
        rth_worksheet_name = st.text_input("Enter the Worksheet (tab) name:", "Input", key="rth_worksheet_name")
        
        st.subheader("Upload Excel Files")
        
        # ---- Technician Report
        st.markdown("#### **Upload Technician Report Excel**")
        technician_report_file = st.file_uploader("Select Technician Report Excel file", type=["xlsx"], key="rth_technician_report", label_visibility="hidden")
        
        # ---- Employee TimeCard Report
        st.markdown("#### **Upload Employee TimeCard Report Excel**")
        timecard_report_file = st.file_uploader("Select Employee TimeCard Report Excel file", type=["xlsx"], key="rth_timecard_report", label_visibility="hidden")
        
        # -------------- Date Selection --------------
        rth_selected_date = st.date_input("Select the date:", datetime.now(), key="rth_selected_date").strftime('%d').lstrip('0')
        
        # -------------- Connect to RTH Google Sheet --------------
        rth_sheet = connect_to_google_sheet(rth_sheet_name, rth_worksheet_name)
        if rth_sheet is None:
            st.error("Failed to connect to the RTH Google Sheet. Please check the inputs and try again.")
        else:
            # Get date column from row 2 (dates start at column E, which is index 5)
            date_row = rth_sheet.row_values(2)[4:]  # Skip first 4 columns (A, B, C, D)
            date = rth_selected_date
            if date in date_row:
                rth_date_col_index = date_row.index(date) + 5  # +5 because we skipped 4 columns and index starts at 1
            else:
                st.error(f"Date {date} not found in the RTH sheet.")
                rth_sheet = None
        
        if rth_sheet is not None:
            # -------------- Get Technicians from Google Sheet --------------
            # Technicians are in column A, starting at row 4, every 4 rows
            # Each tech occupies 4 rows: Attendance Hours, Actual Hours, Assigned Billed Hours, Daily Objective
            # Column B contains employee numbers
            col_a_values = rth_sheet.col_values(1)[3:]  # Tech names, start from row 4 (index 3)
            col_b_values = rth_sheet.col_values(2)[3:]  # Employee IDs, start from row 4 (index 3)
            
            tech_names = []
            tech_employee_ids = []
            tech_start_rows = []
            row = 4
            idx = 0
            
            while idx < len(col_a_values):
                tech_name = col_a_values[idx]
                if not tech_name or tech_name.strip() == "":
                    break
                tech_name = tech_name.strip().upper()
                tech_names.append(tech_name)
                tech_start_rows.append(row + idx)
                
                # Get employee ID if available
                employee_id = col_b_values[idx].strip() if idx < len(col_b_values) and col_b_values[idx] else ""
                tech_employee_ids.append(employee_id)
                
                idx += 4  # Each tech occupies 4 rows
            
            # Create two mappings: by name and by employee ID
            tech_mapping = dict(zip(tech_names, tech_start_rows))
            tech_mapping_by_id = {emp_id: tech_start_rows[i] for i, emp_id in enumerate(tech_employee_ids) if emp_id}
            
            # Combined mapping for flexibility
            tech_mapping_combined = {**tech_mapping_by_id, **tech_mapping}
            
            # -------------- Update Buttons --------------
            col1, col2 = st.columns(2)
            
            with col1:
                if technician_report_file is not None:
                    if st.button("Update Technician Report Data in Google Sheet", key="rth_update_technician"):
                        try:
                            df_tech_report = pd.read_excel(technician_report_file, header=1)  # Header is in row 2 (index 1)
                            actual_hours, assigned_billed_hours = process_technician_report_data(df_tech_report)
                            update_rth_technician_data(
                                rth_sheet,
                                actual_hours,
                                assigned_billed_hours,
                                date_col_index=rth_date_col_index,
                                tech_mapping=tech_mapping
                            )
                            st.success("Technician Report data updated successfully!")
                        except Exception as e:
                            st.error(f"Error updating Technician Report data: {e}")
                        time.sleep(delay_seconds)
            
            with col2:
                if timecard_report_file is not None:
                    if st.button("Update Employee Timecard Data in Google Sheet", key="rth_update_timecard"):
                        try:
                            # Read Employee Timecard - no header row since structure is vertical
                            df_timecard = pd.read_excel(timecard_report_file, header=None)
                            date_range, timecard_data = process_employee_timecard_data(df_timecard)
                            
                            if date_range:
                                start_date, end_date = date_range
                                st.info(f"Processing timecard data for date range: {start_date.strftime('%m/%d/%Y')} - {end_date.strftime('%m/%d/%Y')}")
                            
                            update_rth_timecard_data(
                                rth_sheet,
                                date_range,
                                timecard_data,
                                tech_mapping_combined
                            )
                            st.success(f"Employee Timecard data updated successfully for {len(timecard_data)} technicians!")
                        except Exception as e:
                            st.error(f"Error updating Employee Timecard data: {e}")
                        time.sleep(delay_seconds)


if __name__ == "__main__":
    main()
