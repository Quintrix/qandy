// guest-side DOS operations for localStorage file access

// Function to save data to localStorage
function saveToLocalStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Function to retrieve data from localStorage
function getFromLocalStorage(key) {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
}

// Function to remove data from localStorage
function removeFromLocalStorage(key) {
    localStorage.removeItem(key);
}

// Function to clear all localStorage data
function clearLocalStorage() {
    localStorage.clear();
}