# Multi-API Job Search Enhancement Guide

## Overview

The lightweight job autofill extension has been enhanced with multi-API support, automatic fallback when rate limits are reached, US region filtering, and 30-day job age filtering.

## New Features

### 🔄 **Multi-API Support**
- **Arbeitnow API**: Free global job board (primary)
- **USAJOBS API**: US government jobs (requires API key)
- **Adzuna API**: US job listings (requires API keys)

### 🚀 **Automatic API Switching**
- Detects rate limit errors (HTTP 429)
- Automatically switches to next available API
- Tracks API status and rate limit reset times
- Manual API switching available via UI

### 🌍 **US Region Filtering**
- Filters jobs by US location
- Recognizes all 50 US states and territories
- Supports US-specific keywords (USA, United States, America)

### 📅 **30-Day Job Age Filtering**
- Automatically excludes jobs older than 30 days
- Shows job age in search results
- Visual indicators for recent vs. older jobs

## API Configuration

### Getting API Keys

#### USAJOBS API Key
1. Visit [USAJOBS Developer Portal](https://developer.usajobs.gov/)
2. Sign up for an account
3. Create a new API key
4. Copy the key to the extension settings

#### Adzuna API Keys
1. Visit [Adzuna Publisher Portal](https://publisher.adzuna.com/)
2. Sign up for a free account
3. Create a new application
4. Get your App ID and App Key
5. Copy both keys to the extension settings

### Configuration Steps

1. Open the extension popup
2. Go to the **Jobs** tab
3. Expand **API Configuration** section
4. Enter your API keys:
   - USAJOBS API Key (optional)
   - Adzuna App ID (optional)
   - Adzuna App Key (optional)
5. Keys are automatically saved

## API Priority & Fallback

### Default Priority Order
1. **Arbeitnow** (free, no key required)
2. **USAJOBS** (US government, requires key)
3. **Adzuna** (US commercial, requires keys)

### Fallback Behavior
- **Rate Limit Detection**: Monitors HTTP 429 responses
- **Automatic Switching**: Moves to next API when rate limited
- **Recovery**: Returns to primary API after rate limit reset
- **Graceful Degradation**: Shows appropriate messages when all APIs fail

### Rate Limits
- **Arbeitnow**: No official limits (recommended: 60 requests/minute)
- **USAJOBS**: 1,000 requests/hour
- **Adzuna**: 1,000 requests/month (free tier)

## Search Features

### Enhanced Search Options

#### Location-Based Search
- **US Only Checkbox**: Filters to US-based jobs
- **Location Field**: Specific city/state searches
- **Global Search**: When US Only is unchecked

#### Job Age Indicators
- **Green Badge**: Recent jobs (≤30 days)
- **Gray Badge**: Older jobs (>30 days)
- **Age Display**: Shows exact days since posting

#### Source Identification
Each job listing shows its API source:
- **Blue Badge**: Arbeitnow
- **Purple Badge**: USAJOBS  
- **Green Badge**: Adzuna

### Search Filters
- **Remote Only**: Remote/work-from-home positions
- **US Only**: US-based job listings
- **Visa Sponsorship**: Jobs offering visa sponsorship
- **Keywords**: Job title and skill matching

## API Status Management

### Real-time Status Display
The Jobs tab shows:
- **Current API**: Active API and region
- **API List**: All APIs with status indicators
  - 🟢 **Green**: Active and available
  - 🔴 **Red**: Rate limited
  - ⚪ **Gray**: Inactive

### Manual API Switching
1. Go to Jobs tab
2. Click **Switch API** button
3. Extension cycles to next available API
4. Status updates automatically

### Automatic Recovery
- Rate limited APIs are temporarily marked
- System attempts recovery after reset time
- Returns to preferred API when available

## Technical Implementation

### Background Service Worker
```javascript
class MultiAPIJobManager {
  // Manages multiple APIs
  // Handles rate limiting
  // Implements fallback logic
  // Applies filters
}
```

### Key Features
- **Caching**: 30-minute cache for search results
- **Rate Limit Tracking**: Monitors and respects API limits
- **Error Handling**: Graceful fallback and error recovery
- **Data Transformation**: Normalizes different API formats

### Message Handling
- `FETCH_JOBS`: Enhanced with multi-API support
- `GET_API_STATUS`: Returns current API status
- `SWITCH_API`: Manual API switching
- Existing handlers remain unchanged

## Data Filtering

### US Region Detection
```javascript
isUSJob(job) {
  // Checks location field
  // Matches US states and territories
  // Recognizes US keywords
}
```

### Job Age Calculation
```javascript
getJobAge(job) {
  // Calculates days since posting
  // Handles various date formats
  // Applies 30-day filter
}
```

### Filter Application
- **Age Filter**: Excludes jobs >30 days old
- **Region Filter**: US-only when requested
- **API-Specific**: Respects API capabilities

## Troubleshooting

### Common Issues

#### API Keys Not Working
- Verify keys are correctly copied
- Check API key permissions
- Ensure keys are saved in extension

#### Rate Limit Errors
- Wait for automatic reset
- Switch to different API manually
- Check API key limits

#### No US Jobs Found
- Disable "US Only" checkbox
- Try broader search terms
- Check location spelling

#### Old Jobs Still Showing
- Verify 30-day filter is applied
- Check job posting dates
- Clear extension cache

### Debug Information
- Open browser DevTools (F12)
- Check Console for API errors
- Monitor Network tab for API calls
- Review Background Service Worker logs

## Performance Considerations

### Caching Strategy
- **30-minute cache**: Reduces API calls
- **Smart invalidation**: Cache cleared on new searches
- **Rate limit awareness**: Respects API constraints

### API Efficiency
- **Parallel requests**: Attempts multiple APIs simultaneously
- **Fast fallback**: Quick switching on errors
- **Minimal data**: Only requests necessary fields

### Memory Usage
- **Efficient storage**: Limits history to 100 items
- **Clean data structures**: Optimized for performance
- **Garbage collection**: Proper cleanup of unused data

## Future Enhancements

### Planned Features
- **Additional APIs**: Indeed, LinkedIn, Glassdoor
- **Advanced Filters**: Salary, experience level, company size
- **Job Alerts**: Email notifications for new matches
- **Analytics**: Search history and success metrics

### API Expansion
- **Regional APIs**: Country-specific job boards
- **Industry APIs**: Tech-specific job platforms
- **Premium APIs**: Enhanced features with paid access

## Security & Privacy

### API Key Storage
- **Local Storage**: Keys stored in Chrome sync storage
- **Encryption**: Keys encrypted at rest
- **No Transmission**: Keys never sent to external servers

### Data Privacy
- **Minimal Collection**: Only job search data
- **Local Processing**: No external data processing
- **User Control**: Clear and export functionality

## Support

### Getting Help
1. Check this guide first
2. Review extension documentation
3. Check API provider documentation
4. Report issues with detailed information

### Reporting Issues
Include:
- Extension version
- Browser version
- API keys (redacted)
- Error messages
- Steps to reproduce

---

**Note**: This enhancement maintains backward compatibility while adding powerful new features for job searching across multiple APIs with intelligent fallback and filtering capabilities.
