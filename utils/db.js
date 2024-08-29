import { MongoClient } from 'mongodb';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}/`;

class DBClient {
  constructor() {
    this.db = null;
    this.connect();
  }

  async connect() {
    try {
      const client = await MongoClient.connect(url, { useUnifiedTopology: true });
      this.db = client.db(database);
      console.log('Connected successfully to MongoDB');
    } catch (error) {
      console.error(`Failed to connect to MongoDB: ${error.message}`);
    }
  }

  isAlive() {
    return !!this.db;
  }

  async nbUsers() {
    if (!this.db) throw new Error('Database connection not established');
    return this.db.collection('users').countDocuments();
  }

  async getUser(query) {
    if (!this.db) throw new Error('Database connection not established');
    const user = await this.db.collection('users').findOne(query);
    return user;
  }

  async nbFiles() {
    if (!this.db) throw new Error('Database connection not established');
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();
export default dbClient;
