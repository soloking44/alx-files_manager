import { ObjectId } from 'mongodb';
import { env } from 'process';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import mime from 'mime-types';
import fs from 'fs';
import Queue from 'bull';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fileQueue = new Queue('fileQueue', {
  redis: { host: '127.0.0.1', port: 6379 },
});

class FilesController {
  static async postUpload(req, res) {
    const user = await FilesController.retrieveUserBasedOnToken(req);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const acceptedTypes = ['folder', 'file', 'image'];
    const { name, type, parentId, isPublic, data } = req.body;

    if (!name) return res.status(400).send({ error: 'Missing name' });
    if (!type || !acceptedTypes.includes(type)) return res.status(400).send({ error: 'Missing or invalid type' });
    if (!data && type !== 'folder') return res.status(400).send({ error: 'Missing data' });

    const files = dbClient.db.collection('files');
    if (parentId) {
      const parent = await files.findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).send({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });
    }

    const newFile = { name, type, parentId: parentId || '0', isPublic: !!isPublic, userId: user._id.toString() };
    if (type === 'folder') {
      const result = await files.insertOne(newFile);
      res.status(201).send({ ...newFile, id: result.insertedId });
    } else {
      const storeFolderPath = env.FOLDER_PATH || '/tmp/files_manager';
      const fileName = uuidv4();
      const filePath = path.join(storeFolderPath, fileName);

      newFile.localPath = filePath;
      const decodedData = Buffer.from(data, 'base64');
      await FilesController.createDirectoryIfNotExists(storeFolderPath);
      await FilesController.writeToFile(res, filePath, decodedData, newFile);
    }
  }

  static async createDirectoryIfNotExists(directoryPath) {
    try {
      await fs.promises.access(directoryPath);
    } catch {
      await fs.promises.mkdir(directoryPath, { recursive: true });
    }
  }

  static async writeToFile(res, filePath, data, newFile) {
    await fs.promises.writeFile(filePath, data, 'utf-8');
    const files = dbClient.db.collection('files');
    const result = await files.insertOne(newFile);
    const responseFile = { ...newFile, id: result.insertedId };
    delete responseFile._id;
    delete responseFile.localPath;

    if (newFile.type === 'image') {
      fileQueue.add({ userId: newFile.userId, fileId: responseFile.id });
    }
    res.status(201).send(responseFile);
  }

  static async getShow(req, res) {
    const { id } = req.params;
    const user = await FilesController.retrieveUserBasedOnToken(req);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const files = dbClient.db.collection('files');
    const file = await files.findOne({ _id: ObjectId(id), userId: user._id.toString() });
    if (!file) return res.status(404).send({ error: 'Not found' });

    const responseFile = { ...file, id: file._id };
    delete responseFile._id;
    delete responseFile.localPath;
    res.status(200).send(responseFile);
  }

  static async getIndex(req, res) {
    const user = await FilesController.retrieveUserBasedOnToken(req);
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const { parentId = '0', page = 0 } = req.query;
    const files = dbClient.db.collection('files');

    const query = { userId: user._id.toString(), parentId };
    const pageSize = 20;
    const skip = page * pageSize;

    const result = await files.find(query).skip(skip).limit(pageSize).toArray();
    const formattedResult = result.map(file => {
      const newFile = { ...file, id: file._id };
      delete newFile._id;
      delete newFile.localPath;
      return newFile;
    });

    res.status(200).send(formattedResult);
  }

  static async retrieveUserBasedOnToken(req) {
    const token = req.header('X-Token') ? `auth_${req.header('X-Token')}` : null;
    if (!token) return null;

    const userId = await redisClient.get(token);
    if (!userId) return null;

    const users = dbClient.db.collection('users');
    return users.findOne({ _id: ObjectId(userId) });
  }

  static async pathExists(filePath) {
    return fs.promises.access(filePath, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
  }
}

export default FilesController;
