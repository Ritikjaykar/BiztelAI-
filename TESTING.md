# Testing Guide

Before submitting the project, I used the following checks to verify that all major features were working correctly.

## Running the Project

Start the application:

```bash
node server.js
```

Open in the browser:

```text
http://localhost:5174
```

You can also run the extraction test script:

```bash
node test-extraction.js
```

## Basic Functionality Check

### Upload Documents

* Upload a sample image or SVG file
* Verify the file appears in the upload list
* Verify the preview is displayed correctly
* Confirm extraction starts automatically

### Data Extraction

Check whether the following fields are extracted correctly:

* Date
* Shift
* Employee Number
* Operation Code
* Machine Number
* Work Order Number
* Quantity Produced
* Time Taken
* Remarks

If OCR cannot extract data correctly, the fallback extraction should still populate the form so the workflow remains usable.

### Review & Edit

* Modify one or more extracted fields
* Confirm the values update immediately
* Verify confidence scores update after manual edits
* Check that validation messages refresh automatically

### Validation

Test a few invalid values manually:

| Field             | Example Value |
| ----------------- | ------------- |
| Shift             | D             |
| Employee Number   | 42            |
| Machine Number    | 7             |
| Quantity Produced | 0             |

The application should display appropriate validation warnings and highlight the affected fields.

### Save Record

* Correct any validation issues
* Click **Save Reviewed Record**
* Confirm the record status changes from Draft to Valid

### History

* Open the History section
* Search using employee number, machine number, or work order number
* Verify records can be filtered and reopened

### Analytics

After saving a few records, verify that:

* Total uploads are updated
* Reviewed records count is correct
* Validation failures are displayed
* Quantity summaries are generated
* Shift and machine charts are populated
* Exception queue displays records requiring attention

### Export

Click **Export JSON** and confirm that a JSON file is downloaded containing the processed records.

## Demo Video Flow

For the demo recording, I followed this sequence:

1. Launch the application
2. Upload a document
3. Show document preview
4. Explain extracted fields and confidence scores
5. Demonstrate validation warnings
6. Edit and save a record
7. Open History and perform a search
8. Show Analytics and exception tracking
9. Export the processed data

## Final Submission

Files included:

* Source Code
* README.md
* AI_WORKFLOW.md
* .env.example
* Demo Video
* Hosted Demo URL
