import {
  ObjectId,
} from 'mongodb';
import {
  env,
} from 'process';
import {
  v4 as uuidv4,
} from 'uuid';
import path from 'path';
import mime from 'mime-types';
import fs from 'fs';
import Queue from 'bull';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fileQueue = new Queue('fileQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

/**
 * @class FilesController
 * @description Controller for files related operations
 * @exports FilesController
 */
class FilesController {
  /**
   * @method getShow
   * @description retrieve files based on id
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} - Express response object
   */
  static async getShow(req, res) {
    try {
      const {
        id,
      } = req.params;
      if (!ObjectId.isValid(id)) {
        res.status(400).send({
          error: 'Invalid id',
        });
        return;
      }
      const user = await FilesController.retrieveUserBasedOnToken(req);
      if (!user) {
        res.status(401).send({
          error: 'Unauthorized',
        });
        return;
      }

      const files = dbClient.db.collection('files');
      const file = await files.findOne({
        _id: ObjectId(id),
        userId: user._id,
      });
      if (!file) {
        res.status(404).send({
          error: 'Not found',
        });
      } else {
        file.id = file._id;
        delete file._id;
        delete file.localPath;
        res.status(200).send(file);
      }
    } catch (error) {
      console.error(error);
      res.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }

  /**
   * @method getIndex
   * @description retrieve files based on parentid and pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} - Express response object
   */
  static async getIndex(req, res) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(req);
      if (!user) {
        res.status(401).send({
          error: 'Unauthorized',
        });
        return;
      }
      const {
        parentId,
        page,
      } = req.query;
      if (parentId && !ObjectId.isValid(parentId)) {
        res.status(400).send({
          error: 'Invalid parentId',
        });
        return;
      }
      const files = dbClient.db.collection('files');

      // Perform pagination
      const pageSize = 20;
      const pageNumber = page ? parseInt(page, 10) : 0;
      if (pageNumber < 0) {
        res.status(400).send({
          error: 'Invalid page number',
        });
        return;
      }
      const skip = pageNumber * pageSize;

      // if parentId is not provided retrieve all files
      let query;
      if (!parentId) {
        query = {
          userId: user._id.toString(),
        };
      } else {
        query = {
          userId: user._id.toString(),
          parentId,
        };
      }

      // handle pagination using aggregation
      const
      {
        $match: query,
      },
      {
        $skip: skip,
      },
      {
        $limit: pageSize,
      },
    ]).toArray();

    const finalResult = result.map((file) => {
      const newFile = {
        ...file,
        id: file._id,
      };
      delete newFile._id;
      delete newFile.localPath;
      return newFile;
    });
    res.status(200).send(finalResult);
  }

  /**
   * @method putPublish
   * @description set isPublic to true on the file document based on the ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} - Express response object
   */
  static putPublish(req, res) {
    FilesController.pubSubHelper(req, res, true);
  }

  /**
   * @method putUnpublish
   * @description set isPublic to false on the file document based on the ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} - Express response object
   */
  static putUnpublish(req, res) {
    FilesController.pubSubHelper(req, res, false);
  }

  /**
   * @method pubSubHelper
   * @description helper method for @putPublish and @putUnpublish
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Boolean} isPublic - isPublic value to set
   * @returns {Object} - Express response object
   */
  static async pubSubHelper(req, res, updateValue) {
    const {
      id,
    } = req.params;
    const user = await FilesController.retrieveUserBasedOnToken(req);
    if (!user) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    const files = dbClient.db.collection('files');
    const file = await files.findOne({
      userId: user._id,
      _id: ObjectId(id),
    });
    if (!file) {
      res.status(404).send({
        error: 'Not found',
      });
    } else {
      const update = {
        $set: {
          isPublic: updateValue,
        },
      };
      await files.updateOne({
        _id: ObjectId(id),
      }, update);
      const updatedFile = await files.findOne({
        _id: ObjectId(id),
      });
      updatedFile.id = updatedFile._id;
      delete updatedFile._id;
      delete updatedFile.localPath;
      res.status(200).send(updatedFile);
    }
  }

  /**
   * @method getFile
   * @description return the content of the file document based on the ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} - Express response object
   */
  static async getFile(req, res) {
    const {
      id,
    } = req.params;
    const { size } = req.query;
    if (!id) {
      res.status(404).send({
        error: 'Not found',
      });
      return;
    }
    const user = await FilesController.retrieveUserBasedOnToken(req);
    const files = dbClient.db.collection('files');
    const file = await files.findOne({
      _id: ObjectId(id),
    });
    if (!file) {
      res.status(404).send({
        error: 'Not found',
      });
      return;
    }
    if (!user && file.isPublic === false) {
      res.status(404).send({
        error: 'Not found',
      });
      return;
    }
    if (file.isPublic === false && user && file.userId !== user._id.toString()) {
      res.status(404).send({
        error: 'Not found',
      });
      return;
    }
    if (file.type === 'folder') {
      res.status(400).send({
        error: 'A folder doesn\'t have content',
      });
      return;
    }

    const lookUpPath = size && file.type === 'image'
      ? `${file.localPath}_${size}`
      : file.localPath;

    // check if file exists
    if (!(await FilesController.pathExists(lookUpPath))) {
      res.status(404).send({
        error: 'Not found',
      });
    } else {
      // read file with fs
      res.set('Content-Type', mime.lookup(file.name));
      res.status(200).sendFile(lookUpPath);
    }
  }

  /**
   * @method pathExists
   * @description check if the path exists
   * @param {String} path - path to check
   * @returns {Boolean} - true if path exists, false otherwise
   */
  static pathExists(path) {
    return new Promise((resolve) => {
      fs.access(path, fs.constants.F_OK, (err) => {
        resolve(!err);
      });
    });
  }
}

export default FilesController;
