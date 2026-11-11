# Installation Guide

## Quick Start

### Prerequisites
- Google Chrome browser (latest version)
- Basic understanding of Chrome extensions

### Installation Steps

1. **Download the Extension**
   ```bash
   # Clone or download the repository
   git clone <repository-url>
   # or download and extract the ZIP file
   ```

2. **Open Chrome Extensions**
   - Open Chrome browser
   - Navigate to `chrome://extensions/`
   - Or go to Chrome menu > More tools > Extensions

3. **Enable Developer Mode**
   - Toggle "Developer mode" in the top-right corner
   - This enables loading unpacked extensions

4. **Build and Load the Extension**
   - Run `npm install` once, then `npm run build`
   - Click "Load unpacked"
   - Select the `dist/` folder (the repo root has no `manifest.json`)
   - The extension will appear in your toolbar

5. **Verify Installation**
   - Look for the extension icon in Chrome toolbar
   - Click the icon to open the popup
   - Navigate between Profile, Apply, History, and Tools tabs
   - Click **Best Jobs** to open the side panel

## First Time Setup

### 1. Configure Your Profile
1. Click the extension icon
2. Go to the "Profile" tab
3. Fill in your information:
   - Personal details (name, email, phone)
   - Address information
   - Professional summary and skills
4. Click "Save Profile"

### 2. Test Autofill
1. Navigate to a job application site (LinkedIn, Indeed, etc.)
2. Look for the blue "AutoFill Application" button
3. Click to test form filling

### 3. Search for Jobs
1. Open extension popup
2. Go to "Jobs" tab
3. Enter search terms and filters
4. Click "Search Jobs"

## Troubleshooting

### Extension Not Loading
**Symptoms**: Extension doesn't appear in toolbar
**Solutions**:
- Verify Developer mode is enabled
- Check for errors in `chrome://extensions/`
- Ensure all files are present in the folder
- Try reloading the extension

### Autofill Button Not Showing
**Symptoms**: No blue button on job sites
**Solutions**:
- Refresh the page
- Check if you're on a supported job site
- Verify the page has form elements
- Check browser console for errors

### Profile Not Saving
**Symptoms**: Profile data disappears after closing popup
**Solutions**:
- Check Chrome storage permissions
- Try saving profile again
- Check for JavaScript errors in popup

### Job Search Not Working
**Symptoms**: No results or error messages
**Solutions**:
- Check internet connection
- Verify API accessibility
- Try different search terms
- Check browser network tab for API calls

## Advanced Configuration

### Adding Custom Icons
Create PNG icons in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

### Modifying Permissions
Edit `public/manifest.json` to adjust permissions:
```json
{
  "permissions": [
    "storage",
    "tabs",
    "webNavigation",
    "sidePanel"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

### Custom Field Mappings
Modify field detection in `contentScript.js`:
```javascript
const fieldMappings = {
  'first_name': ['first', 'given', 'forename', 'custom_field'],
  'last_name': ['last', 'surname', 'family', 'custom_last'],
  // Add your custom mappings here
};
```

## Development Mode

### Debugging Content Script
1. Open a job application page
2. Press F12 to open DevTools
3. Go to Console tab
4. Look for "Lightweight Job Autofill" messages

### Debugging Background Script
1. Go to `chrome://extensions/`
2. Find "Lightweight Job Autofill"
3. Click "service worker" link
4. Check console for background script logs

### Debugging Popup
1. Right-click extension icon
2. Select "Inspect popup"
3. Use DevTools to debug popup interface

## File Structure Reference

```
lightweight-job-autofill/
|-- dist/                  # Built extension (load this folder unpacked)
|-- popup.html             # Popup entry (built by Vite)
|-- sidepanel.html         # Side panel entry (built by Vite)
|-- contentScript.js       # Form detection and filling (copied as-is)
|-- contentScript.css      # Dock and toast styles
|-- public/
|   |-- manifest.json      # Extension configuration (MV3)
|-- src/
|   |-- background/        # Service worker source
|   |-- popup/             # Popup React app
|   |-- sidepanel/         # Side panel React app
|   |-- shared/            # Types, messages, scoring, AI providers
|-- lib/
|   |-- pdf-processor.js   # PDF text extraction
|   |-- pdfjs/build/       # Vendored PDF.js
|-- scripts/               # Build copy script
|-- README.md              # Main documentation
|-- INSTALLATION.md        # This file
```

## Security Considerations

### Browser Security
- Extension runs in isolated environment
- No access to other extensions
- Limited to specified host permissions

### Data Privacy
- User data stored locally in Chrome storage
- No data sent to external servers
- No tracking or analytics

### API Security
- HTTPS connections only
- No authentication required for Arbeitnow API
- Input validation and sanitization

## Updates and Maintenance

### Updating the Extension
1. Download new version
2. Remove old extension from Chrome
3. Load new version following installation steps
4. Profile data will be preserved

### Checking for Updates
- Monitor the GitHub repository
- Check Chrome Web Store (if published)
- Review release notes for new features

## Support

### Getting Help
1. Check this installation guide
2. Review README.md documentation
3. Check API_DOCUMENTATION.md for API issues
4. Search existing issues (if on GitHub)
5. Create new issue with details

### Reporting Issues
Include the following information:
- Chrome version
- Extension version
- Steps to reproduce
- Error messages (if any)
- Screenshots (if applicable)

## Uninstallation

### Removing the Extension
1. Go to `chrome://extensions/`
2. Find "Lightweight Job Autofill"
3. Click "Remove"
4. Confirm removal

### Data Cleanup
Extension data is stored in Chrome storage:
- Profile data in `chrome.storage.sync`
- Application history in `chrome.storage.local`
- Data is removed when extension is uninstalled

---

**Note**: This is a lightweight, educational implementation. For production use, consider additional testing, security measures, and user feedback collection.
