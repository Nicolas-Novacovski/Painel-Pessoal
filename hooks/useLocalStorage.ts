
import { useState, useEffect } from 'react';

function getStoredValue<T,>(key: string, initialValue: T | (() => T)): T {
  try {
    const item = window.localStorage.getItem(key);
    if (item) {
        return JSON.parse(item);
    }
  } catch (error) {
    console.error(`Error reading localStorage key “${key}”:`, error);
  }
  
  return initialValue instanceof Function ? initialValue() : initialValue;
}

export function useLocalStorage<T,>(key: string, initialValue: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => getStoredValue(key, initialValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
       console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
