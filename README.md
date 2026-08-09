# Lightweight Job Autofill Extension

A simplified Chrome extension for automatically filling job application forms using free job APIs.

## Features

- **Form Autofill**: Automatically detects and fills job application forms
- **Resume PDF Processing**: Upload a resume PDF and extract its text and personal details (name, email, phone, skills, experience)
- **Smart Form Mapping**: Fills web form fields from your profile data
- **Job Search**: Search for jobs using the free Arbeitnow API
- **Profile Management**: Store and manage your personal and professional information
- **Application History**: Track your job applications and export history
- **Password Generator**: Cryptographically secure password generation
- **Lightweight**: Minimal dependencies and fast performance

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your toolbar

## Usage

### Setting Up Your Profile

1. Click the extension icon in your toolbar
2. Navigate to the "Profile" tab
3. Fill in your personal and professional information
4. Click "Save Profile"

### Using Autofill

1. Navigate to a job application page (LinkedIn, Indeed, etc.)
2. A blue "AutoFill Application" button will appear in the top-right corner
3. Click the button to automatically fill detected form fields
4. The extension will show you how many fields were filled

### Searching for Jobs

1. Open the extension popup
2. Navigate to the "Jobs" tab
3. Enter search terms and optionally filter for remote jobs or visa sponsorship
4. Click "Search Jobs" to see results from the Arbeitnow API

### Viewing Application History

1. Open the extension popup
2. Navigate to the "History" tab
3. See all your previous applications with timestamps and field counts
4. Export your history as CSV for record-keeping

### Using Resume PDF Processing

1. Open the extension popup and navigate to the "Apply" tab
2. Upload a PDF resume
3. The extension automatically extracts the text and personal details (name, email, phone, skills, experience)
4. The extracted info is stored and can be used to enrich your profile and application filling

#### PDF Processing Features

- **Text Extraction**: Automatically extracts all text from PDF documents
- **Personal Info Detection**: Identifies names, emails, phone numbers, addresses, and professional details

## API Integration

### Primary API: Arbeitnow

The extension uses the **Arbeitnow Job Board API** as its primary data source:

- **Free**: No API key required
- **Reliable**: Data from multiple Applicant Tracking Systems (Greenhouse, SmartRecruiters, etc.)
- **Features**: Remote job filtering, visa sponsorship filtering
- **Rate Limiting**: Built-in caching to reduce API calls

**Endpoint**: `https://www.arbeitnow.com/api/job-board-api`

**Parameters**:
- `search`: Job title or keywords
- `remote`: Filter for remote jobs (true/false)
- `visa_sponsorship`: Filter for visa sponsorship (true/false)
- `limit`: Number of results to return

### Alternative APIs Considered

The following APIs were researched but not implemented due to limitations:

| API | Status | Limitations |
|-----|--------|-------------|
| Indeed API | Discontinued | No longer maintained, requires published account |
| LinkedIn API | Restricted | Requires special permissions, limited access |
| Glassdoor API | Restricted | Requires partnership, limited free tier |
| USAJOBS API | Available | US government jobs only, requires API key |
| Adzuna API | Available | Requires API key, rate limits |
| ZipRecruiter API | Available | Requires API key, commercial use restrictions |

## Technical Architecture

### Background Service Worker (`background.js`)

- **JobAPIManager**: Handles API calls and caching
- **UserDataManager**: Manages user profile and application history
- **FormFieldMapper**: Maps form fields to user data
- **Keep-Alive Port**: A long-lived port keeps the MV3 service worker awake while the content script is active
- **Message Hub**: Routes popup/content-script messages, including `OPEN_POPUP` (reopens the popup from the page UI)

### Content Script (`contentScript.js`)

- **AtsFieldDetector**: Analyzes form elements using attribute, keyword, type, and context analysis
- **FormFiller**: Fills fields and triggers the right input/change events for form compatibility
- **AutofillOrchestrator**: Coordinates detection → fill → completion reporting
- **UIService**: Shadow-DOM UI (a "AutoFill" button plus status toasts) that appears on job pages
- **Popup Protocol**: Handles `DETECT_FORMS`, `GET_ATS_STATUS`, `MANUAL_FILL_FORM`, `FILL_JOB_APPLICATION`, `CLEAR_ALL_FORMS` from the popup

### PDF Processing (`lib/pdf-processor.js`)

- **RealPDFProcessor**: Extracts text from PDF resumes using Mozilla PDF.js (vendored at `lib/pdfjs/`)
- **Personal Info Extraction**: Pulls name, email, phone, address, summary, experience, education, and skills from the resume text
- **Smart Filling**: Extracted resume data is stored and available for application filling

### Popup Interface (`popup.html`, `popup.js`)

- **Tab Navigation**: Profile, Apply, History, and Tools sections
- **Profile Management**: Edit and save personal/professional information
- **Resume Upload**: Upload a resume (PDF, DOC, DOCX); PDFs are text-extracted automatically
- **Quick Fill**: Fill detected fields, scan the page, and clear forms
- **Password Generator**: Cryptographically secure password generation (`crypto.getRandomValues`)
- **History Management**: View and export application history as CSV
- **Credential Tools**: View and clear saved credentials

## Form Detection Logic

The extension uses multiple strategies to detect form fields:

1. **Attribute Analysis**: Checks `id`, `name`, `placeholder`, and associated labels
2. **Keyword Matching**: Uses predefined keyword sets for each field type
3. **Type Detection**: Leverages HTML5 input types (email, tel, etc.)
4. **Context Analysis**: Considers surrounding text and labels

### Supported Field Types

- **Personal**: First name, last name, email, phone
- **Address**: Street, city, state, ZIP, country
- **Professional**: Summary, experience, education, skills

## Security & Privacy

- **Local Storage**: User data stored locally in Chrome storage
- **No Tracking**: No analytics or tracking scripts
- **Minimal Permissions**: Only requests necessary permissions
- **Open Source**: Full code transparency

## Browser Compatibility

- **Chrome**: Manifest V3 compatible
- **Edge**: Compatible (Chrome extension support)
- **Firefox**: Not supported (different extension architecture)

## Development

### File Structure

```
lightweight-job-autofill/
|-- manifest.json              # Extension configuration (MV3)
|-- background.js              # Service worker (message hub + keep-alive)
|-- contentScript.js           # Content script (v2, Shadow DOM UI)
|-- contentScript.css          # Content script styles
|-- injectScript.js            # Page-side bridge (custom protocol on jolly-r.app)
|-- injectScriptHandler.js     # Injects injectScript.js at document_start
|-- popup.html                 # Popup interface
|-- popup.js                   # Popup logic
|-- lib/
|   |-- pdf-processor.js       # PDF text + personal-info extraction
|   |-- pdfjs/
|   |   `-- build/
|   |       |-- pdf.js         # PDF.js library (vendored)
|   |       `-- pdf.worker.js  # PDF.js worker (vendored)
|-- plan/                      # Design / approach documents (Go_manager)
|-- task/                      # Work-item tracking (Go_manager)
|-- Agents.md                  # Running change log (Go_manager)
|-- README.md                  # This file
```

### Building from Source

1. Modify files as needed
2. Load extension in Chrome developer mode
3. Test on various job application sites
4. Debug using Chrome DevTools

## Limitations

### PDF & Resume Limitations

- **PDF Quality**: Text extraction depends on PDF quality and formatting
- **Scanned PDFs**: Image-based PDFs require OCR preprocessing (not supported natively)
- **Complex Layouts**: May struggle with highly formatted or multi-column layouts
- **Local Processing**: All processing happens locally, no external AI services
- **Multiple Positions**: Extracts first job position by default, users may need to choose from multiple
- **Date Formats**: Limited support for various date formats, may need manual adjustment

### Performance & Optimization

- **Memory Management**: Keeps extraction local and bounded to avoid popup memory issues
- **Non-blocking**: Yields control to the browser during PDF text processing

### API Limitations

- **Single Source**: Only uses Arbeitnow API (no redundancy)
- **Rate Limits**: No official rate limiting documentation
- **Data Quality**: Dependent on ATS data quality
- **Geographic Bias**: Primarily European job market

### Form Limitations

- **Dynamic Forms**: May not work with heavily JavaScript-driven forms
- **Custom Fields**: Cannot handle unusual or proprietary field types
- **Multi-step Forms**: Works best with single-page applications
- **CAPTCHA**: Cannot bypass CAPTCHA or verification steps
- **Smart Mapping Accuracy**: Field mapping depends on clear field identification

### Browser Limitations

- **Chrome Only**: Manifest V3 specific features
- **No Mobile**: Not designed for mobile browsers
- **Permissions**: Requires broad host permissions for functionality

## Troubleshooting

### Common Issues

**Autofill button not appearing**
- Check if you're on a supported job site
- Ensure the page has form elements
- Refresh the page and try again

**Fields not filling correctly**
- Verify your profile is complete
- Check if the form uses unusual field names
- Try filling manually for problematic fields

**Job search not working**
- Check internet connection
- Verify the Arbeitnow API is accessible
- Try different search terms

**Extension not loading**
- Check Chrome extensions page for errors
- Ensure all files are present
- Try reloading the extension

**PDF processing issues**
- Ensure PDF is text-based (not scanned images)
- Try a different PDF if extraction fails
- Check browser console for processing errors

**Resume upload not filling anything**
- Ensure PDF has been processed successfully (check the status message for a word count)
- Verify your profile contains the fields you want to fill
- Check that the PDF contains relevant personal information

**Smart mapping not finding fields**
- Ensure you're on a page with form fields
- Try detecting fields first before autofill
- Check that the page uses standard field names
- Some forms may have unusual field names

### Debug Mode

Enable debug logging:
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for extension log messages
4. Check background script console in extensions page

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the extension.

### Areas for Improvement

- **Additional APIs**: Integrate more job sources
- **Better Form Detection**: Improve field matching algorithms
- **Multi-language Support**: Add international field detection
- **Custom Mappings**: Allow user-defined field mappings
- **Analytics Dashboard**: Better visualization of application data

## License

MIT License - feel free to use, modify, and distribute.

## Support

For issues and support:
1. Check the troubleshooting section above
2. Review the GitHub issues (if hosted publicly)
3. Create a new issue with detailed information

---

**Note**: This is a lightweight, educational implementation. For production use, consider additional security measures, error handling, and user testing.
