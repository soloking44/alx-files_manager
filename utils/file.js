import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { promises as fsPromises } from 'fs';
import dbClient from './db';
import userUtils from './user';
import basicUtils from './basic';

/**
 * File utilities module
 */
const fileUtils = {
  /**
   * Validates the request body for creating a file
   * @request {request_object} express request object
   * @return {object} object containing error message and validated parameters
   */
  async validateBody(request) {
    const {
      name, type, isPublic = false, data,
    } = request.body;

    let { parentId = 0 } = request.body;

    const typesAllowed = ['file', 'image', 'folder'];
    let msg = null;

    if (parentId === '0') parentId = 0;

    if (!name) {
      msg = 'Missing name';
    } else if (!type || !typesAllowed.includes(type)) {
      msg = 'Missing type';
    } else if (!data && type !== 'folder') {
      msg = 'Missing data';
    } else if (parentId && parentId !== '0') {
      let file;

      if (basicUtils.isValidId(parentId)) {
        file = await this.getFile({
          _id: ObjectId(parentId),
        });
      } else {
        file = null;
      }

      if (!file) {
        msg = 'Parent not found';
      } else if (file.type !== 'folder') {
        msg = 'Parent is not a folder';
      }
    }

    const obj = {
      error: msg,
      fileParams: {
        name,
        type,
        parentId,
        isPublic,
        data,
      },
    };

    return obj;
  },

  /**
   * Retrieves a file document from the database
   * @query {obj} query used to find the file
   * @return {object} file document
   */
  async getFile(query) {
    const file = await dbClient.filesCollection.findOne(query);
    return file;
  },

  /**
   * Retrieves a list of file documents from the database
   * belonging to a specified parent ID
   * @query {obj} query used to find files
   * @return {Array} list of file documents
   */
  async getFilesOfParentId(query) {
    const fileList = await dbClient.filesCollection.aggregate(query);
    return fileList;
  },

  /**
   * Saves a file to the database and disk
   * @userId {string} ID of the user saving the file
   * @fileParams {obj} object containing the file's attributes
   * @FOLDER_PATH {string} path to save the file on disk
   * @return {obj} object containing error if present and the saved file
   */
  async saveFile(userId, fileParams, FOLDER_PATH) {
    const {
      name, type, isPublic, data,
    } = fileParams;
    let { parentId } = fileParams;

    if (parentId !== 0) parentId = ObjectId(parentId);

    const query = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId,
    };

    if (fileParams.type !== 'folder') {
      const fileNameUUID = uuidv4();

      // const fileDataDecoded = Buffer.from(data, 'base64').toString('utf-8');
      const fileDataDecoded = Buffer.from(data, 'base64');

      const path = `${FOLDER_PATH}/${fileNameUUID}`;

      query.localPath = path;

      try {
        await fsPromises.mkdir(FOLDER_PATH, { recursive: true });
        await fsPromises.writeFile(path, fileDataDecoded);
      } catch (err) {
        return { error: err.message, code: 400 };
      }
    }

    const result = await dbClient.filesCollection.insertOne(query);

    // query.userId = query.userId.toString();
    // query.parentId = query.parentId.toString();

    const file = this.processFile(query);

    const newFile = { id: result.insertedId, ...file };

    return { error: null, newFile };
  },

  /**
   * Updates a file document in the database
   * @query {obj} query to find the document to update
   * @set {obj} object containing the updated information
   * @return {object} updated file document
   */
  async updateFile(query, set) {
    const fileList = await dbClient.filesCollection.findOneAndUpdate(
      query,
      set,
      { returnOriginal: false },
    );
    return fileList;
  },

  /**
   * Publishes or unpublishes a file
   * @request {request_object} express request object
   * @setPublish {boolean} true to publish, false to unpublish
   * @return {object} error, status code, and updated file
   */
  async publishUnpublish(request, setPublish) {
    const { id: fileId } = request.params;

    if (!basicUtils.isValidId(fileId)) { return { error: 'Unauthorized', code: 401 }; }

    const { userId } = await userUtils.getUserIdAndKey(request);

    if (!basicUtils.isValidId(userId)) { return { error: 'Unauthorized', code: 401 }; }

    const user = await userUtils.getUser({
      _id: ObjectId(userId),
    });

    if (!user) return { error: 'Unauthorized', code: 401 };

    const file = await this.getFile({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });

    if (!file) return { error: 'Not found', code: 404 };

    const result = await this.updateFile(
      {
        _id: ObjectId(fileId),
        userId: ObjectId(userId),
      },
      { $set: { isPublic: setPublish } },
    );

    const {
      _id: id,
      userId: resultUserId,
      name,
      type,
      isPublic,
      parentId,
    } = result.value;

    const updatedFile = {
      id,
      userId: resultUserId,
      name,
      type,
      isPublic,
      parentId,
    };

    return { error: null, code: 200, updatedFile };
  },

  /**
   * Converts _id to id in a file document
   * @doc {object} document to be processed
   * @return {object} processed document with id instead of _id
   */
  processFile(doc) {
    // Converts _id to id and removes localPath

    const file = { id: doc._id, ...doc };

    delete file.localPath;
    delete file._id;

    return file;
  },

  /**
   * Checks if a file is public and belongs to a specific user
   * @file {object} file to evaluate
   * @userId {string} ID of the user to check ownership
   * @return {boolean} true if the file is public or belongs to the user, false otherwise
   */
  isOwnerAndPublic(file, userId) {
    if (
      (!file.isPublic && !userId)
      || (userId && file.userId.toString() !== userId && !file.isPublic)
    ) { return false; }

    return true;
  },

  /**
   * Retrieves a file's data from the database
   * @file {object} file to obtain data from
   * @size {string} size parameter for image files
   * @return {object} file data or error and status code
   */
  async getFileData(file, size) {
    let { localPath } = file;
    let data;

    if (size) localPath = `${localPath}_${size}`;

    try {
      data = await fsPromises.readFile(localPath);
    } catch (err) {
      // console.log(err.message);
      return { error: 'Not found', code: 404 };
    }

    return { data };
  },
};

export default fileUtils;
