import { db } from './firebase-admin.js';
import { createDelegatedService } from './delegated-service.js';
const service=createDelegatedService({db,secret:()=>process.env.DESKTOP_ADMIN_ACCESS_KEY});
export const authorizedDelegate=service.authorizedDelegate;
export default service.delegatedHandler;
