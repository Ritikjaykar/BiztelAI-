# AI Workflow

## AI Tools Used

During development, I used AI tools to speed up implementation, explore different approaches, and help with debugging. Tesseract.js was used for browser-based OCR so the application could extract text directly from uploaded documents without requiring any external services.

## How AI Was Used

The assignment requirements were intentionally open-ended, so AI helped break the problem into smaller features such as document upload, OCR extraction, review workflows, validation checks, analytics, and record history.

AI was mainly used to:

* Brainstorm the overall product workflow
* Generate initial code structures and utility functions
* Suggest validation rules and data extraction approaches
* Assist with debugging and troubleshooting issues
* Help prepare project documentation and setup instructions

## Development Approach

The focus was on building a working end-to-end prototype rather than a complex production architecture. To keep the application simple to run and easy to review, I chose a lightweight frontend-only approach with local storage for persistence.

I also included fallback extraction logic so the application remains functional even when OCR results are incomplete or inconsistent.

## Where AI Helped Most

* Rapid prototyping of the core workflow
* Designing validation and exception-handling logic
* Structuring the analytics and dashboard views
* Generating boilerplate code and documentation
* Speeding up debugging and testing

## Manual Decisions and Implementation

Several parts of the project required manual judgment and iteration, including:

* Deciding how operational records should be reviewed and corrected
* Defining business validation rules relevant to manufacturing workflows
* Adjusting extraction logic to work with the provided handwritten samples
* Improving the user experience for reviewing extracted records
* Testing and refining the application against different document formats

## Future Improvements

If this were extended beyond a prototype, I would consider:

* Integrating a vision-capable LLM such as Claude or GPT for more accurate extraction
* Adding server-side document processing
* Storing detailed confidence scores and extraction metadata
* Maintaining audit logs for human review actions
* Supporting batch document uploads and processing
* Adding user authentication and role-based access control
