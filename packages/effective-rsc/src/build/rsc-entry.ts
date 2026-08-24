'use server-entry';

import 'effective-rsc/application-stylesheet';
import App from 'effective-rsc/application-entry';

import { Application } from '../server/application';

export default App;

export const HttpLayer = Application.httpLayer(App);
export const ServerLayer = Application.layer(App);
