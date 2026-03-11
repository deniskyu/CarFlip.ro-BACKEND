import { Router } from "express";

import usersRoute from './usersRoute.js';
import carBrandsRoute from './carBrandsRoute.js';
import userActions from "./userActions.js";
import userProfiles from "./userProfiles.js";
import reportRoute from './reportRoute.js';
import searchAlertsRoute from './searchAlertsRoute.js'
import notificationsRoute from './notificationsRoute.js';
import chatRoute from './chatRoute.js'

const route = Router();

route.use(usersRoute);
route.use(carBrandsRoute);
route.use(userActions);
route.use(userProfiles);
route.use(reportRoute);
route.use(searchAlertsRoute);
route.use(notificationsRoute);
route.use(chatRoute);

export default route;