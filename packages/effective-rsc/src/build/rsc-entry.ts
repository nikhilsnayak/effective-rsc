'use server-entry';

import 'effective-rsc/application-stylesheet';
import App from 'effective-rsc/application-entry';

import { Application } from '../server/application';

export const ApplicationRoot = App.component;
const CompiledApplication = {
  component: ApplicationRoot,
  servicesLayer: App.servicesLayer,
};

export const HttpLayer = Application.httpLayer(CompiledApplication);
export const ServerLayer = Application.layer(CompiledApplication);
