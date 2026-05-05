import openpyxl
import re
from decimal import Decimal

def analyze_request_file(file_obj) -> dict:
    """
    Analyzes an uploaded Excel file to extract:
    - Distinct 'Outlets Erp Id' count.
    - Count of 'http://static.fieldassist.io/campaignresponse/' links.
    - Estimated cost (1.8 * image_count).
    """
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        sheet = wb.active
        
        # Initialize counters
        outlet_ids = set()
        image_link_count = 0
        
        # Regex for image links
        link_pattern = re.compile(r'http://static\.fieldassist\.io/campaignresponse/')

        # Find header index for "Outlets Erp Id"
        outlet_col_idx = None
        
        # Assume header is in first row.
        # Iterate all rows
        for i, row in enumerate(sheet.iter_rows(values_only=True)):
            if i == 0:
                # Header row
                for idx, cell_value in enumerate(row):
                    if cell_value and str(cell_value).strip() == "Outlets Erp Id":
                        outlet_col_idx = idx
                pass # Continue to data rows
            
            # Process data rows
            # 1. Outlet IDs
            if outlet_col_idx is not None and outlet_col_idx < len(row):
                val = row[outlet_col_idx]
                if val:
                    outlet_ids.add(val)
            
            # 2. Image Links (Search all cells in row? Or specific column?)
            # Prompt says: "count of http... these kind of links in the excel"
            # It implies scanning content. We will scan all cells in the row to be safe.
            for cell in row:
                if cell and isinstance(cell, str):
                    if link_pattern.search(cell):
                         image_link_count += 1

        outlet_count = len(outlet_ids)
        estimated_cost = Decimal(str(image_link_count)) * Decimal('1.8')

        return {
            'outlet_count': outlet_count,
            'image_count': image_link_count,
            'estimated_cost': estimated_cost
        }

    except Exception as e:
        print(f"Error analyzing file: {e}")
        return {
            'outlet_count': 0,
            'image_count': 0,
            'estimated_cost': Decimal('0.00')
        }
