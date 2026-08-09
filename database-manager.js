// SQL Database Manager for jolly R Extension
class DatabaseManager {
  constructor() {
    this.dbName = 'jollyRDatabase';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => {
        console.error('Database failed to open:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('Database opened successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('userProfiles')) {
          const profileStore = db.createObjectStore('userProfiles', { keyPath: 'id', autoIncrement: true });
          profileStore.createIndex('email', 'email', { unique: true });
        }
        
        if (!db.objectStoreNames.contains('applications')) {
          const appStore = db.createObjectStore('applications', { keyPath: 'id', autoIncrement: true });
          appStore.createIndex('timestamp', 'timestamp', { unique: false });
          appStore.createIndex('company', 'company', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('resumes')) {
          const resumeStore = db.createObjectStore('resumes', { keyPath: 'id', autoIncrement: true });
          resumeStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('questions')) {
          const questionStore = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
          questionStore.createIndex('category', 'category', { unique: false });
        }
      };
    });
  }

  async saveUserProfile(profile) {
    const transaction = this.db.transaction(['userProfiles'], 'readwrite');
    const store = transaction.objectStore('userProfiles');
    
    // Clear existing profiles and save new one
    await store.clear();
    
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...profile,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => {
        console.log('User profile saved to database');
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Error saving profile:', request.error);
        reject(request.error);
      };
    });
  }

  async getUserProfile() {
    const transaction = this.db.transaction(['userProfiles'], 'readonly');
    const store = transaction.objectStore('userProfiles');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const profiles = request.result;
        const latestProfile = profiles.length > 0 ? profiles[profiles.length - 1] : null;
        resolve(latestProfile);
      };
      
      request.onerror = () => {
        console.error('Error getting profile:', request.error);
        reject(request.error);
      };
    });
  }

  async saveApplication(application) {
    const transaction = this.db.transaction(['applications'], 'readwrite');
    const store = transaction.objectStore('applications');
    
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...application,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => {
        console.log('Application saved to database');
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Error saving application:', request.error);
        reject(request.error);
      };
    });
  }

  async getApplications(limit = 50) {
    const transaction = this.db.transaction(['applications'], 'readonly');
    const store = transaction.objectStore('applications');
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];
      let count = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        
        if (cursor && count < limit) {
          results.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => {
        console.error('Error getting applications:', request.error);
        reject(request.error);
      };
    });
  }

  async saveResume(resumeData) {
    const transaction = this.db.transaction(['resumes'], 'readwrite');
    const store = transaction.objectStore('resumes');
    
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...resumeData,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => {
        console.log('Resume saved to database');
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Error saving resume:', request.error);
        reject(request.error);
      };
    });
  }

  async getLatestResume() {
    const transaction = this.db.transaction(['resumes'], 'readonly');
    const store = transaction.objectStore('resumes');
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          resolve(cursor.value);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error('Error getting resume:', request.error);
        reject(request.error);
      };
    });
  }

  async saveQuestionAnswers(answers) {
    const transaction = this.db.transaction(['questions'], 'readwrite');
    const store = transaction.objectStore('questions');
    
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...answers,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => {
        console.log('Question answers saved to database');
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Error saving answers:', request.error);
        reject(request.error);
      };
    });
  }

  async getQuestionAnswers() {
    const transaction = this.db.transaction(['questions'], 'readonly');
    const store = transaction.objectStore('questions');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const answers = request.result;
        const latestAnswers = answers.length > 0 ? answers[answers.length - 1] : null;
        resolve(latestAnswers);
      };
      
      request.onerror = () => {
        console.error('Error getting answers:', request.error);
        reject(request.error);
      };
    });
  }

  async clearOldRecords(daysOld = 30) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    
    const stores = ['applications', 'resumes', 'questions'];
    
    for (const storeName of stores) {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('timestamp');
      
      await new Promise((resolve) => {
        const request = index.openCursor();
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          
          if (cursor) {
            if (cursor.value.timestamp < cutoffTime) {
              cursor.delete();
              cursor.continue();
            } else {
              cursor.continue();
            }
          } else {
            resolve();
          }
        };
      });
    }
  }

  async getDatabaseStats() {
    const stats = {
      profiles: 0,
      applications: 0,
      resumes: 0,
      questions: 0,
      totalSize: 0
    };

    try {
      for (const storeName of ['userProfiles', 'applications', 'resumes', 'questions']) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        await new Promise((resolve) => {
          const request = store.count();
          request.onsuccess = () => {
            stats[storeName] = request.result;
            resolve();
          };
        });
      }
      
      // Estimate database size (rough approximation)
      stats.totalSize = Object.values(stats).reduce((sum, count) => sum + count, 0) * 1000; // Rough estimate
      
      return stats;
    } catch (error) {
      console.error('Error getting database stats:', error);
      return stats;
    }
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DatabaseManager;
} else if (typeof window !== 'undefined') {
  window.DatabaseManager = DatabaseManager;
}
