const NodeCache = require('node-cache');
const cache = new NodeCache();

module.exports = {
    set: (key, value, ttlInSeconds) => {
        return cache.set(key, value, ttlInSeconds);
    },
    get: (key) => {
        return cache.get(key);
    },
    del: (key) => {
        return cache.del(key);
    }
};
