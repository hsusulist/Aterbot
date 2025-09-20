export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
