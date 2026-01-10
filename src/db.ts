const DB_NAME = 'ShiftSyncDB';
const DB_VERSION = 1;
const STORES = {
  SHIFTS: 'shifts',
  CONFIGS: 'configs',
  PAY_SETTINGS: 'paySettings',
};

type ShiftEvent = {
  id: string;
  dateStr: string;
  type: 'morning' | 'day' | 'night' | 'off' | 'custom';
  startTime?: string;
  endTime?: string;
  customLabel?: string;
};

type ShiftConfig = {
  id: 'morning' | 'day' | 'night' | 'off' | 'custom';
  label: string;
  color: string;
  textColor: string;
  darkColor: string;
  darkTextColor: string;
  startTime: string;
  endTime: string;
  iconName: 'Sun' | 'Briefcase' | 'Moon' | 'Check' | 'Edit3';
};

type PaySettings = {
  hourlyRate: number;
  nightDiff: number;
  weekendDiff: number;
  nightStart: string;
  nightEnd: string;
  weekendDays: number[];
};

class ShiftDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.db) {
      return;
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          console.error('IndexedDB error:', request.error);
          reject(new Error(`Failed to open database: ${request.error}`));
        };

        request.onsuccess = () => {
          this.db = request.result;
          console.log('IndexedDB opened successfully');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains(STORES.SHIFTS)) {
            db.createObjectStore(STORES.SHIFTS, { keyPath: 'dateStr' });
          }

          if (!db.objectStoreNames.contains(STORES.CONFIGS)) {
            db.createObjectStore(STORES.CONFIGS, { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains(STORES.PAY_SETTINGS)) {
            db.createObjectStore(STORES.PAY_SETTINGS, { keyPath: 'id' });
          }
        };
      } catch (error) {
        console.error('IndexedDB initialization error:', error);
        reject(new Error(`IndexedDB initialization failed: ${error}`));
      }
    });

    return this.initPromise;
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async getAllShifts(): Promise<Record<string, ShiftEvent>> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SHIFTS], 'readonly');
        const store = transaction.objectStore(STORES.SHIFTS);
        const request = store.getAll();

        request.onsuccess = () => {
          const shifts: Record<string, ShiftEvent> = {};
          request.result.forEach((shift: ShiftEvent) => {
            shifts[shift.dateStr] = shift;
          });
          resolve(shifts);
        };

        request.onerror = () => {
          console.error('Failed to get shifts:', request.error);
          reject(new Error(`Failed to retrieve shifts: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('getAllShifts error:', error);
      throw new Error(`Failed to get shifts: ${error}`);
    }
  }

  async getShift(dateStr: string): Promise<ShiftEvent | undefined> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SHIFTS], 'readonly');
        const store = transaction.objectStore(STORES.SHIFTS);
        const request = store.get(dateStr);

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.error('Failed to get shift:', request.error);
          reject(new Error(`Failed to retrieve shift: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('getShift error:', error);
      throw new Error(`Failed to get shift: ${error}`);
    }
  }

  async putShift(shift: ShiftEvent): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SHIFTS], 'readwrite');
        const store = transaction.objectStore(STORES.SHIFTS);
        const request = store.put(shift);

        request.onsuccess = () => {
          console.log('Shift saved:', shift.dateStr);
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to save shift:', request.error);
          reject(new Error(`Failed to save shift: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('putShift error:', error);
      throw new Error(`Failed to save shift: ${error}`);
    }
  }

  async deleteShift(dateStr: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SHIFTS], 'readwrite');
        const store = transaction.objectStore(STORES.SHIFTS);
        const request = store.delete(dateStr);

        request.onsuccess = () => {
          console.log('Shift deleted:', dateStr);
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to delete shift:', request.error);
          reject(new Error(`Failed to delete shift: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('deleteShift error:', error);
      throw new Error(`Failed to delete shift: ${error}`);
    }
  }

  async putShifts(shifts: Record<string, ShiftEvent>): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.SHIFTS], 'readwrite');
        const store = transaction.objectStore(STORES.SHIFTS);

        const shiftArray = Object.values(shifts);
        let completed = 0;
        let hasError = false;

        shiftArray.forEach((shift) => {
          const request = store.put(shift);

          request.onsuccess = () => {
            completed++;
            if (completed === shiftArray.length && !hasError) {
              console.log('All shifts saved');
              resolve();
            }
          };

          request.onerror = () => {
            if (!hasError) {
              hasError = true;
              console.error('Failed to save shift:', request.error);
              reject(new Error(`Failed to save shifts: ${request.error}`));
            }
          };
        });
      });
    } catch (error) {
      console.error('putShifts error:', error);
      throw new Error(`Failed to save shifts: ${error}`);
    }
  }

  async getConfigs(): Promise<ShiftConfig[]> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CONFIGS], 'readonly');
        const store = transaction.objectStore(STORES.CONFIGS);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.error('Failed to get configs:', request.error);
          reject(new Error(`Failed to retrieve configs: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('getConfigs error:', error);
      throw new Error(`Failed to get configs: ${error}`);
    }
  }

  async putConfigs(configs: ShiftConfig[]): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.CONFIGS], 'readwrite');
        const store = transaction.objectStore(STORES.CONFIGS);

        let completed = 0;
        let hasError = false;

        configs.forEach((config) => {
          const request = store.put(config);

          request.onsuccess = () => {
            completed++;
            if (completed === configs.length && !hasError) {
              console.log('All configs saved');
              resolve();
            }
          };

          request.onerror = () => {
            if (!hasError) {
              hasError = true;
              console.error('Failed to save config:', request.error);
              reject(new Error(`Failed to save configs: ${request.error}`));
            }
          };
        });
      });
    } catch (error) {
      console.error('putConfigs error:', error);
      throw new Error(`Failed to save configs: ${error}`);
    }
  }

  async getPaySettings(): Promise<PaySettings | undefined> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.PAY_SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.PAY_SETTINGS);
        const request = store.get('default');

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.error('Failed to get pay settings:', request.error);
          reject(new Error(`Failed to retrieve pay settings: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('getPaySettings error:', error);
      throw new Error(`Failed to get pay settings: ${error}`);
    }
  }

  async putPaySettings(settings: PaySettings): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORES.PAY_SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORES.PAY_SETTINGS);
        const request = store.put({ ...settings, id: 'default' });

        request.onsuccess = () => {
          console.log('Pay settings saved');
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to save pay settings:', request.error);
          reject(new Error(`Failed to save pay settings: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('putPaySettings error:', error);
      throw new Error(`Failed to save pay settings: ${error}`);
    }
  }

  async exportData(): Promise<string> {
    try {
      const shifts = await this.getAllShifts();
      const configs = await this.getConfigs();
      const paySettings = await this.getPaySettings();

      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        shifts,
        configs,
        paySettings,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('exportData error:', error);
      throw new Error(`Failed to export data: ${error}`);
    }
  }

  async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      if (data.shifts) {
        await this.putShifts(data.shifts);
      }

      if (data.configs) {
        await this.putConfigs(data.configs);
      }

      if (data.paySettings) {
        await this.putPaySettings(data.paySettings);
      }

      console.log('Data imported successfully');
    } catch (error) {
      console.error('importData error:', error);
      throw new Error(`Failed to import data: ${error}`);
    }
  }
}

export const shiftDB = new ShiftDB();
export type { ShiftEvent, ShiftConfig, PaySettings };
