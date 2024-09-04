import { ObjectId } from 'mongodb';

/**
 * this is basic Module
 */
const basicUtils = {
  /**
   * this checks if Id is Valid for Mongo
   * @id {string|number} id to be evaluated
   * @return {boolean} true if valid, false if not
   */
  isValidId(id) {
    try {
      ObjectId(id);
    } catch (err) {
      return false;
    }
    return true;
  },
};

export default basicUtils;
