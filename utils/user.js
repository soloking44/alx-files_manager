import redisClient from './redis';
import dbClient from './db';

/**
 * Utility functions for user-related operations
 */
const userUtils = {
  /**
   * Retrieves the user ID and Redis key from the request
   * @request {object} Express request object
   * @return {object} Object containing the userId and Redis key for the token
   */
  async getUserIdAndKey(request) {
    const obj = { userId: null, key: null };

    const xToken = request.header('X-Token');

    if (!xToken) return obj;

    obj.key = `auth_${xToken}`;

    obj.userId = await redisClient.get(obj.key);

    return obj;
  },

  /**
   * Retrieves a user document from the database
   * @query {object} Query object used to find the user
   * @return {object} User document from the database
   */
  async getUser(query) {
    const user = await dbClient.usersCollection.findOne(query);
    return user;
  },
};

export default userUtils;
