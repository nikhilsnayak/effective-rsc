export type DevRuntimeFailure = {
  readonly _tag: 'RuntimeError' | 'UnhandledRejection';
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly componentStack?: string;
};

type PanelVisibility = 'Visible' | 'Dismissed';

export type DevPanelState =
  | { readonly _tag: 'Clear' }
  | {
      readonly _tag: 'BuildFailed';
      readonly diagnostics: string;
      readonly visibility: PanelVisibility;
    }
  | {
      readonly _tag: 'RuntimeFailed';
      readonly failures: ReadonlyArray<DevRuntimeFailure>;
      readonly visibility: PanelVisibility;
    };

export type DevPanelEvent =
  | { readonly _tag: 'BuildFailed'; readonly diagnostics: string }
  | { readonly _tag: 'RuntimeFailed'; readonly failure: DevRuntimeFailure }
  | { readonly _tag: 'Reconciled' }
  | { readonly _tag: 'Dismissed' };

export const InitialDevPanelState: DevPanelState = { _tag: 'Clear' };

const MaxRuntimeFailures = 5;

const sameRuntimeFailure = (left: DevRuntimeFailure, right: DevRuntimeFailure) =>
  left.name === right.name && left.message === right.message && left.stack === right.stack;

const appendRuntimeFailure = (
  failures: ReadonlyArray<DevRuntimeFailure>,
  failure: DevRuntimeFailure,
) => {
  if (failures.some((current) => sameRuntimeFailure(current, failure))) {
    return failures;
  }

  return [...failures.slice(1 - MaxRuntimeFailures), failure];
};

export const applyDevPanelEvent = (state: DevPanelState, event: DevPanelEvent): DevPanelState => {
  switch (event._tag) {
    case 'BuildFailed':
      return {
        _tag: 'BuildFailed',
        diagnostics: event.diagnostics,
        visibility: 'Visible',
      };
    case 'RuntimeFailed': {
      if (state._tag === 'BuildFailed') {
        return { ...state, visibility: 'Visible' };
      }

      return {
        _tag: 'RuntimeFailed',
        failures: appendRuntimeFailure(
          state._tag === 'RuntimeFailed' ? state.failures : [],
          event.failure,
        ),
        visibility: 'Visible',
      };
    }
    case 'Reconciled':
      return InitialDevPanelState;
    case 'Dismissed':
      return state._tag === 'Clear' ? state : { ...state, visibility: 'Dismissed' };
  }
};
