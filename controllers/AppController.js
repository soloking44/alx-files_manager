import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  /**
   * Return the status of Redis and the database.
   * Example: { "redis": true, "db": true }
   */
  static getStatus(request, response) {
    const status = {
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    };
    response.status(200).send(status);
  }

  /**
   * Return the count of users and files in the database.
   * Example: { "users": 12, "files": 1231 }
   */
  static async getStats(request, response) {
    const stats = {
      users: await dbClient.nbUsers(),
      files: await dbClient.nbFiles(),
    };
    response.status(200).send(stats);
  }
}

export default AppController;
