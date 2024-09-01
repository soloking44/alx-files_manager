import {
  Router,
} from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

const router = Router();

// see status and stats db
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

// to connect and disconnect user
router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);

// method to upload files
router.post('/files', FilesController.postUpload);
router.get('/files/:id', FilesController.getShow);
router.get('/files', FilesController.getIndex);

// publish and unpublish
router.put('/files/:id/publish', FilesController.putPublish);
router.put('/files/:id/unpublish', FilesController.putUnpublish);

// This is user
router.post('/users', UsersController.postNew);
router.get('/users/me', UsersController.getMe);

// content of a file
router.get('/files/:id/data', FilesController.getFile);

export default router;
