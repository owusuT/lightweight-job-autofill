// Hardcoded Job Application Data for Testing
const jobApplicationData = {
  // Mayne Pharma IT Analyst Application
  company: {
    name: "Mayne Pharma",
    position: "IT Analyst",
    location: "Raleigh, North Carolina",
    department: "Information Technology",
    type: "Full-time"
  },
  
  // Application preferences
  preferences: {
    cvSource: "File", // Options: "Dropbox", "File", "Type or Paste Resume", "Apply With LinkedIn"
    availability: "Immediate",
    salary: "Competitive",
    workType: "On-site"
  },
  
  // Form data to autofill (optimized for storage)
  formData: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe.test@example.com",
    phone: "(555) 123-4567",
    address: "123 Test Street",
    city: "Raleigh",
    state: "North Carolina",
    zip: "27601",
    country: "United States",
    
    // Job specific fields
    position: "IT Analyst",
    company: "Mayne Pharma",
    department: "Information Technology",
    startDate: "Immediate",
    salary: "Competitive",
    workType: "On-site",
    
    // Experience/Summary (shortened to save storage)
    summary: "IT Analyst with 5+ years in pharma experience. Skills: System Analysis, Data Management, SQL, Python.",
    skills: "System Analysis, Data Management, SQL, Python",
    
    // Education (shortened)
    education: "BS Information Technology, NCSU",
    
    // Resume/CV handling
    resumeFileName: "resume.pdf",
    resumeSource: "File"
  }
};

// Storage management functions
const StorageManager = {
  // Clear large data to free up quota
  async clearLargeData() {
    try {
      await chrome.storage.local.remove(['processedPDFData', 'sharedPDFData']);
      console.log('Cleared large PDF data to free storage quota');
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  },

  // Check storage quota
  async checkQuota() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const quota = await navigator.storage.estimate();
        console.log('Storage quota:', quota);
        return {
          used: quota.usage || 0,
          available: quota.quota || 5242880,
          percentage: ((quota.usage || 0) / (quota.quota || 5242880)) * 100
        };
      }
    } catch (error) {
      console.error('Error checking quota:', error);
      return null;
    }
  }
};

// Function to get job application data
function getJobApplicationData() {
  return jobApplicationData;
}

// Function to get specific field value
function getJobApplicationField(field) {
  return jobApplicationData.formData[field] || jobApplicationData[field] || '';
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getJobApplicationData, getJobApplicationField };
} else if (typeof window !== 'undefined') {
  window.jobApplicationData = jobApplicationData;
  window.getJobApplicationData = getJobApplicationData;
  window.getJobApplicationField = getJobApplicationField;
}
