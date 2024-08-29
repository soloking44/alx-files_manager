const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    
    // Promisify the get and del methods (for Redis versions below v4)
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);

    // Handle Redis connection errors
    this.client.on('error', (error) => {
      console.error(`Redis client not connected to the server: ${error.message}`);
    });
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    try {
      return await this.getAsync(key);  // Await for the result
    } catch (error) {
      console.error(`Error getting key ${key}: ${error.message}`);
      return null;
    }
  }

  async set(key, value, duration) {
    try {
      await this.client.setex(key, duration, value);  // Await the setex operation
    } catch (error) {
      console.error(`Error setting key ${key}: ${error.message}`);
    }
  }

  async del(key) {
    try {
      await this.delAsync(key);  // Await the del operation
    } catch (error) {
      console.error(`Error deleting key ${key}: ${error.message}`);
    }
  }
}

// Create and export an instance of RedisClient
const redisClient = new RedisClient();
module.exports = redisClient;
