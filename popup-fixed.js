// Fixed Popup Manager - Simplified and Working
class PopupManager {
  constructor() {
    this.currentTab = 'profile';
    this.userProfile = null;
    this.currentPDF = null;
    this.init();
  }

  async init() {
    console.log('Popup initialized');
    
    // Set up tab navigation
    this.setupTabNavigation();
    
    // Initialize components
    await this.setupProfileForm();
    await this.setupJobApplication();
    await this.setupTools();
    
    // Load saved data
    await this.loadUserProfile();
    
    // Show initial tab
    this.showTab('profile');
    
    this.showStatus('Ready');
  }

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;
        
        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Activate selected tab
        button.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
      });
    });
  }

  async setupProfileForm() {
    const saveButton = document.getElementById('save-profile');
    const clearButton = document.getElementById('clear-profile');

    if (saveButton) {
      saveButton.addEventListener('click', () => this.saveProfile());
    }

    if (clearButton) {
      clearButton.addEventListener('click', () => this.clearProfile());
    }

    await this.loadUserProfile();
  }

  async setupJobApplication() {
    const fillButton = document.getElementById('fill-job-application');
    const copyButton = document.getElementById('copy-job-data');
    const resetButton = document.getElementById('reset-job-data');

    if (fillButton) {
      fillButton.addEventListener('click', () => this.fillJobApplication());
    }

    if (copyButton) {
      copyButton.addEventListener('click', () => this.copyJobData());
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => this.resetJobData());
    }

    this.updateJobDataPreview();
  }

  async setupTools() {
    const fillButton = document.getElementById('manual-fill');
    const detectButton = document.getElementById('detect-forms');
    const clearButton = document.getElementById('clear-forms');
    const uploadButton = document.getElementById('upload-resume-pdf');

    if (fillButton) {
      fillButton.addEventListener('click', () => this.manualFillForm());
    }

    if (detectButton) {
      detectButton.addEventListener('click', () => this.detectForms());
    }

    if (clearButton) {
      clearButton.addEventListener('click', () => this.clearAllForms());
    }

    if (uploadButton) {
      uploadButton.addEventListener('click', () => this.uploadResumePDF());
    }
  }

  showTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);

    if (activeButton) activeButton.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
  }

  async loadUserProfile() {
    try {
      const result = await chrome.storage.sync.get(['userProfile']);
      if (result.userProfile) {
        this.userProfile = result.userProfile;
        
        // Fill form fields
        document.getElementById('firstName').value = this.userProfile.firstName || '';
        document.getElementById('lastName').value = this.userProfile.lastName || '';
        document.getElementById('email').value = this.userProfile.email || '';
        document.getElementById('phone').value = this.userProfile.phone || '';
        document.getElementById('address').value = this.userProfile.address || '';
        document.getElementById('city').value = this.userProfile.city || '';
        document.getElementById('state').value = this.userProfile.state || '';
        document.getElementById('zip').value = this.userProfile.zip || '';
        document.getElementById('country').value = this.userProfile.country || '';
        document.getElementById('summary').value = this.userProfile.summary || '';
        document.getElementById('skills').value = this.userProfile.skills || '';
        document.getElementById('experience').value = this.userProfile.experience || '';
        document.getElementById('education').value = this.userProfile.education || '';
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  async saveProfile() {
    try {
      const profile = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        zip: document.getElementById('zip').value,
        country: document.getElementById('country').value,
        summary: document.getElementById('summary').value,
        skills: document.getElementById('skills').value,
        experience: document.getElementById('experience').value,
        education: document.getElementById('education').value
      };

      await chrome.storage.sync.set({ userProfile: profile });
      this.userProfile = profile;
      this.showStatus('Profile saved successfully', 'success');
    } catch (error) {
      console.error('Error saving profile:', error);
      this.showStatus('Error saving profile', 'error');
    }
  }

  async clearProfile() {
    try {
      await chrome.storage.sync.remove(['userProfile']);
      this.userProfile = null;
      
      // Clear form fields
      const inputs = document.querySelectorAll('#profile-form input, #profile-form textarea');
      inputs.forEach(input => input.value = '');
      
      this.showStatus('Profile cleared', 'info');
    } catch (error) {
      console.error('Error clearing profile:', error);
      this.showStatus('Error clearing profile', 'error');
    }
  }

  fillJobApplication() {
    try {
      this.showStatus('Filling job application...');
      
      // Get hardcoded job application data
      const applicationData = {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe.test@example.com",
        phone: "(555) 123-4567",
        address: "123 Test Street",
        city: "Raleigh",
        state: "North Carolina",
        zip: "27601",
        country: "United States",
        position: "IT Analyst",
        company: "Mayne Pharma",
        department: "Information Technology",
        summary: "IT Analyst with 5+ years in pharma experience. Skills: System Analysis, Data Management, SQL, Python.",
        skills: "System Analysis, Data Management, SQL, Python",
        education: "BS Information Technology, NCSU",
        workType: "On-site",
        availability: "Immediate"
      };

      // Send to background script to fill application
      chrome.runtime.sendMessage({
        type: 'FILL_JOB_APPLICATION',
        data: applicationData
      }, (response) => {
        if (response && response.success) {
          this.showStatus(`Application filled: ${response.fieldsFilled} fields`, 'success');
        } else {
          this.showStatus('Failed to fill application', 'error');
        }
      });

    } catch (error) {
      console.error('Error filling job application:', error);
      this.showStatus('Error filling job application', 'error');
    }
  }

  copyJobData() {
    try {
      const jobData = {
        company: {
          name: "Mayne Pharma",
          position: "IT Analyst",
          location: "Raleigh, North Carolina",
          department: "Information Technology",
          type: "Full-time"
        },
        formData: {
          firstName: "John",
          lastName: "Doe",
          email: "john.doe.test@example.com",
          phone: "(555) 123-4567",
          position: "IT Analyst",
          company: "Mayne Pharma",
          summary: "IT Analyst with 5+ years in pharma experience."
        }
      };
      
      const dataString = JSON.stringify(jobData, null, 2);
      navigator.clipboard.writeText(dataString);
      this.showStatus('Job application data copied to clipboard', 'success');
    } catch (error) {
      console.error('Error copying data:', error);
      this.showStatus('Failed to copy data', 'error');
    }
  }

  resetJobData() {
    try {
      const cvSourceSelect = document.getElementById('cv-source');
      const workTypeSelect = document.getElementById('work-type');
      const availabilitySelect = document.getElementById('availability');
      
      if (cvSourceSelect) cvSourceSelect.value = 'file';
      if (workTypeSelect) workTypeSelect.value = 'onsite';
      if (availabilitySelect) availabilitySelect.value = 'immediate';
      
      this.updateJobDataPreview();
      this.showStatus('Job application data reset to defaults', 'info');
    } catch (error) {
      console.error('Error resetting data:', error);
      this.showStatus('Failed to reset data', 'error');
    }
  }

  updateJobDataPreview() {
    const previewDiv = document.getElementById('job-data-preview');
    if (!previewDiv) return;
    
    const cvSource = document.getElementById('cv-source')?.value || 'file';
    const workType = document.getElementById('work-type')?.value || 'onsite';
    const availability = document.getElementById('availability')?.value || 'immediate';
    
    previewDiv.innerHTML = `
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 10px;">
        <h4 style="margin: 0 0 10px 0; color: #333;">Current Application Data:</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
          <div>
            <strong>Position:</strong> IT Analyst<br>
            <strong>Company:</strong> Mayne Pharma<br>
            <strong>Department:</strong> Information Technology
          </div>
          <div>
            <strong>CV Source:</strong> ${cvSource}<br>
            <strong>Work Type:</strong> ${workType}<br>
            <strong>Availability:</strong> ${availability}
          </div>
        </div>
      </div>
    `;
  }

  manualFillForm() {
    chrome.runtime.sendMessage({
      type: 'MANUAL_FILL_FORM',
      options: {
        fillPersonal: true,
        fillProfessional: true,
        fillAddress: true
      }
    }, (response) => {
      if (response && response.success) {
        this.showStatus(`Forms filled: ${response.fieldsFilled} fields`, 'success');
      } else {
        this.showStatus('Failed to fill forms', 'error');
      }
    });
  }

  detectForms() {
    chrome.runtime.sendMessage({ type: 'DETECT_FORMS' }, (response) => {
      if (response && response.success) {
        this.showStatus(`Detected ${response.forms.length} form fields`, 'success');
      } else {
        this.showStatus('Failed to detect forms', 'error');
      }
    });
  }

  clearAllForms() {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL_FORMS' }, (response) => {
      if (response && response.success) {
        this.showStatus('Forms cleared', 'success');
      } else {
        this.showStatus('Failed to clear forms', 'error');
      }
    });
  }

  uploadResumePDF() {
    chrome.runtime.sendMessage({ type: 'UPLOAD_RESUME_PDF' }, (response) => {
      if (response && response.success) {
        this.showStatus(`Resume uploaded: ${response.message}`, 'success');
      } else {
        this.showStatus('Failed to upload resume', 'error');
      }
    });
  }

  showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.className = `status status-${type}`;
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
