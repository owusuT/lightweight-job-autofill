// Lightweight Job Autofill Content Script
class FormAutofiller {
  constructor() {
    this.userProfile = null;
    this.resumeData = null;
    this.isProcessing = false;
    this.detectedFields = new Map();
    this.resumeUploadFields = [];
    this.autofillButton = null;
    this.dbManager = new DatabaseManager();
    this.init();
  }

  // Singleton instance to prevent multiple instantiations
  static getInstance() {
    if (!FormAutofiller.instance) {
      FormAutofiller.instance = new FormAutofiller();
    }
    return FormAutofiller.instance;
  }

  static instance = null;

  async init() {
    console.log('Lightweight Job Autofill content script initialized');
    
    // Load user profile and resume data
    await this.loadUserProfile();
    await this.loadResumeData();
    
    // Detect forms on the page
    this.detectForms();
    
    // Create autofill UI
    this.createAutofillUI();
    
    // Listen for DOM changes
    this.observeDOM();
    
    // Set up message listeners for manual tools
    this.setupMessageListeners();
  }

  async loadUserProfile() {
    try {
      await this.dbManager.init();
      const profile = await this.dbManager.getUserProfile();
      if (profile) {
        this.userProfile = profile;
        console.log('User profile loaded from database:', this.userProfile);
      } else {
        console.log('No user profile found in database, using defaults');
      }
    } catch (error) {
      console.error('Error loading user profile from database:', error);
    }
  }

  detectForms() {
    const forms = document.querySelectorAll('form');
    const inputs = document.querySelectorAll('input, textarea, select');
    
    // Clear previous detections but keep the map structure
    this.detectedFields.clear();
    
    inputs.forEach(input => {
      const fieldType = this.analyzeField(input);
      if (fieldType) {
        // Store both the element and its type for smart autofill
        this.detectedFields.set(fieldType, {
          element: input,
          type: fieldType,
          id: input.id || '',
          name: input.name || '',
          label: this.getFieldLabel(input)
        });
        console.log(`Detected field: ${fieldType} for element:`, input);
      }
    });

    // Detect resume upload fields
    this.detectResumeUploadFields();
    
    // Detect application questions
    this.detectApplicationQuestions();
  }

  detectResumeUploadFields() {
    const resumeUploadSelectors = [
      'input[type="file"]',
      'input[name*="resume"]',
      'input[name*="cv"]',
      'input[id*="resume"]',
      'input[id*="cv"]',
      'input[accept*="pdf"]'
    ];

    this.resumeUploadFields = [];
    
    resumeUploadSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        // Check if this is likely a resume upload field
        const label = this.getFieldLabel(element).toLowerCase();
        const id = (element.id || '').toLowerCase();
        const name = (element.name || '').toLowerCase();
        const accept = (element.accept || '').toLowerCase();
        
        const isResumeField = 
          label.includes('resume') || label.includes('cv') || label.includes('curriculum') ||
          id.includes('resume') || id.includes('cv') || id.includes('curriculum') ||
          name.includes('resume') || name.includes('cv') || name.includes('curriculum') ||
          accept.includes('pdf') || accept.includes('document');
        
        if (isResumeField) {
          this.resumeUploadFields.push({
            element: element,
            label: this.getFieldLabel(element),
            id: element.id || '',
            name: element.name || '',
            accept: element.accept || ''
          });
          console.log('Detected resume upload field:', element);
        }
      });
    });

    // Also check for "Add CV" style sections that might use different UI
    this.detectCustomResumeUploadSections();
  }

  detectCustomResumeUploadSections() {
    // Look for sections with "Add CV", "Upload Resume", etc. text
    const resumeSectionSelectors = [
      '[class*="resume"]',
      '[class*="cv"]',
      '[class*="upload"]',
      '[id*="resume"]',
      '[id*="cv"]',
      '[id*="upload"]'
    ];

    resumeSectionSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent.toLowerCase();
        if (text.includes('add cv') || text.includes('upload resume') || 
            text.includes('attach resume') || text.includes('select file')) {
          
          // Look for file inputs or buttons within this section
          const fileInput = element.querySelector('input[type="file"]');
          const button = element.querySelector('button, [role="button"]');
          
          if (fileInput || button) {
            this.resumeUploadFields.push({
              element: fileInput || button,
              label: element.textContent.trim(),
              id: element.id || '',
              name: element.name || '',
              isCustom: true,
              section: element
            });
            console.log('Detected custom resume upload section:', element);
          }
        }
      });
    });
  }

  analyzeField(element) {
    // Get field identifiers
    const id = element.id || '';
    const name = element.name || '';
    const placeholder = element.placeholder || '';
    const label = this.getFieldLabel(element);
    const type = element.type || element.tagName.toLowerCase();
    const className = element.className || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    
    // Combine all text for analysis
    const searchText = `${id} ${name} ${placeholder} ${label} ${className} ${ariaLabel}`.toLowerCase();
    
    // Enhanced field type mappings with regex patterns for fuzzy matching
    const fieldMappings = {
      'first_name': {
        keywords: ['first', 'given', 'forename', 'fname', 'firstname', 'first-name'],
        regex: /\b(first|given|forename|fname|firstname)\b/gi
      },
      'last_name': {
        keywords: ['last', 'surname', 'family', 'family_name', 'lname', 'lastname', 'last-name'],
        regex: /\b(last|surname|family|lname|lastname)\b/gi
      },
      'email': {
        keywords: ['email', 'email_address', 'email-address', 'e-mail', 'mail'],
        regex: /\b(email|e[-]?mail)\b/gi
      },
      'phone': {
        keywords: ['phone', 'telephone', 'mobile', 'cell', 'tel', 'telephone_number'],
        regex: /\b(phone|telephone|mobile|cell|tel)\b/gi
      },
      'address': {
        keywords: ['address', 'street', 'street_address', 'addr', 'street1', 'street-1'],
        regex: /\b(address|street|addr)\b/gi
      },
      'city': {
        keywords: ['city', 'town', 'locality', 'city_name'],
        regex: /\b(city|town|locality)\b/gi
      },
      'state': {
        keywords: ['state', 'province', 'region', 'state_code', 'region_code'],
        regex: /\b(state|province|region)\b/gi
      },
      'zip': {
        keywords: ['zip', 'postal', 'postcode', 'postal_code', 'zipcode', 'zip_code', 'postalcode'],
        regex: /\b(zip|postal|postcode)\b/gi
      },
      'country': {
        keywords: ['country', 'country_code', 'nation', 'nationality'],
        regex: /\b(country)\b/gi
      },
      'summary': {
        keywords: ['summary', 'objective', 'profile', 'about', 'description', 'bio', 'introduction'],
        regex: /\b(summary|objective|profile|about|bio)\b/gi
      },
      'experience': {
        keywords: ['experience', 'work', 'employment', 'job', 'career', 'work_history'],
        regex: /\b(experience|work|employment|job)\b/gi
      },
      'education': {
        keywords: ['education', 'school', 'university', 'college', 'degree', 'academic'],
        regex: /\b(education|school|university|college|degree)\b/gi
      },
      'skills': {
        keywords: ['skills', 'competencies', 'abilities', 'technologies', 'tech', 'skillset'],
        regex: /\b(skills|competencies|abilities|technologies|tech)\b/gi
      },
      'company': {
        keywords: ['company', 'employer', 'organization', 'org', 'firm', 'company_name'],
        regex: /\b(company|employer|organization|org|firm)\b/gi
      },
      'position': {
        keywords: ['position', 'title', 'job_title', 'role', 'designation'],
        regex: /\b(position|title|job[-]?title|role|designation)\b/gi
      },
      'start_date': {
        keywords: ['start_date', 'start-date', 'start', 'begin_date', 'begin-date'],
        regex: /\b(start[-_]?date|begin[-_]?date|start)\b/gi
      },
      'end_date': {
        keywords: ['end_date', 'end-date', 'end', 'finish_date', 'finish-date'],
        regex: /\b(end[-_]?date|finish[-_]?date|end)\b/gi
      },
      'industry': {
        keywords: ['industry', 'sector', 'field', 'domain'],
        regex: /\b(industry|sector|field|domain)\b/gi
      },
      'present_employer': {
        keywords: ['present_employer', 'present-employer', 'current_employer', 'current-employer'],
        regex: /\b(present[-_]?employer|current[-_]?employer)\b/gi
      },
      'linkedin': {
        keywords: ['linkedin', 'linked-in', 'profile_url'],
        regex: /\b(linkedin|linked[-]?in)\b/gi
      },
      'website': {
        keywords: ['website', 'web', 'site', 'url', 'portfolio'],
        regex: /\b(website|web|site|url|portfolio)\b/gi
      },
      'salary': {
        keywords: ['salary', 'pay', 'compensation', 'wage', 'income'],
        regex: /\b(salary|pay|compensation|wage|income)\b/gi
      }
    };

    // Enhanced fuzzy matching with confidence scoring
    let bestMatch = null;
    let bestScore = 0;

    for (const [fieldType, config] of Object.entries(fieldMappings)) {
      let score = 0;
      
      // Check for exact matches (highest score)
      if (config.keywords.some(keyword => 
          id === keyword || name === keyword || placeholder === keyword || label === keyword)) {
        score += 100;
      }
      
      // Check for partial matches (medium score)
      if (config.keywords.some(keyword => searchText.includes(keyword))) {
        score += 50;
      }
      
      // Check regex matches (variable score based on matches)
      const regexMatches = searchText.match(config.regex);
      if (regexMatches) {
        score += regexMatches.length * 25;
      }
      
      // Bonus for aria-label matches
      if (ariaLabel && config.keywords.some(keyword => ariaLabel.toLowerCase().includes(keyword))) {
        score += 30;
      }
      
      // Type-based detection bonus
      if (type === 'email' && fieldType === 'email') score += 40;
      if (type === 'tel' && fieldType === 'phone') score += 40;
      if (type === 'textarea') {
        if (fieldType === 'summary' && (searchText.includes('summary') || searchText.includes('objective'))) score += 30;
        if (fieldType === 'experience' && (searchText.includes('experience') || searchText.includes('work'))) score += 30;
        if (fieldType === 'skills' && searchText.includes('skills')) score += 30;
      }
      
      // Keep the best match
      if (score > bestScore && score >= 25) { // Minimum threshold
        bestScore = score;
        bestMatch = fieldType;
      }
    }

    return bestMatch;
  }

  getFieldLabel(element) {
    // Try to find associated label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent;
    }
    
    // Check parent or sibling labels
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent;
    
    // Check preceding text nodes or elements
    let prev = element.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL') return prev.textContent;
      if (prev.textContent && prev.textContent.trim()) {
        return prev.textContent;
      }
      prev = prev.previousElementSibling;
    }
    
    return '';
  }

  createAutofillUI() {
    // Create floating button
    this.autofillButton = document.createElement('div');
    this.autofillButton.id = 'job-autofill-button';
    this.autofillButton.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: #4285f4;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
      ">
        <div id="autofill-text">AutoFill Application</div>
        <div id="autofill-status" style="font-size: 12px; margin-top: 4px;"></div>
      </div>
    `;
    
    this.autofillButton.addEventListener('click', () => this.autofillForm());
    document.body.appendChild(this.autofillButton);
  }

  async autofillForm() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const statusText = this.autofillButton.querySelector('#autofill-status');
    const mainText = this.autofillButton.querySelector('#autofill-text');
    
    try {
      statusText.textContent = 'Analyzing form...';
      mainText.textContent = 'Processing...';
      
      // Re-detect fields in case form changed
      this.detectForms();
      
      if (this.detectedFields.size === 0) {
        statusText.textContent = 'No form fields detected';
        return;
      }
      
      statusText.textContent = `Filling ${this.detectedFields.size} fields...`;
      
      let filledCount = 0;
      for (const [fieldType, element] of this.detectedFields) {
        const value = this.getFieldValue(fieldType);
        if (value && this.fillField(element, value)) {
          filledCount++;
          
          // Add small delay for visual feedback
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      statusText.textContent = `Filled ${filledCount} fields`;
      mainText.textContent = 'AutoFill Complete!';
      
      // Log application
      await this.logApplication(filledCount);
      
      // Reset button after delay
      setTimeout(() => {
        mainText.textContent = 'AutoFill Application';
        statusText.textContent = '';
      }, 3000);
      
    } catch (error) {
      console.error('Autofill error:', error);
      statusText.textContent = 'Error occurred';
      mainText.textContent = 'AutoFill Failed';
    } finally {
      this.isProcessing = false;
    }
  }

  getFieldValue(fieldType) {
    if (!this.userProfile) return null;
    
    const fieldMap = {
      'first_name': this.userProfile.firstName,
      'last_name': this.userProfile.lastName,
      'email': this.userProfile.email,
      'phone': this.userProfile.phone,
      'address': this.userProfile.address,
      'city': this.userProfile.city,
      'state': this.userProfile.state,
      'zip': this.userProfile.zip,
      'country': this.userProfile.country,
      'summary': this.userProfile.summary,
      'experience': this.formatExperience(this.userProfile.experience),
      'education': this.formatEducation(this.userProfile.education),
      'skills': this.formatSkills(this.userProfile.skills)
    };
    
    return fieldMap[fieldType] || '';
  }

  formatExperience(experience) {
    if (!Array.isArray(experience) || experience.length === 0) return '';
    
    return experience.map(exp => 
      `${exp.title || ''} at ${exp.company || ''} (${exp.startDate || ''} - ${exp.endDate || ''})`
    ).join('\n');
  }

  formatEducation(education) {
    if (!Array.isArray(education) || education.length === 0) return '';
    
    return education.map(edu => 
      `${edu.degree || ''} from ${edu.school || ''} (${edu.graduationYear || ''})`
    ).join('\n');
  }

  formatSkills(skills) {
    if (!Array.isArray(skills) || skills.length === 0) return '';
    
    return skills.join(', ');
  }

  fillField(element, value) {
    try {
      // Handle different input types
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        // Focus the element
        element.focus();
        
        // Clear existing value
        element.value = '';
        
        // Set new value
        element.value = value;
        
        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        
        return true;
      } else if (element.tagName === 'SELECT') {
        // Handle select dropdowns
        const options = Array.from(element.options);
        const matchingOption = options.find(option => 
          option.text.toLowerCase().includes(value.toLowerCase()) ||
          option.value.toLowerCase().includes(value.toLowerCase())
        );
        
        if (matchingOption) {
          element.value = matchingOption.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    } catch (error) {
      console.error('Error filling field:', error);
    }
    
    return false;
  }

  async logApplication(fieldsFilled) {
    try {
      const application = {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
        fieldsFilled: fieldsFilled,
        totalFields: this.detectedFields.size
      };
      
      await chrome.runtime.sendMessage({ 
        type: 'ADD_APPLICATION', 
        application 
      });
    } catch (error) {
      console.error('Error logging application:', error);
    }
  }

  async loadResumeData() {
    try {
      const result = await chrome.storage.sync.get(['resumeText']);
      if (result.resumeText) {
        this.resumeData = result.resumeText;
      }
    } catch (error) {
      console.error('Error loading resume data:', error);
    }
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'MANUAL_FILL_FORM') {
        this.handleManualFill(message.options, sendResponse);
        return true;
      }
      
      if (message.type === 'DETECT_FORMS') {
        this.handleFormDetection(sendResponse);
        return true;
      }
      
      if (message.type === 'CLEAR_ALL_FORMS') {
        this.handleClearForms(sendResponse);
        return true;
      }
      
      if (message.type === 'FILL_WITH_RESUME') {
        this.handleResumeFill(sendResponse);
        return true;
      }
      
      if (message.type === 'SMART_AUTOFILL') {
        this.handleSmartAutofill(message.mappings, sendResponse);
        return true;
      }
      
      if (message.type === 'UPDATE_PROFILE') {
        this.handleProfileUpdate(message.profile, sendResponse);
        return true;
      }
      
      if (message.type === 'UPLOAD_RESUME_PDF') {
        this.handleResumeUpload(sendResponse);
        return true;
      }
      
      if (message.type === 'FILL_JOB_APPLICATION') {
        this.handleJobApplicationFill(message.data, sendResponse);
        return true;
      }
    });
  }

  async handleManualFill(options, sendResponse) {
    try {
      this.isProcessing = true;
      let fieldsFilled = 0;

      if (options.fillPersonal) {
        fieldsFilled += await this.fillPersonalInfo();
      }
      
      if (options.fillProfessional) {
        fieldsFilled += await this.fillProfessionalInfo();
      }
      
      if (options.fillAddress) {
        fieldsFilled += await this.fillAddressInfo();
      }
      
      if (options.fillResume && this.resumeData) {
        fieldsFilled += await this.fillResumeInfo();
      }

      // Check if account creation fields are needed
      if (this.hasAccountCreationFields()) {
        fieldsFilled += await this.fillAccountCreationFields();
      }

      this.logApplication('Manual Fill', fieldsFilled);
      sendResponse({ success: true, fieldsFilled });
    } catch (error) {
      console.error('Error in manual fill:', error);
      sendResponse({ success: false, error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleFormDetection(sendResponse) {
    try {
      this.detectForms();
      const forms = [];
      
      this.detectedFields.forEach((fieldData, fieldType) => {
        const fieldInfo = {
          type: fieldType,
          id: fieldData.id,
          name: fieldData.name,
          label: fieldData.label,
          tagName: fieldData.element.tagName.toLowerCase()
        };
        forms.push(fieldInfo);
      });

      sendResponse({ success: true, forms });
    } catch (error) {
      console.error('Error detecting forms:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleClearForms(sendResponse) {
    try {
      const inputs = document.querySelectorAll('input, textarea, select');
      let clearedCount = 0;
      
      inputs.forEach(input => {
        if (input.value) {
          input.value = '';
          clearedCount++;
        }
      });

      sendResponse({ success: true, clearedCount });
    } catch (error) {
      console.error('Error clearing forms:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleResumeFill(sendResponse) {
    try {
      if (!this.resumeData) {
        sendResponse({ success: false, error: 'No resume data available' });
        return;
      }

      this.isProcessing = true;
      let fieldsFilled = 0;

      // Try to fill summary/objective fields with resume data
      const summaryFields = document.querySelectorAll('textarea[name*="summary"], textarea[name*="objective"], textarea[name*="about"], #summary, #objective');
      summaryFields.forEach(field => {
        if (!field.value && this.resumeData) {
          field.value = this.resumeData.substring(0, 500);
          fieldsFilled++;
        }
      });

      sendResponse({ success: true, fieldsFilled });
    } catch (error) {
      console.error('Error filling with resume:', error);
      sendResponse({ success: false, error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleSmartAutofill(mappings, sendResponse) {
    try {
      this.isProcessing = true;
      let fieldsFilled = 0;

      // Re-detect forms to get current field elements
      this.detectForms();

      // Fill fields using PDF mappings (fieldType -> value)
      Object.entries(mappings).forEach(([fieldType, value]) => {
        if (value && value.trim() !== '') {
          // Find the field by type using our new mapping structure
          const fieldData = this.detectedFields.get(fieldType);
          
          if (fieldData && fieldData.element && !fieldData.element.value) {
            if (this.fillField(fieldData.element, value)) {
              fieldsFilled++;
              fieldData.element.classList.add('smart-filled');
              console.log(`Smart filled ${fieldType} (${fieldData.id || fieldData.name}) with: ${value.substring(0, 50)}...`);
            }
          }
        }
      });

      sendResponse({ success: true, fieldsFilled });
    } catch (error) {
      console.error('Error in smart autofill:', error);
      sendResponse({ success: false, error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleProfileUpdate(profile, sendResponse) {
    try {
      this.userProfile = profile;
      console.log('Profile updated in content script:', profile);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error updating profile:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleResumeUpload(sendResponse) {
    try {
      // Re-detect forms to find upload fields
      this.detectForms();
      
      if (this.resumeUploadFields.length === 0) {
        sendResponse({ success: false, error: 'No resume upload fields detected on this page' });
        return;
      }

      const uploadSuccess = await this.uploadResumePDF();
      
      if (uploadSuccess) {
        sendResponse({ success: true, message: 'Resume uploaded successfully' });
      } else {
        sendResponse({ success: false, error: 'Resume upload failed' });
      }
    } catch (error) {
      console.error('Error in handleResumeUpload:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleJobApplicationFill(applicationData, sendResponse) {
    try {
      this.isProcessing = true;
      let fieldsFilled = 0;

      // Re-detect forms
      this.detectForms();

      // Fill standard form fields
      fieldsFilled += await this.fillPersonalInfo();
      fieldsFilled += await this.fillProfessionalInfo();
      fieldsFilled += await this.fillAddressInfo();

      // Fill job-specific fields
      if (applicationData.position) {
        const positionField = this.findFieldByKeywords(['position', 'job', 'title']);
        if (positionField) {
          this.fillField(positionField.element, applicationData.position);
          fieldsFilled++;
        }
      }

      if (applicationData.company) {
        const companyField = this.findFieldByKeywords(['company', 'employer', 'organization']);
        if (companyField) {
          this.fillField(companyField.element, applicationData.company);
          fieldsFilled++;
        }
      }

      if (applicationData.department) {
        const deptField = this.findFieldByKeywords(['department', 'division', 'team']);
        if (deptField) {
          this.fillField(deptField.element, applicationData.department);
          fieldsFilled++;
        }
      }

      // Handle CV source selection
      if (applicationData.resumeSource) {
        await this.handleCVSourceSelection(applicationData.resumeSource);
      }

      // Handle work type and availability
      if (applicationData.workType) {
        const workTypeField = this.findFieldByKeywords(['work-type', 'work-type', 'employment-type']);
        if (workTypeField) {
          this.fillField(workTypeField.element, applicationData.workType);
          fieldsFilled++;
        }
      }

      if (applicationData.availability) {
        const availabilityField = this.findFieldByKeywords(['availability', 'start-date', 'available']);
        if (availabilityField) {
          this.fillField(availabilityField.element, applicationData.availability);
          fieldsFilled++;
        }
      }

      // Auto-answer application questions based on hardcoded data
      const questionAnswers = this.generateQuestionAnswers();
      const questionsFilled = await this.autoFillQuestions(questionAnswers);
      fieldsFilled += questionsFilled;

      sendResponse({ success: true, fieldsFilled });
      
    } catch (error) {
      console.error('Error filling job application:', error);
      sendResponse({ success: false, error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  findFieldByKeywords(keywords) {
    for (const [fieldType, fieldData] of this.detectedFields) {
      const element = fieldData.element;
      const id = (element.id || '').toLowerCase();
      const name = (element.name || '').toLowerCase();
      const label = (fieldData.label || '').toLowerCase();
      
      for (const keyword of keywords) {
        if (id.includes(keyword) || name.includes(keyword) || label.includes(keyword)) {
          return { type: fieldType, element: element };
        }
      }
    }
    return null;
  }

  async handleCVSourceSelection(source) {
    // Look for CV source dropdown/button
    const cvSelectors = [
      'select[name*="cv"]',
      'select[name*="resume"]',
      'button[name*="cv"]',
      'button[name*="resume"]',
      '[data-testid*="cv"]',
      '[data-testid*="resume"]'
    ];

    for (const selector of cvSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.tagName === 'SELECT') {
          // Handle dropdown
          const options = element.querySelectorAll('option');
          for (const option of options) {
            if (option.textContent.toLowerCase().includes(source.toLowerCase()) ||
                option.value.toLowerCase().includes(source.toLowerCase())) {
              element.value = option.value;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        } else if (element.tagName === 'BUTTON') {
          // Handle button click
          if (element.textContent.toLowerCase().includes(source.toLowerCase())) {
            element.click();
            return true;
          }
        }
      }
    }
    return false;
  }

  async fillPersonalInfo() {
    let filled = 0;
    
    if (!this.userProfile) {
      console.log('No user profile available for personal info filling');
      return filled;
    }

    const personalFields = {
      'first_name': this.userProfile.firstName || '',
      'last_name': this.userProfile.lastName || '',
      'email': this.userProfile.email || '',
      'phone': this.userProfile.phone || '',
      'address': this.userProfile.address || '',
      'city': this.userProfile.city || '',
      'state': this.userProfile.state || '',
      'zip': this.userProfile.zip || '',
      'country': this.userProfile.country || ''
    };

    Object.entries(personalFields).forEach(([fieldType, value]) => {
      const fieldData = this.detectedFields.get(fieldType);
      if (fieldData && fieldData.element && value) {
        if (this.fillField(fieldData.element, value)) {
          filled++;
        }
      }
    });

    console.log(`Personal info: filled ${filled} fields`);
    return filled;
  }

  async fillProfessionalInfo() {
    let filled = 0;
    
    if (!this.userProfile) {
      console.log('No user profile available for professional info filling');
      return filled;
    }

    const summary = this.userProfile.summary || '';
    let skills = '';
    
    if (this.userProfile.skills) {
      if (Array.isArray(this.userProfile.skills)) {
        skills = this.userProfile.skills.join(', ');
      } else if (typeof this.userProfile.skills === 'string') {
        skills = this.userProfile.skills;
      }
    }

    const professionalFields = {
      'summary': summary,
      'skills': skills,
      'experience': summary, // Use summary for experience fields too
      'education': summary   // Use summary for education fields too
    };

    console.log('Professional fields to fill:', professionalFields);

    this.detectedFields.forEach((element, fieldType) => {
      const fieldValue = professionalFields[fieldType];
      if (fieldValue && fieldValue.trim() !== '' && !element.value) {
        element.value = fieldValue;
        element.classList.add('form-field-filled');
        filled++;
        console.log(`Filled ${fieldType} with: ${fieldValue.substring(0, 50)}...`);
      }
    });

    console.log(`Professional info: filled ${filled} fields`);
    return filled;
  }

  async fillAddressInfo() {
    let filled = 0;
    
    if (!this.userProfile) {
      console.log('No user profile available for address info filling');
      return filled;
    }

    const addressFields = {
      'address': this.userProfile.address || '',
      'city': this.userProfile.city || '',
      'state': this.userProfile.state || '',
      'zip': this.userProfile.zip || '',
      'country': this.userProfile.country || ''
    };

    console.log('Address fields to fill:', addressFields);

    this.detectedFields.forEach((element, fieldType) => {
      const fieldValue = addressFields[fieldType];
      if (fieldValue && fieldValue.trim() !== '' && !element.value) {
        element.value = fieldValue;
        element.classList.add('form-field-filled');
        filled++;
        console.log(`Filled ${fieldType} with: ${fieldValue}`);
      }
    });

    console.log(`Address info: filled ${filled} fields`);
    return filled;
  }

  async fillResumeInfo() {
    let filled = 0;
    
    // Fill summary/objective with resume data
    const summaryFields = document.querySelectorAll('textarea[name*="summary"], textarea[name*="objective"], #summary, #objective');
    summaryFields.forEach(field => {
      if (!field.value && this.resumeData) {
        field.value = this.resumeData.substring(0, 1000);
        field.classList.add('form-field-filled');
        filled++;
      }
    });

    return filled;
  }

  hasAccountCreationFields() {
    const accountFields = document.querySelectorAll(
      'input[type="password"], input[name*="password"], input[id*="password"],' +
      'input[name*="username"], input[id*="username"], input[name*="email"], input[id*="email"],' +
      'input[name*="create"], input[name*="register"], input[name*="signup"]'
    );
    return accountFields.length > 0;
  }

  async fillAccountCreationFields() {
    let filled = 0;
    
    // Get current domain for username generation
    const domain = window.location.hostname;
    
    // Fill username fields
    const usernameFields = document.querySelectorAll(
      'input[name*="username"], input[id*="username"], input[name*="user"], input[id*="user"]'
    );
    
    for (const field of usernameFields) {
      if (!field.value) {
        const username = await this.generateUsernameForDomain(domain);
        field.value = username;
        field.classList.add('form-field-filled');
        filled++;
      }
    }

    // Fill password fields
    const passwordFields = document.querySelectorAll(
      'input[type="password"], input[name*="password"], input[id*="password"]'
    );
    
    passwordFields.forEach(field => {
      if (!field.value) {
        const password = this.generateStrongPassword();
        field.value = password;
        field.classList.add('form-field-filled');
        filled++;
      }
    });

    // Fill confirm password fields
    const confirmPasswordFields = document.querySelectorAll(
      'input[name*="confirm"], input[name*="verify"], input[id*="confirm"], input[id*="verify"]'
    );
    
    confirmPasswordFields.forEach(field => {
      if (!field.value) {
        // Find the main password field value
        const mainPasswordField = document.querySelector('input[type="password"], input[name*="password"], input[id*="password"]');
        if (mainPasswordField && mainPasswordField.value) {
          field.value = mainPasswordField.value;
          field.classList.add('form-field-filled');
          filled++;
        }
      }
    });

    return filled;
  }

  async generateUsernameForDomain(domain) {
    try {
      // Try to get base username from storage
      const result = await chrome.storage.sync.get(['baseUsername']);
      if (result.baseUsername) {
        const domainHash = domain.split('.')[0];
        const timestamp = Date.now().toString(36);
        return `${result.baseUsername}_${domainHash}_${timestamp}`;
      }
    } catch (error) {
      console.error('Error getting base username:', error);
    }
    
    // Fallback: use email or generate default
    if (this.userProfile && this.userProfile.email) {
      const emailParts = this.userProfile.email.split('@');
      const domainHash = domain.split('.')[0];
      return `${emailParts[0]}_${domainHash}`;
    }
    
    return `user_${domain.split('.')[0]}_${Date.now().toString(36)}`;
  }

  generateStrongPassword() {
    const length = 16;
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }

  getFieldLabel(element) {
    // Try to find associated label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }
    
    // Check parent label
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    
    // Check placeholder
    if (element.placeholder) return element.placeholder;
    
    return '';
  }

  createAutofillUI() {
    // Create floating button
    const button = document.createElement('button');
    button.id = 'jolly-autofill-button';
    button.className = 'jolly-autofill-btn';
    button.innerHTML = 'jolly R AutoFill';
    button.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(-10px);
    `;

    // Add hover effects
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
    });

    // Add click handler
    button.addEventListener('click', () => this.handleSmartAutofillClick());

    document.body.appendChild(button);

    // Show button after a delay
    setTimeout(() => {
      button.style.opacity = '1';
      button.style.transform = 'translateY(0)';
    }, 1000);

    this.autofillButton = button;
  }

  async handleSmartAutofillClick() {
    if (this.isProcessing) {
      this.showNotification('Already processing...', 'warning');
      return;
    }

    try {
      this.isProcessing = true;
      this.autofillButton.textContent = 'Processing...';
      this.autofillButton.disabled = true;

      // Check for processed PDF data first
      const result = await chrome.storage.local.get(['processedPDFData', 'sharedPDFData']);
      let pdfData = null;

      if (result.processedPDFData) {
        pdfData = result.processedPDFData;
      } else if (result.sharedPDFData) {
        // Try to process shared PDF
        try {
          const file = await this.base64ToFile(
            result.sharedPDFData.base64, 
            result.sharedPDFData.name, 
            result.sharedPDFData.type
          );
          
          // For now, use simple text extraction
          const text = await this.extractTextFromFile(file);
          const personalInfo = this.extractSimplePersonalInfo(text);
          
          pdfData = {
            personalInfo: personalInfo,
            text: text
          };
        } catch (error) {
          console.error('Error processing shared PDF:', error);
        }
      }

      if (pdfData && pdfData.personalInfo) {
        // Use PDF data for smart autofill
        await this.performSmartAutofill(pdfData.personalInfo);
        this.showNotification('Smart autofill completed using PDF data!', 'success');
      } else {
        // Fallback to regular profile autofill
        await this.performRegularAutofill();
        this.showNotification('AutoFill completed using profile data!', 'info');
      }

      // Try to upload resume PDF if upload fields are detected
      if (this.resumeUploadFields && this.resumeUploadFields.length > 0) {
        await this.uploadResumePDF();
      }

    } catch (error) {
      console.error('Error in smart autofill:', error);
      this.showNotification('AutoFill failed: ' + error.message, 'error');
    } finally {
      this.isProcessing = false;
      this.autofillButton.textContent = 'jolly R AutoFill';
      this.autofillButton.disabled = false;
    }
  }

  async performSmartAutofill(pdfPersonalInfo) {
    let fieldsFilled = 0;

    // Re-detect forms
    this.detectForms();

    // Create mappings from PDF personal info
    const mappings = {
      'first_name': pdfPersonalInfo.name ? pdfPersonalInfo.name.split(' ')[0] : '',
      'last_name': pdfPersonalInfo.name ? pdfPersonalInfo.name.split(' ').slice(-1)[0] : '',
      'email': pdfPersonalInfo.email || '',
      'phone': pdfPersonalInfo.phone || '',
      'address': pdfPersonalInfo.address || '',
      'summary': pdfPersonalInfo.summary || '',
      'experience': pdfPersonalInfo.experience ? pdfPersonalInfo.experience.join('\n') : '',
      'education': pdfPersonalInfo.education ? pdfPersonalInfo.education.join('\n') : '',
      'skills': pdfPersonalInfo.skills ? pdfPersonalInfo.skills.join(', ') : '',
      'company': pdfPersonalInfo.company || '',
      'position': pdfPersonalInfo.position || ''
    };

    // Fill fields using mappings
    Object.entries(mappings).forEach(([fieldType, value]) => {
      if (value && value.trim() !== '') {
        const fieldData = this.detectedFields.get(fieldType);
        if (fieldData && fieldData.element && !fieldData.element.value) {
          if (this.fillField(fieldData.element, value)) {
            fieldsFilled++;
            fieldData.element.classList.add('smart-filled');
          }
        }
      }
    });

    // Log application
    await this.logApplication('Smart AutoFill', fieldsFilled);
    
    return fieldsFilled;
  }

  async performRegularAutofill() {
    const options = {
      fillPersonal: true,
      fillProfessional: true,
      fillAddress: true,
      fillResume: true
    };

    let fieldsFilled = 0;

    if (options.fillPersonal) {
      fieldsFilled += await this.fillPersonalInfo();
    }
    
    if (options.fillProfessional) {
      fieldsFilled += await this.fillProfessionalInfo();
    }
    
    if (options.fillAddress) {
      fieldsFilled += await this.fillAddressInfo();
    }
    
    if (options.fillResume && this.resumeData) {
      fieldsFilled += await this.fillResumeInfo();
    }

    if (this.hasAccountCreationFields()) {
      fieldsFilled += await this.fillAccountCreationFields();
    }

    await this.logApplication('Regular AutoFill', fieldsFilled);
    return fieldsFilled;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `jolly-notification jolly-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10001;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 300px;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;

    // Set color based on type
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.style.color = 'white';

    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Hide after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  async base64ToFile(base64, fileName, mimeType) {
    const response = await fetch(base64);
    const blob = await response.blob();
    return new File([blob], fileName, { type: mimeType });
  }

  detectApplicationQuestions() {
    this.applicationQuestions = [];
    
    // Look for common question patterns
    const questionSelectors = [
      // Radio button groups
      'input[type="radio"]',
      // Checkbox groups  
      'input[type="checkbox"]',
      // Select dropdowns for questions
      'select',
      // Textareas for longer answers
      'textarea',
      // Text inputs for specific questions
      'input[type="text"]',
      'input[type="number"]',
      'input[type="date"]'
    ];

    questionSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const questionInfo = this.analyzeQuestion(element);
        if (questionInfo) {
          this.applicationQuestions.push(questionInfo);
        }
      });
    });

    // Group questions by type for better organization
    this.categorizedQuestions = {
      eligibility: [],
      experience: [],
      availability: [],
      preferences: [],
      legal: [],
      demographics: [],
      technical: []
    };

    this.applicationQuestions.forEach(question => {
      if (this.categorizedQuestions[question.category]) {
        this.categorizedQuestions[question.category].push(question);
      }
    });

    console.log(`Detected ${this.applicationQuestions.length} application questions:`, this.applicationQuestions);
  }

  analyzeQuestion(element) {
    const label = this.getFieldLabel(element).toLowerCase();
    const id = (element.id || '').toLowerCase();
    const name = (element.name || '').toLowerCase();
    const placeholder = (element.placeholder || '').toLowerCase();
    const parentText = element.parentElement?.textContent?.toLowerCase() || '';

    // Question patterns and their categories
    const questionPatterns = [
      // Eligibility questions
      {
        keywords: ['eligible', 'authorized', 'legally authorized', 'work permit', 'visa', 'sponsorship', 'citizenship'],
        category: 'eligibility',
        type: 'yes_no',
        getValue: () => this.getYesNoValue(element)
      },
      
      // Experience questions
      {
        keywords: ['experience', 'years experience', 'years of experience', 'worked before', 'relevant experience'],
        category: 'experience',
        type: 'number' || 'text',
        getValue: () => element.value || element.selectedOptions?.[0]?.text
      },
      
      // Availability questions
      {
        keywords: ['available', 'start date', 'notice period', 'immediately', 'weeks notice'],
        category: 'availability',
        type: 'select' || 'date',
        getValue: () => element.value || element.selectedOptions?.[0]?.text
      },
      
      // Work preference questions
      {
        keywords: ['remote', 'onsite', 'hybrid', 'work type', 'office', 'location'],
        category: 'preferences',
        type: 'radio' || 'select',
        getValue: () => this.getRadioValue(element)
      },
      
      // Technical skills questions
      {
        keywords: ['skills', 'technologies', 'programming', 'software', 'tools', 'languages'],
        category: 'technical',
        type: 'checkbox' || 'text',
        getValue: () => this.getCheckboxValues(element) || element.value
      },
      
      // Legal questions
      {
        keywords: ['background', 'drug test', 'criminal', 'conviction', 'agreement', 'terms', 'privacy'],
        category: 'legal',
        type: 'yes_no',
        getValue: () => this.getYesNoValue(element)
      },
      
      // Demographic questions
      {
        keywords: ['gender', 'ethnicity', 'race', 'veteran', 'disability', 'age', 'birth'],
        category: 'demographics',
        type: 'select' || 'text',
        getValue: () => element.value || element.selectedOptions?.[0]?.text
      }
    ];

    // Check each pattern
    for (const pattern of questionPatterns) {
      const hasKeyword = pattern.keywords.some(keyword => 
        label.includes(keyword) || 
        id.includes(keyword) || 
        name.includes(keyword) || 
        placeholder.includes(keyword) ||
        parentText.includes(keyword)
      );

      if (hasKeyword) {
        return {
          element: element,
          label: this.getFieldLabel(element),
          category: pattern.category,
          type: pattern.type,
          getValue: pattern.getValue,
          keywords: pattern.keywords.filter(k => 
            label.includes(k) || id.includes(k) || name.includes(k)
          )
        };
      }
    }

    return null;
  }

  getYesNoValue(element) {
    if (element.type === 'radio') {
      const checkedRadio = document.querySelector(`input[name="${element.name}"]:checked`);
      return checkedRadio ? checkedRadio.value : '';
    }
    return element.value || '';
  }

  getRadioValue(element) {
    const checkedRadio = document.querySelector(`input[name="${element.name}"]:checked`);
    return checkedRadio ? checkedRadio.value : '';
  }

  getCheckboxValues(element) {
    if (element.type === 'checkbox') {
      const checkboxes = document.querySelectorAll(`input[name="${element.name}"]`);
      return Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value || cb.parentElement?.textContent.trim())
        .join(', ');
    }
    return element.value || '';
  }

  async extractTextFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  generateQuestionAnswers() {
    // Pre-defined answers for common application questions
    const answers = {
      // Eligibility answers
      eligibility: {
        'authorized': 'Yes',
        'work_permit': 'Yes - Authorized to work in US',
        'visa_sponsorship': 'No - Not requiring sponsorship',
        'citizenship': 'US Citizen'
      },
      
      // Experience answers
      experience: {
        'years_experience': '5',
        'relevant_experience': 'Yes - 5+ years in IT/Pharma',
        'management_experience': 'Yes - 2 years management experience',
        'pharma_experience': 'Yes - 3 years pharmaceutical industry'
      },
      
      // Availability answers
      availability: {
        'start_date': 'Immediate',
        'notice_period': '2 weeks',
        'relocate': 'Yes - Willing to relocate'
      },
      
      // Work preference answers
      preferences: {
        'work_type': 'On-site',
        'remote_work': 'Open to occasional remote work',
        'travel': 'Yes - Willing to travel up to 25%'
      },
      
      // Technical skills answers
      technical: {
        'programming_languages': 'Python, SQL, JavaScript',
        'databases': 'SQL Server, Oracle, PostgreSQL',
        'tools': 'JIRA, Confluence, Git',
        'methodologies': 'Agile, Scrum, Waterfall'
      },
      
      // Legal answers
      legal: {
        'background_check': 'Yes - Willing to undergo',
        'drug_test': 'Yes - Willing to undergo',
        'terms_agreement': 'Yes - Agree to terms'
      },
      
      // Demographic answers (optional - can be left blank)
      demographics: {
        'veteran_status': 'No',
        'disability': 'No',
        'gender': 'Prefer not to disclose'
      }
    };

    return answers;
  }

  async autoFillQuestions(answers) {
    let questionsFilled = 0;

    try {
      // Fill eligibility questions
      for (const question of this.categorizedQuestions.eligibility) {
        const answer = answers.eligibility[question.keywords[0]];
        if (answer && question.element) {
          if (question.type === 'yes_no') {
            await this.setYesNoAnswer(question.element, answer);
          } else if (question.type === 'text') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled eligibility question: ${question.label} = ${answer}`);
        }
      }

      // Fill experience questions
      for (const question of this.categorizedQuestions.experience) {
        const answer = answers.experience[question.keywords[0]];
        if (answer && question.element) {
          if (question.type === 'number') {
            this.fillField(question.element, answer);
          } else if (question.type === 'text') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled experience question: ${question.label} = ${answer}`);
        }
      }

      // Fill availability questions
      for (const question of this.categorizedQuestions.availability) {
        const answer = answers.availability[question.keywords[0]];
        if (answer && question.element) {
          if (question.type === 'select') {
            this.fillField(question.element, answer);
          } else if (question.type === 'date') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled availability question: ${question.label} = ${answer}`);
        }
      }

      // Fill work preference questions
      for (const question of this.categorizedQuestions.preferences) {
        const answer = answers.preferences[question.keywords[0]];
        if (answer && question.element) {
          if (question.type === 'radio') {
            await this.setRadioAnswer(question.element, answer);
          } else if (question.type === 'select') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled preference question: ${question.label} = ${answer}`);
        }
      }

      // Fill technical skills questions
      for (const question of this.categorizedQuestions.technical) {
        const answer = answers.technical[question.keywords[0]];
        if (answer && question.element) {
          if (question.type === 'checkbox') {
            const skills = answer.split(', ');
            await this.setCheckboxAnswers(question.element, skills);
          } else if (question.type === 'text') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled technical question: ${question.label} = ${answer}`);
        }
      }

      // Fill legal questions
      for (const question of this.categorizedQuestions.legal) {
        const answer = answers.legal[question.keywords[0]];
        if (answer && question.element) {
          if (question.type === 'yes_no') {
            await this.setYesNoAnswer(question.element, answer);
          } else if (question.type === 'text') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled legal question: ${question.label} = ${answer}`);
        }
      }

      // Fill demographic questions (optional - only fill if user wants)
      for (const question of this.categorizedQuestions.demographics) {
        const answer = answers.demographics[question.keywords[0]];
        if (answer && answer !== 'Prefer not to disclose' && question.element) {
          if (question.type === 'select') {
            this.fillField(question.element, answer);
          } else if (question.type === 'text') {
            this.fillField(question.element, answer);
          }
          questionsFilled++;
          console.log(`Filled demographic question: ${question.label} = ${answer}`);
        }
      }

      return questionsFilled;

    } catch (error) {
      console.error('Error auto-filling questions:', error);
      return 0;
    }
  }

  async setYesNoAnswer(element, answer) {
    const value = answer.toLowerCase().includes('yes') ? 'yes' : 'no';
    const radioOption = element.querySelector(`input[value="${value}"]`);
    if (radioOption) {
      radioOption.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async setRadioAnswer(element, answer) {
    const radioOption = element.querySelector(`input[value="${answer}"]`);
    if (radioOption) {
      radioOption.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async setCheckboxAnswers(element, skills) {
    const checkboxes = element.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      const checkboxLabel = checkbox.parentElement?.textContent?.trim().toLowerCase() || '';
      const isChecked = skills.some(skill => 
        checkboxLabel.includes(skill.toLowerCase()) || 
        checkbox.value?.toLowerCase().includes(skill.toLowerCase())
      );
      
      if (isChecked && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  extractSimplePersonalInfo(text) {
    const info = {
      name: '',
      email: '',
      phone: '',
      address: '',
      summary: '',
      experience: [],
      education: [],
      skills: [],
      companies: [],
      positions: [],
      company: '',
      position: '',
      present_employer: ''
    };

    try {
      // Simple regex extraction
      const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch) info.email = emailMatch[0];

      const phoneMatch = text.match(/\b(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/);
      if (phoneMatch) info.phone = phoneMatch[0];

      // Look for name patterns (simplified)
      const lines = text.split('\n').slice(0, 5); // Check first 5 lines
      for (const line of lines) {
        if (line.length > 5 && line.length < 50 && !line.includes('@') && !line.includes('http')) {
          info.name = line.trim();
          break;
        }
      }

      // Set backward compatibility fields
      info.company = info.companies[0] || '';
      info.position = info.positions[0] || '';
      info.present_employer = info.companies[0] || '';

    } catch (error) {
      console.error('Error extracting personal info:', error);
    }

    return info;
  }

  async uploadResumePDF() {
    try {
      // Get stored resume PDF data
      const result = await chrome.storage.local.get(['sharedPDFData']);
      const resumeData = result.sharedPDFData;

      if (!resumeData) {
        this.showNotification('No resume PDF found. Please upload your resume in the Profile tab first.', 'warning');
        return false;
      }

      // Convert base64 back to File
      const resumeFile = await this.base64ToFile(
        resumeData.base64,
        resumeData.name,
        resumeData.type
      );

      let uploadSuccess = false;

      // Try each detected resume upload field
      for (const field of this.resumeUploadFields) {
        if (field.element.tagName === 'INPUT' && field.element.type === 'file') {
          uploadSuccess = await this.uploadToFileInput(field.element, resumeFile);
        } else if (field.isCustom) {
          uploadSuccess = await this.uploadToCustomField(field, resumeFile);
        }

        if (uploadSuccess) {
          this.showNotification(`Resume uploaded to: ${field.label}`, 'success');
          break;
        }
      }

      if (!uploadSuccess) {
        this.showNotification('Could not find a suitable resume upload field', 'warning');
      }

      return uploadSuccess;

    } catch (error) {
      console.error('Error uploading resume PDF:', error);
      this.showNotification('Failed to upload resume: ' + error.message, 'error');
      return false;
    }
  }

  async uploadToFileInput(fileInput, resumeFile) {
    try {
      // Create a DataTransfer object to simulate file selection
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(resumeFile);
      
      // Set the files on the input element
      fileInput.files = dataTransfer.files;
      
      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);
      
      // Also trigger input event for frameworks that listen to it
      const inputEvent = new Event('input', { bubbles: true });
      fileInput.dispatchEvent(inputEvent);

      console.log('Resume file set to input:', fileInput);
      return true;

    } catch (error) {
      console.error('Error setting file to input:', error);
      return false;
    }
  }

  async uploadToCustomField(field, resumeFile) {
    try {
      // Handle custom upload interfaces like the one in your image
      const section = field.section;
      
      // Look for dropdown/select elements
      const selectElement = section.querySelector('select, [role="combobox"]');
      if (selectElement) {
        // Try to find "File" option in the dropdown
        const options = selectElement.querySelectorAll('option');
        let fileOption = null;
        
        options.forEach(option => {
          if (option.textContent.toLowerCase().includes('file') || 
              option.textContent.toLowerCase().includes('upload') ||
              option.textContent.toLowerCase().includes('browse')) {
            fileOption = option;
          }
        });

        if (fileOption) {
          // Select the "File" option
          selectElement.value = fileOption.value;
          selectElement.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Wait a moment for the UI to update
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Now look for the file input that should appear
          const fileInput = section.querySelector('input[type="file"]');
          if (fileInput) {
            return await this.uploadToFileInput(fileInput, resumeFile);
          }
        }
      }

      // If no dropdown, try clicking buttons to reveal file input
      const buttons = section.querySelectorAll('button, [role="button"]');
      for (const button of buttons) {
        if (button.textContent.toLowerCase().includes('file') || 
            button.textContent.toLowerCase().includes('upload') ||
            button.textContent.toLowerCase().includes('browse')) {
          
          button.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Look for file input that might appear
          const fileInput = section.querySelector('input[type="file"]');
          if (fileInput) {
            return await this.uploadToFileInput(fileInput, resumeFile);
          }
        }
      }

      return false;

    } catch (error) {
      console.error('Error with custom field upload:', error);
      return false;
    }
  }

  observeDOM() {
    // Watch for form changes
    const observer = new MutationObserver((mutations) => {
      let shouldReprocess = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'FORM' || node.tagName === 'INPUT' || 
                  node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
                shouldReprocess = true;
              }
            }
          });
        }
      });
      
      if (shouldReprocess && !this.isProcessing) {
        setTimeout(() => this.detectForms(), 1000);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize the autofiller when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => FormAutofiller.getInstance());
} else {
  FormAutofiller.getInstance();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_PAGE') {
    const autofiller = FormAutofiller.getInstance();
    sendResponse({ success: true });
  }
});

console.log('Lightweight Job Autofill content script loaded');
