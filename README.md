# BiztelAI OpsFlow

BiztelAI OpsFlow is a prototype built to digitize handwritten and semi-structured manufacturing documents and convert them into structured operational records that can be reviewed, validated, and analyzed.

The goal of the project was to create a simple end-to-end workflow that allows users to upload operational documents, extract key information, review the extracted data, and generate useful operational insights.

## Features

* Upload images and PDF documents
* Preview uploaded files before processing
* Extract operational data using browser-based OCR
* Review and edit extracted information
* Display confidence scores for extracted fields
* Validate records using business rules
* Highlight records that require manual review
* Store reviewed records locally
* Search and filter previously processed records
* View analytics and operational summaries
* Export processed data as JSON

## Technology Used

The application was intentionally kept lightweight and easy to run.

* HTML
* CSS
* JavaScript
* Tesseract.js (for browser OCR)
* Browser localStorage for data persistence

No build tools or additional setup are required.

## Running the Project

You can open the application directly in a browser using the `index.html` file.

Alternatively, run the local server:

```bash
node server.js
```

Then open:

```text
http://localhost:5174
```

## Application Workflow

1. Upload a manufacturing document.
2. Preview the uploaded file.
3. Extract operational data using OCR.
4. Review the extracted fields and confidence scores.
5. Correct any fields that require manual attention.
6. Save the reviewed record.
7. Search and revisit previously processed records.
8. Analyze operational summaries from the dashboard.

## Extracted Information

The system currently extracts the following fields:

* Date
* Shift
* Employee Number
* Operation Code
* Machine Number
* Work Order Number
* Quantity Produced
* Time Taken
* Remarks

## Validation Logic

The application performs several validation checks to identify records that may require review.

Examples include:

* Missing mandatory fields
* Invalid shift values
* Incorrect employee number format
* Invalid machine numbers
* Invalid operation codes
* Missing or suspicious quantity values
* Invalid work order numbers
* Duplicate work orders
* Low-confidence OCR results

Records with validation issues are highlighted for manual verification before being saved.

## Analytics Dashboard

The dashboard provides a quick overview of processed records, including:

* Total uploads
* Reviewed records
* Validation failures
* Quantity produced
* Hours logged
* Shift-wise summaries
* Machine-wise summaries
* Employee-wise summaries
* Exception tracking

## Design Decisions

The focus of this project was usability and speed of execution rather than building a production-scale system.

To keep the prototype simple:

* Data is stored in localStorage
* OCR runs directly in the browser
* No external database is required
* No authentication layer was added
* The application can be hosted as a static website

These decisions helped keep the project lightweight, portable, and easy to demonstrate.

## Future Improvements

If extended further, the system could include:

* Vision-based AI extraction using Claude or GPT models
* Database-backed storage
* User authentication and role management
* Audit logs for review actions
* Batch document processing
* Workflow approvals and reviewer assignments
* More advanced analytics and reporting

## Conclusion

This project demonstrates a complete document-processing workflow, starting from document upload and extraction through validation, review, storage, and analytics. The focus was on creating a practical and usable prototype that addresses real operational document-processing challenges in manufacturing environments.
