export const sleep = (ms) => new Promise(resovle => setTimeout(resovle, ms));
export const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
