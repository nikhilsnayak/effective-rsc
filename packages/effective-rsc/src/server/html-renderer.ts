import { Context, type Effect, Schema, type Scope } from 'effect';

import type { FlightPayload } from '../rsc/flight';

type FlightStream = ReadableStream<Uint8Array>;
type HtmlStream = ReadableStream<Uint8Array>;

export class HtmlRenderError extends Schema.TaggedError<HtmlRenderError>()('HtmlRenderError', {
  cause: Schema.Defect(),
}) {}

export class HtmlRenderer extends Context.Service<
  HtmlRenderer,
  {
    render(options: {
      readonly flightStream: FlightStream;
      readonly formState: FlightPayload['formState'];
    }): Effect.Effect<HtmlStream, HtmlRenderError, Scope.Scope>;
  }
>()('effective-rsc/server/html-renderer/HtmlRenderer') {}
