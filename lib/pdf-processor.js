// Real PDF Processing using Mozilla PDF.js
class RealPDFProcessor {
  constructor() {
    this.pdfjsLib = null;
    this.isLoaded = false;
  }

  async loadPDFJS() {
    if (this.isLoaded) return;

    try {
      // Load PDF.js library
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/pdfjs/build/pdf.js');
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      // Configure PDF.js worker
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/build/pdf.worker.js');
      
      this.pdfjsLib = window.pdfjsLib;
      this.isLoaded = true;
      
      console.log('PDF.js loaded successfully');
    } catch (error) {
      console.error('Failed to load PDF.js:', error);
      throw new Error('Failed to load PDF processing library');
    }
  }

  async processPDF(file) {
    await this.loadPDFJS();

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Load PDF document
      const loadingTask = this.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      console.log(`PDF loaded: ${pdf.numPages} pages`);

      // Extract text from all pages
      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');
        
        fullText += pageText + '\n';
      }

      // Validate extraction
      if (!fullText || fullText.trim().length === 0) {
        throw new Error('No text could be extracted from PDF. The PDF might contain only images.');
      }

      const wordCount = fullText.split(/\s+/).length;
      console.log(`Extracted ${wordCount} words from PDF`);

      return fullText;
    } catch (error) {
      console.error('PDF processing error:', error);
      
      if (error.message.includes('Invalid PDF')) {
        throw new Error('Invalid PDF file. Please ensure the file is a valid PDF.');
      } else if (error.message.includes('password')) {
        throw new Error('Password-protected PDFs are not supported.');
      } else if (error.message.includes('images')) {
        throw new Error('This PDF appears to be scanned images. Please use a text-based PDF or OCR the document first.');
      } else {
        throw new Error('Failed to process PDF: ' + error.message);
      }
    }
  }

  // Enhanced personal information extraction with better patterns
  extractPersonalInfo(text) {
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
      // Backward compatibility
      company: '',
      position: '',
      present_employer: ''
    };

    try {
      // Extract name (usually at the beginning)
      const namePatterns = [
        /^(.{2,30})\s{2,}/m, // Name with multiple spaces
        /^(.{2,30})\n.{5,}/m, // Name on first line
        /^([A-Z][a-z]+ [A-Z][a-z]+)/m // Capitalized first and last name
      ];
      
      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && match[1] && !match[1].includes('email') && !match[1].includes('phone')) {
          info.name = match[1].trim();
          break;
        }
      }

      // Extract email
      const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch) {
        info.email = emailMatch[0];
      }

      // Extract phone (multiple formats)
      const phonePatterns = [
        /\b(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/,
        /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/
      ];
      
      for (const pattern of phonePatterns) {
        const match = text.match(pattern);
        if (match) {
          info.phone = match[0];
          break;
        }
      }

      // Extract address
      const addressPatterns = [
        /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}\s*\d{5})/m,
        /(\d+\s+[^,\n]+,\s*[A-Z]{2}\s*\d{5})/
      ];
      
      for (const pattern of addressPatterns) {
        const match = text.match(pattern);
        if (match) {
          info.address = match[1];
          break;
        }
      }

      // Extract summary/objective
      const summaryPatterns = [
        /(?:summary|objective|profile|about)[\s:]+([^@\n]{20,200})/i,
        /^([^@\n]{30,150})\n\n/i // First paragraph if substantial
      ];
      
      for (const pattern of summaryPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          info.summary = match[1].trim();
          break;
        }
      }

      // Extract work experience
      const experienceSection = this.extractSection(text, [
        'experience', 'work', 'employment', 'professional', 'career'
      ]);
      
      if (experienceSection) {
        const workEntries = this.parseWorkEntries(experienceSection);
        info.experience = workEntries;
        
        // Extract companies and positions
        workEntries.forEach(entry => {
          if (entry.company && !info.companies.includes(entry.company)) {
            info.companies.push(entry.company);
          }
          if (entry.position && !info.positions.includes(entry.position)) {
            info.positions.push(entry.position);
          }
        });
      }

      // Extract education
      const educationSection = this.extractSection(text, [
        'education', 'academic', 'university', 'college', 'school'
      ]);
      
      if (educationSection) {
        info.education = this.parseEducationEntries(educationSection);
      }

      // Extract skills
      const skillsSection = this.extractSection(text, [
        'skills', 'competencies', 'abilities', 'technologies', 'tools'
      ]);
      
      if (skillsSection) {
        info.skills = this.parseSkills(skillsSection);
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

  extractSection(text, sectionKeywords) {
    const patterns = sectionKeywords.map(keyword => 
      new RegExp(`(?:${keyword}[s:]*)[\\s\\n]*([\\s\\S]{0,2000})(?=\\n\\n|(?:experience|education|skills|summary|objective)\\b|\\n[A-Z][A-Z\\s]*\\n|$)`, 'im')
    );

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  parseWorkEntries(section) {
    const entries = [];
    const lines = section.split('\n').filter(line => line.trim());
    
    let currentEntry = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for company/position patterns
      const companyPositionMatch = line.match(/^([^,]+),?\s*([^,]*\d{4}[^,\n]*)/);
      if (companyPositionMatch) {
        if (currentEntry) {
          entries.push(currentEntry);
        }
        
        currentEntry = {
          company: companyPositionMatch[1].trim(),
          position: companyPositionMatch[2].replace(/\d{4}.*/, '').trim(),
          description: ''
        };
      } else if (currentEntry && (line.startsWith('·') || line.startsWith('-') || line.startsWith('*'))) {
        // Bullet point - add to description
        currentEntry.description += line + ' ';
      }
    }
    
    if (currentEntry) {
      entries.push(currentEntry);
    }
    
    return entries;
  }

  parseEducationEntries(section) {
    const entries = [];
    const lines = section.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      // Look for degree patterns
      const degreeMatch = line.match(/(bachelor|master|phd|associate|b\.s\.|m\.s\.|ph\.d\.|b\.a\.|m\.a\.)/i);
      if (degreeMatch) {
        entries.push(line.trim());
      }
    }
    
    return entries;
  }

  parseSkills(section) {
    const skills = [];
    
    // Split by common delimiters
    const skillGroups = section.split(/[,;|]/);
    
    for (const group of skillGroups) {
      const skillWords = group.trim().split(/\s+/);
      if (skillWords.length <= 3 && skillWords.length > 0) {
        skills.push(group.trim());
      }
    }
    
    return skills.filter(skill => skill.length > 2);
  }
}

// Export for use in popup
window.RealPDFProcessor = RealPDFProcessor;
