import { createBrowserHistory } from "@nano-router/history";

const history = createBrowserHistory();

import { Routes, Route, Router } from "@nano-router/router";

const routes = new Routes(new Route("home", "/"), new Route("live", "/live"));

export const router = new Router({ routes, history });
