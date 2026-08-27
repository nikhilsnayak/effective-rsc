/**
 * @title Closing the route graph
 *
 * ERSC.make accepts the complete same-ERSC route graph.
 */
import { ERSC } from './01_application';
import { applicationRoutes } from './30_routes';

export default ERSC.make({ routes: applicationRoutes });
